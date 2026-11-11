"""Release Guard: triage a red gate along the real chain.

Covers both gates:
  ci_gate_result  pre-merge Quality Gate: a selected subset ran on the PR; red blocks the merge
  cd_gate_result  post-merge Release Gate: regression on staging; red blocks the release

Walk the chain left to right; the first failed hop gives the verdict.
  1 environment   2 accounts   3 device/queue   4 app install   5 traffic route   -> rules only
  6 case steps    7 product code                                                 -> rule pre-check, then the gate-triage agent
Output: one card to the role owner with verdict, evidence and a suggested action.
The gate stays red until a person decides. The harness proposes; it never passes a failed gate.
"""
from __future__ import annotations

from typing import Any

from code_graph import queries
from harness import run_graph
from harness.brain import Evidence, Verdict
from harness.driver import WorkflowResult
from harness.signals import Event

from .common import Context, policy

HOP_NAMES = ["environment", "accounts", "device_queue", "app_install", "traffic_route", "case_steps", "product_code"]


def _ev(source: str, report_id: str, summary: str) -> Evidence:
    return Evidence(source, f"gate-run:{report_id}", summary)


def hop_environment(ctx: dict[str, Any]) -> Verdict | None:
    env, rid = ctx["environment"], ctx["report_id"]
    checks = policy("gates")[ctx["gate"]]["environment_checks"]
    bad = [c for c in checks if env.get(c) is False]
    if not bad:
        return None
    what = "PR build / test environment" if ctx["gate"] == "ci" else "staging refresh"
    return Verdict("environment", 0.95, [_ev("gate-platform", rid, f"{c}=false") for c in bad],
                   f"Notify the environment owner; rerun after the {what} is healthy.", detail={"hop": 1})


def hop_accounts(ctx: dict[str, Any]) -> Verdict | None:
    acc, rid = ctx["accounts"], ctx["report_id"]
    facts = []
    if acc.get("lock_acquired") is False:
        facts.append("account lock was not acquired")
    if acc.get("expired_mid_run"):
        facts.append("account lease expired mid-run")
    if not facts:
        return None
    return Verdict("test_data", 0.95, [_ev("automation-service", rid, f) for f in facts],
                   "Allocate new test accounts and rerun.", detail={"hop": 2})


def hop_device_queue(ctx: dict[str, Any]) -> Verdict | None:
    failed = run_graph.failed_cases(ctx)
    tasks = {t["task_id"]: t for t in ctx["tasks"]}
    if not failed or not tasks:
        return None
    bad: dict[str, list[str]] = {}
    for case in failed:
        t = tasks.get(case.get("task_id"))
        if not t:
            continue
        why = ("task was never pulled" if not t.get("pulled", True) else
               "Mac went offline" if t.get("mac_online") is False else
               "task lease expired" if t.get("lease_expired") else None)
        if why:
            bad.setdefault(f"{t['mac']}: {why}", []).append(case["case"])
    covered = sum(len(v) for v in bad.values())
    if covered < len(failed):          # some failures ran on healthy devices: not a pure device verdict
        return None
    macs = sorted({k.split(":")[0] for k in bad})
    return Verdict("device", 0.92,
                   [_ev("automation-service", ctx["report_id"], f"{k}; cases: {', '.join(v)}") for k, v in bad.items()],
                   f"Rerun the affected cases on another Mac; Farm Autopilot takes over {', '.join(macs)}.",
                   detail={"hop": 3, "macs": macs})


def hop_app_install(ctx: dict[str, Any]) -> Verdict | None:
    inst = ctx["install"]
    if ctx["platform"] != "app" or not inst:
        return None
    facts = []
    if inst.get("download_ok") is False:
        facts.append("app build download failed")
    if inst.get("exit_code", 0) != 0:
        facts.append(f"install exit code {inst['exit_code']}")
    if not facts:
        return None
    return Verdict("app_build", 0.93, [_ev("runner-logs", ctx["report_id"], f) for f in facts],
                   "Reinstall the build and rerun; if the download fails again, notify the build owner.", detail={"hop": 4})


def hop_traffic_route(ctx: dict[str, Any]) -> Verdict | None:
    route = ctx["route"]
    names = {"proxy_up": "proxy (mitmproxy / egress proxy) is down", "env_answers": "the target environment does not answer",
             "flag_set": "the test-traffic flag is not set"}
    facts = [msg for key, msg in names.items() if route.get(key) is False]
    if not facts:
        return None
    return Verdict("network", 0.93, [_ev("logs", ctx["report_id"], f) for f in facts],
                   "One grouped alert to on-call; rerun when the route is back.", detail={"hop": 5})


def hop_case_steps(ctx: dict[str, Any]) -> Verdict | None:
    failed = run_graph.failed_cases(ctx)
    kinds = {c.get("failure", {}).get("kind") for c in failed}
    if not failed or not kinds <= {"locator", "timeout"}:
        return None
    ev = [Evidence("gate-platform", (c.get("evidence") or [f"gate-run:{ctx['report_id']}"])[0],
                   f"{c['case']}: {c['failure']['kind']} - {c['failure'].get('message', '')}") for c in failed]
    return Verdict("automation_case", 0.7, ev,
                   "To Case Care: the failures look like locator/timing drift. The gate-triage agent confirms with trace and video.",
                   detail={"hop": 6, "cases": [c["case"] for c in failed]})


