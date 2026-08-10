---
name: local-web-test-recorder
description: Install, configure, use, troubleshoot, build, or extend a self-hosted local web-test recording and replay product across Codex, Claude Code, and Devin. Use when an AI coding agent needs to set up Node.js and Playwright, manage test plans/cases, record browser interactions, add assertions/waits/retries, replay tests, diagnose artifacts, configure browser/locale/proxy/test data, or integrate Playwright, Selenium/WebDriver, or Selenium IDE components.
---

# Local Web Test Recorder

Use this Agent Skill in Codex, Claude Code, or Devin to create and operate a local-first browser test recorder. Keep test plans, cases, data, recordings, and run artifacts in the machine or cloud session that runs the application. Use Playwright for Chromium/Chrome, Firefox, and WebKit. Treat real Apple Safari as a separate Selenium/SafariDriver adapter.

## 中文快速开始

### 用户如何调用这个 Skill

根据平台显式调用，然后描述任务：

```text
Codex: 使用 $local-web-test-recorder 帮我安装并启动本地 Web 录制器。
Claude Code: /local-web-test-recorder 帮我录制登录测试并添加断言。
Devin: @skills:local-web-test-recorder 分析这次回放失败的 Trace。
```

三个平台都可以根据 `description` 自动匹配。显式调用最稳定，尤其是 Devin 同一时间只能激活一个 Skill。详细差异见 [平台兼容说明](references/platform-compatibility.md)。

### 零基础环境清单

先区分两个安装层次：Agent Skill 让所选 AI 编程 Agent 知道如何帮助用户；内置 Web 应用才是实际录制、保存和回放测试的服务器与界面。

