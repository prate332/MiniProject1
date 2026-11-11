from flask import Flask, jsonify, request, render_template
from detector import build_wfg, find_cycle

app = Flask(__name__)

state = {"nodes": [], "processes": [], "resources": [], "waits": []}


def reset_state():
    for key in state:
        state[key] = []


def fail(msg):
    return jsonify(ok=False, message=msg), 400


def good(msg):
    return jsonify(ok=True, message=msg)


def find(items, name):
    return next((i for i in items if i["name"] == name), None)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/state")
def get_state():
    return jsonify(**state, wfg=build_wfg(state["resources"], state["waits"]))


@app.route("/api/node", methods=["POST"])
def add_node():
    name = f"N{len(state['nodes']) + 1}"
    state["nodes"].append(name)
    return good(f"Node {name} added")


@app.route("/api/process", methods=["POST"])
def add_process():
    node = (request.get_json() or {}).get("node")
    if node not in state["nodes"]:
        return fail("Select a node first (add a node if none exist)")
    name = f"P{len(state['processes']) + 1}"
    state["processes"].append({"name": name, "node": node})
    return good(f"Process {name} added to {node}")


@app.route("/api/resource", methods=["POST"])
def add_resource():
    node = (request.get_json() or {}).get("node")
    if node not in state["nodes"]:
        return fail("Select a node first (add a node if none exist)")
    name = f"R{len(state['resources']) + 1}"
    state["resources"].append({"name": name, "node": node, "holder": None})
    return good(f"Resource {name} added to {node}")


@app.route("/api/allocate", methods=["POST"])
def allocate():
    data = request.get_json() or {}
    res = find(state["resources"], data.get("resource"))
    proc = find(state["processes"], data.get("process"))
    if not res or not proc:
        return fail("Select a resource and a process")
    if res["holder"]:
        return fail(f"{res['name']} is already held by {res['holder']}")
    res["holder"] = proc["name"]
    return good(f"{res['name']} allocated to {proc['name']}")


@app.route("/api/wait", methods=["POST"])
def wait():
    data = request.get_json() or {}
    res = find(state["resources"], data.get("resource"))
    proc = find(state["processes"], data.get("process"))
    if not res or not proc:
        return fail("Select a process and a resource")
    if not res["holder"]:
        return fail(f"{res['name']} is free. Allocate it instead of waiting")
    if res["holder"] == proc["name"]:
        return fail("A process cannot wait for a resource it already holds")
    if any(w["process"] == proc["name"] and w["resource"] == res["name"] for w in state["waits"]):
        return fail("That process is already waiting for this resource")
    state["waits"].append({"process": proc["name"], "resource": res["name"]})
    return good(f"{proc['name']} is now waiting for {res['name']} (held by {res['holder']})")


@app.route("/api/detect", methods=["POST"])
def detect():
    edges = build_wfg(state["resources"], state["waits"])
    cycle = find_cycle(edges)
    node_of = {p["name"]: p["node"] for p in state["processes"]}
    cycle_edges = []
    if cycle:
        for i, p in enumerate(cycle):
            nxt = cycle[(i + 1) % len(cycle)]
            cycle_edges.append(next(e for e in edges if e["from"] == p and e["to"] == nxt))
    nodes = sorted({node_of[p] for p in cycle}) if cycle else []
    msg = "Deadlock detected!" if cycle else "No deadlock found. System is safe."
    return jsonify(ok=True, deadlock=bool(cycle), cycle=cycle or [], cycle_edges=cycle_edges,
                   edges=edges, nodes_involved=nodes, message=msg)


@app.route("/api/reset", methods=["POST"])
def reset():
    reset_state()
    return good("Simulation reset")


@app.route("/api/scenario/<name>", methods=["POST"])
def scenario(name):
    if name not in ("deadlock", "safe"):
        return fail("Unknown scenario")
    reset_state()
    state["nodes"] = ["N1", "N2", "N3"]
    state["processes"] = [{"name": f"P{i}", "node": f"N{i}"} for i in (1, 2, 3)]
    state["resources"] = [{"name": f"R{i}", "node": f"N{i}", "holder": f"P{i}"} for i in (1, 2, 3)]
    waits = [("P1", "R2"), ("P2", "R3")]
    if name == "deadlock":
        waits.append(("P3", "R1"))
    state["waits"] = [{"process": p, "resource": r} for p, r in waits]
    return good(f"{name.capitalize()} scenario loaded. Click Run Detection.")


if __name__ == "__main__":
    app.run(debug=True)