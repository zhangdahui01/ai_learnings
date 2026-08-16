# 本地 Web 测试录制器：中文新手指南

## 目录

1. 这个工具能做什么
2. 环境安装
3. 创建应用
4. 数据存储、备份和删除
5. 配置说明
6. 录制测试用例
7. 编辑步骤和定位器
8. 增加断言、等待和异常处理
9. 回放测试用例和计划
10. 查看失败证据
11. 常见问题
12. 安全与能力边界

## 1. 这个工具能做什么

本工具在你的电脑上运行，用来：

- 创建、编辑和删除测试计划。
- 创建 Plan → Suite → Case；Suite 和 Case 都支持 Setup/Teardown。
- 创建带参数和固定版本的公共流程，并插入 Suite/Case 任意阶段。
- 使用 Playwright Inspector 录制网页操作。
- 把录制代码转换成可以编辑的结构化步骤。
- 在线编辑并执行 Playwright JavaScript；从步骤同步生成 Python。
- 一个计划对应一个文件夹，一个用例对应一个 JS 文件和一个 Python 文件。
- 增加断言、等待、超时、重试和失败后继续。
- 在 Chromium/Chrome、Firefox 和 WebKit 中回放。
- 批量执行测试计划，查询和删除执行记录。
- 通过仪表盘查看计划、用例、执行次数和通过率。
- 显示失败步骤、原因和建议，并保存截图、视频和 Playwright Trace。

数据默认保存在项目目录：

- `data/store.json`：计划、套件、用例、公共流程、配置和最近运行记录。
- `recordings/`：Playwright Inspector 生成的代码。
- `test-suites/<计划名>/<套件名>/`：每个用例的 JavaScript 和 Python 文件。
- `artifacts/`：截图、视频和 Trace。

## 2. 环境安装

### 安装 Node.js

安装 Node.js 20 或更高的 LTS 版本：<https://nodejs.org/>。

打开终端验证：

```bash
node --version
npm --version
```

如果提示“command not found”，说明 Node.js 尚未正确安装或终端需要重新打开。

### 安装项目依赖和浏览器

进入项目目录：

```bash
cd /absolute/path/to/web-test-recorder
npm install
npx playwright install chromium firefox webkit
```

这些命令第一次运行需要联网，浏览器文件可能需要几分钟下载。

## 3. 创建应用

如果通过 Codex Skill 创建新项目，在 Skill 根目录运行：

```bash
node scripts/create_mvp.js /absolute/path/to/web-test-recorder
```

然后安装并启动：

```bash
cd /absolute/path/to/web-test-recorder
npm install
npx playwright install chromium firefox webkit
node start-server.mjs
```

打开 <http://localhost:4173>。停止服务时，在运行服务的终端按 `Ctrl+C`。一键脚本会检查 Node.js、npm 依赖、Playwright Chromium 和端口，并把服务输出追加到 `data/logs/server.log`。首次没有 `node_modules` 时使用 `node start-server.mjs --install`；换端口使用 `node start-server.mjs --port 4174`。`npm start` 仍可作为最简备用命令。

## 4. 数据存储、备份和删除

### 应用业务数据

所有相对路径都以生成的 `web-test-recorder` 项目目录为根目录：

