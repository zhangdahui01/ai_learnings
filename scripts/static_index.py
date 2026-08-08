#!/usr/bin/env python3
"""Zero-install static index: DOT graph, local KB, and UI-source risk candidates."""
from __future__ import annotations

import argparse, csv, hashlib, json, re, shutil, subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SKIP = {".git", "node_modules", "build", "target", ".gradle", "dist", "vendor", ".venv", "coverage"}
CODE_EXT = {".java", ".kt", ".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".c", ".h", ".cc", ".cpp", ".cxx", ".cs", ".rb", ".rs", ".swift", ".php"}
DECL = re.compile(r"(?m)^\s*(?:public|private|protected|internal|static|final|abstract|async|export|class|interface|enum|record|fun|function|def|func|fn|struct|trait|type)\s+([A-Za-z_$][\w$]*)")
IMPORT = re.compile(r"(?m)^\s*(?:import|from|require\s*\(|using|use)\s*[\(\"']?([^\s;\"')]+)")
TEST_NAME = re.compile(r"(?:@Test\s*(?:\([^)]*\))?\s*(?:public\s+)?void\s+|\b(?:it|test|scenario|describe)\s*\(\s*[\"'])([^\"']+)")
ENDPOINT = re.compile(r"(?:@(?:Get|Post|Put|Delete|Patch|Request)Mapping\s*\(\s*[\"']|\b(?:get|post|put|delete|patch)\s*\(\s*[\"'])(/[^\"'`\s)]+)")
RISK_RULES = [
    ("hard-wait", re.compile(r"\b(?:sleep|waitForTimeout|Thread\.sleep)\s*\("), "P2", "Hard wait can make UI tests slow and flaky."),
    ("broad-selector", re.compile(r"(?:xpath\s*=\s*[\"']?//\*|By\.xpath\s*\(\s*[\"']//*|querySelector\s*\(\s*[\"'][*])"), "P2", "Overly broad selector is likely brittle or ambiguous."),
    ("disabled-test", re.compile(r"(?:\.skip\s*\(|@Disabled|@Ignore|xdescribe\s*\(|xit\s*\()"), "P1", "Disabled or skipped test leaves a known regression hole."),
    ("retry-mask", re.compile(r"(?:retries?\s*[:=]|@Retry|flaky)"), "P2", "Retry may hide a product or synchronization failure."),
    ("secret-in-test-source", re.compile(r"(?i)(?:api[_-]?key|password|secret|token)\s*[:=]\s*[\"'][^\"']{8,}"), "P0", "Possible credential embedded in test source; rotate/review without printing the value."),
]

def scan_files(root: Path):
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in CODE_EXT and not any(p in SKIP for p in path.relative_to(root).parts): yield path

def node_id(kind: str, value: str) -> str:
    return kind.lower() + "_" + hashlib.sha1(value.encode()).hexdigest()[:12]

def line_of(text: str, offset: int) -> int: return text.count("\n", 0, offset) + 1
def dot_label(value: str) -> str: return value.replace('"', "'").replace("\\", "/")

def main() -> None:
    p = argparse.ArgumentParser(description="Read source only; produce a generic graph and static UI risk candidates.")
    p.add_argument("--repo", action="append", required=True, help="Repository to index; repeat as needed.")
    p.add_argument("--automation", help="Optional UI automation repository; may also appear in --repo.")
    p.add_argument("--out", required=True); p.add_argument("--max-files", type=int, default=20000)
    args = p.parse_args(); roots = [Path(x).expanduser().resolve() for x in args.repo]
    auto = Path(args.automation).expanduser().resolve() if args.automation else None
    for root in roots + ([auto] if auto else []):
        if not root.is_dir(): p.error(f"not a directory: {root}")
    out = Path(args.out).expanduser().resolve(); graph_dir = out / "graphs"; graph_dir.mkdir(parents=True, exist_ok=True)
    nodes, edges, symbols, endpoints, tests, risks, imports = [], [], [], [], [], [], []
    seen, file_total = set(), 0
    def add_node(kind, name, path=None, line=None):
        key = f"{kind}:{path or ''}:{line or ''}:{name}"; ident = node_id(kind, key)
        if ident not in seen: nodes.append({"id": ident, "kind": kind, "name": name, "path": path, "line": line}); seen.add(ident)
        return ident
    for root in roots:
        repo = add_node("Repository", root.name, str(root))
        for path in scan_files(root):
            file_total += 1
            if file_total > args.max_files: break
            rel = str(path.relative_to(root)); fid = add_node("File", rel, str(path)); edges.append([repo, "CONTAINS", fid])
            try: text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError: continue
            for match in DECL.finditer(text):
                name, line = match.group(1), line_of(text, match.start()); sid = add_node("Symbol", name, str(path), line)
                edges.append([fid, "DECLARES", sid]); symbols.append({"name": name, "path": str(path), "line": line})
            for match in IMPORT.finditer(text):
                target = match.group(1)[:160]; iid = add_node("ExternalReference", target, str(path), line_of(text, match.start()))
                edges.append([fid, "IMPORTS", iid]); imports.append({"path": str(path), "target": target})
            for match in ENDPOINT.finditer(text):
                route, line = match.group(1), line_of(text, match.start()); eid = add_node("Endpoint", route, str(path), line)
                edges.append([fid, "HANDLES", eid]); endpoints.append({"route": route, "path": str(path), "line": line})
            is_ui = auto and (path == auto or auto in path.parents)
            if is_ui:
                names = list(TEST_NAME.finditer(text))
                for match in names:
                    name, line = match.group(1), line_of(text, match.start()); tid = add_node("TestCase", name, str(path), line)
                    edges.append([fid, "DECLARES", tid]); tests.append({"id": f"test:{path}:{line}", "name": name, "path": str(path), "line": line,
                        "has_assertion": bool(re.search(r"\b(?:expect|assert|should|verify)\b", text[max(0, match.start()-100):match.start()+1200], re.I))})
                for rule, pattern, priority, message in RISK_RULES:
                    for match in pattern.finditer(text):
                        line = line_of(text, match.start()); rid = add_node("Risk", rule, str(path), line)
                        edges.append([fid, "EVIDENCED_BY", rid]); risks.append({"risk_id": f"risk:{hashlib.sha1((str(path)+str(line)+rule).encode()).hexdigest()[:10]}", "priority": priority, "classification": rule, "confidence": "static-candidate", "path": str(path), "line": line, "reason": message})
                for test in [x for x in tests if x["path"] == str(path) and not x["has_assertion"]]:
                    risks.append({"risk_id": f"risk:{hashlib.sha1((test['id']+'assert').encode()).hexdigest()[:10]}", "priority": "P1", "classification": "missing-assertion", "confidence": "static-candidate", "path": test["path"], "line": test["line"], "reason": "Test definition has no nearby assertion keyword; verify manually."})
    test_routes = set()
    if auto:
        for path in scan_files(auto):
            try: content = path.read_text(encoding="utf-8", errors="ignore")
            except OSError: continue
            test_routes.update(ENDPOINT.findall(content))
    for item in endpoints:
        if item["route"] not in test_routes:
            risks.append({"risk_id": f"gap:{hashlib.sha1((item['path']+item['route']).encode()).hexdigest()[:10]}", "priority": "P2", "classification": "unmapped-code-entry-point", "confidence": "inferred", "path": item["path"], "line": item["line"], "reason": f"Endpoint {item['route']} has no literal UI/API-test route match; inspect domain-level mapping."})
    graph = ["digraph CodeGraph {", "rankdir=LR; node [shape=box, style=rounded, fontsize=10];"]
    for n in nodes: graph.append(f'"{n["id"]}" [label="{dot_label(n["kind"] + ": " + n["name"])}"];')
    for a, label, b in edges: graph.append(f'"{a}" -> "{b}" [label="{label}"];')
    graph.append("}"); dot = graph_dir / "overview.dot"; dot.write_text("\n".join(graph) + "\n", encoding="utf-8")
    if shutil.which("dot"):
        for fmt in ("svg", "png"): subprocess.run(["dot", f"-T{fmt}", str(dot), "-o", str(graph_dir / f"overview.{fmt}")], check=False)
    kb = {"generated_at": datetime.now(timezone.utc).isoformat(), "mode": "static-only", "nodes": nodes, "edges": [{"from": a, "type": t, "to": b} for a,t,b in edges], "symbols": symbols, "endpoints": endpoints, "tests": tests, "imports": imports, "risks": risks, "exclusions": ["No source execution", "No runtime coverage proof", "Regex-based generic extractor; use semantic tool for precise call/data flow"]}
    (out / "knowledge-base.json").write_text(json.dumps(kb, indent=2) + "\n", encoding="utf-8")
    summary = ["# Local Code Knowledge Base", "", "## Scan summary", f"- Mode: static-only", f"- Files indexed: {file_total}", f"- Symbols: {len(symbols)}", f"- Endpoints: {len(endpoints)}", f"- UI tests: {len(tests)}", f"- Risk/gap candidates: {len(risks)}", "", "## Evidence", "See `knowledge-base.json`, `graphs/overview.dot`, and `static-ui-analysis.json`. Candidates are not runtime coverage proof."]
    (out / "knowledge-base.md").write_text("\n".join(summary) + "\n", encoding="utf-8")
    (out / "static-ui-analysis.json").write_text(json.dumps({"mode": "static-only", "risks_and_gaps": risks, "test_route_literals": sorted(test_routes)}, indent=2) + "\n", encoding="utf-8")
    with (out / "ui-static-risk-and-gaps.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["risk_id", "priority", "classification", "confidence", "path", "line", "reason"]); writer.writeheader(); writer.writerows(risks)
    print(out / "knowledge-base.md")

if __name__ == "__main__": main()
