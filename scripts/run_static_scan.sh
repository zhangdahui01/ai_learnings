#!/usr/bin/env bash
# Beginner-friendly wrapper around the two read-only Python scripts.
set -euo pipefail
root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
command -v python3 >/dev/null 2>&1 || { echo "Python 3 is missing. Run: bash $root_dir/scripts/bootstrap.sh --install-core" >&2; exit 1; }
python3 - <<'PY'
import sys
if sys.version_info < (3, 10): raise SystemExit("Python 3.10+ is required. Run bootstrap.sh after installing a newer Python.")
PY
repos=(); automation=; out=
while [ "$#" -gt 0 ]; do case "$1" in --repo) repos+=("$2"); shift 2;; --automation) automation=$2; shift 2;; --out) out=$2; shift 2;; -h|--help) echo "Usage: bash scripts/run_static_scan.sh --repo <path> [--repo <path>] [--automation <path>] --out <path>"; exit 0;; *) echo "Unknown or incomplete argument: $1" >&2; exit 2;; esac; done
[ "${#repos[@]}" -gt 0 ] && [ -n "$out" ] || { echo "At least one --repo and --out are required." >&2; exit 2; }
args=(); for repo in "${repos[@]}"; do args+=(--repo "$repo"); done; [ -n "$automation" ] && args+=(--automation "$automation")
python3 "$root_dir/scripts/preflight.py" "${args[@]}" --out "$out"
python3 "$root_dir/scripts/static_index.py" "${args[@]}" --out "$out"
echo "Done. Open: $out/knowledge-base.md"
