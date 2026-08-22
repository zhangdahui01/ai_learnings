---
name: local-web-test-recorder
description: Install, configure, use, troubleshoot, build, or extend a self-hosted local web-test recording and replay product across Codex, Claude Code, and Devin. Also convert multi-sheet manual-case Excel workbooks into reviewed BDD cases, assess Playwright UI-automation suitability, index an existing automation repository as operational knowledge, and prepare Playwright Generator Agent or Codegen jobs. Use for Node.js/Playwright setup, test assets, recording/replay, BDD conversion, script generation, diagnostics, artifacts, browser/locale/proxy/test data, or Selenium adapters.
---

# Local Web Test Recorder

Use this Agent Skill in Codex, Claude Code, or Devin to create and operate a local-first browser test recorder. Keep test plans, cases, data, recordings, and run artifacts in the machine or cloud session that runs the application. Use Playwright for Chromium/Chrome, Firefox, and WebKit. Treat real Apple Safari as a separate Selenium/SafariDriver adapter.

## Manual Case → BDD → Playwright（新增）

此 Skill 现在也提供一条独立于录制回放的短期自动化流水线：

1. 读取一个包含多个 Sheet 的 `.xlsx` 手工用例集合；保持 Sheet 从左到右和原始行号顺序，动态识别表头和继承的功能层级。
2. 所有源用例都生成 BDD，不因“不适合 UI 自动化”而丢弃；原始 Excel 行作为审计快照保留。
3. 计算 `0–100` 的 Web UI 自动化可行度，并标记 `web-ui / hybrid / api / app / manual` 目标及阻碍条件。
4. QA 在 **BDD Case Center** 按准确 Coupay 模板编辑 metadata、Given/When/Then、Common Check 和支付专项检查并批准；BDD 不做版本堆叠，保存即更新当前事实，但保留原始源行和编辑修订号。
5. 为现有自动化 Repo 建立 READY 知识图谱（推荐 Graphify，内置代码图可兜底）。批准 BDD 与图谱是脚本生成必需项，Codegen 是可选证据；页面自动识别当前 Agent 并把任务固定输出到 `specs/` 与 `tests/`。

当用户要求“生成 Playwright 脚本”或“处理生成队列”时，不要只解释步骤：读取 `GET /api/state` 中 `generationJobs`。对 `queued` Job，按 `prompt`、`outputs.specPath`、图谱证据路径和可选录制引用调用当前环境可用的 Playwright Generator Agent，并把代码提交到 `PUT /api/generation-jobs/<job-id>/result`，请求体为 `{code, notes}`。服务器会把代码写入 Job 固定的目标 Repo `tests/<tenant>/<region>/<scenarioId>.spec.ts`；自动模式随后真实执行该文件，手工模式则进入 `awaiting-replay`，等待 QA 在页面点击回放。

对 `fix-queued` Job，读取 `fixPrompt` 以及 `validation.attempts` 最新一轮的错误摘要、stdout/stderr 和 artifacts；优先使用 Playwright Healer 的检查与修复思路，做最小、可解释的修复，不能删除关键断言或用固定等待掩盖失败。再次调用同一 result API 提交修复代码。自动模式会立即再回放，循环至 `awaiting-qa` 或达到 `validation.maxAttempts` 后进入 `failed`。不要自称 UI 服务器直接调用了宿主 Agent：服务器负责编排、回放和证据，当前 Codex/Claude Code/Devin Agent 负责生成及修复。

回放通过不等于最终完成。`awaiting-qa` 必须由 QA 在生成队列检查脚本、错误历史和 Trace/截图/录像后签署；批准调用 `POST /api/generation-jobs/<job-id>/sign-off` 并提交 `{decision:"approved", reviewer, comments}`，状态才是 `signed-off`。QA 退回必须填写原因，任务进入 `fix-queued`（未超过上限时）。Agent 永远不能替 QA 自动签署。

