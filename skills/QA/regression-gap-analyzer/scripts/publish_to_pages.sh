#!/usr/bin/env bash
# Copy a reviewed report into the AI Hub's GitHub Pages source tree.
set -euo pipefail
usage(){ echo "Usage: bash scripts/publish_to_pages.sh --report-dir <scan-output> --name <safe-report-name>"; }
report_dir=; name=
while [ "$#" -gt 0 ]; do case "$1" in --report-dir) report_dir=$2; shift 2;; --name) name=$2; shift 2;; -h|--help) usage; exit 0;; *) echo "Unknown argument: $1" >&2; usage >&2; exit 2;; esac; done
[ -n "$report_dir" ] && [ -n "$name" ] || { usage >&2; exit 2; }
case "$name" in *[!a-zA-Z0-9._-]*|'') echo "Use only letters, digits, dot, underscore, or hyphen in --name." >&2; exit 2;; esac
source_dir=$(cd "$report_dir" && pwd); skill_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd); hub_dir=$(cd "$skill_dir/../.." && pwd); target="$hub_dir/docs/reports/$name"
[ -f "$source_dir/report.html" ] || { echo "Missing $source_dir/report.html. Run run_static_scan.sh first." >&2; exit 1; }
mkdir -p "$target/graphs"
cp "$source_dir/report.html" "$source_dir/knowledge-base.json" "$source_dir/knowledge-base.md" "$source_dir/static-ui-analysis.json" "$source_dir/ui-static-risk-and-gaps.csv" "$target/"
[ -f "$source_dir/repo-inventory.json" ] && cp "$source_dir/repo-inventory.json" "$target/"
[ -d "$source_dir/graphs" ] && cp -R "$source_dir/graphs/." "$target/graphs/"
cp "$target/report.html" "$target/index.html"
echo "Published Pages source: $target/index.html"
