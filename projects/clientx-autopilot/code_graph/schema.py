"""Normalized graph: every backend is converted to this shape before anything consumes it.

{
  "meta":  {"repo", "commit", "backend", "scanned_at"},
  "nodes": [{"id", "label", "kind", "file", "language"}],      kind: file | symbol | concept
  "edges": [{"source", "target", "relation"}]                  relation: contains | defines | imports | calls | references
}
"""
from __future__ import annotations

from typing import Any

RELATIONS = ("contains", "defines", "imports", "calls", "references")
DEPENDENCY_RELATIONS = ("imports", "calls", "references")


def empty(repo: str, commit: str, backend: str, scanned_at: str) -> dict[str, Any]:
    return {"meta": {"repo": repo, "commit": commit, "backend": backend, "scanned_at": scanned_at},
            "nodes": [], "edges": []}


def validate(graph: dict[str, Any]) -> None:
    ids = {n["id"] for n in graph["nodes"]}
    for edge in graph["edges"]:
        if edge["relation"] not in RELATIONS:
            raise ValueError(f"unknown relation: {edge['relation']}")
        if edge["source"] not in ids or edge["target"] not in ids:
            raise ValueError(f"edge references a missing node: {edge}")