| 路径 | 保存内容 | 注意事项 |
|---|---|---|
| `data/store.json` | 测试计划、套件、用例、公共流程版本、生命周期、步骤、断言、测试数据、配置和执行记录元数据 | 当前版本使用本地 JSON，不是远程数据库。测试数据可能敏感。 |
| `data/auth/suites/<Suite ID>/vN/storage-state.json` | Suite Setup vN 成功录制或回放后保存的 Cookie/localStorage | Case 的 Suite 上下文录制会加载；相当于登录凭据，禁止提交或分享。 |
| `data/profiles/`、`data/auth/<用例 ID>.json` | 旧版本合规录制的兼容数据 | 新录制入口不再创建；确认无需兼容后可人工清理。 |
| `recordings/*.spec.js` | Playwright Inspector 生成的原始录制代码 | 录制时输入的账号、搜索词或其他值可能以明文出现。 |
| `test-suites/<计划名>/<套件名>/*.spec.js` | 可在线编辑、可回放的 Node.js/Playwright 测试 | 一个 Case 一个文件；按 Suite Setup → Case Setup/Steps/Teardown → Suite Teardown 生成。 |
| `test-suites/<计划名>/<套件名>/test_*.py` | 从同一步骤模型生成的 Python/Playwright 测试 | 与 JavaScript 保持同样的 Suite/Case 生命周期；Python 可用 pytest-playwright 独立运行。 |
| `test-suites/<计划名>/<套件名>/suite.*` | Suite Setup/Teardown 的 JS/Python 源码 | 无代码阶段保存后自动同步；Case 可执行文件中也会嵌入这些阶段。 |
| `test-suites/_公共流程/` | 公共流程当前版本的 JS/Python | 修改无代码步骤或重新录制后同步更新。 |
| `artifacts/<run-id>/failure.png` | 失败页面截图 | 可能显示用户资料、订单、账号或其他页面内容。 |
| `artifacts/<run-id>/trace.zip` | Playwright Trace、页面快照和网络证据 | 可能包含 URL、DOM、请求信息和输入值。 |
| `artifacts/<run-id>/*.webm` | 回放视频 | 可能包含操作过程和页面中的敏感内容。 |

应用默认绑定本机 `localhost`，不会主动把这些文件上传到云端。但是执行网页操作时，请求会正常发送给被测试网站；安装依赖时 npm 和 Playwright 会访问各自的下载服务。

在项目根目录执行本地代码：

```bash
# 整个生成目录，也可在 -- 后传入某个 Plan/Suite/Case 路径
npm run test:generated
npm run test:generated -- "test-suites/<计划名>/<套件名>/<用例名>.spec.js"

# Python 需先安装 pytest-playwright 并执行 playwright install
python3 -m pytest "test-suites/<计划名>/<套件名>/test_<用例名>.py"
```

生成的 JavaScript 会带上用例的浏览器、locale、操作/导航超时和代理服务器；代理密码不写入文件，命令行用 `WTR_PROXY_USERNAME` / `WTR_PROXY_PASSWORD` 提供。可用 `WTR_TEST_TIMEOUT`、`WTR_EXPECT_TIMEOUT`、`WTR_BROWSER` 和 `WTR_HEADLESS=false` 调整 CLI 运行。

### 环境文件

- `node_modules/`：项目依赖，可以通过 `npm install` 重建。
- Playwright 浏览器缓存：macOS 通常在 `~/Library/Caches/ms-playwright`，Linux 通常在 `~/.cache/ms-playwright`，Windows 通常在 `%USERPROFILE%\AppData\Local\ms-playwright`。
- 标准模式临时 Profile：通常由 Playwright 放在操作系统临时目录并在浏览器关闭后清理。
- 默认会话：录制/回放均全新创建；临时 Profile 在结束后删除，不继承 Cookie 或缓存。
- 显式持久化会话：专用 Profile 和登录状态位于 `data/profiles/<用例 ID>/` 与 `data/auth/<用例 ID>.json`，必须当作凭据保护。
- Skill 本身：通常在 `~/.codex/skills/local-web-test-recorder/`。

### Git 和共享

模板的 `.gitignore` 默认排除：

```text
data/store.json
data/profiles/
data/auth/
recordings/
artifacts/
node_modules/
```

不要强制提交这些目录。分享 Trace、截图、视频或录制脚本前，先检查并删除敏感信息。

### 备份

1. 在服务器终端按 `Ctrl+C` 停止应用。
2. 备份 `data/store.json`。
3. 如果需要保留原始录制和故障证据，同时备份 `recordings/` 与 `artifacts/`。
4. 恢复时把文件放回相同的项目相对路径，再启动服务器。

### 删除和保留策略

- 在界面删除计划或用例只会更新 `data/store.json`。
- 删除计划不会自动删除其中的用例。
- 删除用例不会自动删除对应的旧录制、运行元数据、截图、视频或 Trace。
- “执行记录”页面可以删除单条或清空运行元数据，但 `artifacts/` 文件不会自动清理。
- 清理前先停止服务器，并通过 Finder/文件管理器删除明确选中的录制文件或具体 `artifacts/<run-id>` 目录。

## 5. 配置说明

### 浏览器

- `Chrome / Chromium`：默认选项，适合多数网站。
- `Firefox`：验证 Firefox 兼容性。
- `WebKit`：验证 WebKit 引擎兼容性；它不是真实 Apple Safari。

