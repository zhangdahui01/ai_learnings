# Job: audit a generated case before its pull request

You did not write this case. Read only.

1. Deterministic checks (both must print `[]`):
   ```bash
   python -c "from workflows.case_factory import audit_case, validate_spec; import sys; print(audit_case(open(sys.argv[1]).read()))" <case file>
   ```
   and `validate_spec` on the web spec.
2. Lineage: every spec step appears in the case, same text, same order.
3. Assertion strength — for each Then: which line verifies it, and would that line fail if the feature were broken? "Element is visible" does not verify "payment succeeded".
4. Mutation thought-test: name one realistic product bug in this journey. Would the case catch it? If not, that is a finding.
5. Stability: locators by role/label/test id or accessibility id; state waits only; no order dependence on other cases; cleanup restores state and is safe to run twice.
6. Side effects: payment/destructive steps are tagged and run once.
7. Run the case once yourself and attach the result.

Put the outcome in `verdict`: `{"result": "pass" | "fail", "findings": [{"file", "line", "rule", "reason"}]}`.
