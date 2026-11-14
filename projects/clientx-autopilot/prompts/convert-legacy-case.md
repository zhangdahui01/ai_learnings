# Job: convert an existing scripted case to a spec-driven case

Use for the existing Robot Framework + Selenium/Appium cases.

1. Read the case, the keywords it calls (resolve them to their definitions) and its failure history.
2. Extract the intent as a spec (`prompts/plan-spec.md` rules, tag `@regression`). Keep the original expected results exactly; list anything the old case checked that you could not express.
3. Mark each step: **stable** (passed consistently; reuse its locator) or **fragile** (appears in the failure history: positional XPath, sleeps, order dependence).
4. After QA approves the spec, implement it (`prompts/author-web.md` or `author-app.md`). Regenerate only the fragile steps; carry the stable locators over.
5. Run old and new side by side for the same build. Report per run: old result, new result. They must agree on at least 5 consecutive runs, and the new one must fail when the old one fails for a product reason.
6. Only then propose replacing the old case in the gate; the old case is retired in the same pull request, not before.
