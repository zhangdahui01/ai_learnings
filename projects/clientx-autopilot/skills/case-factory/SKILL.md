---
name: case-factory
description: Turn a feature, PRD or coverage gap into a gated automated case - BDD spec, QA approval, generated case (Playwright + BDD for web, Appium + pytest-bdd for app), local run loop, audit, pull request, graduation. Use when asked to write, generate or convert a UI automation case.
---
# Case Factory

Pipeline: planner → **QA review** → case author → local run loop → case auditor → pull request → **domain review** → daily run → graduation → gate.

1. Spec: follow `agents/planner.md`. Web specs live in `automation/web/specs/<id>.md`, app scenarios in `automation/app/features/*.feature`.
2. After QA approves the exact spec revision, implement with `agents/case-author.md`.
   - Web: `cd automation/web && npx playwright test tests/<id>.spec.ts`
   - App: `pytest automation/app/tests --device-profile android-emulator|ios-simulator|ios-real` (`fake` runs without a device)
3. Audit with `agents/case-auditor.md` (a different agent than the author).
4. Land it with `workflows.case_factory.submit_case(...)`; the case starts `incubating`.
5. Graduation (`workflows.case_factory.graduation`): 7 daily passes in a row, 98% pass rate, human sign-off.

Converting an existing case: read the case, its keywords and failure history → extract the intent into a spec → regenerate only the fragile steps → run old and new side by side → replace.
