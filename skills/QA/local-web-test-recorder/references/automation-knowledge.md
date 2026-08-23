# Automation Knowledge and Script Generation

## 证据职责

最终 TypeScript 不应由单一来源盲目决定：

| 来源 | 主要职责 | 不应承担 |
| --- | --- | --- |
| QA 已批准 BDD | 业务意图、前置条件、动作、预期 | 猜测真实 DOM 定位器 |
| Coupay 现有 E2E Repo | 登录/支付等流程模式、Fixture、Page Object、环境配置和稳定定位器线索 | 未经实时验证直接复制成最终答案 |
| Playwright Codegen/历史原生录制 | Iframe、弹窗、多窗口等真实复杂操作证据 | 代替业务断言和 QA 审核 |
| Playwright Generator Agent | 检查实时页面、生成与执行测试、修复定位器和等待 | 改写已批准的业务意图 |

优先级是：BDD 决定“测什么”，Repo/录制帮助“怎么操作”，Generator 验证“现在是否能执行”。

## 知识图谱实现与门禁

页面可为多个本地 Repo 分别输入绝对路径并建立 `READY` 代码图谱。它们可以来自开发代码、组件/Page Object、既有 UI 自动化框架。图谱记录文件、测试、符号、定位器、流程以及 contains/imports 等节点与边；索引器跳过 `.git`、`node_modules`、`data`、`artifacts`、`recordings`、构建目录和大文件。凭据样式内容会脱敏；产品数据中不保存整个目标 Repo 源码正文。

推荐使用 Graphify：官方最低要求 Python 3.10+，PyPI 包名为 `graphifyy`，CLI 名为 `graphify`。`node start-server.mjs` 默认在 `data/tools/graphify/` 建隔离 venv 并自动安装核心包；也可手工执行 `uv tool install graphifyy` 或 `pipx install graphifyy`。对每个目标 Repo 分别执行 `graphify .`，平台会优先读取 `<repo>/graphify-out/graph.json`；`graph.html` 供人工浏览，`GRAPH_REPORT.md` 供审核。纯代码图谱本地构建不需要模型/API Key；Office、PDF、云端语义后端是可选 extras，凭据不得写入平台。Graphify 不可用时可选择内置本地代码图作为零依赖兜底。`code-review-graph` 很适合 PR 评审、增量索引和 blast-radius，但当前场景需要从整个 E2E Repo 复用业务流程与定位器，因此 Graphify 更匹配。

知识图谱不能跳过。Codegen 只作为复杂 iframe、支付键盘、弹窗或多窗口流程的可选操作证据，不能替代图谱和批准后的 BDD。

## 自动识别 Agent 与触发

页面不再让用户选择 Codex、Claude Code 或 Devin。服务器按环境自动记录当前 Agent；未知环境显示“当前本地 Agent”。点击“生成 Playwright 脚本”后会：

1. 校验 BDD 已批准且至少一个 Repo 图谱为 READY。
2. 选择最终归属的 Test Plan 和 Test Suite，同时多选参考图谱；所有图谱 Repo 始终只读。
3. 将准确 BDD 冻结到平台 `data/generation-jobs/<job-id>/spec.md`。
4. 建立队列 Job，冻结全部参考图谱 ID/名称/路径、检索证据、Plan/Suite 归属、可选 Codegen 引用和 Prompt。
5. 最终输出先保存在平台 `test-suites/_bdd-generation/<job-id>/`；首次提交后创建目标 Suite 下的 BDD 生成 Test Case。重复生成可选择覆盖同一 Case，平台创建新版本，其他 Repo 始终只读。

勾选 Playwright Generator Agent 时，Agent 根据 Job 调用官方 Generator 并实时验证页面；关闭 Generator 时必须提供 Codegen 原生脚本。Planner、Generator、Healer 都随 Playwright 提供，不是三个额外 npm 包。启动器完成锁定的 `npm ci` 后，用 `--agent-target /absolute/repo --agent-loop codex|claude|copilot|vscode|vscode-legacy|opencode` 才会在明确 Repo 中执行 `playwright init-agents`；升级 Playwright 后应重新生成。没有显式目标时禁止写入任何业务 Repo。Devin 没有经过确认的官方专用 loop 参数时，使用相同 Job、Skill 指令和普通 Playwright CLI，不伪造接口。

启动门禁与可迁移性：

- `node start-server.mjs` 默认自动补齐 npm 依赖、三个 Playwright 浏览器和项目内 Graphify；`npm run bootstrap` 只准备环境不启动。
- `data/logs/dependency-bootstrap.json` 是可审计的依赖状态；`data/tools/` 与 `data/logs/` 都是本机可重建数据，不提交 Git。
- `--offline` 禁止下载；`--without-graphify` 明确使用内置图；Linux 只有显式 `--install-system-deps` 才尝试系统库安装。
- Node.js、Git、Python 属于系统级前置，不能由项目静默获取管理员权限安装；新机器缺失时启动器必须给出明确提示。

浏览器页面负责创建并排队 Job，不能跨进程直接控制 Codex、Claude Code 或 Devin。当前 Agent 收到“处理生成队列”请求后读取 `queued` Job，生成 TypeScript，再调用 `PUT /api/generation-jobs/<job-id>/result`；服务器把结果保存为 Job 原生脚本并创建或覆盖冻结目标 Test Case。页面提供两种触发策略：

- 自动回放：Agent 每次提交生成或修复代码后，平台立即真实执行目标测试。
- 手工回放：脚本进入 `awaiting-replay`，由 QA 在页面点击“开始回放”。

每轮回放使用目标 Repo 的 Playwright CLI，强制开启 Trace，并收集目标配置产生的截图和录像。页面显示命令、退出码、错误摘要、stdout/stderr、附件和完整时间线。失败且开启自动修复时进入 `fix-queued`；当前 Agent 必须读取最新失败证据，按最小修改原则修复并再次提交。自动模式随后继续回放，直到通过或达到最大轮次。这里的“自动修复”是平台与宿主 Agent 的可审计协作，不是浏览器服务器暗中调用未知模型。

每个 Job 记录 BDD 来源、所有已选 Repo、每个 Repo 的命中文件数、证据路径、匹配关键词、录制引用、自动识别的运行环境、可复制的 `agentInstruction`、明确输出路径、回放策略、每轮结果和最终 QA 签署。检索先保证每个所选 Repo 的高分证据有机会入选，再按全局相关度补齐；这使既有 P0 自动化框架不会被更大的开发 Repo 淹没。Agent 必须打开证据文件验证登录、支付、Fixture、Page Object 和定位器，而不是把图谱名称当作生成结果。

第一次生成或修复不准确时，页面允许直接编辑生成代码并再次提交，也允许调用 `POST /api/generation-jobs/<id>/recordings` 追加 Codegen 路径；服务器把新增证据加入 Prompt/fixPrompt。回放通过后状态是 `awaiting-qa`，不是完成；QA 查看代码与证据后批准才进入 `signed-off`。QA 退回必须填写原因，并在未超过上限时重新进入修复队列。Agent 不得代替 QA 签署。

状态主流程：

`queued → generated → validating → fix-queued → validating → awaiting-qa → signed-off`

手工回放在 `generated` 后使用 `awaiting-replay`；达到重试上限进入 `failed`。
