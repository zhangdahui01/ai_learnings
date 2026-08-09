# Regression Gap Analyzer 完整使用指南

## 0. 给小白的最短路径

先进入本 Skill 目录。AI Hub 根目录下的正确位置是：`skills/regression-gap-analyzer/`。

```bash
cd skills/regression-gap-analyzer
bash scripts/bootstrap.sh --install-core
bash scripts/run_static_scan.sh \
  --repo /absolute/path/service-repo \
  --automation /absolute/path/ui-automation-repo \
  --out /absolute/path/regression-analysis
```

完成后打开：`/absolute/path/regression-analysis/report.html`。它是给人阅读的交付物；CSV 用于 Excel/Jira，JSON 用于 AI 检索和复核。

## 1. 这是什么、解决什么问题

这是一个本地、只读优先的 Agent Skill：扫描一个或多个后端/客户端代码仓库，加上可选的 UI 自动化仓库，生成代码图、代码知识库、静态 UI 自动化风险、测试映射候选和回归测试 Gap。

默认不运行目标代码、不部署服务、不访问生产、不上传源码。它适合 UI 自动化只能在本机运行，或暂时拿不到 JaCoCo/trace 的团队。

```text
代码仓库 + UI 自动化仓库
          │
          ▼
     静态扫描与索引
          ├── Code graph: DOT / SVG / PNG
          ├── Knowledge base: Markdown / JSON
          ├── UI risk & test-gap: CSV / JSON
          └── Human report: report.html
```

## 2. 结论可信度：必须理解

| 等级 | 意义 | 示例 |
|---|---|---|
| `static-candidate` | 源码直接证明的候选事实 | `@Disabled`、固定 `sleep`、字面量 API route。 |
| `inferred` | 名称、页面对象、领域词等推断 | UI 用例名与后端退款模块可能对应。 |
| `proven-runtime` | 本机测试/JaCoCo/trace 明确证明 | 只有你提供执行产物时才允许使用。 |

没有找到字面量映射，不代表一定没有测试；UI 操作可能间接调用后端。所有 P0/P1 候选必须由 QE 和服务 owner 复核。

## 3. 目录与文件说明

| 路径 | 作用 |
|---|---|
| `SKILL.md` | Agent 执行契约：范围、证据、产物和安全边界。 |
| `AGENTS.md` | 通用 Agent 的最小工作流。 |
| `CLAUDE.md` | Claude Code 入口，导入本模块 Agent 说明。 |
| `.agents/skills/regression-gap-analyzer/SKILL.md` | Devin / Agent Skills 标准入口。 |
| `scripts/bootstrap.sh` | 环境检查、基础一键安装、完整一键安装。 |
| `scripts/install_advanced_tools.sh` | 单独安装 jQAssistant、Joern、CodeQL。 |
| `scripts/run_static_scan.sh` | 一条命令执行预检、索引和 HTML 报告渲染。 |
| `scripts/preflight.py` | 仓库/语言/构建标记/工具盘点。 |
| `scripts/static_index.py` | 零安装通用静态索引与 DOT 图生成。 |
| `scripts/render_html_report.py` | 将扫描 JSON/CSV 渲染为 `report.html`。 |
| `scripts/publish_to_pages.sh` | 将已审核报告导出到 AI Hub 的 `docs/reports/`。 |
| `references/` | 图谱工具、UI 静态分析和报告字段规范。 |

## 4. 环境安装：三种选择

### 4.1 只检查，不改变电脑

```bash
bash scripts/bootstrap.sh --check
```

它会检查 `python3`、`git`、`gh` 和 `dot`。缺少任何一个时，会告诉你下一步命令。

### 4.2 基础安装：绝大多数人只需要这个

```bash
bash scripts/bootstrap.sh --install-core
```

安装内容：

- Python 3.10+：运行扫描/报告脚本；不需要 `pip install`。
- Git：版本管理与共享。
- GitHub CLI (`gh`)：推送、认证和 GitHub 操作。
- Graphviz：把 DOT 图转换为 SVG/PNG。

macOS 会在缺少 Homebrew 时调用 Homebrew 官方安装器；Linux 目前支持 `apt-get`。脚本会联网、可能要求管理员密码，因此 Agent 必须先获得用户批准。

### 4.3 完整安装：需要深度语义图时再用

```bash
bash scripts/bootstrap.sh --install-all
```

在基础安装之上安装：

| 工具 | 用途 | 额外要求 |
|---|---|---|
| jQAssistant | Java/JVM 架构、Maven/模块/依赖图；本地嵌入 Neo4j | JDK 17、SDKMAN。 |
| Joern | 多语言 CPG、CFG、PDG、数据流深挖 | 官方验证 JDK 19；Homebrew 已不再提供它，脚本改用 JDK 21（较新版本，需验证）；自动安装到 `~/.local/opt/joern`，不需要系统级 symlink。 |
| CodeQL | 多语言语义、调用关系、数据流/安全查询 | 编译型语言常需正常构建；Apple Silicon 可能需要 Rosetta/Xcode CLI。 |

完整安装的独立形式：

```bash
bash scripts/install_advanced_tools.sh --all
# 或只安装一个：--jqassistant / --joern / --codeql
```

### 4.4 手工安装 Graphviz

一键脚本失败或你只想要图片功能时，可按系统手工安装：

```bash
# macOS（Homebrew）
brew install graphviz

# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y graphviz
```

验证：

```bash
dot -V
```

