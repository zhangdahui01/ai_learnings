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

### Highlighted files: detailed responsibilities

The highlighted files are the Skill's own quality rules and executable pipeline, not product code from the repositories being scanned. They work together without modifying, building, or executing the target repositories.

```text
Repositories + UI automation
           │
           ▼
run_static_scan.sh (beginner command facade)
           │
   ┌───────┴────────┐
   ▼                ▼
preflight.py   static_index.py
inventory      graph + knowledge base + UI risks/gaps
   │                │
repo-inventory  DOT/SVG/PNG + JSON/CSV/Markdown
           │
           ▼
render_html_report.py → report.html
```

| File | Type / user | Specific role | Reads | Produces |
|---|---|---|---|---|
| `references/report-contract.md` | Rule document; read by an Agent before report drafting/review | Requires source evidence, confidence, and priority for every risk/gap; prevents a static inference being described as real coverage. | Nothing. | No direct artifact; governs JSON, CSV, and HTML report content. |
| `references/static-ui-analysis.md` | Rule document; design basis for the Agent and indexer | Defines source-only UI risks: fixed waits, brittle selectors, skip/retry, missing assertions, shared state, and possible secrets. Defines how code entry points become investigation-only test gaps. | Nothing. | No direct artifact; governs risk class, evidence level, and wording. |
| `references/toolchain.md` | Tool-selection document; read before deep analysis | Explains when to use the baseline indexer, Graphviz, jQAssistant, Joern, CodeQL, or Tree-sitter. | Nothing. | No direct artifact; guides semantic-tool selection. |
| `scripts/preflight.py` | Executable Python; invoked by the facade | Records Git SHA, languages, build markers, likely test files, and locally available tools: the reproducibility receipt for a run. | Directory structure, filenames, Git metadata; skips generated/dependency folders and never runs source. | `repo-inventory.json`. |
| `scripts/run_static_scan.sh` | Executable Bash; normal user entry point | Validates Python/arguments and calls the three downstream steps with repeated `--repo`, optional `--automation`, and `--out`. | Command-line paths and arguments. | No direct data; orchestrates every scan artifact and prints the HTML path. |
| `scripts/static_index.py` | Executable Python; default analysis engine | Zero-install cross-language text/regex index for files, declarations, imports, HTTP routes, UI test names, and UI risks. Compares backend/UI literal routes to create reviewable gaps; it is not a compiler. | Supported source-code text only; never `.env`, build outputs, dependency cache, or executed code. | `knowledge-base.json/md`, `graphs/overview.dot`, optional SVG/PNG, `static-ui-analysis.json`, and `ui-static-risk-and-gaps.csv`. |

The `references/*.md` files are Agent decision/quality guardrails: do not execute them. The scripts are executable. In normal use, execute only `run_static_scan.sh`; run `preflight.py` or `static_index.py` separately only when debugging the Skill.

### Actual scan sequence

```bash
bash scripts/run_static_scan.sh \
  --repo /work/order-service \
  --automation /work/order-ui-e2e \
  --out /tmp/order-analysis
```

1. `run_static_scan.sh` validates Python 3.10+ and complete arguments.
2. `preflight.py` writes repository revision, language/build/test markers, and tool availability to `repo-inventory.json`.
3. `static_index.py` builds the `Repository → File → Symbol/Endpoint/TestCase/Risk` graph and uses Graphviz when installed.
4. `render_html_report.py` reads the graph and JSON results, then creates `report.html`.

Each static finding is traceable to a source file and line. A backend endpoint without a literal UI route is only an `inferred` investigation candidate, never proof that the feature is untested.

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

### Deep graph tools: purpose, official docs, usage, and minimal demos

The normal scan uses `static_index.py` plus Graphviz. It is zero-install and does not need a build. jQAssistant, Joern, and CodeQL are optional enrichments; `run_static_scan.sh` does not launch them automatically because they may require a build, download dependencies, use substantial disk/RAM, and need explicit scope approval.

