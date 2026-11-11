const COL = { gray: "#64748b", green: "#22c55e", orange: "#f59e0b", red: "#ef4444" };
const NODE_COLORS = ["#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#fbbf24"];
let S = { nodes: [], processes: [], resources: [], waits: [], wfg: [] };
let D = null;          // last detection result
let view = "system";

const $ = id => document.getElementById(id);
const val = id => $(id).value;

async function api(url, method = "GET", body = null) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null
  });
  return r.json();
}

function toast(msg, ok = true) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show " + (ok ? "ok" : "bad");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = "toast"), 3000);
}

async function act(url, body = {}) {
  const r = await api(url, "POST", body);
  toast(r.message, r.ok);
  D = null;
  await load();
}

async function load() {
  S = await api("/api/state");
  render();
}

async function detect() {
  if (!S.nodes.length) { toast("Load a scenario or add nodes first", false); return; }
  D = await api("/api/detect", "POST");
  toast(D.message, !D.deadlock);
  render();
}

function setView(v) {
  view = v;
  $("tabSystem").classList.toggle("active", v === "system");
  $("tabWfg").classList.toggle("active", v === "wfg");
  render();
}

const inCycle = p => D && D.deadlock && D.cycle.includes(p);
const holderOf = r => (S.resources.find(x => x.name === r) || {}).holder;

function fill(id, items, emptyText) {
  const el = $(id), old = el.value;
  el.innerHTML = items.length
    ? items.map(i => `<option value="${i}">${i}</option>`).join("")
    : `<option value="">${emptyText}</option>`;
  if (items.includes(old)) el.value = old;
}

function render() {
  const waiting = new Set(S.waits.map(w => w.process));
  $("cNodes").textContent = S.nodes.length;
  $("cProcs").textContent = S.processes.length;
  $("cRes").textContent = S.resources.length;
  $("cWait").textContent = waiting.size;

  const pill = $("statusPill"), st = $("cStatus");
  if (!D) { pill.className = "pill blue"; pill.textContent = "Not checked"; st.textContent = "—"; st.style.color = ""; }
  else if (D.deadlock) { pill.className = "pill red"; pill.textContent = "🔴 Deadlock detected"; st.textContent = "DEADLOCK"; st.style.color = "#ef4444"; }
  else { pill.className = "pill green"; pill.textContent = "🟢 No deadlock"; st.textContent = "SAFE"; st.style.color = "#22c55e"; }

  const pn = S.processes.map(p => p.name), rn = S.resources.map(r => r.name);
  fill("pNode", S.nodes, "No nodes");
  fill("rNode", S.nodes, "No nodes");
  fill("aRes", rn, "No resources");
  fill("aProc", pn, "No processes");
  fill("wProc", pn, "No processes");
  fill("wRes", rn, "No resources");

  $("procBody").innerHTML = S.processes.map(p => {
    const holds = S.resources.filter(r => r.holder === p.name).map(r => r.name).join(", ") || "—";
    const waits = S.waits.filter(w => w.process === p.name).map(w => w.resource).join(", ") || "—";
    let badge = `<span class="badge green">Running</span>`;
    if (inCycle(p.name)) badge = `<span class="badge red">Deadlocked</span>`;
    else if (waits !== "—") badge = `<span class="badge orange">Waiting</span>`;
    return `<tr><td>${p.name}</td><td>${p.node}</td><td>${holds}</td><td>${waits}</td><td>${badge}</td></tr>`;
  }).join("") || `<tr><td colspan="5" class="empty">No processes yet</td></tr>`;

  $("resBody").innerHTML = S.resources.map(r =>
    `<tr><td>${r.name}</td><td>${r.node}</td><td>${r.holder || '<span class="badge blue">Free</span>'}</td></tr>`
  ).join("") || `<tr><td colspan="3" class="empty">No resources yet</td></tr>`;

  drawGraph();
  renderResult();
}

function renderResult() {
  const el = $("result");
  if (!D) { el.className = "result"; el.innerHTML = "Click <b>Run Detection</b> to analyse the system."; return; }
  const list = D.edges.map(e =>
    `${e.from} → ${e.to} <small>(${e.from} waits for ${e.resource}, held by ${e.to})</small>`).join("<br>") || "<small>No wait-for edges</small>";
  if (D.deadlock) {
    el.className = "result red";
    el.innerHTML = `🔴 <b>Deadlock detected!</b><br>Cycle: <b>${D.cycle.concat(D.cycle[0]).join(" → ")}</b><br>` +
      `Processes involved: ${D.cycle.join(", ")}<br>Nodes involved: ${D.nodes_involved.join(", ")}<br><br><b>Wait-For Graph edges:</b><br>${list}`;
  } else {
    el.className = "result green";
    el.innerHTML = `🟢 <b>No deadlock.</b> The Wait-For Graph has no cycle.<br><br><b>Wait-For Graph edges:</b><br>${list}`;
  }
}

