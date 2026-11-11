# Job: confirm or correct the verdict on a red gate

Context: `report_id`, `gate` (`ci` = pre-merge Quality Gate on a PR; `cd` = post-merge Release Gate on staging), the rule verdict, failed cases with evidence, the PR.

Hops 1–5 (environment, accounts, device/queue, app install, traffic route) were checked by rules and are clean. You decide hop 6 (case steps) versus hop 7 (product code).

## Collect, then conclude

1. For each failed case: the failing step, the error, the page snapshot / page source at failure, trace or video if present.
2. The PR: title, changed files, the diff of files on the failing journey. Journey ↔ code: `python -c "from harness.app import build; from code_graph import queries; d,c=build(); print(queries.journeys_touched(c.graphs.get('<service>'), <changed files>, c.kb.coverage_map('<service>')))"`.
3. History: did this case pass on the previous build? Does it fail on the main branch without the PR? Has the same locator broken before (`analytical.json`)?
4. Decide:
   - `automation_case` — the product shows the right result; the case could not find or wait for something.
   - `product_code` — the product shows a different result than the Then, and a changed line explains it (name it), or the same case passes without the PR.
   - `test_data` — the account/data was not in the state the Given requires.
   - `unknown` — the evidence does not separate these. Say what is missing.
5. For CI the consequence is "the merge stays blocked"; for CD "the release stays blocked". Suggest who acts: PR author (product), case owner (case), data owner.

Put the outcome in `verdict`: `{"category", "confidence": 0–1, "first_failed_hop": 6|7|null, "explains": "the changed file:line or the failing step", "suggested_action", "agrees_with_rule": true|false}`.

## Rules

- A product bug judged as "not a product bug" is the failure this system must not make. Between case and product with thin evidence, answer `product_code` or `unknown`.
- Never suggest passing, skipping, quarantining to unblock, or re-running until green.
- Do not edit any file.
