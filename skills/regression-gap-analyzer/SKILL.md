---
name: regression-gap-analyzer
description: Scan one or more local repositories in Java or other languages to create code graphs and a source-grounded knowledge base, statically analyze a local UI-automation repository, map tests to code and product entry points, and produce ranked risks and regression-test gaps. Use when evaluating regression coverage, exploring an unfamiliar multi-repo system, creating a code knowledge base, or identifying UI automation risks without running tests or deploying services.
---

# Regression Gap Analyzer

Create a reproducible, local and source-grounded analysis pack. Support a full-repository scan only after recording the repository list and exclusions. Prefer a bounded feature/module/Git-range view for human-readable graphs; derive it from the full graph rather than repeatedly rescanning code.

## Minimum setup and shared distribution

Require Python 3.10 or later for the baseline scripts; they use only the Python standard library. For a beginner setup run `bash scripts/bootstrap.sh --install-core`; it installs/checks Python, Git, and Graphviz on supported macOS/Linux systems and enables graph images. Then use `bash scripts/run_static_scan.sh --repo <path> --out <path>`. The installer changes the local machine and may download packages, so obtain user approval before running it. Keep outputs outside this skill/repository. Read `GUIDELINE.zh-CN.md` or `GUIDELINE.en.md` for optional advanced engines and non-Codex agents.

## Invocation

Invoke explicitly with `$regression-gap-analyzer`, then state the repository paths and desired mode:

```text
Use $regression-gap-analyzer to perform a full static scan of these repos:
- services: /absolute/path/order-service, /absolute/path/payment-service
- UI automation: /absolute/path/ui-e2e
- output: /absolute/path/analysis-output
Create the code graph, knowledge base, and static UI risks/test gaps. Do not run builds or tests.
```

For a smaller rerun, replace `full static scan` with a module, feature, API route group, or Git range. Do not clone, modify, build, execute tests, install tools, pull containers, or upload source unless the user explicitly authorizes it.

## Inputs and modes

Require readable local Git working copies. Collect `repo_roots`, optional `automation_root`, `scope`, `out_dir`, and exclusions. Accept Java, Kotlin, JavaScript/TypeScript, Python, Go, C/C++, C#, Ruby, Rust, Swift, PHP, and files handled by Tree-sitter only as syntax-level inventory.

Use one of these modes:

- **Static full scan (default):** Build a whole-repository catalog, dependency/containment graph, UI source-risk report, and knowledge base without execution.
- **Bounded analysis:** Slice an existing graph by feature/module/entry point/Git range and produce a readable graph image plus focused gaps.
- **Runtime enrichment (optional):** Attach JaCoCo, trace, or test-result evidence only when the user can run an approved local workflow. It is never required for a static report.

Run `scripts/preflight.py` first. Then run `scripts/static_index.py` for a no-build baseline. Both are local-only and read source text; neither evaluates source code or reads secret values.

## Static graph and knowledge base

1. **Inventory.** Record commit SHA, language/file counts, build markers, detected test frameworks, graph-tool availability, exclusions, and scan limits.
2. **Extract.** Create a language-agnostic graph with `Repository`, `Directory`, `File`, `Module`, `Symbol`, `Endpoint`, `MessageTopic`, `ExternalCall`, `TestCase`, `PageObject`, `Selector`, `Assertion`, `Fixture`, `Risk`, and `Evidence` nodes. Preserve `CONTAINS`, `DECLARES`, `IMPORTS`, `CALLS`, `HANDLES`, `TRIGGERS`, `ASSERTS`, `USES_SELECTOR`, `CANDIDATE_FOR`, and `EVIDENCED_BY` edges.
3. **Render.** Emit DOT on every scan. Render SVG and PNG with Graphviz if installed; SVG is canonical. For a full scan, create an overview graph; use slices for call/path detail. Never use a raw full CPG image as the report graphic.
4. **Publish the local knowledge base.** Generate Markdown and JSON indexes: repository/module overview, public endpoints, symbols, dependencies, detected test suites, UI page objects/selectors, source references, risks, and known exclusions. This is a local artifact, not a cloud RAG store. Use the JSON index and graph query IDs as retrieval evidence for subsequent AI analysis.

Read `references/toolchain.md` before choosing a deep-analysis engine, and `references/static-ui-analysis.md` before judging UI risk or test gaps.

## UI automation static analysis

Analyze source even when tests can run only on a laptop. Parse test IDs, tags, suites, steps, page objects, selectors, API/client calls, fixtures, assertions, skips, retries, waits, and test data references. Produce only source-supported conclusions:

- **Automation design risks:** hard waits, broad/brittle selectors, disabled or quarantined tests, retry masking, missing assertions, shared mutable state, order dependencies, and secrets in test sources.
- **Traceability risks:** test has no discovered entry point/API/event/domain mapping, mapping is ambiguous, or an important code entry point has no corresponding UI candidate.
- **Regression gaps:** state-transition, error, authorization, idempotency, retry/timeout, async-event, rollback, and feature-flag behaviors that are represented in code but absent from matching UI test scenarios.

Never state that a UI test truly covers a backend line/path from source matching alone. Use `static-candidate` or `inferred` confidence. Mark runtime proof as `not-collected` unless the user supplies an approved local execution artifact.

## Tool selection

Use `scripts/static_index.py` as the zero-install baseline for all languages. For durable Java architecture graphs use jQAssistant + Neo4j. For statement/data-flow CPG analysis use Joern where the language is supported. Use CodeQL for build-aware semantic analysis across its supported languages. Use Tree-sitter for syntax-only inventory where no semantic extractor exists. Use Graphviz for image output. Use a commercial visualizer only if the user already has a license. Do not silently install, execute, or deploy any tool.

## Required deliverables

- `run-manifest.json` and `repo-inventory.json`
- `graphs/overview.dot` and, if Graphviz exists, `overview.svg` and `overview.png`
- `knowledge-base.md` and `knowledge-base.json`
- `static-ui-analysis.json` and `ui-static-risk-and-gaps.csv` when an automation repository is provided
- `report.html`: a self-contained, readable summary with evidence tables and graph links
- `test-map.json`, `traceability.csv`, `gap-report.md`, and `gap-backlog.csv`

Use evidence references in every claim: source path/line span, test ID, graph node/edge ID, and tool/query version. Classify certainty as `proven-runtime`, `static-candidate`, or `inferred`.

## Gap quality bar

Rank by `business criticality × change likelihood × blast radius × observability deficit`, while separately showing confidence. Each gap must name the behavior/invariant, reason, evidence, affected code, suggested test level, scenario, and review owner. Do not create UI tests for private implementation details; recommend the lowest layer that validates the risk. Treat reflection, generated code, dynamic routing, configuration, remote services, feature flags, and unavailable test data as explicit exclusions.

Read `references/report-contract.md` before writing the final report.

## HTML report and GitHub Pages

Run `scripts/render_html_report.py --out <out_dir>` after the static index; `scripts/run_static_scan.sh` does this automatically. Review `report.html` locally before sharing. To publish only reviewed, non-sensitive output to this repository's GitHub Pages source, run `scripts/publish_to_pages.sh --report-dir <out_dir> --name <safe-name>`, then commit the generated `docs/reports/<safe-name>/` directory. Do not publish source code, tokens, customer data, or unreviewed P0/P1 findings.
