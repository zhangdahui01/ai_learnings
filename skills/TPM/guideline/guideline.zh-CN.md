# TPM Agentic AI Transformation 设计

## 目标

把 TPM 的 Q3 工作从“统计哪些事情能被 AI 帮助”推进到可度量、可复用、可审计的工作系统：每项工作都能说明输入、判断、输出、人工责任、AI 前后耗时和质量证据。

本设计提供两个可安装的 Agent Skill：

| Skill | 用途 | 主要产物 |
|---|---|---|
| `tpm-ai-tool-authoring` | 指导 TPM 设计 agent/skill | tool spec、流程、输出 schema、评测样例、ROI 记录 |
| `tpm-ai-tool-auditor` | 发布前和运行后的审计门 | audit report、风险等级、阻断项、改进建议 |

## TPM 工作域到 AI 能力的映射

| TPM 工作域 | AI 适合做什么 | 必须保留的人类判断 |
|---|---|---|
| Org setup / goal | 把战略拆成 goal/owner/milestone 草案，检查重复和缺口 | 目标取舍、承诺、组织政治与责任归属 |
| Progress tracking | 从项目源汇总状态、识别偏差、生成周报草稿 | 状态真实性、升级时机、行动优先级 |
| Risk / dependency | 归并风险、给出影响/概率/缓解方案候选、追踪逾期 | 风险接受、跨团队谈判、敏感事件处理 |
| OKR summary | 计算进度、标注证据、生成管理层摘要 | 目标解释、结果归因、绩效语境 |
| Data analysis / reporting | 清洗、切片、异常检测、图表和 narrative 草稿 | 指标定义、因果结论、发布口径 |
| Communication | 按受众改写公告、状态更新、决策记录 | 对外承诺、措辞风险、最终发送 |
| Meetings | 会前 brief、议程、实时 action capture、会后纪要 | 决策确认、冲突处理、责任确认 |

## 统一的工具设计原则

1. **Outcome-first**：先定义 TPM 要减少的等待、汇总、返工或遗漏，再决定是否需要 agent。
2. **Skill before agent**：稳定的知识/流程用 skill；需要跨源检索、循环判断、调用工具才升级为 agent；可确定的计算优先用脚本。
3. **Evidence-bound**：每个事实带来源、时间和置信度；没有证据就标记 `unknown`，不得补全成事实。
4. **Human accountability**：AI 只能草拟、排序、提示和执行已授权的低风险动作；目标承诺、风险接受、绩效结论、外部发送必须人工批准。
5. **Structured output**：固定 schema、状态枚举、时间格式和缺失值规则，让结果可以比较、复核和接入下游。
6. **Least privilege**：最小数据、最小工具权限、只读优先；写入和发送动作使用显式 approval gate。
7. **Measurable ROI**：记录基线人工分钟、AI 运行分钟、人工复核分钟、返工分钟、质量评分和自动化覆盖率；“节省时间”不能只看模型响应时间。
8. **Progressive disclosure**：SKILL.md 只保留触发条件和流程，详细字段、范例、平台差异放在 references/。
9. **Failure is visible**：失败、低置信度、数据缺失、权限不足要显式返回，不允许静默成功。
10. **Audit before scale**：每次发布、关键配置变化、运行后异常都触发审计；Critical/High 不得自动上线。

## 推荐的 TPM 工具卡片

每个候选工具先填一张卡，再决定实现方式：

```yaml
tool_id: tpm-progress-weekly-summary
work_domain: progress-tracking
user: TPM
outcome: 在 15 分钟内生成可审阅的周进展摘要
trigger: 每周五或用户显式调用
inputs:
  - source: project_tracker
    fields: [milestone, owner, status, due_date, updated_at]
outputs:
  - summary_markdown
  - evidence_table
  - risks
human_approval: required_before_send
write_actions: []
baseline_minutes: 90
ai_minutes: 20
quality_checks: [source_coverage, date_freshness, owner_completeness]
known_failures: [stale_source, conflicting_status, missing_owner]
```

## 运行与度量闭环

```text
工作盘点 → 工具卡 → authoring skill → audit gate → 小范围试运行
    ↑                                             ↓
工时/质量/采用率 ← 运行日志 ← 人工审批 ← 输出交付
```

建议每周记录五项指标：覆盖工作时长、AI 参与率、净节省分钟、人工修订率、错误/升级率。Q3 汇报时分成“效率收益”和“风险/质量护栏”，不要只报 token 或调用次数。

## GitHub 借鉴及本设计的取舍

- Anthropic `skills`：采用每个 skill 独立目录、`SKILL.md` frontmatter、按需加载和 references 分层。
- AWS `sample-agent-skill-eval`：采用结构/安全扫描、评分与最低通过分数的门禁思想；本仓库用轻量本地脚本实现可移植子集。
- OWASP Secure Agent Playbook：采用 prompt injection、工具权限、数据泄露和供应链风险作为独立安全维度。
- `skill-inject`：将“恶意指令藏在 skill 文本中”纳入红队样例，而不是只查代码漏洞。
- Claude Code plugin/hook patterns：采用 `PreToolUse` 做阻断、`PostToolUse`/`Stop` 做审计与记录；Claude 专属配置放在参考文件，不把它假设成 Codex/Devin 通用 API。

参考：

- [Anthropic skills](https://github.com/anthropics/skills)
- [AWS sample-agent-skill-eval](https://github.com/aws-samples/sample-agent-skill-eval)
- [OWASP Secure Agent Playbook](https://github.com/OWASP/secure-agent-playbook)
- [SKILL-INJECT benchmark](https://github.com/aisa-group/skill-inject)
- [Claude Code plugin structure](https://github.com/anthropics/claude-code/tree/main/plugins/plugin-dev/skills/plugin-structure)

## 发布门槛

- `Critical`：阻断发布和自动执行。
- `High`：必须修复；若是已知、隔离且有书面接受的风险，只能人工批准试运行。
- `Medium`：可试运行，但必须有 owner 和修复日期。
- `Low/Info`：记录并在下次迭代处理。

审计报告必须能回答：审计了哪个版本、输入范围是什么、哪些检查通过/失败、谁批准了例外、下一步如何复测。
