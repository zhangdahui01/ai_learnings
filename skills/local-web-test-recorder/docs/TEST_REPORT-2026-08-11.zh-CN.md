# coupayWeb testing 测试报告

测试日期：2026-08-12
被测版本：0.4.2（Suite/公共流程双语源码同步、Plan/Suite/Case 可执行文件、代理隔离）
结论：**通过，可在已授权测试环境推广试用；真实企业代理链路仍需现场验收。**

## 1. 执行摘要

- 单元测试：7/7 通过。
- 自动化 E2E 套件：通过；覆盖 API、文件系统、浏览器回放和 UI。
- 浏览器矩阵：Chromium、Firefox、WebKit 核心用例通过。
- 本机正式 Chrome：channel 启动通过，版本 `151.0.7922.76`。
- 真实 Inspector 验收：通过。实际打开录制浏览器、执行页面操作、正常关闭；会话返回 `completed`，自动导入 JavaScript、生成 Python、提取 2 个结构化步骤并把用例切换到代码模式。
- 最终自动化失败数：0。
- 国际化增量回归：中文、英文、韩文切换与刷新持久化通过；韩文动态测试用例弹窗通过；切回中文通过。
- 真实 YouTube 验收：公共流程通过；搜索 `playwright AI agent` Case 5/5 步通过；Suite Setup、Case、Suite Teardown 全通过。
- 生成 JavaScript CLI：指定单个 YouTube Case，确认 `Running 1 test`，13.9 秒通过。

## 2. 本次修复验证

| 用户要求 | 实际结果 | 状态 |
| --- | --- | --- |
| 移除截图中的合规配置大卡片 | 配置页 DOM 不再包含 `.compliance-card` | 通过 |
| 用户不手写录制脚本 | Inspector 输出由服务器自动读取并保存 | 通过 |
| 自动进入代码编辑 | UI 轮询 completed 后切换 JavaScript 编辑器 | 通过 |
| 一个用例一个文件 | 计划目录下写入 `.spec.js` 与 `test_*.py` | 通过 |
| 自动同步 Python | 常见可识别步骤转换为 Python Playwright | 通过 |
| 保留无代码编辑 | 同时提取常见操作/断言为结构化步骤 | 通过 |
| 无代码 → JS/Python | 保存步骤后两种源码按同一结构化模型生成 | 通过 |
| JS → 无代码/Python | 保存常见 Playwright JS 后提取 4 步并更新 Python | 通过 |
| 嵌套测试数据引用 | `${data.account.query}` 在无代码与代码回放中解析 | 通过 |
| 多条远程映射 | UI 支持 CRUD；同协议 Map Remote 的无代码/代码回放通过 | 通过 |
| 跨协议保护 | HTTPS→HTTP 原生映射被拒绝并建议使用 Charles | 通过 |
| Web-first 断言 | 慢速文本更新不再一次读取后误判失败 | 通过 |
| 页面就绪条件 | Loading 消失后再执行目标断言 | 通过 |
| 点击并等待接口 | URL、方法和 HTTP 状态原子等待 | 通过 |
| 安全退避重试 | 首次 HTTP 503、第二次 200；记录 attempts=2、recovered、Flaky | 通过 |
| 高级配置双语源码 | JS 保留结构化 marker，Python 通过 `py_compile` | 通过 |
| 三语言平台 UI | 中文、English、한국어可在右上角即时切换 | 通过 |
| 语言选择持久化 | English 刷新后保持，`html[lang]` 同步更新 | 通过 |
| 动态内容国际化 | 韩文测试用例页和新建用例弹窗正确翻译 | 通过 |
| UI/被测页面 locale 隔离 | UI 切换不改写用例页面语言、代码、定位器或数据 | 通过 |
| 自动导入失败可理解 | 空脚本/异常退出显示明确原因且不覆盖用例 | 通过 |
| Plan → Suite → Case | Suite CRUD、计划关联、套件/计划执行汇总正确 | 通过 |
| Suite 生命周期 | Setup 通过、Case 失败、Teardown 仍执行通过 | 通过 |
| Case 生命周期 | 公共流程 Setup 展开；主体失败后 Case Teardown 仍通过 | 通过 |
| 公共流程 | 参数替换、固定版本 revision、引用中禁止删除 | 通过 |
| 默认会话隔离 | 首次写入 Cookie/LocalStorage，第二次全新回放验证为 clean | 通过 |
| JS/Python 生命周期 | 生成 setup/steps/teardown marker；Python `py_compile` 通过 | 通过 |
| Dashboard 新指标 | 计划、套件、用例、公共流程、执行、通过率六卡片 | 通过 |
| Suite 阶段录制回放 | Setup/Teardown 可独立录制、导入代码及步骤、独立回放 | 通过 |
| 公共流程录制回放 | 录制生成新版本、保存 JS/Python/无代码步骤、回放通过 | 通过 |
| 覆盖确认保护 | 已有步骤时进入待确认状态；确认才覆盖，取消保持原数据 | 通过 |
| Suite 步骤修改同步 | 保存 Setup/Teardown 后 JS/Python 和所属 Case 可执行文件同步重建 | 通过 |
| 公共流程修改同步 | 创建新 revision，并重建 `_公共流程` 下 JS/Python | 通过 |
| Plan/Suite/Case 本地结构 | Case 文件嵌入 Suite Setup → Case → Suite Teardown | 通过 |
| 本地 JavaScript 命令 | 生成的 `.spec.js` 用 Playwright CLI 启动真实 Chromium 并通过 | 通过 |
| 本地 Python 验证 | 生成的 `test_*.py` 通过 `py_compile` | 通过 |
| 直连代理隔离 | direct 模式不再继承终端 HTTP/HTTPS/ALL_PROXY | 通过 |
| 代理瞬断重试 | `ERR_PROXY_CONNECTION_FAILED` 归类为可重试网络错误 | 通过 |
| CLI 单文件选择 | 修复固定目录参数导致全部用例被启动；现在只运行指定文件 | 通过 |
| CLI 总超时 | 从 Playwright 默认 30s 改为可配置 120s，不会早于步骤超时关闭 Teardown | 通过 |
| CLI 用例配置 | 生成源码携带 browser/locale/timeout/proxy，代理凭据只从环境变量读取 | 通过 |
| 真实 YouTube 定位修正 | 失败截图显示搜索框存在；由脆弱 CSS 改为 `role=combobox, name=搜索` 后通过 | 通过 |