BDD Case Center 必须把上述闭环作为一个页面级工作流展示，而不是散落的后台状态：审核页负责 Excel Sheet/Row 追溯和 BDD 批准；图谱页负责目标 Repo 门禁；生成弹窗负责回放模式、自动修复和最大轮次；生成队列用“生成脚本 → 真实回放 → 自动修复 → QA 签署”四阶段进度、每轮错误与附件展示实际状态。页面支持自动回放和 QA 手工回放。每个 Job 冻结 `validation.replayMode`、`autoFix`、`maxAttempts`、attempts、progress 和 `qaSignOff`，不能把 queued、机器 PASS 或 Agent 修复冒充最终完成。

BDD Case Center 的审核、Repo 图谱、生成弹窗、任务队列、错误记录和 QA 签署必须跟随全局 `zh-CN`、`en`、`ko` 切换。翻译 UI 标签、帮助和友好错误；不要翻译或改写 BDD 正文、不可变 Excel 源行、Repo 路径、代码、Prompt、命令及 stdout/stderr，因为这些属于可审计证据。

本流水线新增的存储约定：`data/store.json` 保存 Job 状态、每轮结果和 QA 签署；`data/generation-jobs/<job-id>/` 保存冻结输入；目标 Repo 保存 `specs/<tenant>/<region>/<scenarioId>.md` 与 `tests/<tenant>/<region>/<scenarioId>.spec.ts`；`artifacts/generation/<job-id>/attempt-N/` 保存每轮 Trace 及目标配置生成的截图/录像。不得提交这些运行数据、目标 Repo 副本或凭据。

命令行快速转换：

```bash
node scripts/bdd-case-factory.mjs import \
  --input /absolute/path/manual-cases.xlsx \
  --output /absolute/path/bdd-output
```

输出包含 `manifest.json`、`cases/*.json` 和 Generator 使用的准确 `specs/*.md`。详细字段、评分规则、重复导入策略、UI 和三平台触发方法见 [BDD Case Factory 指南](references/bdd-case-factory.md)。知识图谱边界和脚本生成证据优先级见 [自动化知识与脚本生成](references/automation-knowledge.md)。

三平台显式调用示例：

```text
Codex: 使用 $local-web-test-recorder，把 /path/manual.xlsx 全部转换成 BDD，并输出自动化可行度报告。
Claude Code: /local-web-test-recorder import this multi-sheet workbook, review blocked BDD cases, and prepare Playwright Generator jobs.
Devin: @skills:local-web-test-recorder convert manual.xlsx to BDD, build the repository graph, and process queued Playwright generation jobs.
```

Web 页面会自动识别当前 Agent，不把 Codex、Claude Code 或 Devin 当成普通用户需要选择的“脚本生成方式”。Codex 和 Claude Code 可在支持 Playwright Test Agents 的环境中继续执行 Generator Loop；Devin 使用相同的 Job、Skill 指令和普通 Playwright CLI，且不得假装存在未被官方支持的 Devin Generator 参数。

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
| Google Chrome | 可选 | 产品录制使用 Playwright 浏览器；仅在其他本地调试工作流明确需要正式 Chrome 时安装。 |
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
node start-server.mjs
```

看到服务器地址后打开 <http://localhost:4173>。保持启动终端不关闭；用 `Ctrl+C` 停止服务器。脚本会检查运行环境并把服务日志写入 `data/logs/server.log`。依赖缺失时使用 `node start-server.mjs --install`；端口被占用时使用 `node start-server.mjs --port 4174`。`npm start` 仍是备用启动方式。

### 环境变量与代理

应用支持以下可选环境变量；相对路径容易混淆，优先使用绝对路径：

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `4173` | 本地服务器端口。 |
| `DATA_DIR` | `<项目>/data` | `store.json` 的目录。 |
| `PROFILES_DIR` | `<DATA_DIR>/profiles` | 旧版本兼容 Profile 目录；新录制入口不再使用。 |
| `AUTH_STATE_DIR` | `<DATA_DIR>/auth` | Suite 版本 Cookie/登录状态目录；必须按凭据保护。 |
| `RECORDINGS_DIR` | `<项目>/recordings` | Inspector 录制脚本目录。 |
| `ARTIFACTS_DIR` | `<项目>/artifacts` | Trace、视频和失败截图目录。 |
| `TEST_SUITES_DIR` | `<项目>/test-suites` | 以计划名称分目录保存 JS/Python 测试文件。 |

企业网络下载依赖失败时，只给当前终端临时设置 `HTTPS_PROXY`，例如 macOS/Linux 使用 `HTTPS_PROXY=http://proxy.example:8080 npm ci`，PowerShell 使用 `$env:HTTPS_PROXY='http://proxy.example:8080'` 后再运行安装命令。测试用例自己的浏览器代理应在页面“代理”字段配置，不要修改全局系统代理，也不要把代理密码提交到 Git。

