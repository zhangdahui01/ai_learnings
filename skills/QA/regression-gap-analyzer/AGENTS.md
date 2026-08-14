# Regression Gap Analyzer — Agent Instructions

Use this repository as a portable, local-only code-graph and regression-gap analysis pack. Read `SKILL.md` before performing analysis. Use `GUIDELINE.zh-CN.md` or `GUIDELINE.en.md` only for onboarding and installation detail.

## Safe default

Use the zero-install static path first. Do not execute target code, install packages, start containers, upload source, or access production systems unless the user explicitly approves it. Keep analysis output outside this repository and preserve source path/line evidence for every finding.

## Beginner workflow

1. Ask for code repository paths, optional UI automation repository path, and output path.
2. If Python, Git, GitHub CLI, or Graphviz is missing, ask approval before running `bash scripts/bootstrap.sh --install-core`.
3. Run `bash scripts/run_static_scan.sh --repo <repo> [--repo <repo>] [--automation <repo>] --out <out>`.
4. Read the generated knowledge base and static UI risk output before drafting a ranked gap report.
5. Label static findings as `static-candidate` or `inferred`; never claim runtime coverage without supplied execution evidence.

For advanced Java or semantic analysis, consult `references/toolchain.md`; never make it a prerequisite for the baseline scan.
