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
| Google Chrome | 合规录制模式必需 | 标准模式使用 Playwright Chromium；合规模式使用本机正式 Chrome 和专用测试 Profile。不要连接日常 Chrome Profile。 |
| Firefox、Safari | 可选 | Firefox 可由 Playwright 安装；WebKit 用于 Safari 兼容性测试，但不等于真实 Apple Safari。 |

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
| `PROFILES_DIR` | `<DATA_DIR>/profiles` | 合规录制专用 Chrome Profile；包含敏感会话数据。 |
| `AUTH_STATE_DIR` | `<DATA_DIR>/auth` | 合规录制保存的 Cookie/登录状态；必须按凭据保护。 |
| `RECORDINGS_DIR` | `<项目>/recordings` | Inspector 录制脚本目录。 |
| `ARTIFACTS_DIR` | `<项目>/artifacts` | Trace、视频和失败截图目录。 |
| `TEST_SUITES_DIR` | `<项目>/test-suites` | 以计划名称分目录保存 JS/Python 测试文件。 |

企业网络下载依赖失败时，只给当前终端临时设置 `HTTPS_PROXY`，例如 macOS/Linux 使用 `HTTPS_PROXY=http://proxy.example:8080 npm ci`，PowerShell 使用 `$env:HTTPS_PROXY='http://proxy.example:8080'` 后再运行安装命令。测试用例自己的浏览器代理应在页面“代理”字段配置，不要修改全局系统代理，也不要把代理密码提交到 Git。

详细的配置、录制、断言、回放和排错说明见 [中文指南](guideline.zh-CN.md)。

### 基本使用流程

1. 创建测试计划，在计划中创建或加入测试套件，再把测试用例加入套件。
2. 把登录/退出登录放在 Suite Setup/Teardown，把单用例前置/清理放在 Case Setup/Teardown；把加购物车、进入商品页等复用动作建成有版本的公共流程。
   Suite Setup、Suite Teardown 和公共流程都可单独录制及回放。录制结束同时保存完整 JavaScript、生成 Python 并导入无代码步骤；目标已有步骤时必须由用户确认后才覆盖，取消不修改原数据。
3. 配置浏览器、页面语言、起始 URL、代理和测试数据。
4. 用户点击“开始录制”，完成操作后关闭 Playwright Inspector；不需要点 Save，也不要只关闭被录制的 Chrome 标签页。
5. 应用自动导入完整 JavaScript、同步生成 Python 和可识别的无代码步骤，并打开代码编辑器；“手工导入”只作为异常恢复入口。
6. 核对完整代码以及每个可视化步骤的定位方式、角色名称和输入值。
7. 增加断言、等待、超时、重试或失败后继续策略。
8. 保存并回放用例，或在计划页运行整个计划；在“执行记录”查询历史结果。
9. 失败时先阅读页面上的失败步骤、原因和处理建议，再查看截图、录像和 Trace。

界面右上角“界面语言”可切换中文、English 和 한국어，选择保存在当前浏览器的 `localStorage`（键：`coupayWeb.uiLocale`），刷新后继续生效。界面语言只影响平台菜单、表单、提示、弹窗和友好错误，不会修改测试用例的“页面语言”、定位器、测试数据或录制代码。需要切换被测页面语言时仍在用例“配置与数据 → 页面语言”填写 BCP 47 locale，例如 `zh-CN`、`en-US`、`ko-KR`。

慢页面优先使用“回放稳定性”预设和步骤内“稳定性与高级等待”：等待 Loading 消失、元素可用/可编辑、文本或 URL 达到目标，或使用“点击并等待接口”。使用 Web-first 断言，不用一次性读取 DOM。只对 Timeout、网络重置和 HTTP 5xx 等临时错误退避重试；`auto` 不重复潜在副作用点击，只有确认幂等后才设为 `safe`。记录每次失败、等待和恢复，重试后通过仍标记为 Flaky。