### 页面语言

填写 BCP 47 语言代码，例如：

- `zh-CN`：简体中文。
- `en-US`：美国英语。
- `ko-KR`：韩语。

录制和回放应使用相同语言。role 定位器会严格保留可访问名称；找不到时会失败，避免误点同角色的其他元素造成假通过。

### 平台界面语言（中文 / English / 한국어）

页面右上角的“界面语言”用于切换平台 UI，支持中文、英文和韩文。切换后菜单、Dashboard、测试计划/用例/执行记录、步骤编辑、高级等待、配置、录制弹窗、Toast、确认框和友好错误提示会立即更新。刷新或重新打开页面后仍保持上次选择。

这个选择只保存在当前浏览器的 `localStorage`，键名为 `coupayWeb.uiLocale`，不写入 `data/store.json`，也不会跟随测试计划导出。清理网站数据或执行 `localStorage.removeItem('coupayWeb.uiLocale')` 会恢复默认中文。

不要混淆两种语言设置：右上角是“平台界面语言”；用例“配置与数据”中的“页面语言”是被测网站的 Playwright locale。切换平台 UI 不会改写录制代码、元素可访问名称、测试数据和被测网页语言。

### 起始 URL

填写完整地址，例如 `https://example.com/login`。推荐总是带上 `https://`。

### 测试数据

“测试账号（名称/引用）”只是可审计的账号别名，例如 `accounts.qa-buyer`，不会读取密码，也不会自动填表。实际可变数据放在“测试数据 JSON”：

```json
{
  "account": {
    "username": "qa-user@example.com"
  },
  "searchText": "playwright tutorial"
}
```

无代码步骤的 URL、输入值和期望值都可写 `${data.searchText}` 或嵌套的 `${data.account.username}`。JS/Python 由系统生成相同引用，回放时通过 `WTR_TEST_DATA` 注入并解析。密码、Token 等机密值使用 `${env.COUPAY_PASSWORD}`，启动服务器前设置对应环境变量；不要把生产密码、Token 或一次性验证码写进 JSON、代码或录制文件。

### 无代码与代码如何同步

- 保存无代码步骤：结构化步骤为权威版本，自动重建 JavaScript 和 Python；如果当前用例含手写代码，界面会先确认，避免静默覆盖。
- 保存 JavaScript：系统识别常见 Playwright `goto/fill/click/press/wait/assertion` 等语句，反向更新无代码步骤，再生成 Python。
- JavaScript 中无法识别的 helper、循环、条件、frame 等代码会原样保存，并给出“部分步骤无法可视化”的提示，不会假装已完整同步。
- Python 是导出/派生版本。保存 Python 不反向修改 JS 或无代码步骤，因为任意 JS↔Python↔步骤无法可靠无损转换。

因此，普通用户以无代码步骤为主；开发者以 JavaScript 为主。不要同时在两个页面并发修改同一用例。

### 代理

支持：

```text
http://127.0.0.1:7890
socks5://127.0.0.1:1080
```

“上游代理服务器”用于让浏览器流量经过 Charles 或企业代理。例如 Charles 默认可填 `http://127.0.0.1:8888`；“代理绕过域名”可填 `localhost,127.0.0.1,.corp.internal`。当前界面不持久化代理用户名和密码。不要通过修改全局系统代理来实现单个用例代理。

“远程映射（Map Remote）”支持多条 key-value 规则，按界面顺序匹配第一条启用规则：

| 来源（key） | 目标（value） | 保留后续路径 |
| --- | --- | --- |
| `https://www.coupang.com/` | `https://qa-coupang.example/` | 是 |
| `https://api.example.com/v1/` | `https://mock.example.com/api/` | 是 |

第一条会把 `https://www.coupang.com/np/campaigns/82` 回放到 `https://qa-coupang.example/np/campaigns/82`。本应用的原生映射用于**回放**且要求来源、目标协议相同。录制阶段也需要映射，或要做 HTTP↔HTTPS、改 Header/Query/Body 时，请把上游代理设为 Charles，并在 Charles 中使用 Map Remote/Rewrite；只想把域名指到另一个 IP 并保留 Host 时使用 Charles DNS Spoofing。仅在你拥有授权的 QA/Staging 环境使用这些能力。