详细的配置、录制、断言、回放和排错说明见 [中文指南](guideline.zh-CN.md)。

### 基本使用流程

1. 按严格单父级层级创建资产：`Test Plan → Test Suite → Test Case`。新建/编辑 Suite 必须选择 Plan，新建/编辑 Case 必须选择 Suite；公共流程可设为全局、属于 Suite 或属于 Case。
2. 把登录/退出登录放在 Suite Setup/Teardown，把单用例前置/清理放在 Case Setup/Teardown；把加购物车、进入商品页等复用动作建成有版本的公共流程。
   Suite Setup、Suite Teardown 和公共流程都可单独录制及回放。录制结束同时保存完整 JavaScript、生成 Python 并导入无代码步骤；目标已有步骤时必须由用户确认后才覆盖，取消不修改原数据。
3. 配置浏览器、页面语言、起始 URL、代理和测试数据。
4. 用户点击“开始录制”，完成操作后关闭 Playwright Inspector；不需要点 Save，也不要只关闭被录制的 Chrome 标签页。
5. 应用把 Inspector JavaScript 作为不可变“录制时原始快照”永久保留，并初始化一份可编辑“原生回放 JavaScript”，同时生成可编辑无代码步骤及其只读 JS/Python 导出；“手工导入”只作为异常恢复入口。
6. 核对录制快照、原生回放代码、无代码导入覆盖率，以及每个可视化步骤的定位方式、角色名称和输入值。原生代码与无代码步骤是两个独立执行来源；修改任何一方都不覆盖另一方。
7. 增加断言、等待、超时、重试或失败后继续策略。
8. 保存并回放用例，或在计划页运行整个计划；在“执行记录”查询历史结果。
9. 失败时先阅读页面上的失败步骤、原因和处理建议，再查看截图、录像和 Trace。

运行整个 Suite 时只创建一个 Browser、Browser Context 和主 Page，严格按 Suite Setup → Case 1（Setup/主体/Teardown）→ Case 2 → … → Suite Teardown 连续执行，因此登录 Cookie/localStorage 不会在阶段之间丢失。Case 主体失败仍尝试 Case Teardown，Suite Setup 或任一 Case 失败仍尝试 Suite Teardown。整套执行只保存一个主录像和一个 Trace，失败步骤单独截图，并在执行记录中按阶段显示。执行 Plan 时按 `suiteIds` 顺序逐套执行，每个 Suite 各自使用一个独立会话，Plan 记录按 Suite 分组。一个 Suite 只能属于一个 Plan。只有单独回放 Suite 阶段、Case/Case 阶段或公共流程时才创建独立浏览器和独立录像。

“测试执行”使用 `Plan → Suite → Case` 三列联动选择：点击 Plan 只展开其 Suite，点击 Suite 只展开其 Case。勾选 Plan 必须级联勾选全部 Suite/Case，勾选 Suite 必须级联勾选全部 Case；取消子项后父项显示部分选中。只选 Case 仍必须由所属 Suite 的 Setup/Teardown 包裹并共享一个浏览器会话。执行前为每个 Suite 选择 Stable、Latest 或指定版本，该 Suite 版本同时决定 Setup、Teardown、配置和成员快照；部分 Case 执行可再覆盖各 Case 的版本。若 Stable/Latest Suite 快照不包含所选 Case，确认弹窗必须显式改用包含全部所选 Case 的最新活动 Suite 版本，并保持 Case 的所选策略；没有兼容版本时禁止执行。新建/移动 Case 必须创建 Suite 成员版本，历史不一致数据通过新增迁移版本修复，不能改写旧快照或自动改变 Stable。确认区域必须预览 `Suite Setup vN → Case vM… → Suite Teardown vN`。执行记录详情按 Suite 展示 Setup、每个 Case 和 Teardown 的实际版本与通过/失败/跳过状态，并在阶段内展示步骤明细、失败原因、截图、录像和 Trace；记录之后不随 Stable/Latest 改变。

