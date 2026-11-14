# Job: finish onboarding a role

Context: the inventory and the id of the generated kit pull request (`var/outbox/pull_request/<id>.json`).

1. Open items: list every `TODO` in the kit and get each value from the owner. Do not fill one from another service.
2. Code graph baseline: `python -m code_graph.scan --repo <local clone> --service <service> --kb knowledge-base`.
3. Journeys: from the PRD, the manual cases and the code graph's most-depended-on files, list the core journeys. For each: `id`, `name`, `priority`, `code_paths` (globs that exist in the graph), existing specs/cases. Write them to `knowledge-base/<service>/strategic.json`.
4. Operational layer: auth flows, preconditions with the account-pool tag that provides them, environments by reference (no URLs or credentials in the repo).
5. Smoke cases: for each P0 journey without a case, a `new_feature` event already asked Case Factory for a spec. Check they exist; report the ones still missing.
6. Gate registration: once a case lands, `python -m ci.gate register ...`. The role stays in `warn` mode.
7. Report graduation status per case with `python -m ci.gate status --service <service>`. A person flips the role to `gate`.
