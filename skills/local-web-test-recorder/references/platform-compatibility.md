# Codex, Claude Code, and Devin compatibility

## Contents

- [Shared format](#shared-format)
- [Installation and invocation matrix](#installation-and-invocation-matrix)
- [Installer commands](#installer-commands)
- [Runtime differences](#runtime-differences)
- [中文说明](#中文说明)

## Shared format

Keep `skills/local-web-test-recorder/` as the canonical source. Its `SKILL.md`, `scripts/`, `references/`, and `assets/` follow the Agent Skills open format. Keep only the standard `name` and `description` fields in canonical frontmatter so all three hosts can parse it. `agents/openai.yaml` is optional Codex UI metadata; Claude Code and Devin may ignore it safely.

Do not maintain three divergent copies. Use `scripts/install_agent_skill.js` to copy the canonical directory into a host discovery location. Re-run with `--force` only after reviewing the existing installed directory.

## Installation and invocation matrix

| Host | Personal discovery | Project/repository discovery | Explicit invocation |
| --- | --- | --- | --- |
| Codex | `$HOME/.agents/skills/local-web-test-recorder/` | `<repo>/.agents/skills/local-web-test-recorder/` | `$local-web-test-recorder` |
| Claude Code | `$HOME/.claude/skills/local-web-test-recorder/` | `<repo>/.claude/skills/local-web-test-recorder/` | `/local-web-test-recorder` |
| Devin | No first-class global/personal location | `<repo>/.agents/skills/local-web-test-recorder/` (recommended) | `@skills:local-web-test-recorder` |

Devin also scans `.devin/skills`, `.github/skills`, `.claude/skills`, `.cursor/skills`, `.codex/skills`, `.cognition/skills`, and `.windsurf/skills`, but use `.agents/skills` for the portable repository copy.

## Installer commands

Run from the canonical skill directory:

```bash
node scripts/install_agent_skill.js codex --scope user
node scripts/install_agent_skill.js claude --scope user
node scripts/install_agent_skill.js codex --scope project --project /absolute/repo
node scripts/install_agent_skill.js claude --scope project --project /absolute/repo
node scripts/install_agent_skill.js devin --scope project --project /absolute/repo
```

Add `--dry-run` to print the resolved target without writing. Add `--force` only to replace an installation after reviewing and backing up local modifications.

For Devin, commit and push the generated `.agents/skills/local-web-test-recorder/` directory so repository indexing can discover it. Ask Devin to reload or start a new session after the push.

## Runtime differences

- **Codex local and Claude Code local:** Run the Node/Playwright application on the user's computer. `localhost`, `data/`, `recordings/`, and `artifacts/` refer to that computer.
- **Devin cloud:** Run the application inside Devin's session machine. `localhost` and application data refer to the Devin environment, not automatically to the user's laptop. Persist required outputs through the connected repository or Devin artifacts, and never commit secrets, traces, videos, or `data/store.json`.
- **Devin invocation:** Devin currently activates one skill at a time. Put the complete recorder workflow in this skill rather than depending on another skill remaining active.
- **Interactive recording:** Playwright Inspector requires a graphical browser session. Prefer structured cases and headless replay when the host has no interactive desktop. Do not claim that an Inspector window opened on the user's laptop when running in a cloud agent.
- **Permissions:** Let every host request approval for package installation, browser download, local port binding, GUI launch, repository writes, and network access according to that host's own policy.

Official references:

- [OpenAI Build skills](https://developers.openai.com/codex/skills)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Devin Skills](https://docs.devin.ai/product-guides/skills)
- [Agent Skills specification](https://agentskills.io/specification)

## 中文说明

同一份 Skill 可以兼容三个平台，但安装位置和调用语法不同：

- Codex：个人目录 `$HOME/.agents/skills`，使用 `$local-web-test-recorder`。
- Claude Code：个人目录 `$HOME/.claude/skills`，使用 `/local-web-test-recorder`。
- Devin：把 Skill 提交到目标仓库的 `.agents/skills`，使用 `@skills:local-web-test-recorder`。Devin 当前没有一等的个人全局 Skill 目录。

在 Devin 云会话中，“本地”指 Devin 的会话机器，不是用户电脑。测试数据、录制和 Trace 不会自动出现在用户电脑，也不应直接提交到 Git。无图形桌面时优先使用结构化用例和 headless 回放。
