"""Graphify backend (https://github.com/safishamsi/graphify, Apache-2.0 / MIT).

Uses the code-only path: tree-sitter AST extraction, local, no LLM, nothing leaves the machine.
`graphify update <repo> --no-cluster` writes <repo>/graphify-out/graph.json; GRAPHIFY_BACKEND=none
keeps semantic (LLM) extraction off. Install with `uv tool install graphifyy` or `pip install graphifyy`.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

NAME = "graphify"
RELATION_MAP = {"contains": "contains", "defines": "defines", "imports": "imports",
                "imports_from": "imports", "calls": "calls", "references": "references",
                "inherits": "references", "extends": "references", "implements": "references", "uses": "references"}


EXT_LANG = {".py": "python", ".js": "javascript", ".jsx": "javascript", ".ts": "typescript", ".tsx": "typescript",
            ".java": "java", ".kt": "kotlin", ".swift": "swift", ".go": "go", ".sh": "bash", ".rb": "ruby",
            ".m": "objective-c", ".robot": "robot"}


def available() -> bool:
    return shutil.which("graphify") is not None


def scan(repo: Path) -> dict[str, Any]:
    if not available():
        raise RuntimeError("graphify is not installed (pip install graphifyy)")
    env = {**os.environ, "GRAPHIFY_BACKEND": "none"}
    proc = subprocess.run(["graphify", "update", str(repo), "--no-cluster"], env=env,
                          capture_output=True, text=True, timeout=3600)
    out = repo / "graphify-out" / "graph.json"
    if proc.returncode != 0 or not out.exists():
        raise RuntimeError(f"graphify failed: {proc.stderr[-800:] or proc.stdout[-800:]}")
    return normalize(json.loads(out.read_text()))


def normalize(raw: dict[str, Any]) -> dict[str, Any]:
    nodes, edges = [], []
    for n in raw.get("nodes", []):
        meta = n.get("metadata") or {}
        src = n.get("source_file", "")
        if n.get("file_type") == "code":
            # Graphify marks file nodes with metadata.kind for some languages only; the reliable
            # signal is a node whose label is its own file name.
            is_file = meta.get("kind") == "file" or n.get("label") == src.rsplit("/", 1)[-1]
            kind = "file" if is_file else "symbol"
        else:
            kind = "concept"
        language = meta.get("language") or EXT_LANG.get("." + src.rsplit(".", 1)[-1], "") if src else ""
        nodes.append({"id": n["id"], "label": n.get("label", n["id"]), "kind": kind,
                      "file": src, "language": language})
    ids = {n["id"] for n in nodes}
    for l in raw.get("links", raw.get("edges", [])):
        rel = RELATION_MAP.get(l.get("relation", ""))
        if rel and l["source"] in ids and l["target"] in ids:
            edges.append({"source": l["source"], "target": l["target"], "relation": rel})
    return {"nodes": nodes, "edges": edges}
