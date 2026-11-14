# ClientX Autopilot — Agent Instructions

Read `README.md` first. Then read the skill for the module you are working on (`skills/<module>/SKILL.md`) and, if you are acting as one of the agents, `agents/<name>.md`.

- Run `python -m pytest` from this directory before and after a change; run `npx playwright test --trace off` in `automation/web` when you touch it.
- The harness, `device_farm` and `code_graph` use the Python standard library only. Do not add dependencies to them.
- Keep the safety rules in `README.md` true. A change that lets the harness write anywhere except the outbox, repair inside a gate, alter an assertion automatically, or run a farm action outside the allowlist is wrong even if tests pass; add a test instead.
- Use generic system names in code, fixtures and docs. Real hosts, channels, account names and app identifiers belong in `config/systems.local.json`, `automation/app/proxy/routes.json` or environment variables — all git-ignored.
- `var/` is runtime state and is never committed. Scanned repositories and full code graphs are never committed.
- Fixtures are fictional. Regenerate the farm fixture with `python fixtures/make_farm_fixture.py`.
- New event type: add it to `harness/signals.py` and route it in `policies/routing.json`. New farm action: add it to `device_farm/actions.py`, `policies/farm_policy.json` and `policies/farm_commands.json`.
