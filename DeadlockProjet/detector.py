def build_wfg(resources, waits):
    """Wait-For Graph: edge P1 -> P2 means P1 waits for a resource held by P2."""
    holder = {r["name"]: r["holder"] for r in resources}
    edges = []
    for w in waits:
        h = holder.get(w["resource"])
        if h and h != w["process"]:
            edges.append({"from": w["process"], "to": h, "resource": w["resource"]})
    return edges


def find_cycle(edges):
    """Depth-first search. Returns the list of processes in a cycle, or None."""
    graph = {}
    for e in edges:
        graph.setdefault(e["from"], []).append(e["to"])

    visited = set()

    def dfs(node, path):
        if node in path:
            return path[path.index(node):]
        if node in visited:
            return None
        visited.add(node)
        path.append(node)
        for nxt in graph.get(node, []):
            found = dfs(nxt, path)
            if found:
                return found
        path.pop()
        return None

    for start in graph:
        found = dfs(start, [])
        if found:
            return found
    return None