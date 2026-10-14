# BDD web automation adoption guide

Read for a handbook that converts manual regression scenarios into maintained web tests and CI/CD gate coverage. The following is authoring guidance, not an assertion that a target framework implements these features.

## Portable workflow

Keep these concepts distinct: knowledge preparation; manual case intake; BDD generation; QA plan approval; script generation; human script sign-off; scheduled stability runs; gate qualification and activation. Use the source's canonical numbering consistently.

A batch converter that ingests spreadsheet rows and validates a domain precondition registry is an application-specific component. Do not imply installing a browser testing library installs that converter, its UI, a scheduler, or a CI integration. Markdown Given/When/Then plans do not automatically require a Gherkin/Cucumber execution layer.

Define configuration slots for domain ID, optional tenant, region, browser/locale, base URL, release-candidate identity, source/test repositories, account/data references, precondition handlers, knowledge snapshot, fixtures, output destination, CI runner/job, reports, alert route and owners. Do not globally transplant pilot account names, business rules, production URLs or payment helpers.

## Minimum walkthrough

1. Validate access and environment with a known seed/smoke test. Pin the toolchain and lockfile; check any installation or agent initialization commands against the selected version.
2. Import identified scenarios while retaining workbook/sheet/row provenance. Require concrete expected results and data lifecycle requirements.
3. Generate one BDD plan per scenario or explicitly mapped group. Unknown precondition keys or contradictory requirements go to a domain expert, not a guessed implementation.
4. Approve the exact BDD revision. Include actionable Given/When/Then, common checks, explicit cleanup or a justified no-side-effect declaration, and supported tags.
5. Generate or record the script using the approved fixtures. Use recording as evidence rather than proof of assertion quality. Configure a bounded repair budget and escalation path.
6. Review trace, business assertions, failure behavior and cleanup; approve the exact script revision. Changed behavior, assertion, plan, fixture or material script changes require review.
7. Collect scheduled run evidence before graduation. Separate original first-run outcomes, retries, healed candidates, skips, missing runs and quarantined coverage.
8. Freeze qualified tests and the target release candidate, wire a required CI result to release promotion, and verify both a success and a deliberate failure in a safe test pipeline.

## Execution and release semantics

Daily freshness and the release gate have different jobs. Daily execution detects drift; a repair agent may propose reviewed patches. The release gate evaluates approved tests against a specific candidate and must not silently modify tests or expectations during the decision.

A failed gate is evidence to classify as product, test, environment/data or unknown. It is not automatic proof of a product defect. Preserve the failed run and keep required coverage unresolved until a verified fix or an explicitly authorized exception. Removing a failing test does not repair the product and must not automatically unblock release.

For a quarantine, record scenario, lost coverage, reason, evidence, owner, expiry, repair issue and compensating verification. Name the authority for release exceptions. Skips, missing results, zero selected tests and quarantine are not passing evidence. Describe return-to-gate review and requalification separately.

Repair must preserve test intent. Do not endorse weaker assertions, unapproved new expected values, unconditional waits/retries, or skipping broken functionality as a fix. Require isolated replay and review before a candidate enters the approved suite. Keep original metrics and patch provenance.

## Maintenance and metrics

Describe daily triage; periodic quarantine and flaky-case review; knowledge/fixture refresh after product changes; toolchain upgrade validation; and rollback to known approved versions. Cleanup must be idempotent and verifiable. A failed cleanup remains visible and has a recovery owner.

Define first-run reliability separately from eventual retry success, flaky rate, repair acceptance, quarantine coverage loss, freshness, gate duration and regression detection. Do not import pilot targets as universal service commitments. Name metrics with explicit denominators and pending policy approval where needed.

## Example decision

An approved search scenario fails because the expected result is absent. Retain the failure and candidate build ID. Inspect trace, data and product evidence. Do not change the expected result to what the UI currently shows. If a confirmed locator change caused the issue, propose the locator patch, replay the original assertion, obtain review and requalify. If the product regressed or the cause is unknown, keep the required release check unresolved and escalate.
