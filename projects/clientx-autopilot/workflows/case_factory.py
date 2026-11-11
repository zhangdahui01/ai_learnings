"""Case Factory: from a feature (or a coverage gap) to a gated case.

planner -> QA review (human gate) -> case author -> local run loop -> case auditor -> pull request
-> domain review (human gate) -> daily run -> graduation (7 daily passes, 98%, sign-off) -> gate.
The deterministic checks live here; the agents (planner, case-author, case-auditor) do the writing.
"""
from __future__ import annotations

import re
from typing import Any

from harness.driver import WorkflowResult
from harness.signals import Event

from .common import Context, policy

FRAMEWORKS = {"web": "Playwright + BDD (automation/web)", "app": "Appium + pytest-bdd (automation/app)"}
SPEC_SECTIONS = ("Given", "When", "Then")
HARD_WAIT = re.compile(r"waitForTimeout\(|time\.sleep\(|\bsleep\s+\d|Thread\.sleep\(")
SKIP = re.compile(r"\.skip\(|test\.fixme|@skip\b|pytest\.mark\.skip|@pytest\.mark\.xfail|\bxit\(|\.only\(")
ASSERT = re.compile(r"expect\s*\(|\bassert\b|assert_|Should Be|Should Contain|toHave|toBe")
UNSTABLE_LOCATOR = re.compile(r"nth-child|//\*\[|/html/body|\.first\(\)|\.nth\(\d")


def validate_spec(markdown: str) -> list[str]:
    """One BDD spec per scenario: Given/When/Then present, a concrete Then, a cleanup statement."""
    issues = [f"missing '{s}' section" for s in SPEC_SECTIONS
              if not re.search(rf"^\s*(?:#+\s*|[-*]\s*|\*\*)?{s}\b", markdown, re.M | re.I)]
    then = re.search(r"Then\b(.*?)(?:\n#+\s|\Z)", markdown, re.S | re.I)
    if then and len(then.group(1).strip()) < 10:
        issues.append("'Then' has no concrete, observable expected result")
    if not re.search(r"cleanup|teardown|no side effect", markdown, re.I):
        issues.append("no cleanup step or 'no side effect' declaration")
    return issues


def audit_case(source: str) -> list[dict[str, str]]:
    """The Case Auditor's deterministic checks: real assertions, no hidden skip, stable waits and locators."""
    issues = []
    if not ASSERT.search(source):
        issues.append({"rule": "real_assertions", "detail": "the case asserts nothing"})
    for n, line in enumerate(source.splitlines(), 1):
        if SKIP.search(line):
            issues.append({"rule": "no_hidden_skip", "detail": f"line {n}: {line.strip()[:80]}"})
        if HARD_WAIT.search(line):
            issues.append({"rule": "stable_waits", "detail": f"line {n}: fixed sleep instead of a state wait"})
        if UNSTABLE_LOCATOR.search(line):
            issues.append({"rule": "stable_locators", "detail": f"line {n}: positional or absolute locator"})
    return issues


def graduation(stats: dict[str, Any]) -> tuple[bool, list[str]]:
    g = policy("case_lifecycle")["graduation"]
    missing = []
    if stats.get("consecutive_passes", 0) < g["consecutive_daily_passes"]:
        missing.append(f"{stats.get('consecutive_passes', 0)}/{g['consecutive_daily_passes']} daily passes in a row")
    if stats.get("pass_rate", 0) < g["pass_rate"]:
        missing.append(f"pass rate {stats.get('pass_rate', 0):.0%} < {g['pass_rate']:.0%}")
    if g["human_sign_off"] and not stats.get("signed_off"):
        missing.append("no human sign-off")
    return (not missing, missing)


def submit_case(c: Context, *, service: str, repo: str, scenario: str, spec: str, case_path: str, case_source: str,
                qa_approved_by: str | None, local_run_passed: bool, kb_update: dict[str, str] | None = None) -> dict[str, Any]:
    """The Case Author's only way to land a case: every gate before the PR must hold."""
    problems = [f"spec: {i}" for i in validate_spec(spec)]
    problems += [f"audit/{i['rule']}: {i['detail']}" for i in audit_case(case_source)]
    if not qa_approved_by:
        problems.append("the spec is not approved by QA")
    if not local_run_passed:
        problems.append("the local run did not pass")
    if problems:
        return {"accepted": False, "problems": problems}
    files = {f"specs/{scenario}.md": spec, case_path: case_source}
    pr = c.outbox.pull_request(repo=repo, module="case_factory", files=files,
                               title=f"[case-factory] {service}: {scenario}",
                               body=f"Spec approved by {qa_approved_by}. Audited: real assertions, no skip, stable waits. "
                                    "Local run passed. Starts as `incubating` (daily run only).",
                               evidence=[{"source": "local-run", "ref": scenario, "summary": "passed"}])
    for name, selector in (kb_update or {}).items():
        c.kb.record_selector(service, name, selector, source=f"case-factory:{pr['id']}")
    return {"accepted": True, "pr": pr["id"], "state": "incubating"}


def make_handler(c: Context):
    def handle(event: Event) -> WorkflowResult:
        p = event.payload
        service = p.get("service", "")
        stack = p.get("stack", "web")
        source = (f"coverage gap: {p.get('signal')} on journey {p.get('journey')} - {p.get('detail')}"
                  if event.type == "coverage_gap" else f"feature: {p.get('title', event.subject)}")
        c.outbox.agent_task(
            agent="planner", module="case_factory",
            task="Write one BDD spec per scenario (Given/When/Then, concrete expected results, cleanup). "
                 "Check every precondition against the service knowledge base; unknown ones go to a domain expert, "
                 "not a guess. Stop for QA review before any code is generated.",
            context={"source": source, "service": service, "framework": FRAMEWORKS.get(stack, stack), "input": p,
                     "knowledge": {layer: c.kb.load(service, layer) for layer in ("strategic", "operational")} if service else {}})
        return WorkflowResult("case_factory", f"spec draft requested for {service or event.subject}",
                              data={"stage": "planner", "next": ["qa_review", "case_author", "local_run", "case_auditor",
                                                                 "pull_request", "domain_review", "daily_run", "graduation"]})
    return handle