Case Setup、测试步骤、Case Teardown、Suite Setup/Teardown 和公共流程都提供“标准录制”和“手工登录后录制”。后者要求先在录制浏览器完成登录且不关闭 Inspector，再回到平台点击“登录完成，开始录制业务步骤”；平台记录当时的步骤快照与步骤数，优先精确删除登录前缀，Inspector 改写前缀时按记录的步骤数恢复边界，只把后续步骤同步为无代码、JavaScript 和 Python。如果关闭后的脚本短到无法应用该边界，平台不得丢弃整次录制：完整导入并醒目提示用户手工删除登录步骤。

Case 录制必须把步骤写入启动录制时选择的阶段。若用户先把完整流程录入主体步骤，可使用“选择步骤作为 Setup/Teardown”多选并移动或复制；该操作必须原子创建一个新版本并同时重建 JavaScript/Python，不能要求用户手工剪贴代码。

Case 的标准录制还可选择“Suite 上下文中录制”：选择所属 Suite 以及 Stable、Latest 或指定版本，平台加载 `data/auth/suites/<suite-id>/vN/storage-state.json` 后直接打开 Case 起始页。该文件由对应版本的 Suite Setup 成功回放或录制后生成；缺失时必须先生成登录状态，平台不会静默回退到未登录会话。

步骤编辑器支持拖拽排序和在任意步骤前后插入。定位器优先使用 testId、role+可访问名称、label 和用户可见文本；也支持 id、name、class、CSS、XPath，以及等于、包含、不等于、不包含和正则匹配。可使用“查找页面元素”在已授权目标页面上生成并排序定位器候选，选择后必须回放验证。

失败记录的“本地 AI 诊断与修复”默认使用内置确定性规则；配置 `LOCAL_AI_URL`、`LOCAL_AI_MODEL` 和可选 `LOCAL_AI_API_KEY` 后，可调用 OpenAI-compatible 本地模型补充摘要。只有超时等待和精确匹配等白名单结构化修改允许 Apply，应用前必须由用户确认；永远不执行模型生成的任意代码，也不自动修改代理凭据或绕过目标网站安全控制。

界面右上角“界面语言”可切换中文、English 和 한국어，选择保存在当前浏览器的 `localStorage`（键：`coupayWeb.uiLocale`），刷新后继续生效。界面语言只影响平台菜单、表单、提示、弹窗和友好错误，不会修改测试用例的“页面语言”、定位器、测试数据或录制代码。需要切换被测页面语言时仍在用例“配置与数据 → 页面语言”填写 BCP 47 locale，例如 `zh-CN`、`en-US`、`ko-KR`。

慢页面优先使用“回放稳定性”预设和步骤内“稳定性与高级等待”：等待 Loading 消失、元素可用/可编辑、文本或 URL 达到目标，或使用“点击并等待接口”。使用 Web-first 断言，不用一次性读取 DOM。只对 Timeout、网络重置和 HTTP 5xx 等临时错误退避重试；`auto` 不重复潜在副作用点击，只有确认幂等后才设为 `safe`。记录每次失败、等待和恢复，重试后通过仍标记为 Flaky。