| 工具或软件 | 是否必需 | 用途与要求 |
| --- | --- | --- |
| Codex、Claude Code 或 Devin | 使用 Skill 时三选一 | 发现并调用 Skill；单独运行 Web 应用时不需要 AI Agent 常驻。 |
| Node.js | 必需 | 安装 Node.js 20 或更高版本；优先使用 [Node.js 官方安装包](https://nodejs.org/)。 |
| npm、npx | 必需但无需单独安装 | 随 Node.js 一起安装；npm 安装依赖，npx 安装和运行 Playwright。 |
| Playwright 浏览器 | 必需 | 使用命令下载 Chromium、Firefox 和 WebKit；不是操作系统里已有的普通浏览器。 |
| Git | 按安装方式 | Claude Code/Devin 仓库安装和手工克隆时需要；Codex 使用 `$skill-installer` 时无需用户手工运行 Git。 |
| Python 3 | 可选 | 仅运行 `scripts/validate_case.py` 时需要；录制器服务器不依赖 Python。 |
| Google Chrome、Firefox、Safari | 可选 | 当前“Chrome”选项实际使用 Playwright Chromium；WebKit 用于 Safari 兼容性测试，但不等于真实 Apple Safari。 |

准备至少约 2 GB 可用磁盘空间存放 Node 依赖、三个 Playwright 浏览器和运行产物。Linux 安装浏览器系统库可能需要 `sudo` 权限。本应用不需要 Java、Docker、数据库、Selenium Server 或浏览器扩展。

### 第一步：为目标 Agent 安装 Skill

克隆仓库并进入 Skill 目录：

```bash
git clone https://github.com/zhangdahui01/ai_learnings.git
cd ai_learnings/skills/local-web-test-recorder
```

按使用平台选择一条命令：

```bash
# Codex 个人 Skill：$HOME/.agents/skills
node scripts/install_agent_skill.js codex --scope user

# Claude Code 个人 Skill：$HOME/.claude/skills
node scripts/install_agent_skill.js claude --scope user

# Devin：安装到目标仓库并提交 .agents/skills 目录
node scripts/install_agent_skill.js devin --scope project --project /absolute/path/to/target-repo
```

Codex 也可以用 `$skill-installer` 直接从 GitHub 安装。项目级 Codex/Claude Code 安装、Windows 路径、`--dry-run` 和安全更新方式见 [平台兼容说明](references/platform-compatibility.md)。Skill 没有出现时重启或要求 Agent 重新加载 Skills；Devin 安装后必须提交并推送目标仓库中的 `.agents/skills`。

### 第二步：检查 Node.js 环境

在 Terminal、PowerShell 或 Agent 终端执行：

```bash
node --version
npm --version
npx --version
```

`node --version` 必须为 `v20` 或更高。如果任何命令显示“找不到命令”，安装 Node.js 后关闭并重新打开终端。不要只安装 npm；npm 和 npx 应由同一套 Node.js 安装提供。

### 第三步：创建并安装录制器应用

先进入安装后的 Skill 目录。Codex 通常在 `$HOME/.agents/skills`，Claude Code 通常在 `$HOME/.claude/skills`，Devin 位于目标仓库 `.agents/skills`。macOS/Linux：

```bash
cd /absolute/path/to/installed/local-web-test-recorder
node scripts/create_mvp.js "$HOME/web-test-recorder"
cd "$HOME/web-test-recorder"
npm ci
npx playwright install chromium firefox webkit
```

Windows PowerShell：

```powershell
Set-Location "C:\absolute\path\to\installed\local-web-test-recorder"
node .\scripts\create_mvp.js "$HOME\web-test-recorder"
Set-Location "$HOME\web-test-recorder"
npm ci
npx playwright install chromium firefox webkit
```

Linux 首次安装时用下面的命令同时安装浏览器及操作系统依赖：

```bash
npx playwright install --with-deps chromium firefox webkit
```

如果目标目录已经存在，`create_mvp.js` 会停止以避免覆盖文件；换一个空目录，或先确认并备份已有数据。`npm ci` 使用锁文件安装可复现版本；只有修改依赖时才使用 `npm install`。

### 第四步：验证并启动

```bash
npm run test:e2e
npm start
```

看到服务器地址后打开 <http://localhost:4173>。保持启动终端不关闭；用 `Ctrl+C` 停止服务器。若 4173 被占用，macOS/Linux 使用 `PORT=4174 npm start`，PowerShell 使用 `$env:PORT=4174; npm start`。

### 环境变量与代理

应用支持以下可选环境变量；相对路径容易混淆，优先使用绝对路径：

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `4173` | 本地服务器端口。 |
| `DATA_DIR` | `<项目>/data` | `store.json` 的目录。 |
| `RECORDINGS_DIR` | `<项目>/recordings` | Inspector 录制脚本目录。 |
| `ARTIFACTS_DIR` | `<项目>/artifacts` | Trace、视频和失败截图目录。 |

企业网络下载依赖失败时，只给当前终端临时设置 `HTTPS_PROXY`，例如 macOS/Linux 使用 `HTTPS_PROXY=http://proxy.example:8080 npm ci`，PowerShell 使用 `$env:HTTPS_PROXY='http://proxy.example:8080'` 后再运行安装命令。测试用例自己的浏览器代理应在页面“代理”字段配置，不要修改全局系统代理，也不要把代理密码提交到 Git。

详细的配置、录制、断言、回放和排错说明见 [中文指南](references/guideline.zh-CN.md)。

### 基本使用流程

1. 创建测试计划。
2. 在计划中创建或加入测试用例。
3. 配置浏览器、页面语言、起始 URL、代理和测试数据。
4. 点击“录制”，在 Playwright Inspector 浏览器中完成操作并关闭录制窗口。
5. 点击“覆盖导入最近录制”，明确选择本次录制文件。
6. 核对每个步骤的定位方式、定位值、角色名称和输入值。
7. 增加断言、等待、超时、重试或失败后继续策略。
8. 保存并回放；失败时检查 `artifacts/<run-id>/failure.png` 和 `trace.zip`。

### 数据存储位置

所有业务数据默认保存在生成项目目录中，不由本应用主动上传：

- `data/store.json`：测试计划、用例、步骤、断言、测试数据、配置和最近 50 次运行元数据。
- `recordings/`：Playwright Inspector 生成的脚本；可能包含录制时输入的明文。
- `artifacts/<run-id>/`：失败截图、视频和 Trace；可能包含页面内容、账号信息和网络证据。

删除计划或用例不会自动删除历史录制与运行产物。备份或清理前先停止服务器。详细说明见中文指南的“数据存储、备份和删除”。

## English quick start

### How to invoke this Skill

Use the host-specific invocation followed by the task:

```text
Codex: Use $local-web-test-recorder to install and start the local recorder.
Claude Code: /local-web-test-recorder record a login test and add assertions.
Devin: @skills:local-web-test-recorder diagnose this failed replay trace.
```

All three hosts can match the description automatically. Explicit invocation is most predictable, especially because Devin currently activates one Skill at a time. Read [platform compatibility](references/platform-compatibility.md) for details.

### Beginner environment checklist

Treat installation as two layers: the Agent Skill teaches the selected coding agent the workflow; the bundled Web application is the server and UI that actually record, persist, and replay tests.

| Tool or software | Required | Purpose |
| --- | --- | --- |
| Codex, Claude Code, or Devin | Choose one for Skill invocation | Discovers the Skill; the Web application can keep running without an AI agent. |
| Node.js | Yes | Install Node.js 20 or newer from [nodejs.org](https://nodejs.org/). |
| npm and npx | Yes, bundled | Installed with Node.js; do not install them separately. |
| Playwright browsers | Yes | Download Chromium, Firefox, and WebKit with the commands below. |
| Git | Depends on installation | Needed for Claude Code/Devin repository installation and manual cloning; Codex `$skill-installer` does not require manual Git commands. |
| Python 3 | Optional | Needed only for `scripts/validate_case.py`, not for the recorder server. |
| System Chrome, Firefox, or Safari | Optional | The current Chrome choice uses Playwright Chromium. WebKit approximates Safari compatibility but is not real Apple Safari. |

Allow roughly 2 GB of free disk space for dependencies, browser binaries, and artifacts. Linux system dependencies may require `sudo`. Java, Docker, a database, Selenium Server, and browser extensions are not required.

### Step 1: install the Skill for the target agent

Clone the repository and enter the canonical Skill directory:

```bash
git clone https://github.com/zhangdahui01/ai_learnings.git
cd ai_learnings/skills/local-web-test-recorder
```

Choose one host command:

```bash
# Personal Codex Skill: $HOME/.agents/skills
node scripts/install_agent_skill.js codex --scope user

# Personal Claude Code Skill: $HOME/.claude/skills
node scripts/install_agent_skill.js claude --scope user

# Devin: install into a target repository and commit .agents/skills
node scripts/install_agent_skill.js devin --scope project --project /absolute/path/to/target-repo
```

Codex can alternatively use `$skill-installer` with the GitHub URL. Read [platform compatibility](references/platform-compatibility.md) for project-scoped Codex/Claude installations, Windows paths, `--dry-run`, and safe updates. Restart or reload Skills if discovery is stale. For Devin, commit and push the installed `.agents/skills` directory.

### Step 2: verify Node.js

```bash
node --version
npm --version
npx --version
```

Node must report `v20` or newer. If a command is not found, install Node.js and reopen the terminal. npm and npx must come from the same Node.js installation.

### Step 3: create and install the recorder application

Enter the installed Skill directory first. Codex normally uses `$HOME/.agents/skills`, Claude Code uses `$HOME/.claude/skills`, and Devin uses the target repository's `.agents/skills`. On macOS/Linux:

```bash
cd /absolute/path/to/installed/local-web-test-recorder
node scripts/create_mvp.js "$HOME/web-test-recorder"
cd "$HOME/web-test-recorder"
npm ci
npx playwright install chromium firefox webkit
```

On Windows PowerShell:

```powershell
Set-Location "C:\absolute\path\to\installed\local-web-test-recorder"
node .\scripts\create_mvp.js "$HOME\web-test-recorder"
Set-Location "$HOME\web-test-recorder"
npm ci
npx playwright install chromium firefox webkit
```

On Linux, install browser binaries and operating-system dependencies together:

```bash
npx playwright install --with-deps chromium firefox webkit
```

`create_mvp.js` refuses to overwrite an existing target; use an empty directory or back up existing data first. Use `npm ci` for the locked reproducible install and `npm install` only when intentionally changing dependencies.

### Step 4: validate and start

```bash
npm run test:e2e
npm start
```

Open <http://localhost:4173> and keep the terminal running. Press `Ctrl+C` to stop. If port 4173 is busy, use `PORT=4174 npm start` on macOS/Linux or `$env:PORT=4174; npm start` in PowerShell.

### Environment variables and proxies

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4173` | Local server port. |
| `DATA_DIR` | `<project>/data` | Directory containing `store.json`. |
| `RECORDINGS_DIR` | `<project>/recordings` | Inspector-generated scripts. |
| `ARTIFACTS_DIR` | `<project>/artifacts` | Traces, videos, and failure screenshots. |

On a corporate network, temporarily set `HTTPS_PROXY` only in the installation shell if package or browser downloads fail. For example, use `HTTPS_PROXY=http://proxy.example:8080 npm ci` on macOS/Linux or `$env:HTTPS_PROXY='http://proxy.example:8080'` in PowerShell. Configure the test browser proxy in the application's Proxy field; do not alter the global OS proxy or commit proxy credentials.

Read the [English guide](references/guideline.en.md) for configuration, recording, assertions, replay, and troubleshooting.

### Basic workflow

1. Create a test plan.
2. Create or attach a test case.
3. Configure browser, page locale, start URL, proxy, and test data.
4. Click Record, interact with the Playwright Inspector browser, and close the recorder.
5. Click “Replace-import recording” and explicitly select the recording just created.
6. Review every locator strategy, locator value, accessible name, and input value.
7. Add assertions, waits, timeouts, retries, and continue-on-error behavior.
8. Save and replay; inspect `artifacts/<run-id>/failure.png` and `trace.zip` on failure.

### Data storage

All application data stays under the generated project directory by default and is not proactively uploaded by this application:

- `data/store.json`: plans, cases, steps, assertions, test data, configuration, and metadata for the latest 50 runs.
- `recordings/`: scripts generated by Playwright Inspector; these can contain literal values entered while recording.
- `artifacts/<run-id>/`: screenshots, videos, and traces; these can contain page content, account information, and network evidence.

Deleting a plan or case does not automatically delete historical recordings or run artifacts. Stop the server before backup or cleanup. Read “Data storage, backup, and deletion” in the English guide.

## Implementation workflow for coding agents

1. Detect whether the host is Codex, Claude Code, or Devin and follow [platform compatibility](references/platform-compatibility.md); do not assume local paths or invocation syntax.
2. Read [the open-source landscape](references/open-source-landscape.md) before changing framework boundaries or copying third-party code.
3. Read [the execution contract](references/execution-contract.md) before adding actions, assertions, locators, browsers, proxies, or persistence fields.
4. Modify the generated application during normal product work. Modify `assets/web-test-recorder/` only when intentionally releasing a reusable template update.
5. Preserve structured steps as the editable source of truth. Treat generated Playwright code as import/export material.
6. Preserve case versions. Reject stale browser saves with HTTP 409 so an old page cannot overwrite a newer import.
7. Preserve recording and replay locale. For role locators with localized names, retain the exact locator and a role-only fallback.
8. Resolve `${data.key}` at execution time and redact secrets, proxy passwords, traces, screenshots, and logs.
9. Never attach automation to the user's normal Chrome profile. Use an isolated or dedicated test profile.
10. Do not bypass CAPTCHA, anti-bot, access-control, DRM, or third-party site protections.
11. Treat `data/`, `recordings/`, and `artifacts/` as sensitive data on the executing machine or cloud session. Keep them excluded from Git and explain retention before delivery.

## Browser and capability contract

- Support Chromium/Chrome, Firefox, and Playwright WebKit through Playwright.
- Label Playwright WebKit as WebKit, not Safari.
- Add real Safari only through Selenium WebDriver/SafariDriver on macOS and document its reduced feature set.
- Apply HTTP/HTTPS/SOCKS proxy configuration before browser/context creation. Never change the global OS proxy.
- Prefer selectors in this order: test ID, role + accessible name, label, stable text/attribute, CSS, XPath.
- Support semantic controls, frames, shadow DOM, files, downloads, dialogs, keyboard/mouse, navigation, waits, and assertions where the selected browser adapter permits them.

## Validation and delivery gates

Run these checks before delivery:

```bash
node --check assets/web-test-recorder/server.js
node --check assets/web-test-recorder/public/app.js
cd assets/web-test-recorder
npm install
npx playwright install chromium firefox webkit
npm run test:e2e
```

Also validate a sample structured case:

```bash
python3 scripts/validate_case.py path/to/case.json
```

Require tests for plan/case CRUD, codegen import, locator preservation, stale-version protection, locale fallback, assertions, waits, retries, replay, and redacted failure artifacts. Never claim support for an untested browser/action/assertion combination.

## Bundled resources

- `assets/web-test-recorder/`: runnable Playwright/Express application template.
- `scripts/create_mvp.js`: copy the bundled template into a new empty directory.
- `scripts/install_agent_skill.js`: install the canonical Skill for Codex, Claude Code, or a Devin repository.
- `scripts/validate_case.py`: validate structured test-case JSON.
- [Platform compatibility](references/platform-compatibility.md): discovery paths, invocation syntax, installer commands, and local/cloud runtime boundaries.
- [中文指南](references/guideline.zh-CN.md): beginner installation, configuration, usage, and troubleshooting.
- [English guide](references/guideline.en.md): beginner installation, configuration, usage, and troubleshooting.
- [Open-source landscape](references/open-source-landscape.md): repository and license decisions.
- [Execution contract](references/execution-contract.md): schema, actions, assertions, locators, and adapters.
