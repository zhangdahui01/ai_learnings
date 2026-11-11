# ClientX Autopilot

AI-driven UI automation and Device Farm operations: the runtime systems keep running the tests; an agent harness around them authors cases, keeps them green, triages red gates, keeps the farm up, finds coverage gaps and onboards services. People step in only for exceptions.

System names in this module are generic (gate platform, automation service, staging environment). Map them to the real systems in `config/systems.local.json`, which is not committed.

## Layout

```text
clientx-autopilot/
├── harness/            Agent harness: signals → driver → brain → actions, read-only adapters, run graph, knowledge base
├── workflows/          The six modules + CI case selection, one file each
├── agents/             Agent definitions: planner, case-author, case-auditor, healer, gate-triage, farm-doctor, onboarding
├── skills/             One SKILL.md per module, plus code-graph and farm-dashboard
├── knowledge-base/     Per service, three layers (strategic / analytical / operational)
├── code_graph/         Code knowledge graph: Graphify backend + zero-install fallback, queries
├── device_farm/        Monitor rules, Farm Doctor, healer policy gate, typed action queue, Mac-side runner, dashboard
├── automation/web/     BDD web automation: Markdown Given/When/Then specs → Playwright
├── automation/app/     App automation: Appium for Android emulators, iOS Simulators and real iPhones; mitmproxy
├── policies/           Routing, gates (CI + CD), case lifecycle, healing policy, farm policy and commands
├── fixtures/           Sanitized sample data: the whole loop runs offline
└── tests/              Harness, workflow, farm and code-graph tests
```

## The harness

| Part | File | What it guarantees |
|---|---|---|
| Signals | `harness/signals.py` | One event model for every stack: gate results, PRs, device status, queue timeouts, schedule, incidents |
| Driver | `harness/driver.py`, `ledger.py` | Every event is recorded; routed by rule (`policies/routing.json`); duplicates merged; hop limit; a workflow suspends until a person answers |
| Brain | `harness/brain.py` | Rules before model; a verdict without evidence cannot be constructed; confidence decides who acts |
| Actions | `harness/actions.py` | Only three ways to change anything: a pull request, a Slack card, a typed farm action. Dry-run unless a transport is configured |
| Tools | `harness/adapters/` | Read-only access to gate platform, automation service, logs, source control, code quality |
| Knowledge | `harness/kb.py`, `run_graph.py` | Per-service knowledge base; one gate run joined to its PR, tasks, devices, cases and evidence |

The model is not embedded. Where judgment is needed the harness writes an **agent task** (agent name, instructions, context) to the outbox; any agent runtime (Claude Code, Codex, Devin, …) picks it up using `agents/<name>.md`.

## The six modules

| Module | Wakes on | Produces | Code |
|---|---|---|---|
| Case Factory | new feature, coverage gap | case PR | `workflows/case_factory.py` |
| Case Care | failed cases (daily or gate) | fix PR, quarantine | `workflows/case_care.py` |
| Release Guard | red CI or CD gate; PR opened | verdict card; CI case selection | `workflows/release_guard.py` |
| Farm Autopilot | device status push, queue timeout | typed farm action | `workflows/farm_autopilot.py`, `device_farm/` |
| Coverage Intelligence | incident closed, merge, daily | ranked gap backlog | `workflows/coverage.py` |
| Service Onboarding | new role | config PR (warn mode) | `workflows/onboarding.py` |

**Two gates.** The pre-merge **Quality Gate** (CI) runs a selected subset on the PR and blocks the merge. The post-merge **Release Gate** (CD) runs regression on staging and blocks the release. Both are triaged along the same seven hops — environment, accounts, device/queue, app install, traffic route, case steps, product code — and both stay red until a person decides.

## Quick start

```bash
cd projects/clientx-autopilot
pip install pytest pytest-bdd Appium-Python-Client     # tests + app framework
python -m pytest                                        # harness, farm, code graph, app framework (fake device)

python -m harness demo                                  # replay 8 sample events through the whole loop
ls var/outbox/*                                         # cards, PRs, farm actions, agent tasks it produced
python -m harness decide gate:gr-1001 rerun --by you    # a person answers a card

python -m device_farm.dashboard.generate_dashboard \
  --snapshot fixtures/farm_snapshot.json --history fixtures/farm_history.json \
  --policy policies/farm_policy.json --out var/farm-dashboard.html

pip install graphifyy                                   # optional: Graphify backend
python -m code_graph.scan --repo /path/to/service --service my-service --kb knowledge-base

cd automation/web && npm install && npx playwright test  # BDD web cases against the bundled demo shop
```

App cases on real targets (on a farm Mac with Appium running):

```bash
export ANDROID_APP_PACKAGE=... ANDROID_APP_ACTIVITY=... DEVICE_UDID=emulator-5554
pytest automation/app/tests --device-profile android-emulator
export IOS_BUNDLE_ID=... DEVICE_UDID=<simulator udid>
pytest automation/app/tests --device-profile ios-simulator
export XCODE_ORG_ID=... DEVICE_UDID=<iphone udid>
pytest automation/app/tests --device-profile ios-real
```

## What is verified and what is not

- **Run here:** the harness loop on fixtures, all workflow rules, farm monitor/doctor/healer/queue/runner (dry-run), the dashboard, both code-graph backends, the web framework against the demo shop in Chromium, the app framework against the in-memory `fake` device.
- **Not run here:** Appium against a real emulator, Simulator or iPhone; mitmproxy with real traffic; any real gate platform, automation service or log store. The page objects' accessibility ids are those of the sample app — replace them with the real app's ids.
- **Not implemented:** real adapters (only the fixture-backed ones exist) and real transports for PRs, Slack and the farm queue. `config/systems.example.json` lists what to connect.

## Safety rules (enforced in code, covered by tests)

1. Rules first; the model is asked only when no rule fires.
2. Evidence before verdict.
3. No production write: reads are read-only; the only outputs are a PR, a card, or an allowlisted farm action the Mac pulls.
4. Nothing is repaired inside a gate, and the harness never passes a failed gate.
5. Assertions, expected values and skips are never changed automatically.
6. Farm actions are dry-run by default; `reset_mac` needs a person's approval.