function edge(a, b, key, dash, label) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const x1 = a.x + ux * 28, y1 = a.y + uy * 28, x2 = b.x - ux * 32, y2 = b.y - uy * 32;
  const cx = (x1 + x2) / 2 - uy * 35, cy = (y1 + y2) / 2 + ux * 35;
  let s = `<path d="M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${COL[key]}" stroke-width="3"` +
    `${dash ? ' stroke-dasharray="8 5"' : ""} marker-end="url(#a-${key})" class="${key === "red" ? "pulse" : ""}"/>`;
  if (label) {
    const lx = 0.25 * x1 + 0.5 * cx + 0.25 * x2, ly = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
    s += `<text x="${lx}" y="${ly}" class="elbl">${label}</text>`;
  }
  return s;
}

function systemView() {
  const pos = {}, W = 300;
  let out = "";
  const waiting = new Set(S.waits.map(w => w.process));
  S.nodes.forEach((n, i) => {
    const x0 = 20 + i * (W + 20);
    out += `<rect x="${x0}" y="15" width="${W}" height="310" rx="16" fill="#0b1220" stroke="#475569" stroke-dasharray="6 5"/>` +
           `<text x="${x0 + W / 2}" y="40" class="nodeLbl">🖥️ Node ${n}</text>`;
    S.processes.filter(p => p.node === n).forEach((p, j) => (pos[p.name] = { x: x0 + 45 + j * 70, y: 120 }));
    S.resources.filter(r => r.node === n).forEach((r, j) => (pos[r.name] = { x: x0 + 45 + j * 70, y: 260 }));
  });
  const cyc = D && D.deadlock ? D.cycle_edges : [];
  const resInCycle = new Set(cyc.map(e => e.resource));
  S.resources.forEach(r => {
    if (r.holder) out += edge(pos[r.name], pos[r.holder], resInCycle.has(r.name) ? "red" : "green", false);
  });
  S.waits.forEach(w => {
    const red = cyc.some(e => e.from === w.process && e.resource === w.resource);
    out += edge(pos[w.process], pos[w.resource], red ? "red" : "orange", true);
  });
  S.processes.forEach(p => {
    const c = pos[p.name];
    const k = inCycle(p.name) ? "red" : waiting.has(p.name) ? "orange" : "green";
    out += `<circle cx="${c.x}" cy="${c.y}" r="24" fill="${COL[k]}33" stroke="${COL[k]}" stroke-width="3" class="${k === "red" ? "pulse" : ""}"/>` +
           `<text x="${c.x}" y="${c.y + 5}" class="lbl">${p.name}</text>`;
  });
  S.resources.forEach(r => {
    const c = pos[r.name], red = resInCycle.has(r.name), col = red ? COL.red : "#38bdf8";
    out += `<rect x="${c.x - 22}" y="${c.y - 22}" width="44" height="44" rx="8" fill="${col}33" stroke="${col}" stroke-width="3"/>` +
           `<text x="${c.x}" y="${c.y + 5}" class="lbl">${r.name}</text>`;
  });
  return out;
}

function wfgView(W, H) {
  const n = S.processes.length, pos = {};
  if (!n) return `<text x="${W / 2}" y="${H / 2}" class="lbl">Add processes to see the Wait-For Graph</text>`;
  S.processes.forEach((p, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    pos[p.name] = { x: W / 2 + Math.cos(a) * 140, y: H / 2 + Math.sin(a) * 115 };
  });
  const cyc = D && D.deadlock ? D.cycle_edges : [];
  let out = "";
  S.wfg.forEach(e => {
    const red = cyc.some(c => c.from === e.from && c.to === e.to);
    out += edge(pos[e.from], pos[e.to], red ? "red" : "gray", false, e.resource);
  });
  S.processes.forEach(p => {
    const c = pos[p.name], col = NODE_COLORS[S.nodes.indexOf(p.node) % NODE_COLORS.length];
    const stroke = inCycle(p.name) ? COL.red : col;
    out += `<circle cx="${c.x}" cy="${c.y}" r="24" fill="${stroke}33" stroke="${stroke}" stroke-width="3" class="${inCycle(p.name) ? "pulse" : ""}"/>` +
           `<text x="${c.x}" y="${c.y + 5}" class="lbl">${p.name}</text>` +
           `<text x="${c.x}" y="${c.y + 44}" class="nodeLbl">${p.node}</text>`;
  });
  return out;
}

function drawGraph() {
  const W = Math.max(700, S.nodes.length * 320 + 20), H = 340;
  if (!S.nodes.length) {
    $("graphBox").innerHTML = `<div class="empty big">Nothing to show yet. Click "Deadlock Scenario" in the Control Panel, or add nodes manually.</div>`;
    return;
  }
  const defs = Object.entries(COL).map(([k, c]) =>
    `<marker id="a-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`
  ).join("");
  const body = view === "system" ? systemView() : wfgView(W, H);
  $("graphBox").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%"><defs>${defs}</defs>${body}</svg>`;
}

load();