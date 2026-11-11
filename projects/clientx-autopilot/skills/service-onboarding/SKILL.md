---
name: service-onboarding
description: Onboard a service or role to CI/CD with one kit - role config, runner image, environment-refresh mapping, accounts, proxy routes, owner, knowledge-base baseline and smoke cases - delivered as one pull request in warn mode. Use when a new service, role or task needs to join the quality gates.
---
# Service Onboarding

1. Emit a `new_role` event with the inventory (`role`, `service`, `owner`, `repo`, `stack`, `slack_channel`, optional `smoke_journeys`); see `fixtures/events/08_new_role.json`.
2. The kit is one pull request in `var/outbox/pull_request/`; unknowns are listed as open items, never invented.
3. Follow `agents/onboarding.md` for the knowledge-base baseline and smoke cases.
4. Stages: inventory → KB baseline → smoke cases → config PR → warn mode → gate live (a person flips it after graduation).
