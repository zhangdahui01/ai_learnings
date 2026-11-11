"""Scan a service repository into a code knowledge graph and write its summary to the knowledge base.

    python -m code_graph.scan --repo /path/to/service --service sample-checkout \
        [--backend auto|graphify|static] [--out var/code-graph] [--kb knowledge-base]

Local only. The graph file stays under var/ (git-ignored); only the summary goes to the
knowledge base. Never commit a scanned repository or its full graph.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import time
from pathlib import Path
from typing import Any

from harness.kb import KnowledgeBase

from . import backends, queries, schema


def _commit(repo: Path) -> str:
    proc = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True, text=True)
    return proc.stdout.strip() if proc.returncode == 0 else "unknown"


def scan(repo: str | Path, backend: str = "auto") -> dict[str, Any]:
    repo = Path(repo).resolve()
    if not repo.is_dir():
        raise FileNotFoundError(repo)
    impl = backends.pick(backend)
    graph = schema.empty(repo.name, _commit(repo), impl.NAME, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    graph.update(impl.scan(repo))
    schema.validate(graph)
    return graph


def to_knowledge_base(graph: dict[str, Any], service: str, kb: KnowledgeBase, graph_path: str) -> dict[str, Any]:
    data = kb.load(service, "operational")
    data["code_graph"] = {**queries.summary(graph), "graph_file": graph_path, "evidence_level": "static-candidate"}
    kb.save(service, "operational", data)
    return data["code_graph"]


def main() -> None:
    ap = argparse.ArgumentParser(description="Scan a repository into a code knowledge graph.")
    ap.add_argument("--repo", required=True)
    ap.add_argument("--service", required=True)
    ap.add_argument("--backend", default="auto", choices=["auto", "graphify", "static"])
    ap.add_argument("--out", default="var/code-graph")
    ap.add_argument("--kb", help="knowledge-base root; when given, the summary is written to <service>/operational.json")
    args = ap.parse_args()
    graph = scan(args.repo, args.backend)
    out = Path(args.out) / f"{args.service}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(graph))
    result = queries.summary(graph)
    if args.kb:
        to_knowledge_base(graph, args.service, KnowledgeBase(args.kb), str(out))
    print(json.dumps({"graph_file": str(out), **result}, indent=2))


if __name__ == "__main__":
    main()
