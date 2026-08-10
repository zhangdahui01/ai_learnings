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
- 创建、编辑和删除测试用例，并把用例加入或移出计划。
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

- `data/store.json`：计划、用例和最近运行记录。
- `recordings/`：Playwright Inspector 生成的代码。
- `test-suites/<计划名>/`：每个用例的 JavaScript 和 Python 文件。
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
npm start
```

打开 <http://localhost:4173>。停止服务时，在运行服务的终端按 `Ctrl+C`。

## 4. 数据存储、备份和删除

### 应用业务数据

所有相对路径都以生成的 `web-test-recorder` 项目目录为根目录：

| 路径 | 保存内容 | 注意事项 |
|---|---|---|
| `data/store.json` | 测试计划、用例、步骤、断言、测试数据、账号引用、浏览器/语言/代理配置和执行记录元数据 | 当前版本使用本地 JSON，不是远程数据库。测试数据可能敏感。 |
| `recordings/*.spec.js` | Playwright Inspector 生成的原始录制代码 | 录制时输入的账号、搜索词或其他值可能以明文出现。 |
| `test-suites/<计划名>/*.spec.js` | 可在线编辑、可回放的 Node.js/Playwright 测试 | 一个用例一个文件；适合纳入版本控制。 |
| `test-suites/<计划名>/test_*.py` | 从无代码步骤同步生成的 Python/Playwright 测试 | 当前应用回放 JS；Python 文件可在安装 Python Playwright 后独立运行。 |
| `artifacts/<run-id>/failure.png` | 失败页面截图 | 可能显示用户资料、订单、账号或其他页面内容。 |
| `artifacts/<run-id>/trace.zip` | Playwright Trace、页面快照和网络证据 | 可能包含 URL、DOM、请求信息和输入值。 |
| `artifacts/<run-id>/*.webm` | 回放视频 | 可能包含操作过程和页面中的敏感内容。 |

应用默认绑定本机 `localhost`，不会主动把这些文件上传到云端。但是执行网页操作时，请求会正常发送给被测试网站；安装依赖时 npm 和 Playwright 会访问各自的下载服务。

### 环境文件

- `node_modules/`：项目依赖，可以通过 `npm install` 重建。
- Playwright 浏览器缓存：macOS 通常在 `~/Library/Caches/ms-playwright`，Linux 通常在 `~/.cache/ms-playwright`，Windows 通常在 `%USERPROFILE%\AppData\Local\ms-playwright`。
- 临时浏览器 Profile：通常由 Playwright 放在操作系统临时目录并在浏览器关闭后清理。
- Skill 本身：通常在 `~/.codex/skills/local-web-test-recorder/`。

### Git 和共享

模板的 `.gitignore` 默认排除：

```text
data/store.json
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

### 起始 URL

填写完整地址，例如 `https://example.com/login`。推荐总是带上 `https://`。

### 测试数据

使用 JSON：

```json
{
  "email": "qa-user@example.com",
  "searchText": "playwright tutorial"
}
```

步骤值可以写成 `${data.email}` 或 `${data.searchText}`。不要保存生产密码、Token 或一次性验证码。

### 代理

支持：

```text
http://127.0.0.1:7890
socks5://127.0.0.1:1080
```

当前界面不持久化代理用户名和密码。不要通过修改全局系统代理来实现单个用例代理。

## 6. 录制测试用例

1. 创建测试计划。
2. 在计划中点击“新建用例并加入”。
3. 填写用例名称、浏览器、页面语言和起始 URL。
4. 点击“保存用例”。
5. 点击“录制”。
6. 在新打开的 Playwright 浏览器中执行点击、填写、选择和键盘操作。
7. 需要断言时，可在 Inspector 中使用断言工具，也可以导入后手工增加。
8. 完成后关闭 Inspector 和录制浏览器。
9. 点击“覆盖导入最近录制”。
10. 在按时间排序的列表中选择刚刚生成的文件。
11. 确认覆盖并检查所有步骤。

不要重复导入同一个文件。覆盖导入可以避免新旧步骤混杂。

## 7. 编辑步骤和定位器

每一步包含：

- 类型：操作或断言。
- 操作/断言：例如 `click`、`fill`、`press`、`toBeVisible`。
- 定位方式：`role`、`label`、`text`、`testId`、`placeholder`、`css` 或 `xpath`。
- 定位值：例如 role 的 `button`、测试 ID 或 CSS。
- 角色名称：role 的可访问名称，例如“登录”或“Search”。
- 值：输入内容、按键、URL、期望值或延时毫秒。
- 超时：该步骤最多等待多少毫秒。
- 重试：失败后额外重试次数。
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

### 异常处理

- 超时：慢页面可以从 `10000` 调高到 `30000`。
- 重试：临时不稳定步骤可以设置 1–2 次。
- 继续：仅用于非关键检查。登录、付款、提交等关键步骤不要勾选。

## 9. 回放测试用例和计划

- 用例回放：在用例页点击“回放用例”。无代码模式按步骤执行；代码模式执行本地 `.spec.js`。
- 计划回放：打开测试计划，点击“运行整个计划”，应用会逐个执行计划内用例并汇总通过/失败。
- 执行记录：在左侧“执行记录”按状态和范围筛选，点击详情查看证据；可以删除单条或清空元数据。
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

目标网站可能阻止自动化浏览器。不要绕过第三方安全控制。使用你有权测试的测试环境、Sandbox、API 或申请自动化测试授权。

### 端口被占用

使用其他端口：

```bash
PORT=4174 npm start
```

## 12. 安全与能力边界

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
