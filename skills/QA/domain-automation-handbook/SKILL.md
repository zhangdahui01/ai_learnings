---
name: domain-automation-handbook
description: Use when converting an automation framework design or pilot documentation into an operational handbook for other domains, including BDD generation, web test maintenance, and CI/CD quality-gate adoption.
---

# Domain Automation Handbook

Turn a design into instructions that tell a domain team what to do, why, and how to verify the result. This skill authors documentation; it does not implement or operate the described framework.

## Inputs and scope

Read the supplied authoring standard, framework documentation, and relevant diagrams first. Confirm the intended audience, language, delivery surfaces, and whether repository/runtime evidence is available. Proceed with a useful draft when configuration is missing; identify the exact activation dependencies rather than inventing endpoints, commands, owners, or completed integrations.

Use [the handbook contract](references/handbook-contract.md) for the default structure. A user-supplied standard takes precedence. For BDD/web quality-gate adoption, also read [the adoption guide](references/web-automation-adoption.md). Do not load unrelated repository skills.

Use [the activation record](references/activation-record.md) when concrete configuration or evidence handoff is needed; remove fields that do not apply.

## Transformation

1. Build a private source map: source location, relevant claim, supported operational instruction, and unresolved conflict. Separate observed implementation, design intent, historical status, proposed policy, and illustrative examples.
2. Inspect diagrams and screenshots, not just extracted text. Record each figure's source page, meaning, labels, decision branches, and destination in the handbook. Screenshots demonstrate the captured version; they do not prove the current deployment or CI integration exists.
3. Define the portable contract: domain identity, repositories, URLs, environment, accounts/data references, preconditions, fixtures, supported versions, runner, case selection, result reporting, ownership, and escalation. Replace pilot-specific configuration semantically, including inside figures, captions, paths and examples. Preserve operational distinctions such as daily baseline versus release-candidate execution.
4. Write task-oriented steps with actor, input, action, output, success evidence, and failure route. Preserve distinct human approvals and traceability from manual scenario to plan, script revision, run, and gate decision. Keep benchmarks and historical pilot statistics out of the instructions unless needed and clearly labeled.
5. Make a small end-to-end example: manual scenario → approved BDD → generated script → replay evidence → qualification → required CI check. Mark fictional examples and local integration adapters. Do not present an example manifest or shell command as an installed product feature.
6. Reconcile conflicting numbering and thresholds explicitly. Select a consistent documented workflow; record any changed interpretation as a proposal requiring the relevant owner to adopt. Do not silently turn an ambiguous percentage, historical date, or aspirational capability into policy.
7. Include maintenance, failure classification, cleanup, quarantine, recovery and re-entry procedures. Explain who makes a release exception and what evidence is retained. See the adoption guide for BDD-specific distinctions.

## Figures and delivery

- Follow the requested tools and destinations. A reusable skill does not imply authorization to publish source documents, send messages, or operate production.
- For a neutral diagram deck, preserve source relationships and decision paths while replacing pilot names and configuration. Include a figure map. If UI screenshots are redrawn as schematic workflows, label them illustrative and describe that fidelity choice.
- Required approval gates belong on the execution path. If a source figure appears to bypass one, reconcile it with the authoritative workflow rather than copying the misleading edge.
- Insert the same verified new figures into the handbook. Check visible labels, image legibility, captions, source references and links after export/import. Do not claim screenshots or diagrams are editable when they are embedded bitmaps.
- Keep confidential source files, private evidence maps, credentials and internal example data outside public repositories. Publish only the requested generic skill resources unless other content is explicitly authorized for that destination.

## Validation

Verify all required headings and ownership fields. Then perform a reader walkthrough: can a domain identify its inputs, complete one scenario, find evidence, interpret a failure, and determine whether CI activation is ready?

Check that unresolved activation inputs are visible, sample commands are labeled and grounded, native controls or required images survived conversion, and the handbook never equates skipped/missing cases or healed results with original first-run success. Check consistency across prose, figures, templates, and metric definitions.

Read back remote artifacts before delivering verified links. Report actual limitations, not a claim that the framework was deployed or tested merely because a handbook was written.
