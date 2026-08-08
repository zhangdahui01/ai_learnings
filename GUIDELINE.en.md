# Regression Gap Analyzer Guide

## 1. Purpose

This is a local Codex Skill for scanning multiple source repositories and an optional UI automation repository. Without running code, deploying services, or uploading source, it produces a code graph, a local knowledge base, UI automation risk candidates, and reviewable regression-test gaps.

It is intended for multi-service systems where UI automation is local-only and code-to-test traceability is weak.

## 2. How it works

```text
Local code repositories ─┐
                         ├─> read-only static scan ─> DOT graph ─> SVG/PNG (optional)
UI automation repository ─┘             │
                                        ├─> knowledge-base.json / .md
                                        └─> UI risks, mapping candidates, test gaps
```

The zero-install layer indexes files, declarations, imports, endpoint literals, tests, and common UI-risk patterns. Optional semantic engines add more precise architecture, control-flow, or data-flow facts. Every claim must retain source/line evidence.

Evidence levels are `static-candidate` (direct source fact), `inferred` (semantic/domain mapping requiring review), and `proven-runtime` (only with supplied local execution evidence). A missing mapping is an investigation candidate, not proof that a test is missing.

## 3. Files

| File | Purpose |
|---|---|
| `SKILL.md` | Codex execution contract and safety/evidence rules. |
| `scripts/preflight.py` | Read-only inventory of repositories, languages, tests, and tools. |
| `scripts/static_index.py` | Zero-install graph, local KB, and static UI risk/gap generator. |
| `references/toolchain.md` | Tool-selection rules. |
| `references/static-ui-analysis.md` | UI source-risk and gap rules. |
| `references/report-contract.md` | Required report fields and confidence definitions. |
| `agents/openai.yaml` | Codex UI metadata. |
| `.gitignore` | Prevents generated output, copied repos, and secrets from commits. |

## 4. Setup and dependencies

### One-command baseline setup (recommended)

From this repository root, run:

```bash
bash scripts/bootstrap.sh --install-core
```

On supported macOS/Linux systems it checks and installs Python 3, Git, GitHub CLI, and Graphviz. If Homebrew is missing on macOS, it invokes the official Homebrew installer first. It downloads software and may require an administrator password, so run it only after approval. It uses no `pip` package, reads no target repository, and starts no server.

Afterwards, scans automatically produce DOT, SVG, and PNG. To inspect without installing, run `bash scripts/bootstrap.sh --check`.

### Optional semantic tools

| Goal | Tool / prerequisite | Install only when |
|---|---|---|
| Java architecture and dependency graph | jQAssistant; JDK 11+, preferably 17 | Persistent JVM architecture queries are needed. |
| CFG/PDG/data-flow deep dive | Joern; JDK 19 per its documentation | Branch or parameter-flow analysis is required. |
| Precise multi-language semantics | CodeQL CLI; normal builds may be needed for compiled languages | You need validated call/data-flow or security queries. |
| Syntax inventory fallback | Tree-sitter | A semantic engine does not support the language. |

Do not install advanced tools for a first run. When they are needed and licensing/network policy permits it, run `bash scripts/bootstrap.sh --install-all`. It invokes `install_advanced_tools.sh` to install JDKs, jQAssistant, Joern, and CodeQL locally; the official Joern installer still presents its own confirmation prompts. jQAssistant runs an embedded local Neo4j only; it does not deploy a server.

## 5. Supported coding agents

| Agent | Entry point | Invocation |
|---|---|---|
| Codex | root `SKILL.md`; install under `~/.codex/skills/` | Use `$regression-gap-analyzer`. |
| Claude Code | root `CLAUDE.md`, importing `AGENTS.md` | Run Claude Code in this repository and ask it to follow `SKILL.md`. |
| Devin | `.agents/skills/regression-gap-analyzer/SKILL.md` | Connect the repo and use `@skills:regression-gap-analyzer`. |
| Other compatible agents | `AGENTS.md` and root `SKILL.md` | Ask the agent to read both files before analysis. |

The entry points share one canonical workflow to prevent agent-specific drift.

## 6. Recommended Codex invocation

```text
Use $regression-gap-analyzer for a full static scan.

Code repositories:
- /absolute/path/payment-service
- /absolute/path/order-service

UI automation repository:
- /absolute/path/payment-ui-e2e

Output directory:
- /absolute/path/payment-analysis

Create a code graph, local knowledge base, UI static risks, and regression-test gaps.
Do not run builds, tests, Docker, deployment, or install tools.
```

For a focused re-run, specify a feature, module, endpoint group, or Git range. Build the full knowledge base once; use bounded slices afterward for readable graphs.

## 7. Simplified manual workflow

```bash
bash scripts/run_static_scan.sh \
  --repo /absolute/path/payment-service \
  --repo /absolute/path/order-service \
  --automation /absolute/path/payment-ui-e2e \
  --out /absolute/path/payment-analysis
```

Review `knowledge-base.md` and `ui-static-risk-and-gaps.csv` first. Ask Codex to draft the final report only from source evidence. QE and service owners must review P0/P1 candidates; never copy possible secret values into a report.

## 8. Outputs

- `repo-inventory.json`: scan scope and environment inventory.
- `graphs/overview.dot`: graph source for every scan.
- `graphs/overview.svg` / `.png`: when Graphviz is available.
- `knowledge-base.json`: graph nodes/edges, symbols, endpoints, tests, risks, and evidence for later local retrieval.
- `knowledge-base.md`: human-readable summary.
- `static-ui-analysis.json`: UI static risks and route-mapping candidates.
- `ui-static-risk-and-gaps.csv`: review backlog before import to a test-management tool.

## 9. Innovations and limitations

The design does not require production access or server-side JaCoCo. It joins code structure, UI test intent, risk rules, and evidence level in one local knowledge layer; it creates readable feature/module slices from a full graph; and it gives beginners a zero-install path.

The baseline extractor is heuristic, not a compiler. Reflection, generated code, dynamic routing, proxies, configuration-driven injection, and remote calls can create false positives or omissions. Do not interpret every graph edge as a runtime path or add UI tests merely to increase line coverage.

## 10. Package and share

This folder is the shareable repository root. Before pushing, verify that no business code, real reports, `.env` files, tokens, or output directories are present:

```bash
git init
git add SKILL.md GUIDELINE.zh-CN.md GUIDELINE.en.md agents scripts references .gitignore
git commit -m "Add regression gap analyzer skill"
```

Recipients install it with:

```bash
git clone <YOUR_REPOSITORY_URL> ~/.codex/skills/regression-gap-analyzer
```

Restart or refresh Codex, then invoke `$regression-gap-analyzer`. Every recipient should first run `bash scripts/bootstrap.sh --install-core`, then `run_static_scan.sh`; advanced semantic engines remain optional. Never copy target business repositories into this Skill repository.
