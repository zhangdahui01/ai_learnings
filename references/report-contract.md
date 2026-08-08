# Regression gap report contract

Use this heading order: **Scope and evidence**, **Graph summary**, **Traceability**, **Ranked gaps**, **Exclusions and confidence**, **Review decisions**.

For every backlog row emit these fields:

`gap_id, priority, classification, confidence, feature_scope, entry_point, uncovered_behavior, invariant_or_risk, affected_modules, downstream_boundary, proposed_test_level, proposed_scenario, evidence_refs, owner, review_status`

Use `proven-runtime` only with supplied local JaCoCo/trace/test evidence. Use `static-candidate` for direct source-derived links and `inferred` for semantic matching. In static-only mode, set `runtime_evidence` to `not-collected`, not `failed`. Include source path and line span, graph node/edge or query ID, test ID, and execution/run ID where available.

Priority definition:

- **P0**: payment/security/data-loss or broad customer impact with no proven protection.
- **P1**: material business flow or integration failure lacking protection.
- **P2**: bounded edge/negative case or a low-likelihood regression.
- **P3**: maintainability/observability candidate; validate before scheduling.

Never create a UI test merely to cover a private implementation detail. Prefer the lowest test layer that verifies the business risk; reserve UI coverage for user-visible cross-system journeys.

For static UI reports additionally include `analysis_mode`, `runtime_evidence`, `mapping_basis`, and `review_question`. Use `mapping_basis` values such as `literal-route`, `page-object`, `domain-term`, `source-risk-rule`, or `semantic-inference`.