同步约定：保存无代码步骤会重建 JS/Python；保存 JavaScript 会把可识别语句同步为无代码步骤并重建 Python；无法识别的复杂 JS 原样保留并提示部分可视化；Python 是派生导出，不做反向同步。测试账号字段只存引用名称。数据用 `${data.key}`/`${data.nested.key}`，机密用 `${env.SECRET_NAME}`。多条 URL 映射按顺序匹配第一条；原生映射仅用于同协议回放，录制阶段或跨协议映射使用上游 Charles Map Remote。

### 会话隔离与合规录制模式

每次标准录制和回放默认创建全新浏览器会话，不继承上次 Cookie、缓存、Local/Session Storage 或 IndexedDB。合规录制使用本机正式 Chrome 和独立的临时 Profile，结束后删除。只有用户在“配置与数据”显式选择“持久化登录态（高级）”时，才写入 `data/profiles/<case-id>/` 和 `data/auth/<case-id>.json` 并供以后加载；可用“删除历史登录态和缓存”清理。

遇到 CAPTCHA 或登录验证时，在打开的 Chrome 中手工完成后继续。录制器本身处于交互等待状态，不会破解 CAPTCHA、隐藏自动化特征或规避目标网站控制。白名单字段只是审批记录；真正的 IP/账号白名单必须由目标系统管理员配置。回放检测到 Access Denied、CAPTCHA 或异常流量页面时，会标记为“目标网站拒绝自动化”，停止无意义重试并给出合规建议。

### 数据存储位置

所有业务数据默认保存在生成项目目录中，不由本应用主动上传：

- `data/store.json`：测试计划、测试套件、测试用例、公共流程及版本、生命周期步骤、测试数据、配置和执行记录元数据。
- `data/profiles/_sessions/<session-id>/`：默认合规录制的临时 Profile；正常结束后自动删除。
- `data/profiles/<case-id>/` 与 `data/auth/<case-id>.json`：仅显式持久化模式使用，按登录凭据保护。
- `recordings/`：Playwright Inspector 生成的脚本；可能包含录制时输入的明文。
- `test-suites/<计划名>/<套件名>/`：每个 Case 一个可执行 `.spec.js` 和一个 Python 文件，并嵌入 Suite Setup/Teardown；`suite.*` 保存 Suite 阶段的同步源码。公共流程位于 `test-suites/_公共流程/`。
- `artifacts/<run-id>/`：失败截图、视频和 Trace；可能包含页面内容、账号信息和网络证据。

在生成项目根目录使用 `npm run test:generated`，或传入具体 `test-suites/<计划>/<套件>/<用例>.spec.js` 路径执行本地 JavaScript。Python 需安装 `pytest-playwright` 后用 `python3 -m pytest <test_*.py>` 执行。

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
| Google Chrome | Required for compliant recording | Standard mode uses Playwright Chromium. Compliant mode uses the locally installed stable Chrome with a dedicated test profile. Never attach the normal daily profile. |
| Firefox or Safari | Optional | Firefox can be installed by Playwright. WebKit approximates Safari compatibility but is not the Apple Safari application. |

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
| `PROFILES_DIR` | `<DATA_DIR>/profiles` | Dedicated Chrome profiles for compliant recording; contains sensitive session data. |
| `AUTH_STATE_DIR` | `<DATA_DIR>/auth` | Saved cookies/login state for compliant recording; protect as credentials. |
| `RECORDINGS_DIR` | `<project>/recordings` | Inspector-generated scripts. |
| `ARTIFACTS_DIR` | `<project>/artifacts` | Traces, videos, and failure screenshots. |
| `TEST_SUITES_DIR` | `<project>/test-suites` | Plan folders containing per-case JavaScript and Python files. |

On a corporate network, temporarily set `HTTPS_PROXY` only in the installation shell if package or browser downloads fail. For example, use `HTTPS_PROXY=http://proxy.example:8080 npm ci` on macOS/Linux or `$env:HTTPS_PROXY='http://proxy.example:8080'` in PowerShell. Configure the test browser proxy in the application's Proxy field; do not alter the global OS proxy or commit proxy credentials.

Read the [English guide](guideline.en.md) for configuration, recording, assertions, replay, and troubleshooting.

### Basic workflow

