# Domain activation record

Use as a compact onboarding template. Values are supplied by the adopting domain; they are not installed framework settings.

| Field | Value or evidence needed |
|---|---|
| Domain and scope | Domain ID, tenant if applicable, region, browser, locale, P0 inventory |
| Owners | QA, automation, framework, CI/release, escalation and exception authority |
| Runtime | Framework URL/checkout, commit, toolchain/lockfile, agent entry point |
| Knowledge | Source repositories, snapshot, preconditions and fixture revisions |
| Environment | Daily baseline URL; gate URL; candidate identity/routing verification |
| Data lifecycle | Secret references, test accounts, isolation, setup and cleanup |
| CI | Runner, job, trigger, selection adapter, timeout, required promotion check |
| Evidence | Reports/traces, retention, access, notification destination |
| Policy | Qualification definitions, repair budget, quarantine expiry, re-entry |
| Activation evidence | Seed success, assertion failure, zero selection, missing/skip checks, stale-candidate and canceled-job checks |

Minimal traceability record:

```text
scenarioId + source location/revision
BDD revision + QA approval record
script revision + human sign-off + fixture/knowledge versions
run ID + scheduled observation + selected inventory
application commit/digest + environment + browser/region
original result + retry/repair records + cleanup result + artifact links
qualification decision + CI inclusion approval
gate decision + release exception record (if any)
```

A canceled/timed-out job, stale candidate, missing required evidence, or report publication failure cannot be presented as completed passing verification. Define recovery and retry rules in the adopting CI platform. Keep the required status unresolved/failed until valid evidence for the intended candidate is available.
