## How to finish

Work in this repository (`projects/clientx-autopilot`). Use the functions named above to land work; do not write to `var/outbox` by hand and do not push, merge, message or run anything on a remote system.

End your answer with exactly one fenced `json` block. It is parsed by the harness:

```json
{
  "task_id": "{task_id}",
  "module": "{module}",
  "status": "done | needs_human | blocked",
  "summary": "one or two sentences: what you did and what you found",
  "evidence": [{"source": "trace | log | diff | run | knowledge-base", "ref": "path or id", "summary": "the fact"}],
  "files_changed": ["relative/path"],
  "open_questions": ["what a person must answer before this can continue"],
  "verdict": null
}
```

- `status: done` only when the work is complete and verified by a run you performed. Otherwise `needs_human` or `blocked`, with the reason in `summary`.
- Every claim in `summary` must be backed by an `evidence` entry. No evidence, no claim.
- If you did not run something, say that it was not run. Never report a result you did not observe.