### Plan、Suite、Case 与公共流程怎么组织

步骤可通过左侧拖拽手柄排序，也可用“＋↑/＋↓”在任意步骤前后插入。定位器支持 role、label、text、testId、placeholder、altText、title、id、name、class、CSS 和 XPath；匹配关系支持等于、包含、不等于、不包含和正则。优先采用 testId、role 和 label，class/XPath 只作为最后手段。

“查找页面元素”会使用当前用例的浏览器、页面语言和代理打开已授权 URL，扫描可见交互元素并返回带稳定性分数的候选。选择候选只是修改编辑表单，必须保存并回放确认。

失败结果中的“本地 AI 诊断与修复”默认在本机运行规则诊断。设置 `LOCAL_AI_URL`、`LOCAL_AI_MODEL` 和可选 `LOCAL_AI_API_KEY` 可连接 OpenAI-compatible 本地模型。Apply 只接受服务器白名单中的结构化修改并保留前后快照，不执行 AI 任意代码。

- 测试资产采用严格单父级层级：`Test Plan → Test Suite → Test Case`。新建或编辑 Suite 必须选择一个 Plan；新建或编辑 Case 必须选择一个 Suite。移动父级会创建新版本并同步本地文件路径。
- 测试计划（Plan）是发布/回归目标；按顺序执行多个测试套件。每个 Suite 是独立执行会话，计划记录按 Suite 展开状态、失败步骤、截图、录像和 Trace。
- 测试套件（Suite）组织同一业务域的用例。运行整个 Suite 时只启动一次 Browser、一个 Browser Context 和一个主 Page，会依次执行 Suite Setup → 其中调用的公共流程 → 每个 Case 的 Setup/主体/Teardown → Suite Teardown。Cookie、localStorage 和页面状态在这个会话中连续保留；Suite Teardown 即使 Setup 或 Case 失败也会尝试执行。整套运行只生成一个主录像和一个 Trace，失败步骤各自保存截图。
- 在“测试执行”中按 `Test Plan → Test Suite → Test Case` 三列选择范围。点击某个 Plan 后中列只显示该 Plan 的 Suite；点击某个 Suite 后右列只显示该 Suite 的 Case。勾选 Plan 会默认勾选其全部 Suite 和 Case，勾选 Suite 会默认勾选其全部 Case；取消任意子项后父项显示部分选中。只选 Case 时也会自动执行所属 Suite 的 Setup 和 Teardown，不会退化为无登录态的独立 Case 会话。
- 版本在三列下方的“本次执行版本”配置：Suite 选择 Stable、Latest 或指定 vN，该 vN 同时用于 Suite Setup 和 Suite Teardown；不能分别混用两个 Suite 版本。只选择部分 Case 时，可以为每个 Case 覆盖 Stable、Latest 或指定版本。页面执行前预览版本链，执行记录永久保存实际解析的 Suite、Case 和公共流程版本。
- “手工登录后录制”在点击“登录完成，开始录制业务步骤”时同时记录登录步骤快照和步骤数。正常情况下精确删除登录前缀；Inspector 改写前缀时用点击时的步骤数恢复边界并提示检查第一个业务步骤；若最终脚本无法可靠应用边界，则完整导入而不是报错丢失录制，并用红色提示要求手工删除登录步骤。该规则一致适用于 Suite Setup/Teardown、Case 三阶段和公共流程。
- 单独回放 Suite Setup/Teardown、Case、Case 某阶段或公共流程时，仍创建独立的全新浏览器会话和独立录像，不会继承其他回放的 Cookie 或缓存。
- 测试用例（Case）包含 Case Setup、主体步骤/断言和 Case Teardown。单独回放 Case 时使用全新 Browser Context；在 Suite 整体执行中则加入该 Suite 的共享会话。Case Teardown 在主体失败后仍执行。
- 公共流程可设为全局、属于某个 Suite 或属于某个 Case。Suite 流程可用于该 Suite 生命周期与子用例，Case 流程只用于当前 Case；调用时填写参数 JSON并选择版本策略。支付、下单和绑卡设为“敏感操作”，平台禁止自动重试。
- Suite Setup、Suite Teardown 和公共流程编辑页均提供独立“录制”和“回放”。关闭 Inspector 后，平台同时导入完整 JavaScript、生成 Python 和可编辑无代码步骤。若目标已有步骤，导入暂停并显示覆盖确认；选择取消时原代码与步骤完全不变。
- 公共流程独立录制/回放不会借用某个 Case 的代理。在公共流程“编辑信息 → 独立录制/回放配置”中保存浏览器、页面语言、代理和超时。流程被 Case/Suite 引用时，则使用当前 Case 的执行配置。`ERR_ABORTED` 且实际页是 `about:blank` 时，先检查网络出口和该流程的代理，加长元素等待无效。

