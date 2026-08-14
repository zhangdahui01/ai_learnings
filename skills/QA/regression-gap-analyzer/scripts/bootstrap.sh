#!/usr/bin/env bash
# Install the beginner baseline: Python 3, Git, GitHub CLI, and Graphviz. No source repo is touched.
set -euo pipefail
usage(){ echo "Usage: bash scripts/bootstrap.sh [--check|--install-core|--install-all] [--yes]"; }
if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
if [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"; fi
mode=check; assume_yes=false
for arg in "$@"; do case "$arg" in --check) mode=check;; --install-core) mode=install;; --install-all) mode=all;; --yes) assume_yes=true;; -h|--help) usage; exit 0;; *) echo "Unknown option: $arg" >&2; usage >&2; exit 2;; esac; done
missing=(); for tool in python3 git gh dot; do command -v "$tool" >/dev/null 2>&1 || missing+=("$tool"); done
if [ "${#missing[@]}" -eq 0 ]; then
  echo "Baseline ready: Python=$(python3 --version 2>&1), Git=$(git --version), GitHubCLI=$(gh --version | head -n 1), Graphviz=$(dot -V 2>&1)"
  [ "$mode" != all ] && exit 0
else
  echo "Missing baseline tools: ${missing[*]}"
  [ "$mode" = check ] && { echo "Run: bash scripts/bootstrap.sh --install-core"; exit 1; }
fi
if [ "$assume_yes" = false ]; then printf 'This will install local development packages and may request an administrator password. Continue? [y/N] '; read -r answer; case "$answer" in y|Y|yes|YES) ;; *) echo "Cancelled."; exit 0;; esac; fi
platform=$(uname -s)
if [ "$platform" = Darwin ]; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew is required on macOS. Installing it from brew.sh..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
    [ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
  fi
  brew install python git gh graphviz
elif command -v apt-get >/dev/null 2>&1; then sudo apt-get update; sudo apt-get install -y python3 git gh graphviz
else echo "Unsupported package manager. Install Python 3.10+, Git, GitHub CLI, and Graphviz, then rerun --check." >&2; exit 2; fi
if [ "$mode" = all ]; then
  advanced_args=(--all); [ "$assume_yes" = true ] && advanced_args+=(--yes)
  bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install_advanced_tools.sh" "${advanced_args[@]}"
fi
exec bash "$0" --check