预期输出包含 `graphviz version`。没有 Graphviz 时扫描仍会生成 `overview.dot`，但不会有 SVG/PNG 和 HTML 内嵌图片。

### 4.5 PATH 与安装验证

新开一个 Terminal，再运行：

```bash
python3 --version
git --version
gh --version
dot -V
jqassistant effective-configuration  # 首次执行会下载其插件；jQAssistant 没有 --version 参数
joern --version         # 仅完整安装后
codeql version          # 仅完整安装后
```

如果高级命令找不到，可临时执行：

```bash
export PATH="$HOME/.local/bin:$HOME/bin:$PATH"
```

## 5. 调用方式

### 5.1 Codex（推荐）

```text
使用 $regression-gap-analyzer 扫描以下仓库：
- 代码仓库：/absolute/path/payment-service, /absolute/path/order-service
- UI 自动化仓库：/absolute/path/payment-ui-e2e
- 输出：/absolute/path/payment-analysis
进行全量静态扫描，生成代码图、知识库、HTML report、CSV 风险和测试 Gap。
不要运行 build、测试、Docker、部署或安装额外工具。
```

如果从 AI Hub 安装到 Codex，Skill 目录是 `skills/regression-gap-analyzer/`，而不是 AI Hub 根目录。

### 5.2 Claude Code

在 Skill 目录运行 Claude Code；`CLAUDE.md` 会导入模块 `AGENTS.md`。提示 Claude：

```text
Read SKILL.md and analyze these local repositories without executing tests.
```

### 5.3 Devin

将 AI Hub repo 接入 Devin，然后使用：

```text
@skills:regression-gap-analyzer scan the selected local repositories statically.
```

Devin 会识别 `.agents/skills/regression-gap-analyzer/SKILL.md`。

### 5.4 其他 Agent

要求 Agent 先读取本模块的 `AGENTS.md` 与 `SKILL.md`；不要只读 AI Hub 根目录的 `AGENTS.md`。

## 6. 手工扫描与交付物

```bash
bash scripts/run_static_scan.sh \
  --repo /absolute/path/payment-service \
  --repo /absolute/path/order-service \
  --automation /absolute/path/payment-ui-e2e \
  --out /absolute/path/payment-analysis
```

输出目录包含：

| 文件 | 面向谁 | 用途 |
|---|---|---|
| `report.html` | QE/开发/管理者 | 首选阅读入口：摘要、图、风险表、端点表、证据链接。 |
| `ui-static-risk-and-gaps.csv` | Excel/Jira/测试平台 | 可导入的风险/GAP Backlog。 |
| `static-ui-analysis.json` | Agent/脚本 | 静态风险与映射候选原始数据。 |
| `knowledge-base.md` | 人 | 系统概览。 |
| `knowledge-base.json` | Agent | 可检索的节点、边、符号和证据。 |
| `graphs/overview.dot` | 工具/开发 | 代码图原始格式。 |
| `graphs/overview.svg/png` | 人 | Graphviz 可用时的图片。 |
| `repo-inventory.json` | 审计/复现 | 仓库 revision、语言、工具盘点。 |

## 7. 发布到 GitHub Pages

仅发布已经过人工审核、可公开分享的报告。禁止发布源代码、密钥、客户数据、内部 URL、未复核的敏感 P0/P1 结论。

```bash
bash scripts/publish_to_pages.sh \
  --report-dir /absolute/path/payment-analysis \
  --name payment-analysis-2026-08
```

它复制 HTML、图、CSV 和 JSON 到 AI Hub 的 `docs/reports/payment-analysis-2026-08/`。提交、推送后，到 GitHub 仓库 **Settings → Pages → Source → GitHub Actions** 启用 Pages。部署地址通常是：

```text
https://zhangdahui01.github.io/ai_learnings/reports/payment-analysis-2026-08/
```

仓库已含 `.github/workflows/deploy-pages.yml`，每次 `docs/` 变更推送后都会部署。

## 8. 常见问题

| 现象 | 解决方式 |
|---|---|
| `dot: command not found` | 运行 `bash scripts/bootstrap.sh --install-core`，或手工 `brew install graphviz`。 |
| macOS 报没有 `brew` | 运行基础脚本；它会使用 Homebrew 官方安装器。安装完成后新开 Terminal。 |
| SDKMAN 报 Bash 版本过低 | 运行 `--install-all`；脚本会安装 Homebrew Bash。 |
| `jqassistant` / `codeql` 找不到 | 新开 Terminal；必要时执行 `export PATH="$HOME/.local/bin:$HOME/bin:$PATH"`。 |
| 没有 `overview.svg/png` | 检查 `dot -V`；无 Graphviz 只能生成 DOT。 |
| HTML 没有图片 | 确认输出目录存在 `graphs/overview.svg`；重新运行扫描。 |
| Pages 404 | 确认 Settings → Pages 选择 GitHub Actions，随后查看 Actions 中的 Deploy GitHub Pages。 |
| 报告内容看起来像真实覆盖 | 检查证据等级；静态模式不能称为 runtime coverage。 |

## 9. 安全与边界

基础索引器是启发式工具，不是完整编译器。反射、代理、动态路由、远端服务、生成代码、feature flag 和配置化依赖可能造成遗漏或误报。不要为覆盖私有实现细节而新增 UI 测试；建议最低合适测试层。

永远把风险报告视为草稿：对业务关键、支付、安全、数据损失、权限等场景，由 QE 与服务 owner 共同确认。