双来源约定：`recordedSources.<phase>.originalJavascript` 是永久只读的录制快照，`runnableJavascript` 是可编辑、可直接执行的原生回放代码。保存原生代码必须创建新资产版本，只更新当前阶段的 `runnableJavascript` 和默认执行方式，绝不改写快照或无代码步骤。导入器仍生成可编辑无代码步骤；保存步骤只重建只读 JS/Python 导出，不反向覆盖原生代码。单独回放阶段、Case 或公共流程时可选择“按原生代码回放”或“按当前步骤回放”；Suite/Plan 执行可选“各阶段默认”“优先原生代码”或“全部当前步骤”。无论混用哪种引擎，一次 Suite 执行仍使用同一 Browser/Context/Page、一个录像和一个 Trace。历史资产没有 `recordedSources` 时自动按无代码执行。测试账号字段只存引用名称。数据用 `${data.key}`/`${data.nested.key}`，机密用 `${env.SECRET_NAME}`。多条 URL 映射按顺序匹配第一条；原生映射仅用于同协议回放，录制阶段或跨协议映射使用上游 Charles Map Remote。

### 会话隔离与 Suite 上下文录制

每次标准录制和回放默认创建全新浏览器会话，不继承上次 Cookie、缓存、Local/Session Storage 或 IndexedDB。“合规录制”入口已移除。需要在登录后的页面录制 Case 时，优先选择 Suite 上下文并显式选择 Suite 版本；没有可用状态时使用“手工登录后录制”。

遇到 CAPTCHA 或登录验证时，在打开的 Chrome 中手工完成后继续。录制器本身处于交互等待状态，不会破解 CAPTCHA、隐藏自动化特征或规避目标网站控制。白名单字段只是审批记录；真正的 IP/账号白名单必须由目标系统管理员配置。回放检测到 Access Denied、CAPTCHA 或异常流量页面时，会标记为“目标网站拒绝自动化”，停止无意义重试并给出合规建议。

### 数据存储位置

所有业务数据默认保存在生成项目目录中，不由本应用主动上传：

- `data/store.json`：测试计划、测试套件、测试用例、公共流程及版本、生命周期步骤、测试数据、配置和执行记录元数据。
- `data/auth/suites/<suite-id>/vN/storage-state.json`：Suite Setup vN 成功录制或回放后保存的 Cookie/localStorage，供 Case 的 Suite 上下文录制加载；按登录凭据保护。
- `data/profiles/` 与旧 `data/auth/<case-id>.json`：旧版本合规录制兼容数据；新录制入口不再创建。
- `recordings/`：Playwright Inspector 生成的脚本；可能包含录制时输入的明文。
- `test-suites/<计划名>/<套件名>/`：每个 Case 一个从无代码步骤生成的 `.spec.js` 和 Python 导出，并嵌入 Suite Setup/Teardown；`suite.*` 保存 Suite 阶段导出。每个 `versions/vN/` 同时保存 `steps.json`、`generated.spec.js`、`generated.py`、只读 `recorded.<phase>.spec.js` 和可编辑回放源 `native.<phase>.spec.js`（存在录制时）；公共流程采用同样规则并位于 `test-suites/_公共流程/`。旧文件名继续生成，已有命令和历史路径不失效。

普通用户页面只展示“无代码步骤”“配置与数据”“录制”“回放”和“版本历史”。代码能力收进“高级功能”：原生回放 JavaScript 可编辑且保存为新版本，录制时原始快照严格只读，当前步骤生成的 JS/Python 只读且可下载。不再提供会创建额外空资产的“复制为自定义代码用例”入口；历史自定义代码用例仍可查看和编辑。版本历史的每一行必须按阶段展示该版本的默认回放方式（原生代码或无代码步骤），并在无代码为默认但原生代码可用时标明“可切换原生”。
- `artifacts/<run-id>/`：失败截图、视频和 Trace；可能包含页面内容、账号信息和网络证据。

在生成项目根目录使用 `npm run test:generated`，或传入具体 `test-suites/<计划>/<套件>/<用例>.spec.js` 路径执行本地 JavaScript。Python 需安装 `pytest-playwright` 后用 `python3 -m pytest <test_*.py>` 执行。

删除计划或用例不会自动删除历史录制与运行产物。备份或清理前先停止服务器。详细说明见中文指南的“数据存储、备份和删除”。

