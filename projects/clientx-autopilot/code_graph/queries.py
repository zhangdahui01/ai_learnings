"""Questions the agents ask the code graph."""
from __future__ import annotations

from collections import Counter, defaultdict
from fnmatch import fnmatch
from typing import Any

from .schema import DEPENDENCY_RELATIONS


def _file_of(graph: dict[str, Any]) -> dict[str, str]:
    return {n["id"]: n["file"] for n in graph["nodes"] if n.get("file")}


def file_dependents(graph: dict[str, Any]) -> dict[str, set[str]]:
    """file -> files that import/call/reference something in it."""
    file_of = _file_of(graph)
    out: dict[str, set[str]] = defaultdict(set)
    for e in graph["edges"]:
        if e["relation"] in DEPENDENCY_RELATIONS:
            src, dst = file_of.get(e["source"]), file_of.get(e["target"])
            if src and dst and src != dst:
                out[dst].add(src)
    return out


def affected_files(graph: dict[str, Any], changed: list[str], depth: int = 2) -> dict[str, int]:
    """Changed files plus everything that depends on them, with the hop distance."""
    dependents = file_dependents(graph)
    seen = {f: 0 for f in changed}
    frontier = list(changed)
    for hop in range(1, depth + 1):
        nxt = []
        for f in frontier:
            for dep in dependents.get(f, ()):
                if dep not in seen:
                    seen[dep] = hop
                    nxt.append(dep)
        frontier = nxt
    return seen


def _touches(paths: list[str], files: dict[str, int]) -> list[tuple[str, int]]:
    return sorted({(f, hop) for f, hop in files.items()
                   for p in paths if fnmatch(f, p) or f.startswith(p.rstrip("*"))})


def journeys_touched(graph: dict[str, Any] | None, changed: list[str], coverage_map: dict[str, Any],
                     depth: int = 2) -> list[dict[str, Any]]:
    """Which journeys does this change reach? Direct hits first, then through dependencies."""
    files = affected_files(graph, changed, depth) if graph else {f: 0 for f in changed}
    out = []
    for journey in coverage_map.get("journeys", []):
        hits = _touches(journey.get("code_paths", []), files)
        if hits:
            out.append({"journey": journey["id"], "name": journey.get("name", journey["id"]),
                        "priority": journey.get("priority", "P2"), "distance": min(h for _, h in hits),
                        "files": [f for f, _ in hits][:10], "cases": [c["id"] for c in journey.get("cases", [])]})
    out.sort(key=lambda j: (j["distance"], j["priority"]))
    return out


def select_cases(graph: dict[str, Any] | None, changed: list[str], coverage_map: dict[str, Any],
                 *, smoke: list[str] | None = None, limit: int = 50, states: tuple[str, ...] = ("gated",)) -> dict[str, Any]:
    """CI gate case selection: the smoke set plus gated cases of every journey the PR reaches."""
    selected: dict[str, str] = {c: "smoke set, always runs" for c in (smoke or [])}
    touched = journeys_touched(graph, changed, coverage_map)
    for journey in touched:
        full = next(j for j in coverage_map["journeys"] if j["id"] == journey["journey"])
        for case in full.get("cases", []):
            if case.get("state", "gated") in states and case["id"] not in selected and len(selected) < limit:
                how = "changed directly" if journey["distance"] == 0 else f"{journey['distance']} dependency hop(s) away"
                selected[case["id"]] = f"journey '{journey['journey']}' is {how}"
    uncovered = [j["journey"] for j in touched if not j["cases"]]
    return {"cases": selected, "journeys": touched, "changed_without_case": uncovered}


def summary(graph: dict[str, Any], top: int = 15) -> dict[str, Any]:
    dependents = file_dependents(graph)
    return {
        **graph["meta"],
        "files": sum(n["kind"] == "file" for n in graph["nodes"]),
        "symbols": sum(n["kind"] == "symbol" for n in graph["nodes"]),
        "edges": dict(Counter(e["relation"] for e in graph["edges"])),
        "languages": dict(Counter(n["language"] for n in graph["nodes"] if n["kind"] == "file" and n["language"])),
        "most_depended_on": [{"file": f, "dependents": len(d)} for f, d in
                             sorted(dependents.items(), key=lambda kv: -len(kv[1]))[:top]],
    }
