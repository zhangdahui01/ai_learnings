---
name: coverage-intelligence
description: Find what is not tested - journeys without a case, incidents without a regression case, changed code no case ran, cases that assert nothing - and rank the gaps for Case Factory. Use after an incident closes, after a merge, or when asked about coverage gaps.
---
# Coverage Intelligence

1. The coverage map lives in `knowledge-base/<service>/strategic.json`: journey → code paths → specs → cases → incidents.
2. Compute gaps: `workflows.coverage.gaps(coverage_map, graph=<code graph>, recent_prs=[...])`, or emit `incident_closed` / `pr_merged` / `daily_schedule`.
3. The ranked backlog is a card; the top gaps become `coverage_gap` events that Case Factory turns into spec drafts.
4. Keep the map true: when a case lands or an incident gets its regression case, update `cases` / `covered_by`.