def hop_product_code(ctx: dict[str, Any]) -> Verdict | None:
    failed = [c for c in run_graph.failed_cases(ctx) if c.get("failure", {}).get("kind") == "assertion"]
    pr = ctx.get("pr")
    if not failed or not pr:
        return None
    touched = queries.journeys_touched(ctx.get("code_graph"), pr.get("files", []), ctx.get("coverage_map", {}))
    hit = [j for j in touched if set(j["cases"]) & {c["case"] for c in failed}]
    if not hit:
        return None
    ev = [Evidence("scm", f"pr:{pr['id']}", f"PR changes {', '.join(j['files'][:3])} in journey '{j['journey']}' "
                   f"({'direct' if j['distance'] == 0 else str(j['distance']) + ' hop(s)'})") for j in hit]
    ev += [Evidence("gate-platform", (c.get("evidence") or [f"gate-run:{ctx['report_id']}"])[0],
                    f"{c['case']}: assertion failed - {c['failure'].get('message', '')}") for c in failed]
    build = ctx.get("build") or {}
    if build.get("status"):
        ev.append(Evidence("code-quality", f"build:{pr['id']}", f"last build status: {build['status']}"))
    return Verdict("product_code", 0.65, ev,
                   "Block. Send the evidence to the PR author; the gate-triage agent confirms against trace and diff.",
                   detail={"hop": 7, "pr": pr["id"], "author": pr.get("author"), "cases": [c["case"] for c in failed]})


RULES = [hop_environment, hop_accounts, hop_device_queue, hop_app_install, hop_traffic_route,
         hop_case_steps, hop_product_code]


def triage(c: Context, report_id: str) -> tuple[Verdict, dict[str, Any]]:
    graph = run_graph.build(c.adapters, report_id)
    run = c.adapters.gate_platform.get_gate_run(report_id)
    service = run.get("service", "")
    graph["code_graph"] = c.graphs.get(service)
    graph["coverage_map"] = c.kb.coverage_map(service) if service else {}
    graph["service"] = service
    graph["owner_channel"] = run.get("owner_channel", c.default_channel)
    verdict = c.brain.decide(RULES, graph, model_task="gate-triage", fallback_evidence=[
        _ev("harness", report_id, "hops 1-5 are clean and no rule classifies the failed cases")])
    return verdict, graph


def make_handler(c: Context):
    def handle(event: Event) -> WorkflowResult:
        report_id = event.payload["report_id"]
        verdict, graph = triage(c, report_id)
        gate = graph["gate"]
        blocks = "merge" if gate == "ci" else "release"
        hop = verdict.detail.get("hop")
        if graph["service"]:
            c.kb.record_verdict(graph["service"], verdict.to_dict(), report_id=report_id)

        follow_ups: list[Event] = []
        mode = c.brain.policy.mode(verdict)
        if verdict.category == "device" and mode == "auto_follow_up":
            for mac in verdict.detail["macs"]:
                follow_ups.append(event.child("device_fault_suspected", mac, {"mac": mac, "report_id": report_id}))
        if verdict.category == "automation_case":
            failures = [{"case": x["case"], **x.get("failure", {})} for x in run_graph.failed_cases(graph)]
            follow_ups.append(event.child("case_failure", f"gate:{report_id}", {
                "origin": "gate", "service": graph["service"], "failures": failures,
                "pr": (graph.get("pr") or {}).get("id")}))
        if hop in (6, 7) or verdict.category == "unknown":
            c.outbox.agent_task(agent="gate-triage", module="release_guard",
                                task="Confirm or correct this verdict using trace, video, logs and the PR diff. "
                                     "Cite evidence for every claim. Never recommend passing the gate.",
                                context={"report_id": report_id, "gate": gate, "rule_verdict": verdict.to_dict(),
                                         "failed_cases": run_graph.failed_cases(graph), "pr": graph.get("pr")})

        decision_key = f"gate:{report_id}"
        c.outbox.slack_card(
            channel=graph["owner_channel"], module="release_guard", decision_key=decision_key,
            title=f"{'Quality Gate (pre-merge)' if gate == 'ci' else 'Release Gate (staging)'} is red: "
                  f"{graph['role']} - verdict: {verdict.category}",
            verdict=verdict.to_dict(),
            suggested_action=verdict.suggested_action if mode != "needs_human" else "Needs investigation by a person.",
            extra={"gate": gate, "report_id": report_id, "first_failed_hop": HOP_NAMES[hop - 1] if hop else None,
                   "gate_state": f"stays red; the {blocks} is blocked until a person decides",
                   "decisions": ["rerun", "block", "override (records who and why)"]})
        return WorkflowResult("release_guard", f"{report_id}: {verdict.category} ({verdict.decided_by}, {verdict.confidence})",
                              follow_ups=follow_ups, wait_for=decision_key,
                              data={"verdict": verdict.to_dict(), "gate": gate})
    return handle


def select_handler(c: Context):
    """pr_opened -> which cases the pre-merge Quality Gate should run for this PR."""
    def handle(event: Event) -> WorkflowResult:
        pr = c.adapters.scm.get_pr(event.payload["pr"])
        service = event.payload["service"]
        cfg = policy("gates")["ci"]["selection"]
        cmap = c.kb.coverage_map(service)
        selection = queries.select_cases(c.graphs.get(service), pr.get("files", []), cmap,
                                         smoke=cmap.get("smoke", []), limit=cfg["limit"], states=tuple(cfg["states"]))
        if selection["changed_without_case"]:
            c.outbox.slack_card(channel=c.default_channel, module="release_guard", verdict=None,
                                title=f"{pr['id']}: changed code reaches journeys with no gated case",
                                suggested_action="Coverage Intelligence adds these to the gap backlog.",
                                extra={"journeys": selection["changed_without_case"], "pr": pr["id"]})
        return WorkflowResult("gate_selection", f"{pr['id']}: {len(selection['cases'])} cases selected",
                              data={"selection": selection})
    return handle