1. Create a test plan, add test suites to the plan, and add test cases to suites.
2. Put login/logout in Suite Setup/Teardown, case-local preparation/cleanup in Case Setup/Teardown, and reusable business actions in versioned shared flows.
   Suite Setup, Suite Teardown, and shared flows can each be recorded and replayed independently. Recording imports full JavaScript, generated Python, and no-code steps together. Existing steps require explicit overwrite confirmation; canceling preserves the target.
   Configure browser, locale, proxy, and timeouts for standalone shared-flow recording/replay in the flow's Edit information dialog. A flow invoked by a case or suite uses the calling case settings instead.
3. Configure browser, page locale, start URL, proxy, and test data.
4. Click Record, interact with the browser, then close Playwright Inspector. There is no Save action; closing only the recorded Chrome tab is not a reliable completion signal.
5. The app automatically imports the complete JavaScript, generates Python and recognized no-code steps, and opens the Code editor. Manual import is only a recovery path.
6. Review the complete source plus each recognized locator, accessible name, and input value.
7. Add assertions, waits, timeouts, retries, and continue-on-error behavior.
8. Save and replay a case, or run every case from the plan page; query history under Runs.
9. On failure, read the failed-step diagnosis first, then inspect the screenshot, video, and trace.

Use **Interface language** in the top-right corner to switch among 中文, English, and 한국어. The choice is stored in the current browser's `localStorage` under `coupayWeb.uiLocale` and persists across reloads. UI language affects platform navigation, forms, notifications, dialogs, and friendly errors only; it never changes the case's test-page locale, locators, test data, or recorded code. Configure the target page separately under **Settings & data → Test page locale** with a BCP 47 value such as `zh-CN`, `en-US`, or `ko-KR`.

For slow pages, use Stability presets and per-step Advanced readiness: wait for loading indicators to disappear, elements to become enabled/editable, text or URL state, or Click and wait for response. Use Web-first assertions rather than one-shot DOM reads. Retry only transient timeouts, network resets, and HTTP 5xx with backoff; `auto` never repeats potentially side-effecting clicks, and `safe` requires an explicit idempotency decision. Keep every failed attempt/recovery and mark recovered runs as flaky.

Synchronization contract: saving no-code steps regenerates JS/Python; saving JavaScript extracts recognized statements into steps and regenerates Python; unsupported custom JS remains intact with a partial-visualization warning; Python is derived and does not reverse-sync. The account field stores an alias only. Use `${data.key}`/`${data.nested.key}` for test data and `${env.SECRET_NAME}` for secrets. Ordered URL mappings use first match; native mapping is same-protocol replay only, while recording-time or cross-protocol mapping requires upstream Charles Map Remote.

### Session isolation and compliant recording

Standard recording and replay use a fresh browser context by default, with no cookies, cache, Local/Session Storage, or IndexedDB inherited from the previous run. Compliant recording launches locally installed stable Chrome with a temporary isolated profile that is removed when recording completes. Only the explicit advanced persistent-session setting writes `data/profiles/<case-id>/` and `data/auth/<case-id>.json` for later reuse. Use the UI action to delete saved state.

For CAPTCHA or login challenges, complete the verification manually in the opened Chrome window and then continue. The recorder waits for user interaction; it does not solve CAPTCHA, spoof fingerprints, or evade target controls. Allowlist fields document approval only—the target-system administrator must configure the real IP/account allowlist. Access Denied, CAPTCHA, and unusual-traffic pages are reported as “Target site rejected automation,” with pointless retries stopped and compliant next steps shown.

### Data storage

All application data stays under the generated project directory by default and is not proactively uploaded by this application:

- `data/store.json`: plans, suites, cases, versioned shared flows, lifecycle steps, test data, configuration, and run metadata.
- `data/profiles/_sessions/<session-id>/`: temporary compliant-recording profiles, normally removed at completion.
- `data/profiles/<case-id>/` and `data/auth/<case-id>.json`: used only by explicitly enabled persistent sessions; protect them like credentials.
- `recordings/`: scripts generated by Playwright Inspector; these can contain literal values entered while recording.
- `test-suites/<plan-name>/<suite-name>/`: one executable `.spec.js` and one Python file per case, with Suite Setup/Teardown embedded; `suite.*` contains synchronized Suite-phase sources. Shared flows live under `test-suites/_公共流程/`.
- `artifacts/<run-id>/`: screenshots, videos, and traces; these can contain page content, account information, and network evidence.

