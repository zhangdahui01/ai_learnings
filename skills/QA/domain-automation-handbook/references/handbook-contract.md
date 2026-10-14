# Handbook contract

Use this structure when the user asks for a task-oriented operational handbook and supplies no conflicting standard. These headings describe logical handbook pages, not every physical PDF page.

```markdown
# How to [complete the reader's task]

## Purpose
Outcome, scope and exclusions. Identify draft status and unverified activation dependencies.

## Target Audience
Who performs, reviews, operates and approves the task.

## Prerequisites
Access, supported versions, configuration, environment, data and ownership.

## Steps
Ordered actions. For each: actor, input, action, output, verification, failure route.

## Verification
Evidence that the task works, including negative checks and readiness criteria.

## Common Issues
Symptom → evidence to inspect → action → owner/escalation.

## FAQs
Decisions and misunderstandings likely to prevent adoption.

## Related Documents
Sources, supporting diagrams, reference implementation, verified tool documentation.

## Ownership
Owner:
Approver:
Review Frequency:
Last Updated:
```

Use an action title, such as “How to Add Web Regression Tests to a Domain Release Gate,” rather than a design title. Use role-based proposed owners when named ownership has not been supplied, and state that assignment is pending. A standard's example ownership table is not evidence that those teams approved a new document.

Keep an internal requirement-to-section check and source-conflict ledger while writing. Do not include authoring commentary in the reader's operational steps. In the final document, include only unresolved decisions the reader needs to configure or activate the workflow.

For any number used as a threshold, name the unit of evaluation, time window, numerator, denominator, exclusions, minimum sample and approval status. “Seven days” is insufficient without specifying scheduled observations and missing runs. Distinguish per-case graduation from suite-level reliability.
