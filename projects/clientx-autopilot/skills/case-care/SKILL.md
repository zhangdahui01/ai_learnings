---
name: case-care
description: Keep automated cases green without hiding product bugs - case states (incubating, warn, gated, quarantined, retired), failure grouping, and the Healer repair policy. Use for daily-run failures, flaky or broken cases, quarantine decisions and locator drift after a UI change.
---
# Case Care

1. Feed failures: a `case_failure` event (`origin: daily | gate`) → `python -m harness emit <event.json>`.
2. Failures are grouped by fingerprint (kind + selector/message). One group is repaired once.
3. Repair policy (`policies/healing_policy.json`): locator and wait → automatic (rerun must pass, one PR); flow, data, account → proposed to a person; assertion, expected value, skip, delete → never, the card says "possible product bug".
4. The Healer (`agents/healer.md`) lands fixes only through `workflows.case_care.submit_patch(...)`.
5. State changes: `workflows.case_care.next_state(case_stats, today)`. Quarantine needs an owner, an expiry and a reason; an unfixed case at expiry is retired, a fixed one re-enters as `incubating`.

Inside a gate nothing is repaired: the failure stays red until a person decides.
