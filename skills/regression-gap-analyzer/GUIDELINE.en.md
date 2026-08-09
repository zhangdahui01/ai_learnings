# Regression Gap Analyzer — Complete Guide

## Quick start

Run commands from this module, not from the AI Hub root:

```bash
cd skills/regression-gap-analyzer
bash scripts/bootstrap.sh --install-core
bash scripts/run_static_scan.sh \
  --repo /absolute/path/service-repo \
  --automation /absolute/path/ui-automation-repo \
  --out /absolute/path/regression-analysis
```

Open `/absolute/path/regression-analysis/report.html`. It is the human-facing deliverable; CSV is for Excel/Jira and JSON is for agents and evidence review.

## Purpose and evidence model

This local, read-only-first Skill scans one or more application repositories plus an optional UI automation repository. It produces code graphs, a source-grounded knowledge base, static UI automation risks, mapping candidates, and regression-test gaps without executing target code, deploying services, accessing production, or uploading source.

| Evidence level | Meaning |
|---|---|
| `static-candidate` | Direct source fact, such as a skipped test, hard wait, or literal route. |
| `inferred` | Domain/page-object/test-name mapping that needs review. |
| `proven-runtime` | Only allowed with supplied local test, JaCoCo, or trace evidence. |

A missing literal mapping is never proof that a test is absent. Review all P0/P1 candidates with QE and the service owner.

## Contents

| Path | Purpose |
|---|---|
| `SKILL.md` | Canonical workflow, evidence contract, safety rules, and outputs. |
| `AGENTS.md` / `CLAUDE.md` | Module-specific generic-agent and Claude Code entry points. |
| `.agents/skills/regression-gap-analyzer/SKILL.md` | Devin / Agent Skills entry point. |
| `scripts/bootstrap.sh` | Check, core installation, or all-tools installation. |
| `scripts/install_advanced_tools.sh` | Install only jQAssistant, Joern, and/or CodeQL. |
| `scripts/run_static_scan.sh` | Inventory + static index + HTML report in one command. |
| `scripts/render_html_report.py` | Render `report.html` from scan artifacts. |
| `scripts/publish_to_pages.sh` | Copy a reviewed report into GitHub Pages source. |
| `references/` | Toolchain, UI static analysis, and report-contract details. |

## Installation

### Check only

```bash
bash scripts/bootstrap.sh --check
```

It checks Python, Git, GitHub CLI, and Graphviz without changing the machine.

### Core install — recommended for nearly everyone

```bash
bash scripts/bootstrap.sh --install-core
```

Installs/checks Python 3.10+, Git, GitHub CLI (`gh`), and Graphviz. It uses no `pip` package. On macOS it installs Homebrew first when necessary; on Linux it supports `apt-get`. It downloads software and can request administrator approval, so an agent must ask before running it.

### Full install — only for semantic/deep graph work

```bash
bash scripts/bootstrap.sh --install-all
```

This adds:

| Tool | Use | Prerequisite / note |
|---|---|---|
| jQAssistant | Java/JVM architecture, Maven/module/dependency graph | JDK 17 and SDKMAN. |
| Joern | CPG, CFG, PDG, deep data-flow analysis | JDK 19 is the documented tested version; Homebrew no longer provides it, so the script uses JDK 21 (a newer version that should be verified); installed under `~/.local/opt/joern` without a system-wide symlink. |
| CodeQL | Multi-language semantic/call/data-flow analysis | Compiled languages can need a regular build; Apple Silicon can require Rosetta/Xcode tools. |

Install individual tools with `bash scripts/install_advanced_tools.sh --jqassistant`, `--joern`, or `--codeql`.

### Install Graphviz manually

```bash
# macOS
brew install graphviz

# Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y graphviz

dot -V
```

Without Graphviz, the scan still produces `overview.dot`; SVG/PNG and the in-report graph image are unavailable.

### Verify and repair PATH

Open a new terminal and run:

```bash
python3 --version
git --version
gh --version
dot -V
jqassistant effective-configuration  # first run downloads its plugins; jQAssistant has no --version flag
command -v joern       # Joern has no --version flag; `joern` opens its REPL, then type exit
codeql version         # after full install
```

If advanced commands are not found:

```bash
export PATH="$HOME/.local/bin:$HOME/bin:$PATH"
```

## Agent usage

### Codex

```text
Use $regression-gap-analyzer to statically scan:
- Code repositories: /absolute/path/payment-service, /absolute/path/order-service
- UI automation repository: /absolute/path/payment-ui-e2e
- Output: /absolute/path/payment-analysis
Create a code graph, knowledge base, HTML report, CSV risks, and test gaps.
Do not run builds, tests, Docker, deployment, or installation.
```

### Claude Code

Run Claude Code in this module directory and ask it to read `SKILL.md` before analysis. `CLAUDE.md` imports the module's `AGENTS.md`.

### Devin

Connect the AI Hub repository, then invoke `@skills:regression-gap-analyzer`. Devin discovers the standard file under `.agents/skills/`.

### Other agents

Ask the agent to read this module's `AGENTS.md` and `SKILL.md`, not only the AI Hub root instructions.

## Scan outputs

```bash
bash scripts/run_static_scan.sh \
  --repo /absolute/path/payment-service \
  --repo /absolute/path/order-service \
  --automation /absolute/path/payment-ui-e2e \
  --out /absolute/path/payment-analysis
```

| Artifact | Audience | Purpose |
|---|---|---|
| `report.html` | QE, owners, management | Primary readable report: summary, graph, endpoint and risk/gap tables. |
| `ui-static-risk-and-gaps.csv` | Excel, Jira, test tools | Importable risk/gap backlog. |
| `static-ui-analysis.json` | Agents/scripts | Raw static UI findings and mapping candidates. |
| `knowledge-base.md/json` | Humans/agents | System summary and retrieval graph data. |
| `graphs/overview.dot/svg/png` | Developers/reviewers | Code graph source and images. |
| `repo-inventory.json` | Audit/reproduction | Scope, revisions, languages, and tool inventory. |

## GitHub Pages

Publish only reviewed, non-sensitive output. Never publish source code, credentials, customer data, internal URLs, or unreviewed sensitive P0/P1 findings.

```bash
bash scripts/publish_to_pages.sh \
  --report-dir /absolute/path/payment-analysis \
  --name payment-analysis-2026-08
```

The script copies the HTML, graph, CSV, and JSON to `docs/reports/payment-analysis-2026-08/` in the AI Hub. Commit and push; then enable **Settings → Pages → Source → GitHub Actions**. The repository workflow deploys `docs/` and the usual URL is:

```text
https://zhangdahui01.github.io/ai_learnings/reports/payment-analysis-2026-08/
```

## Troubleshooting and limits

| Symptom | Action |
|---|---|
| `dot: command not found` | Run `bootstrap.sh --install-core` or install Graphviz manually. |
| No Homebrew on macOS | Run the core installer; it invokes the official installer. Open a new terminal afterwards. |
| SDKMAN reports Bash 3 | Full install upgrades to Homebrew Bash. |
| `jqassistant`, `joern`, or `codeql` not found | Open a new terminal and repair PATH as above. |
| No SVG/PNG | Verify `dot -V`, then rerun the scan. |
| Pages shows 404 | Enable GitHub Actions as the Pages source and inspect the deploy workflow. |

The baseline indexer is heuristic, not a compiler. Reflection, proxies, generated code, dynamic routing, remote calls, feature flags, and configuration-driven dependencies can cause false positives or omissions. Do not add UI tests merely to raise line coverage; choose the lowest suitable layer for the business risk.
