# TPM Agentic AI Transformation Guideline

## Purpose

This guideline defines how TPM work becomes a measurable, reusable, and auditable AI-enabled operating model. The goal is not to add isolated prompts. The goal is to improve TPM productivity while preserving evidence, human accountability, security, and decision quality.

## Architecture

```text
TPM work inventory
        ↓
Standard work-item model
        ↓
Script / Skill / Agent selection
        ↓
Tool specification and implementation
        ↓
Audit gate
        ↓
Pilot and human approval
        ↓
Time, quality, risk, and adoption metrics
        ↺ continuous improvement
```

The two TPM skills in this folder implement the core lifecycle:

- `tpm-ai-tool-authoring`: turns a TPM work item into a tool specification and implementation plan.
- `tpm-ai-tool-auditor`: checks structure, content, reliability, code, data governance, and security before release or autonomous execution.

## TPM work taxonomy

| TPM work | AI can support | Human accountability remains |
|---|---|---|
| Org setup and goals | Draft goals, owners, milestones, and gap checks | Prioritization, commitments, and accountability |
| Progress tracking | Gather status, detect drift, draft weekly updates | Status truth, escalation, and next actions |
| Risks and dependencies | Cluster risks, identify dependencies, suggest mitigations | Risk acceptance, negotiation, and escalation |
| OKR summaries | Calculate progress and attach evidence | Interpretation, attribution, and performance context |
| Data analysis and reporting | Clean, slice, detect anomalies, draft narratives | Metric definitions, causal claims, and publication |
| Communication | Adapt drafts for different audiences | Commitments, sensitive wording, and final send |
| Meetings | Prepare briefs, agendas, action capture, and minutes | Decision confirmation, conflict handling, and owner confirmation |

Every work item should be represented as:

```text
Input → retrieval/transformation → judgment → output → human owner → time cost → risk
```

## Choosing the right primitive

Use the least complex primitive that reliably solves the work:

- **Script**: deterministic calculations, validations, transformations, and data-quality checks.
- **Skill**: reusable domain knowledge, procedures, rubrics, terminology, and output contracts.
- **Agent**: multi-step retrieval, comparison, routing, iteration, or authorized tool use.

The normal preference is:

```text
Script before Skill; Skill before Agent.
```

An agent may combine a skill and scripts, but orchestration should only be introduced when the task genuinely requires it.

## Tool contract

Before implementation, create a tool card with:

```yaml
tool_id: stable-kebab-case-id
work_domain: TPM domain
outcome: measurable improvement
trigger: explicit or event trigger
inputs: sources, fields, freshness, sensitivity
outputs: schema plus evidence links
actions: read_only | draft_only | approval_required
human_owner: accountable role
failure_modes: stale, missing, conflicting, or unavailable data
acceptance_tests: realistic fixtures and pass criteria
roi: baseline, AI runtime, review, and rework minutes
```

## Core design principles

1. **Outcome first**: define the time, quality, or risk improvement before choosing a model.
2. **Evidence bound**: every material claim has a source, timestamp, and confidence; otherwise return `unknown`.
3. **Human accountable**: AI may collect, organize, analyze, draft, and remind; people confirm decisions, commitments, risk acceptance, and publication.
4. **Structured output**: use stable schemas and explicit missing-value rules so results can be compared and audited.
5. **Least privilege**: read-only by default; writes, sends, and external actions require explicit approval.
6. **Progressive disclosure**: keep activation and workflow in `SKILL.md`; put long schemas and examples in references.
7. **Visible failure**: surface stale data, permission failures, low confidence, conflicting status, and tool errors.
8. **Measure net productivity**: count execution, review, and rework—not only model response time.

## TPM safety boundaries

AI must not independently finalize:

- OKR achievement or performance conclusions;
- delivery status or risk acceptance without evidence and confirmation;
- ownership or accountability assignments without owner confirmation;
- sensitive employee, customer, security, or payment-data processing outside an approved data path;
- broad organizational or external communication without human approval.

For reporting, preserve metric definition, denominator, time window, timezone, filters, source, and freshness. For meetings, separate transcript facts, decisions, open questions, and proposed actions. A proposed action is not final until the owner confirms it.

## Audit and hooks

Audit is a release and runtime control plane, not merely a style check. It covers:

```text
Structure → content quality → TPM correctness → evaluation → code quality → security/privacy
```

Use `Critical`, `High`, `Medium`, and `Low/Info` findings. Critical and High findings block autonomous execution. The policy is shared across agents, while trigger mechanisms are platform-specific:

- Claude Code: narrow `PreToolUse`, `PostToolUse`, or `Stop` hooks.
- Codex: repository CI, pre-commit, or explicit audit-skill invocation; do not assume Claude hook configuration is portable.
- Devin: project skill path plus CI/merge gates and agent approval policy.

Hooks should call a fixed, read-only scanner with bounded timeout and fail closed when the scanner cannot run. Never pipe raw model or source content into shell commands.

## Transformation metrics

For each work item, record:

```text
net saved minutes
= baseline human minutes
  - AI execution minutes
  - human review/edit minutes
  - rework minutes
```

Also measure AI participation, automation coverage, revision rate, error/escalation rate, adoption, evidence completeness, and data freshness. Report efficiency gains together with quality and risk guardrails.

## Operating cadence

- **Before pilot**: complete the tool card, acceptance fixtures, permissions, and audit report.
- **During pilot**: keep human approval, sample outputs, and log review/rework time.
- **Weekly**: review net saved minutes, adoption, quality, and failure patterns.
- **After changes**: re-audit skill text, scripts, dependencies, hooks, permissions, and output contract.
- **Before scale**: close or explicitly approve all High/Critical findings with an owner and expiry date.

## Definition of done

A TPM AI tool is ready to scale only when it has a clear outcome, structured contract, evidence rules, human approval points, failure tests, ROI baseline, audit report, named owner, and post-release monitoring plan.
