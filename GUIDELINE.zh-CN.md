# Regression Gap Analyzer 使用指南

## 1. 它解决什么问题

这是一个给 Codex 使用的本地 Skill。它可以读取多个本地代码仓库和一个 UI 自动化仓库，在**不运行代码、不部署服务、不上传源代码**的前提下，生成：代码关系图、本地代码知识库、UI 自动化风险，以及回归测试 Gap 候选。

它尤其适合以下情况：后端由多个服务组成、UI 自动化只能在本机运行、现有测试与代码缺乏可追溯关系、需要先给 QE/开发一个可审核的风险清单。

## 2. 工作原理

```text
本地代码仓库 ─┐
              ├─> 只读静态扫描 ─> DOT code graph ─> SVG/PNG（可选）
UI 自动化仓库 ─┘          │
                           ├─> knowledge-base.json / .md
                           └─> UI 风险、映射候选、测试 Gap
```

第一层是零安装静态索引：识别文件、声明、import、端点字面量、测试声明和常见 UI 风险模式。第二层是可选的语义图谱工具：Java 多模块架构可使用 jQAssistant；需要控制流/数据流时使用 Joern 或 CodeQL。AI 只能依据产物推理，每个结论必须保留文件和行号证据。

静态分析的结论分为三种：

- `static-candidate`：源代码可直接看见的事实，例如 `@Disabled`、固定等待或 literal route。
- `inferred`：根据测试名称、Page Object、领域词或间接关系推断，需人工确认。
- `proven-runtime`：仅在提供本机测试/JaCoCo/trace 产物时使用；默认不会出现。

“没有发现映射”不等于“没有测试”。例如 UI 测试可能通过页面操作间接调用 API，因此它会被报告成待确认的 Gap 候选。

## 3. 文件说明

| 文件 | 用途 |
|---|---|
| `SKILL.md` | Codex 的执行契约：输入、边界、证据标准、产物和风险规则。 |
| `scripts/preflight.py` | 只读盘点仓库、语言、构建标记、测试文件和工具是否已安装。 |
| `scripts/static_index.py` | 零安装静态索引器；输出 code graph、知识库、UI 风险与 Gap CSV/JSON。 |
| `references/toolchain.md` | 多语言工具选择：jQAssistant、Joern、CodeQL、Tree-sitter、Graphviz。 |
| `references/static-ui-analysis.md` | UI 源码风险与测试 Gap 的判定规则。 |
| `references/report-contract.md` | QE/开发评审报告需要的字段和证据等级。 |
| `agents/openai.yaml` | Codex UI 显示名称和默认提示词。 |
| `.gitignore` | 防止分析输出、目标 repo、密钥和本地环境被提交。 |

## 4. 最低环境与安装

### 一键基础安装（推荐）

小白只需要在本仓库根目录运行一条命令：

```bash
bash scripts/bootstrap.sh --install-core
```

脚本会在 macOS/Linux 上检查并安装 Python 3、Git、GitHub CLI 和 Graphviz；macOS 缺少 Homebrew 时，会先使用 Homebrew 官方安装器。它会下载软件并可能要求管理员密码，所以只应在你确认后运行。基础脚本不使用 `pip`、不读取业务仓库内容、也不启动服务器。

安装完成后图片能力已经可用：`overview.dot` 会自动同时输出 `overview.svg` 和 `overview.png`。若只想检查环境而不安装，运行 `bash scripts/bootstrap.sh --check`。

### 可选：深度语义分析

| 目标 | 工具与依赖 | 何时安装 |
|---|---|---|
| Java 架构/模块/依赖图 | jQAssistant；JDK 11+，建议 JDK 17 | 要查询大型 Java 多模块系统或保存 Neo4j 图谱时。 |
| 语句级 CFG/PDG/数据流 | Joern；官方文档要求 JDK 19 | 需要追分支、参数流向或 CPG 时。 |
| 多语言精确语义/数据流 | CodeQL CLI；编译型语言可能需要正常构建 | 要验证调用关系/数据流或做安全规则时。 |
| 通用语法树 | Tree-sitter | 没有对应语义引擎时；不能证明调用/数据流。 |

这些均为可选项；不要为了第一次扫描安装它们。若确实需要，在确认软件许可和网络策略后运行一条命令：`bash scripts/bootstrap.sh --install-all`。它会继续调用 `install_advanced_tools.sh`，本机安装 JDK、jQAssistant、Joern 和 CodeQL；Joern 官方安装器仍会显示确认提示。jQAssistant 会在本机启动嵌入式 Neo4j，不会部署到服务器；Joern 和 CodeQL 可能需要较多磁盘/内存。