推荐结构：Plan「支付回归」→ Suite「信用卡支付」→ Suite Setup「测试账号登录」→ Case Setup「打开指定商品」→ Steps「下单与断言」→ Case Teardown「清理购物车」→ Suite Teardown「退出登录」。

## 6. 录制测试用例

1. 创建测试计划。
2. 新建测试套件并在“所属测试计划”选择该 Plan。
3. 新建测试用例并在“所属测试套件”选择该 Suite，然后设置名称、优先级和标签。
4. 在 Suite 或 Case 的“配置与数据”填写浏览器、页面语言、起始 URL 和测试数据。
5. 在 Case Setup、测试步骤或 Case Teardown 中点击“录制当前阶段”，选择“标准录制”或“手工登录后录制”。Suite Setup/Teardown 和公共流程的录制弹窗也提供相同两种方式。
6. 在新打开的 Playwright 浏览器中执行点击、填写、选择和键盘操作。
7. 需要断言时，可在 Inspector 中使用断言工具，也可以导入后手工增加。
8. 完成后关闭 **Playwright Inspector**（带录制工具栏/代码的窗口）。不需要点击 Save；不要只关闭被录制的 Chrome 标签页，因为录制进程可能仍在等待。
9. 页面等待录制进程结束，然后自动保存完整 JavaScript、同步 Python 和可识别的无代码步骤。
10. 应用自动打开“代码编辑”；此时脚本已经落盘，页面里的“保存代码到本地”只用于你随后手工修改代码的场景。

正常流程不需要点击导入或手写脚本。“手工导入（备用）”只用于浏览器异常关闭、旧录制迁移或自动状态丢失。

录制某个 Case 阶段时，导入目标由点击录制时所在的页签决定：在 Case Setup 录制只更新 `setupSteps`，在测试步骤录制只更新 `steps`，在 Case Teardown 录制只更新 `teardownSteps`。如果已经把一段完整业务录进“测试步骤”，点击“选择步骤作为 Setup/Teardown”，可多选后移动或复制到目标阶段；一次确认只创建一个新版本，并同步 JS/Python。

### 手工登录后录制

当 Case 只需要保存登录后的业务操作时，在“开始录制”弹窗选择“手工登录后录制”。第一阶段在录制浏览器完成登录，但不要关闭 Inspector；登录成功后回到平台点击“登录完成，开始录制业务步骤”。平台会保存登录步骤边界，之后才开始计算 Case 的业务步骤。完成业务操作后关闭 Inspector，并在版本确认框选择是否创建新版本。选择保存时，登录步骤不会进入 Case，无代码步骤、JavaScript 和 Python 仅包含边界后的业务操作；原始 Inspector 文件仍保留在 `recordings/`，可能含账号输入，必须按敏感数据保护。若 Inspector 尚未刷新脚本，边界按钮会提示稍等后重试；没有点击边界按钮就关闭 Inspector 时，平台拒绝导入，避免误把登录过程保存进 Case。

### 在 Suite 上下文中录制 Case

1. 先录制或编辑 Suite Setup，使它完成登录。
2. 回放该 Suite Setup 版本；回放成功后平台保存 `data/auth/suites/<suite-id>/vN/storage-state.json`。录制 Suite Setup 并确认创建新版本时，也会保存该新版本的状态。
3. 进入该 Suite 下的 Case，在要录制的 Case Setup、测试步骤或 Case Teardown 点击“录制当前阶段”。
4. 选择“标准录制”，在“会话起点”选择“使用 Suite 上下文”。
5. 选择所属 Suite，再选择 Stable、Latest 或指定版本。只有标记“登录态可用”的版本才能启动。
6. 平台加载该版本 Cookie/localStorage 并打开 Case 起始 URL；用户只录制当前 Case 阶段。

