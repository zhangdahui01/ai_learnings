---
name: tpm-ai-tool-authoring
description: Guide TPMs to design reusable, measurable, and safe AI skills or agents for goal setup, progress tracking, risk management, OKR summaries, reporting, communication, and meetings. Use when turning a TPM work item into an AI tool specification, workflow, prompt, script, agent, or skill.
---

# TPM AI Tool Authoring

Design the smallest reusable tool that improves a TPM outcome while keeping human accountability explicit.

## Workflow

1. **Frame the work item**: capture user, trigger, desired outcome, baseline minutes, frequency, inputs, sources, current steps, pain points, and unacceptable failure modes.
2. **Choose the primitive**:
   - deterministic calculation, transformation, or validation → script;
   - stable procedure, rubric, vocabulary, or output format → skill;
   - multi-step retrieval, comparison, routing, or authorized actions → agent;
   - use a skill plus agent only when the procedure and orchestration are both genuinely reusable.
3. **Write the contract**: define input schema, output schema, evidence requirements, freshness rules, confidence/unknown behavior, and whether each action is read-only, draft-only, or approval-gated.
4. **Map the TPM control points**: goal/OKR definition, owner, deadline, decision, risk acceptance, data interpretation, and communication approval must have named human owners.
5. **Design the happy path and failure path**: include stale/conflicting/missing data, permission failure, ambiguous ownership, prompt injection in source content, and tool/API failure.
6. **Add measurable acceptance tests**: at least three realistic examples, one missing-data case, one conflicting-data case, and one adversarial/sensitive case. Define correctness, evidence coverage, action safety, and review effort.
7. **Estimate ROI**: record baseline minutes, AI execution minutes, human review/edit minutes, rework minutes, quality score, and adoption. Do not count unreviewed output as productivity.
8. **Package for progressive disclosure**: keep activation and process in `SKILL.md`; put schemas, examples, platform notes, and long checklists in `references/`; put repeatable deterministic logic in `scripts/`.
9. **Run the audit skill** before pilot or release. Critical/High findings block autonomous execution.

## Required tool spec

```yaml
tool_id: kebab-case-id
work_domain: one TPM domain
outcome: measurable user outcome
trigger: explicit or event trigger
inputs: source, fields, freshness, sensitivity
outputs: schema and evidence links
actions: read_only | draft_only | approval_required
human_owner: role accountable for final decision
failure_modes: list with safe fallback
acceptance_tests: fixture IDs and pass criteria
roi: baseline_minutes, ai_minutes, review_minutes, rework_minutes
```

## TPM-specific rules

- Never turn a model inference into an OKR fact, delivery status, risk acceptance, performance statement, or commitment without a source and human confirmation.
- Prefer a traceable table before a polished narrative: `claim → value → source → as_of → confidence → owner/action`.
- For meetings, separate transcript-derived facts, decisions, open questions, and proposed actions. An action is not assigned until the owner confirms it.
- For reporting, preserve metric definitions, denominator, time window, timezone, filters, and source freshness.
- For risk, distinguish observed issue, inferred risk, impact scenario, mitigation suggestion, and escalation threshold.
- For communication, generate drafts by audience but require approval before sending externally or to a broad organization.
- Do not ingest confidential employee, customer, security, or payment data unless the approved data path and retention policy are explicit.

## Definition of done

A tool is ready for pilot only when it has: a tool spec, a deterministic output contract, evidence and unknown rules, human approval points, failure tests, ROI baseline, an audit report, and a named owner for post-release monitoring.

Read [../guideline/guideline.zh-CN.md](../guideline/guideline.zh-CN.md) for the TPM work taxonomy and transformation metrics.
