"""Coverage Intelligence: a knowledge base that knows what is missing.

Four gap signals over the coverage map (service -> journey -> spec -> case -> run -> incident -> PR diff):
  1 journey without a case        2 incident without a case
  3 changed code, no case ran     4 case that asserts nothing
Output: a ranked gap backlog; each gap becomes work for Case Factory.
"""
from __future__ import annotations

from typing import Any

from code_graph import queries
from harness.driver import WorkflowResult
from harness.signals import Event

from .common import Context

PRIORITY_WEIGHT = {"P0": 4, "P1": 3, "P2": 2, "P3": 1}
SIGNAL_WEIGHT = {"incident_without_case": 5, "changed_code_no_case": 4, "journey_without_case": 3, "case_asserts_nothing": 2}


def gaps(coverage_map: dict[str, Any], *, graph: dict[str, Any] | None = None,
         recent_prs: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    journeys = {j["id"]: j for j in coverage_map.get("journeys", [])}

    def add(signal: str, journey_id: str, detail: str, **extra: Any) -> None:
        j = journeys.get(journey_id, {})
        out.append({"signal": signal, "journey": journey_id, "priority": j.get("priority", "P2"), "detail": detail,
                    "score": SIGNAL_WEIGHT[signal] * PRIORITY_WEIGHT.get(j.get("priority", "P2"), 2), **extra})

    for j in journeys.values():
        live = [c for c in j.get("cases", []) if c.get("state") not in ("retired", "quarantined")]
        if not live:
            add("journey_without_case", j["id"], f"journey '{j.get('name', j['id'])}' has no live case")
        for case in live:
            if case.get("asserts", 1) == 0:
                add("case_asserts_nothing", j["id"], f"case {case['id']} has no business assertion", case=case["id"])
    for inc in coverage_map.get("incidents", []):
        if not inc.get("covered_by"):
            add("incident_without_case", inc.get("journey", "unknown"),
                f"incident {inc['id']} ({inc.get('title', '')}) has no regression case", incident=inc["id"],
                fix_pr=inc.get("fix_pr"))
    for pr in recent_prs or []:
        for j in queries.journeys_touched(graph, pr.get("files", []), coverage_map):
            ran = set(pr.get("cases_ran", []))
            if not (set(j["cases"]) & ran):
                add("changed_code_no_case", j["journey"],
                    f"{pr['id']} changed {', '.join(j['files'][:2])} but no case of this journey ran", pr=pr["id"])
    out.sort(key=lambda g: -g["score"])
    return out


def make_handler(c: Context, top_n: int = 3):
    def handle(event: Event) -> WorkflowResult:
        p = event.payload
        services = [p["service"]] if p.get("service") else c.kb.services()
        backlog: list[dict[str, Any]] = []
        for service in services:
            cmap = c.kb.coverage_map(service)
            prs = [c.adapters.scm.get_pr(p["pr"])] if event.type == "pr_merged" and p.get("pr") else []
            for gap in gaps(cmap, graph=c.graphs.get(service), recent_prs=prs):
                backlog.append({"service": service, **gap})
        if event.type == "incident_closed":
            backlog = [g for g in backlog if g.get("incident") == p.get("incident")] or backlog
        backlog.sort(key=lambda g: -g["score"])
        follow_ups = [event.child("coverage_gap", f"{g['service']}:{g['signal']}:{g['journey']}:{g.get('incident') or g.get('case') or g.get('pr') or ''}", g)
                      for g in backlog[:top_n]]
        if backlog:
            c.outbox.slack_card(channel=c.default_channel, module="coverage", verdict=None,
                                title=f"Coverage gap backlog: {len(backlog)} gap(s)",
                                suggested_action=f"The top {min(top_n, len(backlog))} are sent to Case Factory as spec drafts.",
                                extra={"backlog": backlog[:20]})
        return WorkflowResult("coverage", f"{len(backlog)} gap(s) ranked", follow_ups=follow_ups, data={"backlog": backlog})
    return handle
