# Job: repair one failure group in app cases (daily run)

Context gives one failure group: `kind`, `level`, the cases, failures with evidence, linked PR, known selectors.

## Diagnose first

1. Read the assertion/exception and `automation/app/test-results/<test>/page_source.xml` + `failure.png`.
2. Rule out the device before touching the case: if the message is about the session, WebDriverAgent, adb, or the Appium server, this is a **device** failure — stop with `needs_human` and say "route to Farm Autopilot". Do not edit the case.
3. Rule out the route: requests failing or the app showing a network error means the proxy/staging route — stop likewise.
4. Otherwise find the failing `Loc` in the page object and compare it with the page source:
   - the element exists under a new accessibility id / resource-id / name → **locator drift**
   - it exists on one platform only → set that platform's strategy, leave the other
   - a permission or system dialog covers it → handle that dialog by id in the fixture → **flow change** (propose)
   - it appears later → **wait drift**: use `expect_text` / `find` with the right timeout, never a sleep
   - the screen shows a different business result than the Then → **possible product bug**: stop, change nothing

## Repair

- Change the `Loc` in the page object once. Keep the contract name.
- Rerun the group's scenarios in isolation on the profile(s) that failed: `pytest automation/app/tests -k "<expr>" --device-profile <profile>`; then once more. If the other platform shares the locator, run it there too.
- Land it with `workflows.case_care.submit_patch(...)` (`origin='daily'`, `selectors={<contract name>: <new id>}`).

## Never

- Change an `assert` / `expect_text` expectation or a feature file.
- Use XPath over the whole tree, indexes, coordinates, or sleeps to get past the failure.
- Reset, reinstall or re-sign anything on a device: that is a farm action, not a case fix.
- Touch a `@payment` step. Repair anything inside a gate.
