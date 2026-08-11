# coupayWeb testing 回归测试计划

版本：0.3.x  
维护日期：2026-08-11  
适用范围：`skills/local-web-test-recorder/assets/web-test-recorder`

## 1. 测试目标

验证产品可以交付给普通用户和开发者使用，重点保证：测试计划/用例/执行记录数据不丢失；录制结束后无需手工导入或编写脚本；JavaScript、Python 和结构化步骤一致落盘；回放失败能够定位具体步骤并保留证据；主要 Playwright 浏览器可运行；本地敏感数据不进入 Git。

## 2. 测试范围

- Dashboard、测试计划、测试用例、执行记录四个主流程。
- 测试计划和测试用例 CRUD、加入/移出计划、版本冲突保护。
- 标准录制、合规录制、录制状态轮询、自动导入、备用手工导入。
- Playwright codegen 解析、完整 JavaScript 保存、Python 同步生成、在线代码编辑。
- 无代码步骤、断言、等待、超时、重试、失败后继续。
- Chromium、Firefox、WebKit，以及本机正式 Chrome channel。
- 单用例回放、代码回放、整计划回放、执行记录查询/筛选/删除。
- 失败步骤、友好诊断、截图、视频、Trace、目标网站拒绝自动化识别。
- 本地 JSON、源码文件、录制文件、Profile、登录状态和 artifacts 的存储边界。

不宣称支持：真实 Apple Safari（当前 WebKit 不等于 Safari）、绕过 CAPTCHA/反自动化、未经授权的第三方站点、无法获得测试代理的真实代理链路。

## 3. 测试环境

| 项目 | 配置 |
| --- | --- |
| 操作系统 | macOS |
| Node.js | v25.9.0（产品最低要求 Node.js 20） |
| Playwright | 1.58.2 |
| UI 自动化 | Playwright Chromium，1440×1000 |
| 浏览器矩阵 | Chromium、Firefox、WebKit、本机 Google Chrome channel |
| 数据 | 每次自动化使用独立临时目录和本地 fixture，不接触生产数据 |
| 服务端口 | 自动化 4187；真实录制验收 4190；产品 4173 |

## 4. 准入与退出标准

准入：依赖安装完成；三个 Playwright 浏览器可启动；fixture 可访问；测试数据目录为空且可写。  
退出：所有 P0 自动化通过；无未解释的 P1 失败；真实 Inspector 自动导入至少成功一次；失败证据可打开；文档与实际 UI 一致；工作树无敏感运行数据。

## 5. 回归用例

