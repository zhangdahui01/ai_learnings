#!/usr/bin/env python3
"""Read-only repository inventory for static code and UI-test analysis."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SKIP = {".git", "node_modules", "build", "target", ".gradle", ".idea", "dist", "vendor", ".venv", "coverage"}
EXTENSIONS = {
    ".java": "Java", ".kt": "Kotlin", ".js": "JavaScript", ".jsx": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript",
    ".py": "Python", ".go": "Go", ".c": "C", ".h": "C/C++ header", ".cc": "C++", ".cpp": "C++", ".cxx": "C++",
    ".cs": "C#", ".rb": "Ruby", ".rs": "Rust", ".swift": "Swift", ".php": "PHP",
}
BUILD_MARKERS = ("pom.xml", "build.gradle", "build.gradle.kts", "gradlew", "mvnw", "package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "*.sln", "*.csproj", "Gemfile", "Package.swift")

def git_sha(root: Path) -> str | None:
    try:
        return subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        return None

def source_files(root: Path):
    for path in root.rglob("*"):
        if path.is_file() and not any(part in SKIP for part in path.relative_to(root).parts):
            yield path

def existing_markers(root: Path) -> list[str]:
    markers = []
    for marker in BUILD_MARKERS:
        markers.extend(str(p.relative_to(root)) for p in root.glob(marker))
    return sorted(set(markers))

def inspect(root: Path, kind: str) -> dict:
    files = list(source_files(root))
    language_counts = Counter(EXTENSIONS.get(path.suffix.lower(), "Other") for path in files if path.suffix)
    tests = [str(path.relative_to(root)) for path in files if any(token in path.name.lower() for token in ("test", "spec", "e2e", "feature"))]
    return {"path": str(root), "kind": kind, "git_sha": git_sha(root), "build_markers": existing_markers(root),
            "languages": dict(sorted(language_counts.items())), "source_file_count": sum(language_counts.values()),
            "test_files": sorted(tests)[:2000], "test_file_count": len(tests)}

def main() -> None:
    parser = argparse.ArgumentParser(description="Read-only inventory; does not build, execute, or upload source.")
    parser.add_argument("--repo", action="append", default=[], help="Repository to scan; repeat as needed.")
    parser.add_argument("--service", action="append", default=[], help="Deprecated alias for --repo.")
    parser.add_argument("--automation", help="Optional local UI automation repository.")
    parser.add_argument("--out", required=True, help="Output directory for repo-inventory.json.")
    args = parser.parse_args()
    repos = [Path(item).expanduser().resolve() for item in [*args.repo, *args.service]]
    if not repos:
        parser.error("provide at least one --repo")
    automation = Path(args.automation).expanduser().resolve() if args.automation else None
    for root in [*repos, *([automation] if automation else [])]:
        if not root.is_dir(): parser.error(f"not a readable directory: {root}")
    out = Path(args.out).expanduser().resolve(); out.mkdir(parents=True, exist_ok=True)
    tools = ("jqassistant", "joern", "codeql", "dot", "java", "mvn", "gradle", "node", "python3", "go", "cargo")
    inventory = {"generated_at": datetime.now(timezone.utc).isoformat(), "read_only": True,
                 "repositories": [inspect(root, "code-repository") for root in repos],
                 "automation": inspect(automation, "ui-automation") if automation else None,
                 "tool_availability": {name: shutil.which(name) is not None for name in tools}}
    (out / "repo-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
    print(out / "repo-inventory.json")

if __name__ == "__main__": main()