如果所选版本没有登录态，平台明确提示“Suite vN 尚未生成登录状态”，不会静默使用未登录会话。“合规录制”入口已经移除；无法通过 Suite Setup 生成状态时使用“手工登录后录制”。平台不会破解 CAPTCHA、伪造指纹或规避站点安全控制。

## 7. 编辑步骤和定位器

每一步包含：

- 类型：操作或断言。
- 操作/断言：例如 `click`、`fill`、`press`、`toBeVisible`。
- 定位方式：`role`、`label`、`text`、`testId`、`placeholder`、`css` 或 `xpath`。
- 定位值：例如 role 的 `button`、测试 ID 或 CSS。
- 角色名称：role 的可访问名称，例如“登录”或“Search”。
- 值：输入内容、按键、URL、期望值或延时毫秒。
- 超时：该步骤最多等待多少毫秒。
- 稳定性与高级等待：执行前页面就绪条件、重试退避、恢复动作和重复操作安全性。
- 继续：失败后记录 warning 并继续后续步骤。

推荐定位顺序：`testId` → `role + 名称` → `label` → 稳定文本/属性 → `css` → `xpath`。

## 8. 增加断言、等待和异常处理

### 断言示例

验证按钮可见：

```text
类型：断言
断言：toBeVisible
定位方式：role
定位值：button
角色名称：提交
```

验证 URL：

```text
类型：断言
断言：toHaveURL
值：/dashboard$
```

常用断言包括：`toBeVisible`、`toBeHidden`、`toBeEnabled`、`toBeDisabled`、`toBeChecked`、`toHaveText`、`toContainText`、`toHaveValue`、`toHaveCount`、`toHaveURL` 和 `toHaveTitle`。

### 等待

优先使用条件等待：

- `waitForVisible`
- `waitForHidden`
- `waitForURL`
- `waitForLoadState`

只有在确实需要固定暂停时使用 `waitForTimeout`，值填写毫秒，例如 `1000`。

### 慢页面和异步接口

先在“配置与数据”选择回放稳定性：快速、标准（推荐）、慢速网络或自定义。导航、操作和断言超时分开配置，避免一个超时值控制所有阶段。

每个步骤的“稳定性与高级等待”支持：

- 等待元素出现、消失、可用、可编辑或包含指定文本。
- 等待 URL 或 `DOMContentLoaded`/`load`。
- 固定或指数退避，刷新页面或重新打开当前 URL 后恢复。
- “点击并等待接口”：先监听 URL/方法，再点击，最后校验 HTTP 状态，避免遗漏快速响应。

不要把 `networkidle` 当作通用页面完成条件；现代页面可能持续轮询。应等待 Loading 消失、主要内容出现或业务接口成功。

重复操作安全性非常重要：`自动判断` 不会重复点击等潜在副作用操作；只有查询、展开等确认可重复的操作才设为“可安全重复”。支付、创建订单、删除、退款和审批必须设为“禁止重复”。

### 异常处理

- 超时：仅针对确实较慢的阶段调整导航、操作或断言超时。
- 重试：仅对超时、网络中断和 HTTP 5xx 等临时故障使用 1–2 次退避重试；重试后通过仍保留为 Flaky/自动恢复记录。
- 继续：仅用于非关键检查。登录、付款、提交等关键步骤不要勾选。

## 9. 回放测试用例和计划

- 用例回放：在用例页点击“回放用例”。无代码模式按步骤执行；代码模式执行本地 `.spec.js`。
- 计划回放：打开测试计划，点击“运行整个计划”，应用会逐个执行计划内用例并汇总通过/失败。
- 执行记录：在左侧“执行记录”按状态和范围筛选。点击详情可按 Suite 查看 Suite 版本、Setup/Teardown 版本、每个 Case 的版本与通过/失败/跳过状态；展开阶段可查看逐步明细、失败原因、建议和步骤截图，套件顶部提供整段录像与 Trace。可以删除单条或清空元数据。
- 仪表盘：展示计划、用例、执行次数、通过率、最近执行和最近失败。

## 10. 查看失败证据

失败卡片会先显示失败步骤序号、操作、定位器、问题类型、可能原因和处理建议。需要技术细节时再展开原始错误，并查看：

