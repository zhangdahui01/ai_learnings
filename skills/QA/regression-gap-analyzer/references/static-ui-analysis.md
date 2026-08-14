# Static UI automation analysis

Analyze source without running it. Extract suites, test IDs, tags, page objects, selectors, API routes/clients, assertions, fixtures, waits, retries, skips, and test-data references. Never read or print secret values; report only the file/line and generic pattern.

## Risk rules

Report, with source evidence and confidence:

- hard sleeps or fixed waits;
- broad, positional, dynamic, or duplicate selectors;
- disabled, skipped, quarantined, or excessive-retry tests;
- test definitions lacking assertions near their body;
- state/test-data shared across tests, hidden order dependency, or non-isolated cleanup;
- literal credentials/tokens or unredacted sensitive fixture data;
- endpoint/event/domain behavior in application code with no literal or semantic UI-test mapping.

## Test-gap reasoning

Build candidates from code entry points and code-visible business controls: error branches, authorization guards, idempotency keys, state transitions, retry/timeout logic, events, rollback, and feature flags. Map a candidate to UI tests using route/event/domain terms, test title, page object, test data, and assertion. A literal route match is `static-candidate`; name/semantic matching is `inferred`.

Do not equate a missing literal route with a missing test: many UI tests reach a route indirectly. Phrase the result as an investigation candidate and recommend a lowest suitable test layer. Rank P0/P1 only when code evidence indicates material impact; otherwise leave it P2/P3 pending owner review.