版本管理采用不可变快照。Suite 将 Setup/Teardown/配置/Case 绑定原子保存，Case 将 Setup/测试步骤/Teardown/配置/JS/Python 原子保存，公共流程单独保存。编辑历史版本必须“基于此版本编辑”并创建新版本；版本可修改说明、对比、归档和恢复，并用 Stable 作为唯一稳定标记，不设置额外版本标签。测试用例业务标签仍独立用于资产筛选。永久删除必须先归档，并受 Latest、Stable、固定引用、执行记录和录制会话保护；删除后的版本号不得复用。

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
| Google Chrome | Optional | Product recording uses Playwright browsers; install stable Chrome only for separate local debugging workflows that explicitly need it. |
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
node start-server.mjs
```

Open <http://localhost:4173> and keep the terminal running. Press `Ctrl+C` to stop. The launcher validates the environment and appends server output to `data/logs/server.log`. Use `node start-server.mjs --install` when dependencies are missing, or `node start-server.mjs --port 4174` when the default port is occupied. `npm start` remains a fallback.

### Environment variables and proxies

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4173` | Local server port. |
| `DATA_DIR` | `<project>/data` | Directory containing `store.json`. |
| `PROFILES_DIR` | `<DATA_DIR>/profiles` | Legacy profile directory; new recording entry points do not use it. |
| `AUTH_STATE_DIR` | `<DATA_DIR>/auth` | Versioned suite Cookie/login state; protect as credentials. |
| `RECORDINGS_DIR` | `<project>/recordings` | Inspector-generated scripts. |
| `ARTIFACTS_DIR` | `<project>/artifacts` | Traces, videos, and failure screenshots. |
| `TEST_SUITES_DIR` | `<project>/test-suites` | Plan folders containing per-case JavaScript and Python files. |

On a corporate network, temporarily set `HTTPS_PROXY` only in the installation shell if package or browser downloads fail. For example, use `HTTPS_PROXY=http://proxy.example:8080 npm ci` on macOS/Linux or `$env:HTTPS_PROXY='http://proxy.example:8080'` in PowerShell. Configure the test browser proxy in the application's Proxy field; do not alter the global OS proxy or commit proxy credentials.

Read the [English guide](guideline.en.md) for configuration, recording, assertions, replay, and troubleshooting.

### Basic workflow

1. Create assets with a strict single-parent hierarchy: `Test Plan → Test Suite → Test Case`. Creating or editing a Suite requires a Plan; creating or editing a Case requires a Suite. A shared flow can be global, Suite-owned, or Case-owned.
2. Put login/logout in Suite Setup/Teardown, case-local preparation/cleanup in Case Setup/Teardown, and reusable business actions in versioned shared flows.
   Suite Setup, Suite Teardown, and shared flows can each be recorded and replayed independently. Recording imports full JavaScript, generated Python, and no-code steps together. Existing steps require explicit overwrite confirmation; canceling preserves the target.
   Configure browser, locale, proxy, and timeouts for standalone shared-flow recording/replay in the flow's Edit information dialog. A flow invoked by a case or suite uses the calling case settings instead.
3. Configure browser, page locale, start URL, proxy, and test data.
4. Click Record, interact with the browser, then close Playwright Inspector. There is no Save action; closing only the recorded Chrome tab is not a reliable completion signal.
5. The app permanently stores Inspector JavaScript as an immutable **original recording**, then creates editable no-code steps and JS/Python exports. Manual import is only a recovery path.
6. Review the original recording, import coverage, and every recognized locator, accessible name, and input value. Original recording and no-code are independent execution sources.
7. Add assertions, waits, timeouts, retries, and continue-on-error behavior.
8. Save and replay a case, or run every case from the plan page; query history under Runs.
9. On failure, read the failed-step diagnosis first, then inspect the screenshot, video, and trace.