From the generated project root, run JavaScript with `npm run test:generated` or pass a specific `test-suites/<plan>/<suite>/<case>.spec.js` path. Install `pytest-playwright` before running Python with `python3 -m pytest <test_*.py>`.

Deleting a plan or case does not automatically delete historical recordings or run artifacts. Stop the server before backup or cleanup. Read “Data storage, backup, and deletion” in the English guide.

## Implementation workflow for coding agents

1. Detect whether the host is Codex, Claude Code, or Devin and follow [platform compatibility](references/platform-compatibility.md); do not assume local paths or invocation syntax.
2. Read [the open-source landscape](references/open-source-landscape.md) before changing framework boundaries or copying third-party code.
3. Read [the execution contract](references/execution-contract.md) before adding actions, assertions, locators, browsers, proxies, or persistence fields.
4. Modify the generated application during normal product work. Modify `assets/web-test-recorder/` only when intentionally releasing a reusable template update.
5. Preserve two explicit editing modes: structured steps for no-code users and executable Playwright JavaScript for code users. Generate Python from structured steps and keep both source files on disk.
6. Preserve case versions. Reject stale browser saves with HTTP 409 so an old page cannot overwrite a newer import.
7. Preserve recording and replay locale. Keep exact role + accessible-name locators; never silently fall back to any element with the same role because that creates false passes.
8. Resolve `${data.key}`, nested `${data.account.username}`, and `${env.SECRET_NAME}` at execution time. Redact secrets and proxy passwords from text logs. Treat screenshots, videos, and traces as sensitive binary evidence that must be reviewed before sharing.
9. Generate structured readiness and retry policies into both JavaScript and Python. Preserve `// wtr-step:` metadata markers so saving generated JavaScript restores advanced no-code fields without lossy parsing.
10. Never attach automation to the user's normal Chrome profile. Use an isolated or dedicated test profile.
11. Do not bypass CAPTCHA, anti-bot, access-control, DRM, or third-party site protections.
12. Treat `data/`, `recordings/`, and `artifacts/` as sensitive data on the executing machine or cloud session. Keep them excluded from Git and explain retention before delivery.

## Browser and capability contract

- Support Chromium/Chrome, Firefox, and Playwright WebKit through Playwright.
- Label Playwright WebKit as WebKit, not Safari.
- Add real Safari only through Selenium WebDriver/SafariDriver on macOS and document its reduced feature set.
- Apply HTTP/HTTPS/SOCKS proxy configuration before browser/context creation. Never change the global OS proxy.
- Support ordered URL-prefix mappings for same-protocol replay. Reject unsafe/unsupported cross-protocol native rewrites with a clear instruction to use an authorized upstream Charles Map Remote configuration.
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

Require tests for plan/case CRUD, plan folders, JS/Python generation, codegen import, exact locator preservation, visual/code replay, plan execution, assertions, waits, retries, friendly failed-step diagnostics, artifacts, dashboard, and run-record CRUD. Never claim support for an untested browser/action/assertion combination.

## Bundled resources

- `assets/web-test-recorder/`: runnable Playwright/Express application template.
- `scripts/create_mvp.js`: copy the bundled template into a new empty directory.
- `scripts/install_agent_skill.js`: install the canonical Skill for Codex, Claude Code, or a Devin repository.
- `scripts/validate_case.py`: validate structured test-case JSON.
- [Platform compatibility](references/platform-compatibility.md): discovery paths, invocation syntax, installer commands, and local/cloud runtime boundaries.
- [中文指南](guideline.zh-CN.md): beginner installation, configuration, usage, and troubleshooting.
- [English guide](guideline.en.md): beginner installation, configuration, usage, and troubleshooting.
- [Open-source landscape](references/open-source-landscape.md): repository and license decisions.
- [Execution contract](references/execution-contract.md): schema, actions, assertions, locators, and adapters.
