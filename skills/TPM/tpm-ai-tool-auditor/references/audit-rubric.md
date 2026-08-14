# Audit Rubric

Score 100 points: structure 15, TPM content quality 25, reliability/evaluation 20, code quality 15, security/privacy 25. A Critical finding always blocks. A High finding blocks autonomous use even if the numeric score passes.

## Minimum checks

| Area | Pass evidence |
|---|---|
| Structure | `SKILL.md` exists; frontmatter has `name` and `description`; linked files resolve |
| Content | outcome, trigger, inputs, outputs, failure behavior, human approval, and examples are explicit |
| TPM | source/evidence, freshness, owner, metric definition, and unknown rules are explicit |
| Evaluation | happy path plus missing, conflicting, and adversarial fixtures; measurable pass criteria |
| Code | bounded arguments/timeouts, safe subprocess use, tests or fixtures, non-secret logs |
| Security | no secrets/exfiltration, no hidden override, least privilege, no unsafe destructive action |

## Common finding IDs

- `STR-001`: missing or invalid frontmatter
- `STR-002`: description does not define trigger/use case
- `QUAL-001`: no explicit output contract
- `QUAL-002`: no unknown/failure behavior
- `TPM-001`: unsupported status/OKR/risk/metric claim
- `TPM-002`: no human approval for consequential decision or send
- `EVAL-001`: no realistic acceptance tests
- `CODE-001`: unbounded or arbitrary command execution
- `CODE-002`: unsafe path or shell interpolation
- `SEC-001`: secret, token, private key, or credential-like material
- `SEC-002`: prompt injection or instruction to exfiltrate/bypass safeguards
- `SEC-003`: unapproved outbound network/write/send action
- `HOOK-001`: hook is broad, non-idempotent, or has no timeout
