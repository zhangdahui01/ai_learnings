---
name: release-guard
description: Triage a red gate - the pre-merge Quality Gate (CI) or the post-merge Release Gate on staging (CD) - along the seven-hop chain and produce a verdict card with evidence. Also selects which cases the CI gate runs for a PR. Use when a gate fails, when asked why a run is red, or to pick cases for a PR.
---
# Release Guard

1. Triage one run: `python -m harness emit <event.json>` with a `ci_gate_result` / `cd_gate_result` event, or call `workflows.release_guard.triage(ctx, report_id)`.
2. The chain is walked left to right; the first failed hop is the verdict: environment → accounts → device/queue → app install → traffic route → case steps → product code. Hops 1-5 are rules. For hops 6-7 a `gate-triage` agent task is written to `var/outbox/agent_task/`; act on it with `agents/gate-triage.md`.
3. Output is one card in `var/outbox/slack_card/` for the role owner. Follow-ups are automatic: `device` → Farm Autopilot, `automation_case` → Case Care.
4. A person answers: `python -m harness decide gate:<report_id> rerun|block|override --by <name>`.
5. CI case selection: a `pr_opened` event returns the smoke set plus gated cases of every journey the PR reaches through the code graph.

Rules: evidence before verdict; the gate stays red until a person decides; nothing is repaired inside a gate. Policy: `policies/gates.json`.