## 3. 自动化覆盖结果

通过项目包括：

- 测试计划、测试套件和测试用例 CRUD、关联、Suite/Plan 执行。
- Suite/Case Setup 与 Teardown；主体失败后 Teardown 始终执行。
- 参数化公共流程、固定版本 revision、引用保护和敏感流程禁重试。
- 每次录制/回放默认全新会话；显式高级模式才保存/加载登录态。
- 测试用例创建、编辑、删除、409 版本冲突保护。
- JS/Python 计划文件夹生成与源码保存。
- codegen 的 goto、click、fill、press、check、selectOption、页面断言和元素断言解析。
- JavaScript 保存反向同步步骤与 Python；生成代码中的等待、导航、type 和数据引用可重新解析。
- `${data.key}`、嵌套 `${data.account.query}`、运行时数据注入，以及同协议 URL-prefix 映射。
- 标准录制状态、合规录制授权校验、Chrome/Profile/storage 参数、登录状态二次加载。
- 录制自动导入成功、空脚本失败保护、UI 自动打开代码编辑器。
- Chromium、Firefox、WebKit 无代码回放和 JavaScript 代码回放。
- 失败后继续 warning、后续步骤继续执行。
- 普通超时定位具体步骤；Access Denied/CAPTCHA fixture 分类为“目标网站拒绝自动化”并停止重试。
- 失败截图、Trace、执行记录查询/筛选/单条删除/清空。
- Dashboard 指标、用例页、代码编辑页、录制弹窗和执行记录页 UI。

执行命令及结果：

```text
npm test
Unit: 7 passed, 0 failed
E2E: passed
```

## 4. 真实录制证据

隔离验收环境使用端口 4190 和独立临时数据目录，未修改正式产品数据。

```text
session.status       = completed
session.autoImported = true
session.stepCount    = 2
case.editorMode      = code
case.codeLanguage    = javascript
JavaScript file      = generated
Python file          = generated
```

实际生成脚本包含本地 fixture 的 `page.goto(...)` 与按钮点击；Python 文件包含对应 `page.goto(...)` 和 `get_by_role(...).click()`。

## 5. 测试中发现的问题

1. 回归用例最初把空 `<p role="status">` 当作可见元素，导致“失败后继续”测试失败。确认是 fixture 期望错误，不是产品缺陷；已改为断言可用搜索框并重新通过全套测试。
2. 复杂自定义 JavaScript、frame locator 和超出解析器白名单的链式写法无法完整转换为无代码步骤或等价 Python；**完整 JavaScript 会原样保存，并明确提示部分可视化**。Python 不反向覆盖 JS/无代码步骤。这是避免有损转换的产品边界。
3. Playwright 原生 URL 改写要求协议相同；跨协议和录制阶段映射需通过已授权的 Charles Map Remote 配置。自动化已覆盖原生同协议映射与跨协议校验，但企业 Charles 链路仍需现场验收。

## 6. 残余风险与推广条件

- WebKit 只代表 WebKit 引擎，不代表真实 Apple Safari；对外不要宣传真实 Safari 已完全支持。
- Coupang、Google、YouTube 等第三方站点可能基于 IP、账号、地区或行为拒绝自动化。产品只负责识别和提示，不承诺绕过。
- CAPTCHA 必须由用户手工完成；本报告没有也不会自动破解 CAPTCHA。
- 未取得企业代理服务器，真实 HTTP/SOCKS 代理认证链路尚需在目标公司网络做一次现场验收。
- `recordings/`、`data/auth/`、`data/profiles/`、截图、视频和 Trace 可能包含敏感信息，推广前必须制定保留和清理策略。
- 自动生成 Python 适用于常见结构化步骤；复杂录制以 JavaScript 原始文件为权威版本。

## 7. 发布建议

满足以下条件后可从团队试用扩大推广：

1. 在 Coupay 授权 QA/Staging 环境执行一次登录、查询和失败诊断冒烟。
2. 明确测试账号、IP 白名单、代理和数据保留负责人。
3. CI 中固定执行 `npm test`。
4. 发布说明明确“WebKit 非真实 Safari”“不绕过 CAPTCHA/风控”“复杂录制以 JS 为准”。

当前代码质量门禁已通过，核心录制—自动导入—编辑—回放—诊断链路具备推广试用条件。