```text
artifacts/<run-id>/failure.png
artifacts/<run-id>/trace.zip
artifacts/<run-id>/*.webm
```

打开 Trace：

```bash
npx playwright show-trace artifacts/<run-id>/trace.zip
```

Trace 可查看步骤、页面快照、网络请求和控制台信息。

## 11. 常见问题

### 找不到元素

检查：

1. 定位方式是否正确，例如不要把 `role=combobox` 写成 `label=combobox`。
2. 页面语言是否与录制一致。
3. iframe、弹窗或新标签页是否改变了页面上下文。
4. 页面是否加载完成。

### 导入步骤不完整

确认选择的是最新录制文件。当前导入器支持常见 Playwright codegen 格式；复杂链式定位、frame locator 或自定义 JavaScript 可能需要手工补充。

### `ERR_NETWORK_CHANGED`

检查 VPN、代理、Wi-Fi 切换和系统网络。网络稳定后重新回放。

### `Access Denied` 或 CAPTCHA

回放会把 Access Denied、CAPTCHA 和异常流量页面标记为“目标网站拒绝自动化”，而不是普通元素超时，并停止无意义重试。不要绕过安全控制；使用已授权测试环境，申请 IP/测试账号白名单，或在允许人工验证时使用“手工登录后录制”。

### 端口被占用

使用其他端口：

```bash
PORT=4174 npm start
```

## 12. 资产版本、Stable 与回放选择

测试用例、测试套件和公共流程都会保留多个不可变版本。录制完成、保存无代码步骤、保存代码或应用 AI 修复时，系统创建新版本，不覆盖旧版本。详情页顶部显示“最新版本”和“Stable”，点击“版本历史”进入统一版本管理，可以查看、回放、对比、编辑版本说明或把某个版本标记为 Stable。版本不再设置额外标签；Stable 是唯一的稳定版本标记。测试用例自身的业务标签仍用于资产查询和筛选。

点击 Case、Suite 或公共流程的“回放”后选择：Stable 用于正式回归；Latest 用于调试最新修改；“指定版本”用于重现历史问题。Suite 版本同时保存 Setup、Teardown、配置、数据以及子用例版本策略。执行记录会保存实际解析到的 Suite、Case 和公共流程版本。

当前便捷文件仍保留在原位置；不可变源码额外保存在 `test-suites/.../versions/vN/`。不要手工覆盖历史版本目录。

历史版本不能原地改写。点击“基于此版本编辑”后，页面加载该版本的 Suite Setup/Teardown、Case Setup/测试步骤/Teardown 或公共流程步骤作为工作副本；顶部会显示来源版本。保存时创建新的最大版本号，并同步结构化步骤、JavaScript 和 Python。即使中间版本已删除，版本号也不会重复使用。

清理版本分为两级：普通“归档”只从默认列表和回放选择中隐藏版本，文件仍保留且可以恢复；“永久删除”必须先归档并输入 `vN` 二次确认，随后删除该版本的结构化快照、JS/Python 文件以及 Suite 版本登录态。Latest、Stable、唯一剩余版本、正在录制的版本、被 Suite/公共流程固定引用的版本不能归档或删除；有执行记录的版本可以归档但不能永久删除。先修改 Stable/Latest 或固定引用，再重试清理。版本号不会因删除而重新排列。

Suite 版本是一个原子快照，Setup、Teardown、配置、数据和 Case 绑定一起保存；Case 版本同样把 Setup、测试步骤、Teardown、配置和两种代码一起保存。界面会标注本次修改范围，但不会允许把互不匹配的阶段版本随意拼接，确保回放可复现。

## 13. 安全与能力边界

- 不要保存生产密码、Token、银行卡信息或一次性验证码。
- 不要连接日常 Chrome 默认 Profile；使用隔离的测试 Profile。
- WebKit 不是真实 Safari。
- CAPTCHA、DRM、浏览器原生界面、系统文件对话框、跨域限制和 Canvas/WebGL 可能无法可靠录制。
- 仅对你拥有或获得明确授权的系统执行自动化测试。

## 自检

开发者修改代码后运行：

```bash
npm run test:e2e
```

该测试覆盖计划文件夹、JS/Python、codegen 导入、精确定位器、无代码/代码回放、计划执行、友好错误、截图/录像/Trace、仪表盘和执行记录 CRUD。
