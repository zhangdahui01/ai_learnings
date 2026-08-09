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

### 3.1 图中红框文件：逐个深入说明

这些文件不是“扫描出来的业务代码”，而是这个 Skill 自己的**方法说明与可执行流水线**。它们一起把输入仓库变成可审计的报告。它们不会修改、构建或运行被扫描仓库。

```text
你的代码仓库 / UI 自动化仓库
                 │
                 ▼
        run_static_scan.sh（命令门面）
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
preflight.py         static_index.py
环境与范围盘点        图 + 知识库 + UI 风险/GAP
       │                   │
repo-inventory.json   DOT/SVG/PNG + JSON/CSV/Markdown
                 │
                 ▼
          render_html_report.py → report.html
```

| 红框文件 | 类型 / 谁会使用 | 在本 Skill 中具体做什么 | 读取什么 | 产生什么 |
|---|---|---|---|---|
| `references/report-contract.md` | 规则文档；Agent 在生成或审核报告前读取 | 定义每条风险/GAP 必须带哪些证据字段、可信度和优先级，防止 Agent 把“静态推断”写成“真实覆盖”。 | 不读取仓库或文件。 | 不直接产物；约束 `static-ui-analysis.json`、CSV 和 HTML 报告的内容。 |
| `references/static-ui-analysis.md` | 规则文档；Agent 与 `static_index.py` 的设计依据 | 定义静态 UI 自动化风险规则：固定等待、脆弱 selector、skip/retry、缺少断言、共享状态、潜在密钥；并规定如何把后端入口点转为“待确认”的测试 GAP。 | 不读取仓库或文件。 | 不直接产物；决定风险的分类、证据等级与措辞。 |
| `references/toolchain.md` | 决策文档；Agent 选择图谱引擎前读取 | 说明 `static_index.py`、Graphviz、jQAssistant、Joern、CodeQL、Tree-sitter 各自的能力边界和选择条件。 | 不读取仓库或文件。 | 不直接产物；指导是否从零安装索引升级到语义图。 |
| `scripts/preflight.py` | Python 可执行脚本；由总入口自动执行 | 扫描仓库元信息：Git SHA、语言数量、构建文件、疑似测试文件、以及本机工具是否可用。它是一次分析的“环境与版本凭证”。 | 目录结构、文件名、Git 元数据；跳过 `.git`、`node_modules`、`target` 等目录；不读取密钥值，不运行代码。 | `repo-inventory.json`。 |
| `scripts/run_static_scan.sh` | Bash 可执行脚本；你唯一需要手工执行的扫描入口 | 校验 Python 版本和参数，把多个 `--repo`、可选 `--automation`、`--out` 传给三个下游脚本，按固定顺序执行。 | 只读命令行路径和参数。 | 自身不保存分析数据；编排生成全部扫描产物，并最后提示 `report.html` 路径。 |
| `scripts/static_index.py` | Python 可执行脚本；默认核心分析器 | 零安装、跨语言的启发式源码索引：收集文件、声明、import、HTTP 路由、UI 测试名；识别 UI 风险模式；比较后端 route 与 UI route 字面量，产生待人工确认的 GAP。使用正则/文本规则，不是编译器。 | 支持的源码文件文本；不执行代码，不读取 `.env`/构建输出/依赖缓存。 | `knowledge-base.json`、`knowledge-base.md`、`graphs/overview.dot`、可选 SVG/PNG、`static-ui-analysis.json`、`ui-static-risk-and-gaps.csv`。 |

三个 `references/*.md` 都是给 Agent 的**决策和质量护栏**，所以不需要你在 Terminal 执行。三个 `scripts/*` 才是可执行代码；日常只运行 `run_static_scan.sh`，不要分别运行 `preflight.py` 和 `static_index.py`，除非你在调试本 Skill。

### 3.2 一次静态扫描的真实调用顺序

例如执行：

```bash
bash scripts/run_static_scan.sh \
  --repo /work/order-service \
  --automation /work/order-ui-e2e \
  --out /tmp/order-analysis
```

实际发生的顺序是：

1. `run_static_scan.sh` 检查 Python 3.10+ 和参数完整性。
2. `preflight.py` 记录两个仓库的 Git SHA、语言、构建标记、测试文件清单和工具可用性，写入 `repo-inventory.json`。
3. `static_index.py` 读取源码文本并建立 `Repository → File → Symbol/Endpoint/TestCase/Risk` 图；Graphviz 可用时把 DOT 渲染为 SVG/PNG。
4. `render_html_report.py` 读取上述 JSON 和图，生成便于评审的 `report.html`。

