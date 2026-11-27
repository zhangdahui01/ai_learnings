---
name: stock-daily-report
description: 生成"美股观察日报"：一组股票的最新行情、图表、情报、分析和情景预测，发布到 ai_learnings 的 GitHub Pages。用户说"股票日报"、"美股日报"、"分析这些股票"、"今天的股票情报"，或每日定时任务触发时使用。默认清单是 Nvidia、Coupang、Meta、台积电、Amazon、Apple、Microsoft、Tesla、Broadcom、Salesforce，用户可以换成任意股票。
---

# 美股观察日报

每期日报是一个数据文件。你只负责调研并写出这份 JSON，页面由 `build.py` 用 `template.html` 生成。不要手写或改动生成出来的 HTML。

- 数据：`docs/reports/stock-daily/data/<YYYY-MM-DD>.json`
- 页面：`docs/reports/stock-daily/<YYYY-MM-DD>/index.html`（生成物）
- 归档页：`docs/reports/stock-daily/index.html`（生成物）
- 线上地址：`https://zhangdahui01.github.io/ai_learnings/reports/stock-daily/<YYYY-MM-DD>/`

读者是用户本人和他的老板，都用中文阅读，多数时候在手机上看。全部内容用中文写，公司名和代码保留英文。

## 第 1 步：确定日期和清单

- 日期用首尔时间的当天日期。星期写成"周一"到"周日"。
- 股票清单默认读 `watchlist.json`。用户在请求里点名了别的股票，就用用户的清单；新股票要查到上一年最后一个交易日的收盘价作为 `base`。
- 打开 `data/` 里日期最新的一份 JSON。它是格式样例，也是"上期预测回看"的依据。

## 第 2 步：取行情

每只股票需要最近约 23 个交易日的收盘价（最旧到最新），以及 52 周高低点、市值、PE、远期 PE、分析师平均目标价。

来源经验：

- 首选 `https://stockanalysis.com/stocks/<ticker>/history/`，日线收盘价最全、最新。
- `https://stockanalysis.com/stocks/<ticker>/` 的概览页经常是几天前的缓存。只用它取估值和新闻标题，并核对页面上的报价日期。
- 备选是 `https://finance.yahoo.com/quote/<TICKER>/` 和 `/history/`。
- 最省事的做法：把上一期 JSON 的 `px` 去掉最早的几天，补上新的交易日，保持 `dates` 和每只股票的 `px` 等长。
- 大盘四格（道指、标普 500、纳指、VIX）取最近一个交易日的收盘和涨跌幅。

规则：

- 每个数字都要有来源，取不到就写 `null`，不要估。
- 只能间接推算的收盘价可以写入，但该股票要加 `"approx": true`，并在 `dataNotes` 里说明是怎么推算的。
- 最后两个交易日的收盘价必须有，否则算不出当日涨跌。
- 美股休市日（周末、节假日）没有新收盘价：沿用上一期的 `dates` 和 `px`，在 `asof` 里写明"美股休市，行情同上一期"，只更新情报、分析、预测和日历。

## 第 3 步：取情报

每只股票搜最近 24 到 72 小时的消息，再搜一次大盘和宏观。每只股票写 2 到 4 条 `notes`，每条是 `[一句话事实, 来源链接]`。

- 用自己的话转述，不照抄原文，不大段引用。
- 相互矛盾的报道要多查一个来源；仍然对不上就两种说法都写，并说明出处。
- 涉及真实人物的负面消息只写报道了什么、谁报道的，不加猜测。
- 没有新消息的股票，如实写"过去两天没有公司层面的新消息"，再补一条最近的重要背景。

## 第 4 步：写分析和预测

这部分是日报的重点，老板要看的是判断，不只是消息汇总。

每只股票：

- `view`：一段分析，3 到 5 句。说明这些消息意味着什么、股价为什么这样走、市场在担心或期待什么。结论要能从 `notes` 和价格数据推出来；属于推断的地方直接说"这是推断"。
- `bias`：未来 1 到 2 周的方向倾向，如"偏多"、"中性"、"偏弱"、"震荡"、"财报前偏多"。
- `conf`：把握度，"低"、"中低"、"中"、"中高"。消息面主导、随时可能反转的写低。
- `sc`：三种情景，顺序固定为上行、基准、下行。每个是 `[触发条件, 对应价位]`。价位用近期收盘高低点、52 周高低点这类有出处的参考位，写明来历，例如"回测 318.71（11/20 收盘）"。
- `watch`：最该盯的一两个信号。

整体：

- `lead`：3 到 4 条，当天最值得知道的事，带具体数字。
- `mview`：3 到 4 条整体判断。
- `mscen`：三种情景，顺序固定为基准、上行、下行，每个是 `[名称, 概率, 描述]`。概率写"约 50%"这种粗略值，三者合计 100%。
- `cal`：未来两周的财报和事件，`[日期, 事件]`。
- `headline`：一句话概括当天，用在归档页。

底线：

- 这是情景分析，不是买卖建议。不写"建议买入/卖出/加仓/减仓"，不给仓位，不针对读者个人的持仓给意见。
- 不把预测写成确定的事。概率是主观估计，页面模板已有相应说明和免责声明，不要删。

## 第 5 步：上期预测回看

如果上一期 JSON 存在，为每只股票写一条 `review`：

```json
{"t": "NVDA", "bias": "震荡", "range": "125 到 165 宽幅震荡", "actual": "$149.30", "result": "在区间内"}
```

`result` 如实写："在区间内"、"高于区间，判断偏保守"、"跌破区间，判断错了"等。再用 `reviewNote` 写一句总结，例如"10 个判断里 7 个落在基准区间"。判断错了就直说，这一栏的意义就是让预测可以被检验。第一期没有上期，`review` 写空数组。

## 第 6 步：构建并自查

```bash
python3 skills/stock-daily-report/build.py <YYYY-MM-DD>
```

脚本会校验数据，并打印每只股票的 1 日、5 日、1 个月、年内涨跌幅。逐个对照来源里的涨跌幅，差得多说明收盘价抄错了，回去改 JSON 再构建。校验不过就修数据，不要改脚本绕过去。

## 第 7 步：发布

用户的长期要求是：发到 ai_learnings 的报告直接合并，不用问。

1. 从 `main` 新建分支 `reports/stock-daily-<YYYY-MM-DD>`，提交数据文件和生成的页面。
2. 推送并开 PR，然后直接 squash 合并。在这个环境里 `gh pr create` 用不了，用 REST：
   `gh api repos/zhangdahui01/ai_learnings/pulls -f title=... -f head=... -f base=main -f body=...`
   `gh api -X PUT repos/zhangdahui01/ai_learnings/pulls/<n>/merge -f merge_method=squash`
3. 等约 80 秒，查部署：`gh api "repos/zhangdahui01/ai_learnings/actions/runs?per_page=1"`。"Deploy GitHub Pages" 第一次常因取不到 artifact 而失败，失败就重跑一次：`gh api -X POST repos/zhangdahui01/ai_learnings/actions/runs/<id>/rerun`，再等 80 秒确认成功。
4. 打开线上地址确认页面能加载。

## 第 8 步：回报

用中文简短回报：线上地址、当天 3 条要点、上期预测对了几个，以及哪些数据没取到或是推算的。没有问题就不用展开过程。