A full Suite run creates one Browser, Browser Context, and primary Page and strictly runs Suite Setup → Case 1 (Setup/body/Teardown) → Case 2 → … → Suite Teardown, so authentication cookies/localStorage survive across stages. Case Teardown is attempted after a failed body, and Suite Teardown is attempted after Setup or Case failure. It stores one primary video and one Trace plus per-failure screenshots, with stage results in one ordered session. A Plan runs complete Suites sequentially in `suiteIds` order, starting one independent shared session per Suite and grouping evidence by Suite. A Suite belongs to exactly one Plan. Standalone phase, Case, or shared-flow replay still launches an isolated browser and records separate artifacts.

The Test execution screen uses linked `Plan → Suite → Case` columns: focusing a plan shows only its suites, and focusing a suite shows only its cases. Checking a Plan cascades to every Suite/Case; checking a Suite cascades to every Case. Clearing a child leaves the parent indeterminate. A case-only selection still runs inside its owning Suite Setup/Teardown and shared browser session. Before execution, choose Stable, Latest, or a specific suite version; that atomic suite version controls Setup, Teardown, settings, and membership. A case subset can override each case version. If the requested Stable/Latest Suite snapshot does not contain all selected Cases, the confirmation UI must visibly use the newest active compatible Suite version while preserving each Case policy; block execution if none exists. Creating or moving a Case must commit a Suite membership version. Repair older inconsistent data by adding a migration version without rewriting history or changing Stable. Preview `Suite Setup vN → Case vM… → Suite Teardown vN`. Run details must show the resolved version and pass/fail/skip state for Setup, every Case, and Teardown, plus step details, failure reasons, screenshots, video, and Trace; the immutable record never follows later Stable/Latest changes.

Case Setup, case steps, Case Teardown, Suite Setup/Teardown, and shared flows all offer **Standard recording** and **Record after manual login**. The latter captures both the step snapshot and count when the user marks the business boundary. It first removes an exact login prefix and falls back to the captured step count if Inspector rewrites that prefix. If the final script is too short to apply either boundary safely, never discard the recording: import all recognized steps and show a prominent instruction to remove login actions manually.

Standard case recording also offers **Record in suite context**. Select the containing suite and its Stable, Latest, or a specific version. The recorder loads `data/auth/suites/<suite-id>/vN/storage-state.json` and opens the case start URL. A successful replay or recording of that Suite Setup version creates the state file; missing state is reported explicitly and never falls back silently to a signed-out session.

Use **Interface language** in the top-right corner to switch among 中文, English, and 한국어. The choice is stored in the current browser's `localStorage` under `coupayWeb.uiLocale` and persists across reloads. UI language affects platform navigation, forms, notifications, dialogs, and friendly errors only; it never changes the case's test-page locale, locators, test data, or recorded code. Configure the target page separately under **Settings & data → Test page locale** with a BCP 47 value such as `zh-CN`, `en-US`, or `ko-KR`.

For slow pages, use Stability presets and per-step Advanced readiness: wait for loading indicators to disappear, elements to become enabled/editable, text or URL state, or Click and wait for response. Use Web-first assertions rather than one-shot DOM reads. Retry only transient timeouts, network resets, and HTTP 5xx with backoff; `auto` never repeats potentially side-effecting clicks, and `safe` requires an explicit idempotency decision. Keep every failed attempt/recovery and mark recovered runs as flaky.

Dual-source contract: `recordedSources.<phase>.originalJavascript` is the immutable recording snapshot, while `runnableJavascript` is editable native replay code. Saving native code creates a new asset version and changes only that phase's runnable source and default mode; it never changes the snapshot or no-code steps. Import still produces editable no-code steps, and saving them regenerates only read-only JS/Python exports without overwriting native code. Standalone phase, Case, or shared-flow replay offers **Replay native code** and **Replay current steps**. Suite/Plan execution offers per-phase defaults, prefer-native, or all-current-steps. Mixed engines still run inside the same Browser/Context/Page, video, and Trace for one Suite execution. Historical assets without `recordedSources` automatically use no-code. The account field stores an alias only. Use `${data.key}`/`${data.nested.key}` for test data and `${env.SECRET_NAME}` for secrets. Ordered URL mappings use first match; native mapping is same-protocol replay only, while recording-time or cross-protocol mapping requires upstream Charles Map Remote.

### Session isolation and suite-context recording