| ID | 优先级 | 测试内容 | 关键期望 | 类型 |
| --- | --- | --- | --- | --- |
| DASH-001 | P0 | 首次打开 Dashboard | 计划/用例/执行/通过率卡片可见 | UI E2E |
| DASH-002 | P1 | 有通过和失败记录 | 指标与最近失败诊断正确 | API/UI |
| PLAN-001 | P0 | 创建测试计划 | 返回唯一 ID，列表出现 | API E2E |
| PLAN-002 | P0 | 编辑名称和说明 | 数据持久化，更新时间变化 | API E2E |
| PLAN-003 | P0 | 用例加入计划 | `caseIds` 更新并生成计划目录 | API E2E |
| PLAN-004 | P1 | 用例移出计划 | 仅解除关系，不误删用例 | API E2E |
| PLAN-005 | P0 | 删除计划 | 计划删除，用例保留 | API E2E |
| PLAN-006 | P0 | 执行整个计划 | 汇总 total/passed/failed 正确 | API E2E |
| CASE-001 | P0 | 创建无代码用例 | 默认配置、版本和空步骤正确 | API E2E |
| CASE-002 | P0 | 编辑用例名称/配置 | 版本递增并持久化 | API E2E |
| CASE-003 | P0 | 旧版本覆盖 | HTTP 409，最新数据不被覆盖 | API E2E |
| CASE-004 | P0 | 删除用例 | 计划关系清理，历史证据不误删 | API E2E |
| FILE-001 | P0 | 用例加入计划 | 一个用例生成一个 JS 和一个 Python 文件 | 文件 E2E |
| FILE-002 | P1 | 未归档用例 | 保存到 `_未归档/` | 文件 E2E |
| CODE-001 | P0 | 在线保存 JavaScript | 源码落盘，用例切换代码模式 | API E2E |
| CODE-002 | P0 | Python 同步生成 | role+名称、输入值、导航顺序保留 | Unit/API |
| PARSE-001 | P0 | goto/click/fill/press | 操作顺序和值完整 | Unit |
| PARSE-002 | P0 | role 可访问名称 | 精确保留，不退化为任意同 role 元素 | Unit |
| PARSE-003 | P1 | check/selectOption/断言 | 可转为结构化步骤 | Unit |
| PARSE-004 | P1 | 混入自定义代码 | 不破坏可识别步骤；完整 JS 仍保存 | Unit/API |
| REC-001 | P0 | 点击开始录制 | 录制窗口启动，状态为等待用户 | UI/API E2E |
| REC-002 | P0 | 正常关闭 Inspector | 会话变为 completed | 真实手工验收 |
| REC-003 | P0 | 自动导入完整 JS | 无需点击导入，源码进入代码编辑器 | UI/API/真实验收 |
| REC-004 | P0 | 自动同步 Python | Python 文件和编辑内容生成 | API/真实验收 |
| REC-005 | P0 | 自动提取可视化步骤 | 常见 codegen 操作可在无代码页继续编辑 | API E2E |
| REC-006 | P0 | 自动切换代码编辑 | UI 轮询完成后自动打开 JavaScript | UI E2E |
| REC-007 | P1 | 空录制脚本 | 显示明确失败，不覆盖原用例 | API E2E |
| REC-008 | P1 | 录制进程异常退出 | 标记 failed，保留原用例 | API/代码审查 |
| REC-009 | P1 | 手工导入备用入口 | 可选择历史文件并打开代码编辑 | API E2E |
| COMP-001 | P0 | 未确认授权启动合规录制 | HTTP 400，拒绝启动 | API E2E |
| COMP-002 | P0 | 合规录制参数 | 正式 Chrome、独立 Profile、save-storage | API E2E |
| COMP-003 | P0 | 已有登录状态 | 下次包含 load-storage | API E2E |
| COMP-004 | P1 | 配置页简化 | 不再显示截图中的整块合规配置 | UI E2E |
| REPLAY-001 | P0 | Chromium 无代码回放 | 操作和断言通过，Trace 生成 | E2E |
| REPLAY-002 | P0 | Firefox 无代码回放 | 同一核心用例通过 | E2E |
| REPLAY-003 | P0 | WebKit 无代码回放 | 同一核心用例通过 | E2E |
| REPLAY-004 | P0 | JavaScript 代码回放 | Playwright Test 通过 | E2E |
| REPLAY-005 | P0 | 本机正式 Chrome channel | Chrome 可启动 | 环境验收 |
| STEP-001 | P0 | 精确 role+name 定位 | 找到正确元素，不误点 | Unit/E2E |
| STEP-002 | P0 | 断言失败 | 标记准确步骤并返回实际/期望 | E2E |
| STEP-003 | P1 | 失败后继续 | 当前步骤 warning，后续步骤执行 | E2E |
| STEP-004 | P1 | 重试 | 普通错误按配置重试 | E2E/代码审查 |
| BLOCK-001 | P0 | Access Denied/CAPTCHA 页面 | 分类为“目标网站拒绝自动化” | E2E |
| BLOCK-002 | P0 | 拒绝页面配置重试 | 停止无意义重试，attempts=1 | E2E |
| ART-001 | P0 | 回放失败 | 生成失败截图和 Trace | E2E |
| ART-002 | P1 | 浏览器上下文录像 | 执行记录返回视频（浏览器允许时） | E2E/文件检查 |
| RUN-001 | P0 | 查询全部执行记录 | 按时间返回 | API/UI E2E |
| RUN-002 | P1 | 按 status/scope 筛选 | 结果全部满足筛选条件 | API E2E |
| RUN-003 | P0 | 删除单条执行记录 | 指定记录消失 | API E2E |
| RUN-004 | P1 | 清空执行记录 | 元数据清零，artifact 不误删 | API E2E |
| SEC-001 | P0 | Profile/Auth Git 忽略 | 敏感目录不进入版本控制 | 静态检查 |
| SEC-002 | P0 | 会话状态 API | 不返回绝对 Profile/Auth 路径或 Cookie 内容 | API/代码审查 |

## 6. 执行命令

```bash
node --check server.js
node --check public/app.js
npm run test:unit
npm run test:e2e
# 或一次执行
npm test
```

## 7. 每次发布的人工冒烟

1. 用全新测试用例点击“开始录制”。
2. 在 Inspector 浏览器完成一次输入和点击。
3. 正常关闭 Inspector，确认页面在数秒内自动打开代码编辑器。
4. 核对 JS 文件含本次操作、Python 文件已生成、无代码步骤含可识别操作。
5. 回放该用例，检查执行记录和 Trace。
6. 使用失败用例检查失败步骤、截图、录像和技术详情。

