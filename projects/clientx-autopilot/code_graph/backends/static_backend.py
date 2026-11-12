"""Zero-install fallback: files, top-level declarations and import edges by regex.

Shallow on purpose. It can run on a repository that does not build. Its facts are
`static-candidate`, never runtime-proven; prefer Graphify when it is installed.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

NAME = "static"
LANG = {".py": "python", ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript", ".ts": "typescript", ".tsx": "typescript",
        ".java": "java", ".kt": "kotlin", ".swift": "swift", ".go": "go", ".robot": "robot"}
SKIP_DIRS = {".git", "node_modules", "build", "dist", "target", ".venv", "venv", "__pycache__", "graphify-out",
             "Pods", ".gradle", "var"}
DECL = {
    "python": re.compile(r"^(?:async\s+)?(?:def|class)\s+(\w+)", re.M),
    "javascript": re.compile(r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class)\s+(\w+)", re.M),
    "typescript": re.compile(r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface)\s+(\w+)", re.M),
    "java": re.compile(r"^\s*(?:public|protected|private)?\s*(?:abstract\s+|final\s+)?(?:class|interface|enum)\s+(\w+)", re.M),
    "kotlin": re.compile(r"^\s*(?:class|object|interface|fun)\s+(\w+)", re.M),
    "swift": re.compile(r"^\s*(?:class|struct|protocol|func|enum)\s+(\w+)", re.M),
    "go": re.compile(r"^func\s+(?:\([^)]*\)\s*)?(\w+)", re.M),
}
IMPORT = {
    "python": re.compile(r"^\s*(?:from\s+(\.*[\w.]*)\s+import\s+\(?([\w, \t]+)|import\s+([\w.]+))", re.M),
    "javascript": re.compile(r"""(?:import\s[^'"]*from\s*|require\()\s*['"]([^'"]+)['"]"""),
    "typescript": re.compile(r"""(?:import\s[^'"]*from\s*|require\()\s*['"]([^'"]+)['"]"""),
    "java": re.compile(r"^\s*import\s+(?:static\s+)?([\w.]+);", re.M),
    "kotlin": re.compile(r"^\s*import\s+([\w.]+)", re.M),
}


def available() -> bool:
    return True


def _resolve(lang: str, spec: str, src: Path, repo: Path, files: dict[str, str]) -> str | None:
    if lang in ("javascript", "typescript"):
        if not spec.startswith("."):
            return None
        base = (src.parent / spec).resolve()
        for cand in (base, *(base.with_name(base.name + ext) for ext in (".ts", ".tsx", ".js", ".jsx", ".mjs")),
                     *(base / f"index{ext}" for ext in (".ts", ".js"))):
            try:
                rel = cand.relative_to(repo).as_posix()
            except ValueError:
                continue
            if rel in files:
                return rel
        return None
    if lang == "python" and spec.startswith("."):
        dots = len(spec) - len(spec.lstrip("."))
        base = src.parent
        for _ in range(dots - 1):
            base = base.parent
        try:
            prefix = base.relative_to(repo).as_posix()
        except ValueError:
            return None
        spec = ".".join(x for x in ((prefix.replace("/", ".") if prefix != "." else ""), spec.lstrip(".")) if x)
    parts = spec.split(".")
    while parts:
        stem = "/".join(parts)
        for rel in files:
            no_ext = rel.rsplit(".", 1)[0]
            if no_ext in (stem, stem + "/__init__") or (lang != "python" and no_ext.endswith("/" + stem)):
                return rel
        parts = parts[:-1] if lang in ("java", "kotlin") else []
    return None


def scan(repo: Path) -> dict[str, Any]:
    repo = repo.resolve()
    files: dict[str, str] = {}
    for path in sorted(repo.rglob("*")):
        if path.is_file() and path.suffix in LANG and not (set(path.relative_to(repo).parts) & SKIP_DIRS):
            files[path.relative_to(repo).as_posix()] = LANG[path.suffix]
    nodes = [{"id": f"file:{rel}", "label": rel.rsplit("/", 1)[-1], "kind": "file", "file": rel, "language": lang}
             for rel, lang in files.items()]
    edges: list[dict[str, str]] = []
    for rel, lang in files.items():
        try:
            text = (repo / rel).read_text(errors="ignore")
        except OSError:
            continue
        for name in dict.fromkeys(DECL[lang].findall(text)) if lang in DECL else []:
            sid = f"sym:{rel}:{name}"
            nodes.append({"id": sid, "label": name, "kind": "symbol", "file": rel, "language": lang})
            edges.append({"source": f"file:{rel}", "target": sid, "relation": "defines"})
        if lang in IMPORT:
            for match in IMPORT[lang].findall(text):
                if lang == "python":
                    module, names, plain = match
                    # `from pkg import a, b` may import submodules: try pkg.a first, then pkg itself
                    sep = "" if module.endswith(".") else "."
                    groups = [[f"{module}{sep}{n.strip()}", module] for n in names.split(",") if n.strip()] or [[plain]]
                else:
                    groups = [[match]]
                for specs in groups:
                    target = next((t for t in (_resolve(lang, s, repo / rel, repo, files) for s in specs if s) if t), None)
                    if target and target != rel:
                        edges.append({"source": f"file:{rel}", "target": f"file:{target}", "relation": "imports"})
    seen, unique = set(), []
    for edge in edges:
        key = (edge["source"], edge["target"], edge["relation"])
        if key not in seen:
            seen.add(key)
            unique.append(edge)
    return {"nodes": nodes, "edges": unique}
