# BDD Case Factory / BDD 用例工厂

## 中文

### 输入约定

- 支持未加密的 `.xlsx`，一个工作簿可包含多个 Sheet。
- 每个 Sheet 可代表一个功能；表头不要求在第一行，系统会在前 40 行寻找 `No.`、`Step`、`Expected Result`。
- 支持 `Priority`、`Depth1/2/3`、`Pre-requisite`、`Test Data`、`iOS/Android/Web`、`BTS No.` 和 `Notes`。
- 合并单元格和空单元格不会中断导入。缺少 Step/Expected 时仍创建 BDD，但进入 `needs-review`，不凭空补写业务行为。
- 同一个 Case ID 在不同 Sheet/行出现时全部保留；唯一来源键是 `Sheet + Row + Case ID`。

### UI 工作流

1. 启动产品，进入 **BDD Case Center**。
2. 选择 `.xlsx`，并设置本批次 `tenant / region / language / category` 默认值。
3. 第一层按工作簿中 Sheet 从左到右排列，第二层严格按 Excel 原始行号升序；每条 Case 永久显示 `文件 → Sheet → Row`。
4. 按 Case ID、标题、行号、可行度或评审状态筛选，查看不可变原始 Excel 行和评分阻碍。
5. 按模板编辑 `scenarioId / functionName / priority / tenant / platform / device / region / category / language`，以及 Given 前置条件、When、Then。
6. 保存后 `specs/*.md` 预览自动更新。没有前置条件时 Given 保持空白，不生成虚假占位文本；Common Check 始终存在，payment Case 追加 Specific-Payment Check。
7. QA 批准且 Repo 知识图谱为 READY 后，才可触发 Script Generation Job。

重新导入同一文件时，以来源键匹配：未人工编辑的 Draft 可以刷新；已批准或已编辑 Case 不会被静默覆盖。源行变化时标记 `SOURCE_CHANGED`，要求 QA 比较。

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

The factory imports every row from an unencrypted multi-sheet `.xlsx`, preserves workbook sheet order and original row order, detects offset headers, preserves duplicate IDs by source location, and never fabricates missing actions or prerequisites. Each case stores the exact Coupay BDD metadata and sections, an immutable source snapshot, validation issues, a Playwright UI-suitability assessment, QA review state, and the final `specs/*.md` preview.

Use the BDD Case Center for review, or the CLI for Codex, Claude Code, and Devin. Approval is a required gate before script-generation jobs. Reimport never silently overwrites an approved or edited BDD case.