因此：HTML/CSV 中每条静态风险都能回溯到文件和行号；但“后端端点没有字面量 UI route”只代表 `inferred` GAP 候选，不能表述成“该功能未测试”。

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
command -v joern        # Joern 没有 --version 参数；执行 joern 会进入交互式界面，输入 exit 退出
codeql version          # 仅完整安装后
```

如果高级命令找不到，可临时执行：

```bash
export PATH="$HOME/.local/bin:$HOME/bin:$PATH"
```

### 4.6 深度图谱工具：作用、官网、何时使用与最小 Demo

默认扫描只依赖 `static_index.py` + Graphviz，适合任何语言、无需 build。下面三个工具是**可选增强**：它们不会被 `run_static_scan.sh` 自动执行，因为可能下载依赖、需要 build、占用较多磁盘/内存，且深度分析范围必须由你授权。

| 工具 | 它究竟做什么 | 何时最适合本 Skill | 不应拿它做什么 |
|---|---|---|---|
| [jQAssistant](https://jqassistant.github.io/jqassistant/current/) | 将 Java/JVM、Maven、文件等结构扫描进本地嵌入式 Neo4j；用 Cypher 查询架构、模块、依赖和规则违反。 | 多个 Java Maven/Gradle 服务的持久架构知识图、模块依赖评审、架构规则。 | 不把它当作 UI 真实覆盖证明；源码/字节码信息仍不证明测试已执行。 |
| [Joern](https://docs.joern.io/) | 把代码解析为 CPG（Code Property Graph）：融合 AST、CFG、PDG 和调用/数据流信息；通过 Scala 风格 CPGQL 查询。 | 需要沿“入口 → 调用 → 敏感 sink”追踪、检查权限/错误/数据流、分析局部复杂分支。 | 不建议直接渲染全仓库 CPG；图会不可读且内存消耗很大。 |
| [CodeQL](https://codeql.github.com/docs/codeql-overview/about-codeql/) | 先为代码建语义数据库，再运行 QL 查询；支持可解释的调用/数据流和 SARIF 结果。 | 需要用特定问题验证 GAP 假设、做跨语言安全/质量查询、在可正常 build 的项目中获得较高语义精度。 | 不要在没有正常构建条件的 Java/C# 等编译型仓库上承诺完整结果；不要上传含私有源码的数据库 bundle。 |

#### jQAssistant：Java 架构图与本地 Neo4j

官网：[User Manual](https://jqassistant.github.io/jqassistant/current/) · [命令行任务](https://jqassistant.github.io/jqassistant/current/#_command_line)。官方要求 JDK 11+；本 Skill 安装 JDK 17 并通过 SDKMAN 安装 jQAssistant。它采用插件扫描器和 Cypher 规则，常用任务包括 `scan`、`server`、`effective-configuration`、`available-rules`、`analyze`。

最小 Demo（在**可公开的示例目录**或已获授权的项目副本中执行）：

```bash
# 先确认命令和当前配置；首次运行会下载所需插件
jqassistant effective-configuration

# 扫描编译后的 classes；jQAssistant 对 classpath/构建产物的语义最完整
jqassistant scan -f java:classpath::target/classes

# 启动本机 Neo4j 浏览器服务，然后访问 http://localhost:7474
jqassistant server
```

Neo4j Browser 中可运行的 Cypher 例子：

```cypher
MATCH (a:Artifact)-[:CONTAINS]->(t:Type)-[:DECLARES]->(m:Method)
RETURN a.fileName AS artifact, t.fqn AS type, count(m) AS methods
ORDER BY methods DESC LIMIT 20;
```

对 Maven 工程，更可复现的做法是将 jQAssistant Maven 插件加入父 `pom.xml`，再运行 `mvn jqassistant:scan jqassistant:analyze`。这会改动项目配置、可能运行 Maven，因此必须先得到项目 owner 批准。进一步规则和配置参见 [官方扫描器/规则说明](https://jqassistant.github.io/jqassistant/current/#_scanner)。

#### Joern：CPG、控制流与数据流

官网：[安装](https://docs.joern.io/installation/) · [Quickstart](https://docs.joern.io/quickstart/) · [CPGQL](https://docs.joern.io/cpgql/) · [Java frontend](https://docs.joern.io/frontends/java/)。Joern 的 CPG 将语法树（AST）、控制流（CFG）和程序依赖（PDG）等结构合到可查询图中，适合从一个明确入口点做深挖。

最小 Demo（建议先用很小的 Java 模块；`joern` 会创建本地 workspace）：

```bash
joern
```

在 `joern>` 提示符中输入：

```scala
importCode(inputPath="/absolute/path/small-java-module", projectName="small-java")
cpg.method.name.l
cpg.method.name("processOrder").callIn.code.l
exit
```

含义：第一行创建 CPG 项目；第二行列方法；第三行查谁调用 `processOrder`。大仓库请限制到一个模块/入口点，并按官方文档设置 JVM 内存，例如 `joern -J-Xmx8G`。也可用 [官方脚本模式](https://docs.joern.io/interpreter/) 使查询可复现：`joern --script query.sc --param cpgFile=/path/to/cpg.bin.zip`。

#### CodeQL：构建感知的语义查询

官网：[CodeQL 概述](https://codeql.github.com/docs/codeql-overview/about-codeql/) · [CLI 设置](https://docs.github.com/en/code-security/how-tos/scan-code-for-vulnerabilities/scan-from-the-command-line/setting-up-the-codeql-cli) · [`database create`](https://docs.github.com/en/code-security/codeql-cli/manual/database-create) · [`database analyze`](https://docs.github.com/en/code-security/codeql-cli/manual/database-analyze)。CodeQL 先用 extractor 建数据库，再运行 query/suite，结果通常输出 SARIF，便于 GitHub code scanning 或人工审阅。

最小 Demo（对 Java 等编译型语言，`--command` 必须是项目本来就能成功执行的构建命令；这会执行 build，先获批准）：

```bash
# 查看本机可用语言与 query packs
codeql resolve languages
codeql resolve packs

# 在授权的 Java 项目中创建数据库；命令按项目实际 Maven/Gradle 构建调整
codeql database create /tmp/order-codeql-db \
  --language=java-kotlin \
  --command="./mvnw -DskipTests package"

# 使用已安装或显式指定的查询套件，输出 SARIF
codeql database analyze /tmp/order-codeql-db \
  --format=sarif-latest \
  --output=/tmp/order-codeql.sarif \
  <query-suite-or-pack>
```

`<query-suite-or-pack>` 不是固定字符串：先运行 `codeql resolve packs`，再选你本机可见的 suite/pack。数据库和 SARIF 可能包含源码路径、诊断和结果；仅在获授权的环境保存、共享或上传。对只想做本 Skill 的快速静态报告的人，不需要运行 CodeQL。

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
