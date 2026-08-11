# coupayWeb testing 测试报告

测试日期：2026-08-11  
被测版本：0.3.x（录制自动导入、双向同步、数据引用与 Map Remote）
结论：**有条件通过，可用于已授权测试环境的推广试用。**

## 1. 执行摘要

- 单元测试：7/7 通过。
- 自动化 E2E 套件：通过；覆盖 API、文件系统、浏览器回放和 UI。
- 浏览器矩阵：Chromium、Firefox、WebKit 核心用例通过。
- 本机正式 Chrome：channel 启动通过，版本 `151.0.7922.76`。
- 真实 Inspector 验收：通过。实际打开录制浏览器、执行页面操作、正常关闭；会话返回 `completed`，自动导入 JavaScript、生成 Python、提取 2 个结构化步骤并把用例切换到代码模式。
- 最终自动化失败数：0。

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
| 自动导入失败可理解 | 空脚本/异常退出显示明确原因且不覆盖用例 | 通过 |

## 3. 自动化覆盖结果

通过项目包括：

- 测试计划创建、编辑、加入/移出用例、删除、整计划执行。
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
