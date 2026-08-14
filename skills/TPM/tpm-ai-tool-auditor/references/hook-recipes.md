# Cross-platform Hook Recipes

The audit policy is portable; event names and installation locations are platform-specific. Keep the scanner read-only and pass a fixed artifact path from the hook, not arbitrary model text.

## Claude Code

Project `.claude/settings.json` can use a narrow `PreToolUse` gate for skill files and a `PostToolUse`/`Stop` audit for changed artifacts. Adapt the matcher to the installed Claude Code version and validate JSON before enabling it:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "python3 skills/tpm-ai-tool-auditor/scripts/audit_skill.py skills/tpm-ai-tool-authoring --json --min-score 80",
        "timeout": 30
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "python3 skills/tpm-ai-tool-auditor/scripts/audit_skill.py skills/tpm-ai-tool-authoring --json --min-score 80",
        "timeout": 30
      }]
    }]
  }
}
```

## Codex

Codex does not share Claude Code's hook event schema. Use the same command as a repository CI/pre-commit gate or invoke the auditor skill before installing/running a tool. Do not invent a Claude-style settings file and assume Codex will enforce it.

## Devin

Place the skill and scanner in the target repository's project skill path, then call the scanner from the repository's CI/pre-commit workflow. Require a passing report before merge and keep write/send tools approval-gated in the agent policy.

## Operational controls

- Pin the scanner revision and record the audit report as an artifact.
- Use a fixed timeout and fail closed when the scanner cannot run.
- Never include secrets or raw transcripts in hook output.
- Re-audit on skill content, scripts, dependencies, hook config, or permission changes.
- Human approval is required to accept any High/Critical exception, with expiry.