| Tool | What it does | Best use in this Skill | Do not claim |
|---|---|---|---|
| [jQAssistant](https://jqassistant.github.io/jqassistant/current/) | Imports Java/JVM, Maven, and file structures into a local embedded Neo4j; query with Cypher. | Durable Java multi-repository architecture graph, module/dependency review, architecture rules. | Source/bytecode structure is not proof of UI test execution or coverage. |
| [Joern](https://docs.joern.io/) | Generates a Code Property Graph (AST + CFG + PDG + calls/data flow) and queries it with CPGQL. | Bounded tracing from an entry point through calls to a sensitive sink; authorization/error/data-flow review. | A whole-repository CPG image is not a useful human report. |
| [CodeQL](https://codeql.github.com/docs/codeql-overview/about-codeql/) | Builds a semantic database and runs QL queries with explainable data-flow findings and SARIF output. | Verify a specific gap hypothesis or run cross-language security/quality queries when the normal project build works. | Complete compiled-language results without a successful regular build. |

#### jQAssistant — Java architecture graph and local Neo4j

Official links: [User Manual](https://jqassistant.github.io/jqassistant/current/) · [command-line tasks](https://jqassistant.github.io/jqassistant/current/#_command_line) · [scanner and rules](https://jqassistant.github.io/jqassistant/current/#_scanner). It requires JDK 11+; this Skill installs JDK 17 and SDKMAN jQAssistant. Main tasks include `scan`, `server`, `effective-configuration`, `available-rules`, and `analyze`.

Minimal demo, only in an authorized project/example:

```bash
jqassistant effective-configuration
jqassistant scan -f java:classpath::target/classes
jqassistant server  # then open http://localhost:7474
```

Example Cypher in Neo4j Browser:

```cypher
MATCH (a:Artifact)-[:CONTAINS]->(t:Type)-[:DECLARES]->(m:Method)
RETURN a.fileName AS artifact, t.fqn AS type, count(m) AS methods
ORDER BY methods DESC LIMIT 20;
```

For a Maven project, the reproducible integration is the jQAssistant Maven plugin plus `mvn jqassistant:scan jqassistant:analyze`. It modifies project configuration and can run Maven, so obtain owner approval first.

#### Joern — CPG, control flow, and data flow

Official links: [installation](https://docs.joern.io/installation/) · [quickstart](https://docs.joern.io/quickstart/) · [CPGQL](https://docs.joern.io/cpgql/) · [Java frontend](https://docs.joern.io/frontends/java/). Joern combines AST, CFG, and PDG into a queryable CPG; use it for bounded entry-point-led investigation.

Minimal demo on a small Java module:

```bash
joern
```

At `joern>`:

```scala
importCode(inputPath="/absolute/path/small-java-module", projectName="small-java")
cpg.method.name.l
cpg.method.name("processOrder").callIn.code.l
exit
```

This creates a local CPG project, lists methods, and finds callers of `processOrder`. Limit large repositories to a module/entry point; allocate memory if needed, for example `joern -J-Xmx8G`. For repeatable jobs use [script mode](https://docs.joern.io/interpreter/): `joern --script query.sc --param cpgFile=/path/to/cpg.bin.zip`.

#### CodeQL — build-aware semantic queries

Official links: [overview](https://codeql.github.com/docs/codeql-overview/about-codeql/) · [CLI setup](https://docs.github.com/en/code-security/how-tos/scan-code-for-vulnerabilities/scan-from-the-command-line/setting-up-the-codeql-cli) · [`database create`](https://docs.github.com/en/code-security/codeql-cli/manual/database-create) · [`database analyze`](https://docs.github.com/en/code-security/codeql-cli/manual/database-analyze). CodeQL extracts a database first, then runs a query/suite; output is commonly SARIF.

Minimal demo. For Java and other compiled languages, the build command must be the project's normal successful build, so obtain approval before executing it:

```bash
codeql resolve languages
codeql resolve packs
codeql database create /tmp/order-codeql-db \
  --language=java-kotlin \
  --command="./mvnw -DskipTests package"
codeql database analyze /tmp/order-codeql-db \
  --format=sarif-latest \
  --output=/tmp/order-codeql.sarif \
  <query-suite-or-pack>
```

`<query-suite-or-pack>` is deliberately variable: use `codeql resolve packs` and choose a locally visible suite/pack. Databases and SARIF can contain source paths, diagnostics, and findings, so retain, share, or upload them only in an approved environment. CodeQL is not required for the Skill's fast static report.

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
