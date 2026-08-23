# BDD Case Factory / BDD 用例工厂

## 中文

### 输入约定

- 支持未加密的 `.xlsx`，一个工作簿可包含多个 Sheet。
- 每个 Sheet 可代表一个功能；表头不要求在第一行，系统会在前 40 行寻找 `No.`、`Step`、`Expected Result`。
- 支持 `Priority`、`Depth1/2/3`、`Pre-requisite`、`Test Data`、`iOS/Android/Web`、`BTS No.` 和 `Notes`。
- 合并单元格和空单元格不会中断导入。系统先解析有效层级，再按同一 Sheet 内的 `Depth1 + Depth2 + Depth3 + Pre-requisite` 分组。缺少 Step/Expected 时仍创建 BDD，但进入 `needs-review`，不凭空补写业务行为。Pre-requisite 中形如 `AB Key [AB ID] is A/B` 或 `AB Key 103680 is A` 的内容会额外进入 Given 的结构化 AB 列表，历史数据在 Schema 15 自动补齐并规范化。
- 同组的多个 `No.` 合并成一个 scenarioId；共同前缀只保留一次，例如 `MAIN_001 + MAIN_002 → MAIN_001_002`。来源同时保存全部 `rowNumbers`、`caseIds` 和不可变 `rawRows`。
- `functionName` 使用 `[Depth1][Depth2][Depth3][Pre-requisite][第一条 Step]`；空字段跳过。
- `Pre-requisite` 原值直接作为 Given。每个源行形成一条 `{when: Step, then: Expected Result}` 成对记录，顺序与 Excel 一致；Expected Result 即使包含多行也不会与对应 Step 拆开。

### UI 工作流

1. 启动产品，进入 **BDD Case Center**。
2. 选择 `.xlsx`，并设置本批次 `tenant / region / language / category` 默认值。
3. 第一层按工作簿中 Sheet 从左到右排列，第二层按每组首个 Excel 行号升序；每条 Case 显示全部来源行，例如 `Rows 2, 3`。
4. 按 Case ID、标题、行号、可行度或评审状态筛选，查看不可变原始 Excel 行和评分阻碍。
5. 按模板编辑 metadata 与 Given；When/Then 使用成对卡片，可增加、删除和上下移动，移动时动作与预期一起移动。
6. 保存后 `specs/*.md` 预览自动更新。没有前置条件时 Given 保持空白，不生成虚假占位文本；Common Check 始终存在，payment Case 追加 Specific-Payment Check。
7. QA 批准且 Repo 知识图谱为 READY 后，才可触发 Script Generation Job。

重新导入同名文件时会用本次分组结果替换该文件的旧结果，其他工作簿和平台资产不受影响。同一分组且源 Hash 未变化时保留 QA 编辑；分组或源行发生变化时按新规则重建，必须重新 QA 审核。升级前先备份 `data/store.json`。

### 评分含义

分数表示“在当前授权测试环境中稳定实现 Playwright Web UI 自动化的可行度”，不是测试通过率：

- `80–100 ui-ready`：主要是可观察的 Web UI 行为。
- `60–79 fixture-needed`：适合 UI，但需要账号、数据、Feature Flag 或清理机制。
- `40–59 hybrid-review`：需要 UI + API/Mock/消息读取/故障注入组合。
- `<40 not-ui-suited`：更适合 Appium、API、性能工具或人工验证。

系统会识别原生 App、硬件/生物识别、OTP/CAPTCHA/3DS、后端/网络异常、测试数据状态、邮件短信、视觉检查、性能并发和有副作用的支付/删除操作。Iframe、Shadow DOM、弹窗和多窗口本身不是“不适合 UI”的理由，Playwright 原生脚本可以处理。

### CLI

```bash
node scripts/bdd-case-factory.mjs import --input manual.xlsx --output bdd-output
node scripts/bdd-case-factory.mjs knowledge-index --repo /path/e2e-repo --output knowledge-graph.json
node scripts/bdd-case-factory.mjs generation-job --case bdd-output/cases/example.json --knowledge knowledge-index.json
```

## English

The factory imports every row from an unencrypted multi-sheet `.xlsx`, then groups rows within each sheet by the effective `Depth1 + Depth2 + Depth3 + Pre-requisite`. A group becomes one BDD case: IDs are compacted (for example `MAIN_001_002`), the prerequisite becomes Given, and every source row remains an ordered When/Then pair. All row numbers, IDs, and immutable raw rows remain traceable. Missing actions or outcomes are never fabricated.

Use the BDD Case Center for review, or the CLI for Codex, Claude Code, and Devin. Approval is a required gate before script-generation jobs. Reimport never silently overwrites an approved or edited BDD case.