## 5. 支持哪些 AI 编程 Agent

| Agent | 入口文件/位置 | 如何使用 |
|---|---|---|
| Codex | 根目录 `SKILL.md`；安装到 `~/.codex/skills/` | 在对话中输入 `$regression-gap-analyzer`。 |
| Claude Code | 根目录 `CLAUDE.md`（会导入 `AGENTS.md`） | 在该仓库目录运行 Claude Code，然后要求它按 `SKILL.md` 扫描。 |
| Devin | `.agents/skills/regression-gap-analyzer/SKILL.md` | 将 repo 连接到 Devin，在会话使用 `@skills:regression-gap-analyzer`。 |
| 其他兼容 Agent | `AGENTS.md` + 根目录 `SKILL.md` | 要求 agent 先读 `AGENTS.md` 和 `SKILL.md`。 |

这些入口共享同一份核心流程，避免不同 agent 的规则漂移。

## 6. 在 Codex 中调用（推荐）

在新对话或当前对话粘贴下列内容并替换路径：

```text
使用 $regression-gap-analyzer 进行全量静态扫描。

代码仓库：
- /Users/your-name/workspace/payment-service
- /Users/your-name/workspace/order-service

UI 自动化仓库：
- /Users/your-name/workspace/payment-ui-e2e

输出目录：
- /Users/your-name/Desktop/payment-analysis

生成 code graph、本地知识库、UI 静态风险和测试 Gap。
不要运行 build、测试、Docker 或部署；不要安装额外工具。
```

如果只关注一个功能，把“全量静态扫描”替换为：`分析 refund 模块，包含 Git range <base>..<head>`。全量扫描用于建立知识库；后续工作优先使用 feature/module 的有界切图，避免图片不可读。

## 7. 手工使用（已简化）

一条命令完成预检和静态索引：

```bash
bash scripts/run_static_scan.sh \
  --repo /absolute/path/payment-service \
  --repo /absolute/path/order-service \
  --automation /absolute/path/payment-ui-e2e \
  --out /absolute/path/payment-analysis
```

它会自动依次执行预检和静态索引。随后评审：

先打开 `knowledge-base.md` 和 `ui-static-risk-and-gaps.csv`；再把输出目录交给 Codex，请它按证据逐条生成 `gap-report.md`。P0/P1 必须由 QE 和服务 owner 复核，尤其是“硬编码密钥”类发现：只报告文件/行号，绝不在报告中复制值。

## 8. 会产生什么

- `repo-inventory.json`：扫描范围和环境盘点。
- `graphs/overview.dot`：所有扫描均生成的图谱源文件。
- `graphs/overview.svg` / `.png`：安装 Graphviz 时生成的图片。
- `knowledge-base.json`：结构化节点、边、符号、端点、测试和证据，可供 Codex 后续检索。
- `knowledge-base.md`：人类可读摘要。
- `static-ui-analysis.json`：静态 UI 风险与端点映射候选。
- `ui-static-risk-and-gaps.csv`：可导入 Jira/测试管理工具前的评审清单。

## 9. 创新点与边界

创新点：不要求接入生产或部署 JaCoCo；将“代码可达性、UI 测试意图、风险规则、证据等级”放在同一个本地知识层；支持由全量图谱切出可读的 feature/module 图；对小白默认使用零安装路径。

边界：基础索引器是通用启发式，不是编译器；反射、动态路由、代理、配置化依赖、远端调用和生成代码可能遗漏或误报。不要把图中的所有边当成真实运行路径，也不要仅为提高行覆盖率而新增 UI 测试。

## 10. 打包和分享给小白

此目录就是可分享的仓库根目录。初始化并推送前，确认其中**没有**任何业务源代码、真实测试报告、`.env`、token 或输出目录：

```bash
git init
git add SKILL.md GUIDELINE.zh-CN.md GUIDELINE.en.md agents scripts references .gitignore
git commit -m "Add regression gap analyzer skill"
```

Codex 接收者安装方式：

```bash
git clone <YOUR_REPOSITORY_URL> ~/.codex/skills/regression-gap-analyzer
```

随后重启或刷新 Codex，在对话中输入 `$regression-gap-analyzer`。所有接收者先运行 `bash scripts/bootstrap.sh --install-core`，再运行 `run_static_scan.sh`；高级语义工具仍按需安装。不要让接收者把待分析业务 repo 复制进这个 Skill 仓库。
