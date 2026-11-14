---
name: auto-author
description: Have AI write an automated case end to end - web (Playwright + BDD) or app (Appium, Android and iOS), for a new feature (progression) or existing behaviour (regression) - through spec, QA approval, generation, local run loop, audit and gate registration. Use when asked to automatically write or generate automation cases.
---
# Auto-author a case

1. Ask for the case:
   ```bash
   python -m harness feature --service <service> --stack web|app --kind progression|regression \
       --title "<what the user does>" [--input prd-or-manual-case.md]
   ```
   Coverage gaps and onboarding create the same request by themselves.
2. Let the agents work:
   ```bash
   python -m harness agents            # composes each pending task's prompt into var/agent_runs/*.prompt.md
   python -m harness agents --run      # runs them with the configured agent runtime (default: Claude Code headless)
   ```
   Order: `planner` (prompts/plan-spec.md) → **QA approves the spec** → `case-author` (prompts/author-web.md or author-app.md) → `case-auditor` (prompts/audit-case.md).
3. The author explores the page or app live (Playwright MCP / Appium MCP, `config/mcp.example.json`), runs the case locally up to 5 times, then lands it with `submit_case` and `python -m ci.gate register`.
4. Converting an existing scripted case: `prompts/convert-legacy-case.md`.

The two human gates stay: QA approves the spec; a domain engineer merges the pull request.
Runtime: `config/agent_runtime.example.json` (copy to `agent_runtime.json` to switch runtime or add MCP servers).
