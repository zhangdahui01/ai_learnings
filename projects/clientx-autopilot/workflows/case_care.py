"""Case Care: every case has a state and a repair policy.

incubating -> warn -> gated; quarantined (owner + expiry) instead of silent removal; retired.
The Healer works on the daily run only. Locator and wait fixes may be automatic (rerun must
pass, one PR per failure group). Flow and data changes are proposed to a person. Assertions,
expected values and skips are never changed automatically: that is how a product bug gets
patched to green.
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from harness.driver import WorkflowResult
from harness.signals import Event

from .common import Context, policy

KIND_TO_PATCH = {"locator": "locator", "timeout": "wait", "flow": "flow", "data": "test_data",
                 "account": "account", "assertion": "assertion"}
ASSERTION_LINE = re.compile(r"\b(expect\s*\(|assert\b|assert_|Should\s|should\.|toHave|toBe|\.skip\b|@skip|pytest\.mark\.skip|test\.fixme)", re.I)


def next_state(case: dict[str, Any], today: str | None = None) -> tuple[str, str]:
    """Return (state, reason) for a case given its run statistics."""
    lc = policy("case_lifecycle")
    grad, quar = lc["graduation"], lc["quarantine"]
    state = case.get("state", "incubating")
    stable = (case.get("consecutive_passes", 0) >= grad["consecutive_daily_passes"]
              and case.get("pass_rate", 0) >= grad["pass_rate"])
    if state == "quarantined":
        q = case.get("quarantine", {})
        if case.get("fixed"):
            return "incubating", "fixed: re-enters through the daily run and must requalify"
        if today and q.get("expires") and today > q["expires"]:
            return "retired", f"unfixed at expiry {q['expires']}"
        return state, "quarantined, waiting for its owner"
    if state in ("warn", "gated") and case.get("recent_failures", 0) >= quar["after_recent_failures"]:
        return "quarantined", f"failed {case['recent_failures']} times recently; needs owner, expiry and reason"
    if state == "incubating" and stable:
        return "warn", f"{case['consecutive_passes']} daily passes in a row at {case['pass_rate']:.0%}"
    if state == "warn" and stable and case.get("signed_off"):
        return "gated", "stable and signed off by a person"
    if state == "warn" and stable:
        return state, "stable; waiting for human sign-off"
    return state, "no change"


def classify(kind: str) -> str:
    """auto | propose | never for a failure kind."""
    hp = policy("healing_policy")
    patch = KIND_TO_PATCH.get(kind, kind)
    for level in ("auto", "propose", "never"):
        if patch in hp[level]["kinds"]:
            return level
    return "propose"


def fingerprint(failure: dict[str, Any]) -> str:
    key = failure.get("selector") or re.sub(r"\d+", "N", failure.get("message", ""))[:80]
    return f"{failure.get('kind', 'unknown')}|{key}"


def group_failures(failures: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for f in failures:
        groups[fingerprint(f)].append(f)
    return dict(groups)


def diff_touches_assertions(diff: str) -> list[str]:
    """Changed lines (+/-) that add, remove or alter an assertion or a skip."""
    return [l for l in diff.splitlines()
            if l[:1] in "+-" and not l.startswith(("+++", "---")) and ASSERTION_LINE.search(l)]


def submit_patch(c: Context, *, service: str, repo: str, group: str, kind: str, origin: str, diff: str,
                 files: dict[str, str], rerun_passed: bool, tags: list[str] | None = None,
                 selectors: dict[str, str] | None = None) -> dict[str, Any]:
    """The Healer's only way to land a fix. Returns the PR item or a refusal with the reason."""
    level = classify(kind)
    hp = policy("healing_policy")
    touched = diff_touches_assertions(diff)
    refuse = None
    if origin != "daily":
        refuse = "the healer is off inside a gate; the failure stays red until a person decides"
    elif level == "never":
        refuse = f"'{kind}' is never repaired automatically"
    elif touched:
        refuse = f"the patch changes assertions or skips: {touched[0].strip()[:80]}"
    elif set(tags or []) & set(hp["side_effect_steps"]["tags"]):
        refuse = "side-effect steps (payment/destructive) are not repaired unattended"
    elif not rerun_passed:
        refuse = "the isolated rerun did not pass"
    if refuse:
        card = c.outbox.slack_card(channel=c.default_channel, module="case_care", verdict=None,
                                   title=f"Healer patch refused for {group}", suggested_action="A person reviews the failure.",
                                   extra={"reason": refuse, "service": service})
        return {"accepted": False, "reason": refuse, "card": card["id"]}
    pr = c.outbox.pull_request(
        repo=repo, module="case_care", files=files,
        title=f"[case-care] {'fix' if level == 'auto' else 'proposal'}: {kind} drift in {group.split('|', 1)[-1][:50]}",
        body=f"Failure group `{group}`. Policy level: {level}. Original assertions unchanged; isolated rerun passed.\n\n```diff\n{diff}\n```",
        evidence=[{"source": "local-rerun", "ref": group, "summary": "rerun passed with original assertions"}])
    for name, selector in (selectors or {}).items():
        c.kb.record_selector(service, name, selector, source=f"case-care:{pr['id']}")
    return {"accepted": True, "level": level, "pr": pr["id"]}


def make_handler(c: Context):
    def handle(event: Event) -> WorkflowResult:
        p = event.payload
        origin, service = p.get("origin", "daily"), p.get("service", "")
        groups = group_failures(p.get("failures", []))
        plan = []
        for key, items in groups.items():
            kind = items[0].get("kind", "unknown")
            level = classify(kind)
            cases = [i["case"] for i in items]
            if level == "never":
                c.outbox.slack_card(channel=c.default_channel, module="case_care", verdict=None,
                                    title=f"Possible product bug: {len(cases)} case(s) fail on {kind}",
                                    suggested_action="Do not repair. Triage as a product failure; the cases stay failing.",
                                    extra={"cases": cases, "group": key, "service": service, "pr": p.get("pr")})
                action = "card: possible product bug"
            elif origin == "gate":
                c.outbox.slack_card(channel=c.default_channel, module="case_care", verdict=None,
                                    title=f"Gate failure looks like {kind} drift in {len(cases)} case(s)",
                                    suggested_action="Fix in the case repo through the daily run; the gate stays red meanwhile.",
                                    extra={"cases": cases, "group": key, "service": service})
                action = "card: healer is off in the gate"
            else:
                c.outbox.agent_task(
                    agent="healer", module="case_care",
                    task=("Repair this failure group once. " +
                          ("Fix locator/wait only, keep every assertion, rerun in isolation, then call submit_patch."
                           if level == "auto" else
                           "Draft the flow/data change, link it to the product change that explains it; a person approves.")),
                    context={"group": key, "kind": kind, "level": level, "cases": cases, "service": service,
                             "failures": items, "linked_pr": p.get("pr"),
                             "known_selectors": c.kb.load(service, "operational").get("selectors", {}) if service else {}})
                action = f"agent task: healer ({level})"
            plan.append({"group": key, "kind": kind, "level": level, "cases": cases, "action": action})
        return WorkflowResult("case_care", f"{len(p.get('failures', []))} failures in {len(groups)} group(s)",
                              data={"plan": plan, "origin": origin})
    return handle
