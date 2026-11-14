# Job: implement an approved app scenario (Appium + pytest-bdd)

The scenario in `automation/app/features/*.feature` is approved by QA; the approver's name is in the context. If it is not, stop with `needs_human`.

## Framework (read these first)

- `automation/app/clientx_app/locators.py` — `Loc(name, default=<accessibility id>, android=(by, value), ios=(by, value))` and the strict rule (0 waits, 1 acts, more than 1 raises `LocatorAmbiguous`). `wait_text` is the state wait.
- `automation/app/clientx_app/pages/` — page objects on `Page` (`tap`, `type`, `text`, `expect_text`, `present`).
- `automation/app/tests/test_shop_bdd.py` — how steps bind to page objects with `pytest_bdd`.
- `automation/app/config/devices.json` — profiles: `android-emulator`, `ios-simulator`, `ios-real`, `fake`.

## Steps

1. Read the scenario, existing steps and page objects. Reuse a step when the wording matches; do not write a second step for the same action.
2. Explore the screens on a running device with the Appium MCP server or Appium Inspector. For each element take, in order: accessibility id → resource-id (Android) / name predicate (iOS) → class chain. One `Loc` per element with the contract name `<screen>.<element>`. Where Android and iOS differ, set only that side.
3. Add or extend page objects; then bind the steps in `automation/app/tests/`.
4. Every Then asserts the business result through `expect_text` or an explicit `assert` with the actual value in the message.
5. No `time.sleep`. No index into a list of elements. No coordinates.
6. Local run loop — at most 5 attempts, on the profile named in the context (start with Android emulator, then iOS Simulator, then a real iPhone if the context asks):
   ```bash
   pytest automation/app/tests -k "<scenario words>" --device-profile android-emulator --junitxml var/app-junit.xml
   ```
   On failure read the assertion, `automation/app/test-results/<test>/page_source.xml` and `failure.png`; fix the cause; rerun.
7. A scenario must pass on every profile the context lists. If a device is unavailable, report which profile was not run; do not mark it passed.
8. Run it three more times in a row on one profile.
9. Audit: `python -c "from workflows.case_factory import audit_case; import sys; print(audit_case(open(sys.argv[1]).read()))" <test file>` must print `[]`.
10. Land it with `workflows.case_factory.submit_case(...)` (same call as for web, `case_path` = the test file) and register it: `python -m ci.gate register --service <service> --case app_<id> --journey <journey> --stack app --k "<pytest -k expression>"`.

## Do not

- Change the feature text to match the app.
- Dismiss system dialogs blindly; handle the specific dialog by its id.
- Reinstall or reset the app inside a scenario; that belongs to fixtures.
- Repeat a payment/destructive action.
