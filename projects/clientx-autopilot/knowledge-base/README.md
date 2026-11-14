# Knowledge base

One folder per service, three layers. The baseline is built once from code, PRD and manual cases; after that every run and every verdict updates it.

| Layer | File | Holds | Fed by |
|---|---|---|---|
| Strategic | `strategic.json` | business rules, journeys and their priority, the coverage map, incidents | PRD, wiki, incidents |
| Analytical | `analytical.json` | failure patterns, selector stability, reusable steps | runs, triage verdicts |
| Operational | `operational.json` | selectors, auth flows, preconditions, environments, code graph summary | code, UI, case repos |

## Coverage map (`strategic.json`)

```json
{"coverage_map": {
  "smoke": ["case ids that always run in the CI gate"],
  "journeys": [{"id": "pay", "name": "Checkout and pay", "priority": "P0",
                "code_paths": ["checkout/payment/*"], "specs": ["specs/checkout-pay.md"],
                "cases": [{"id": "web_checkout_pay", "stack": "web", "state": "gated", "asserts": 3}]}],
  "incidents": [{"id": "INC-77", "journey": "pay", "fix_pr": "PR-480", "covered_by": []}]}}
```

`code_paths` link a journey to the code graph: that is how a PR is mapped to the cases the CI gate runs and how "changed code, no case ran" is found.

## Rules

- Start a service from `_template/`. `sample-checkout/` is a fictional example used by the fixtures and tests.
- Store stable locators (role, label, test id, accessibility id), never short-lived session refs.
- No credentials, personal data or production URLs. Environment endpoints are referenced from `config/systems.local.json`.
- Agents write here only through `harness.kb.KnowledgeBase` or a pull request.
