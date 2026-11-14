# Job: implement an approved web spec (Playwright + BDD)

The spec in `automation/web/specs/<id>.md` is approved by QA; the approver's name is in the context. If it is not, stop with `needs_human`.

## Framework (read these first)

- `automation/web/support/bdd.ts` — `scenario('<id>', async ({ page, bdd }) => { ... })`. Each `await bdd.Given|When|Then|Cleanup('<text>', async () => {...})` must use the spec's bullet text verbatim, in order. Drift fails the test with `SPEC_DRIFT`.
- `automation/web/support/strict.ts` — `strict(name, [primary, ...fallbacks], test.info())`: 0 matches waits, 1 acts, more than 1 throws `LOCATOR_AMBIGUOUS`.
- `automation/web/pages/` — page objects. Extend one before writing locators in a test.
- `knowledge-base/<service>/operational.json` — known stable selectors and auth flows.

## Steps

1. Read the spec, the page objects, and the selectors in the knowledge base.
2. Explore the real page when a locator is unknown: use the Playwright MCP server (accessibility snapshot) or `npx playwright codegen <url>`. Take the role/name, label or test id you see. Never store a snapshot `ref`.
3. Write `automation/web/tests/<id>.spec.ts`. Put interactions in the page object; the test reads like the spec.
4. Locator order of preference: `getByRole` with name → `getByLabel` → `getByTestId` → scoped CSS. No `nth`, `first()`, `last()`, XPath from the root, or text that marketing changes.
5. Assertions are web-first: `await expect(locator).toHaveText(...)`, `toBeVisible()`, `toHaveURL()`. Each Then gets at least one assertion on the business result it names.
6. No `waitForTimeout`. Wait on state.
7. Local run loop — at most 5 attempts:
   ```bash
   cd automation/web && npx playwright test tests/<id>.spec.ts --trace on
   ```
   On failure read the error, `test-results/**/error-context.md`, the screenshot and the trace; fix the cause; rerun. If it still fails after 5, stop with `blocked` and the evidence.
8. Run it three more times in a row. A case that passes 2 of 3 is not done.
9. Audit yourself: `python -c "from workflows.case_factory import audit_case; import sys; print(audit_case(open(sys.argv[1]).read()))" automation/web/tests/<id>.spec.ts` must print `[]`.
10. Land it: from the project root call `workflows.case_factory.submit_case(ctx, service=..., repo=..., scenario='<id>', spec=<spec text>, case_path='automation/web/tests/<id>.spec.ts', case_source=<test text>, qa_approved_by=<name>, local_run_passed=True, kb_update={<contract name>: <selector>})` using `harness.app.build()` for `ctx`. Then register it for the gates: `python -m ci.gate register --service <service> --case web_<id> --journey <journey> --stack web --spec <id>`.

## Do not

- Edit the spec to match the UI. If the UI contradicts the spec, that is a finding: stop with `needs_human`.
- Add retries, `test.skip`, `test.fixme`, `.only`.
- Repeat a payment/destructive action to "make sure".
