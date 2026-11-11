---
name: auto-fix
description: Diagnose failed web or app automation runs and repair test drift automatically - classify each failure, group them, let the healer fix locator and wait drift with a rerun, and route product bugs, device faults and network faults to the right owner. Use after a daily run fails or when asked to auto-fix or auto-diagnose cases.
---
# Auto-diagnose and auto-fix

```bash
# 1. feed the run
python -m harness ingest --web automation/web/test-results/report.json --service <service> [--pr <id>]
python -m harness ingest --app var/app-junit.xml --service <service> --evidence-dir automation/app/test-results
# 2. run the healer on what Case Care decided is repairable
python -m harness agents --run --agent healer
```

- **Diagnosis** (`harness/results.py`, no model): `locator`, `timeout`, `assertion`, `device`, `network`, `account`, `spec_drift`, `unknown`. A case that passed only on a fallback locator is reported as drift before it fails.
- **Grouping and policy** (`workflows/case_care.py`): one group is fixed once. `locator`/`wait` → healer, automatic. `flow`/`data` → healer drafts, a person approves. `assertion` → card "possible product bug", nothing is changed. `device` → Farm Autopilot.
- **The healer** (`agents/healer.md`, `prompts/heal-web.md`, `prompts/heal-app.md`) fixes the page object, reruns in isolation, and can land the fix only through `submit_patch`, which refuses a diff that touches an assertion or a skip, a failed rerun, a `@payment` step, or a gate failure.
- Output: a pull request in `var/outbox/pull_request/` and the new selector in the knowledge base.