Standard recording and replay use a fresh browser context by default, with no cookies, cache, Local/Session Storage, or IndexedDB inherited from the previous run. The Compliant recording entry has been removed. To record an authenticated case, explicitly load a versioned suite context or use Record after manual login.

For CAPTCHA or login challenges, complete the verification manually in the opened Chrome window and then continue. The recorder waits for user interaction; it does not solve CAPTCHA, spoof fingerprints, or evade target controls. Allowlist fields document approval only—the target-system administrator must configure the real IP/account allowlist. Access Denied, CAPTCHA, and unusual-traffic pages are reported as “Target site rejected automation,” with pointless retries stopped and compliant next steps shown.

### Data storage

All application data stays under the generated project directory by default and is not proactively uploaded by this application:

- `data/store.json`: plans, suites, cases, versioned shared flows, lifecycle steps, test data, configuration, and run metadata.
- `data/auth/suites/<suite-id>/vN/storage-state.json`: versioned Cookie/localStorage captured by successful Suite Setup recording or replay and loaded by suite-context case recording; protect it like credentials.
- `data/profiles/` and legacy `data/auth/<case-id>.json`: compatibility data from earlier compliant-recording releases; new recording entry points do not create it.
- `recordings/`: scripts generated by Playwright Inspector; these can contain literal values entered while recording.
- `test-suites/<plan-name>/<suite-name>/`: one no-code-generated `.spec.js` and Python export per case, with Suite Setup/Teardown embedded; `suite.*` contains Suite-phase exports. Each `versions/vN/` contains `steps.json`, `generated.spec.js`, `generated.py`, immutable `recorded.<phase>.spec.js`, and editable `native.<phase>.spec.js` when a recording exists. Shared flows use the same rule under `test-suites/_公共流程/`. Legacy filenames remain available for compatibility.

The ordinary UI exposes no-code steps, configuration/data, recording, replay, and version history. Code tools live under Advanced: native replay JavaScript is editable and saved as a new version, immutable recording snapshots are read-only, and generated JS/Python is read-only and downloadable. Do not expose “Copy as custom code case,” which created a confusing extra empty asset; existing historical custom-code cases remain editable. Every version-history row must show the default replay mode for each phase (native code or no-code steps), including “native available” when no-code is the default but a native source exists.
- `artifacts/<run-id>/`: screenshots, videos, and traces; these can contain page content, account information, and network evidence.

From the generated project root, run JavaScript with `npm run test:generated` or pass a specific `test-suites/<plan>/<suite>/<case>.spec.js` path. Install `pytest-playwright` before running Python with `python3 -m pytest <test_*.py>`.

Deleting a plan or case does not automatically delete historical recordings or run artifacts. Stop the server before backup or cleanup. Read “Data storage, backup, and deletion” in the English guide.

Version management uses immutable snapshots. A suite atomically versions Setup, Teardown, settings, and case bindings; a case atomically versions Setup, main steps, Teardown, settings, JavaScript, and Python; a public flow versions its own steps. Editing history means “Edit from this version” and saving a new version. Users can update the description, compare, archive, and restore versions. Stable is the only version stability marker; extra version tags are not used. Case business tags remain separate for asset filtering. Permanent deletion requires prior archival and is protected by Latest, Stable, pinned references, run records, and active recording sessions. Never reuse deleted version numbers.

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
- Import Playwright `frameLocator(...)` and `locator(...).nth(n).contentFrame()` chains as explicit `switchFrame`/`switchMainFrame` boundaries. Preserve Inspector-generated `filter({hasText})`, `first()`, `last()`, and `nth(n)` locator refinements through no-code saves, JavaScript/Python generation, replay, and diagnostics. Store nested iframe selectors as an outer-to-inner JSON array.
- Keep one searchable, categorized operation/assertion guide available beside every Suite Setup/Teardown, shared-flow, and Case Setup/steps/Teardown editor. Cover common form controls, dialogs, windows, files, frames, waits, locators, data references, and assertions; clearly distinguish reliably imported Playwright code from constructs that require manual review or code mode.

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
