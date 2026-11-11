# Job: repair one failure group in web cases (daily run)

Context gives one failure group: `kind`, `level` (`auto` or `propose`), the cases, the failures with evidence paths, the linked PR, and the selectors the knowledge base knows.

## Diagnose first

1. Read the error and, for each case, `test-results/**/error-context.md` (page snapshot at failure), the screenshot and the trace (`npx playwright show-trace <trace.zip>` is interactive; read the snapshot file instead).
2. Open the page object and find the locator or wait that failed.
3. Compare with the page as it is now (Playwright MCP snapshot, or run the case headed with `--debug` off and read the new snapshot). Decide which of these is true and write it down with evidence:
   - the element still exists with a new role/name/id → **locator drift**
   - the element appears later or after a new async step → **wait drift**
   - the flow has a new or removed step → **flow change** (propose only)
   - the data or account is not in the expected state → **test data** (propose only)
   - the product no longer does what the Then says → **possible product bug**: stop, change nothing, `needs_human`
4. If the linked PR explains the change, cite the file and line.

## Repair

- Fix at the shared place (page object or `support/`), once for the whole group.
- `auto` (locator, wait): replace the locator with the stable contract (role/label/test id) or the sleep/timeout with a state wait. Keep every `expect`. Keep the old locator only as a `strict()` fallback when both versions are live.
- `propose` (flow, data): write the change, link it to the product change, and stop for approval.
- Rerun every case of the group in isolation: `cd automation/web && npx playwright test <files> --retries=0`. All must pass, then run them once more.
- Land it: `workflows.case_care.submit_patch(ctx, service=..., repo=..., group=<group>, kind=<kind>, origin='daily', diff=<git diff>, files={path: content}, rerun_passed=True, tags=[...], selectors={<contract name>: <new selector>})`. It refuses a diff that touches an assertion or a skip.

## Never

- Change, weaken, reorder or delete an `expect`, an expected value, or a spec.
- Add `.first()`, `nth()`, `force: true`, retries, `waitForTimeout`, or a longer global timeout.
- Skip, `fixme` or delete a case.
- Touch a `@payment` / `@destructive` step.
- Repair anything for a failure whose origin is a gate.
