import inspect

import pytest

from harness.actions import ForbiddenAction, Outbox
from harness.adapters import FixtureAdapters
from harness.brain import Brain, Evidence, Verdict
from harness.driver import Driver, WorkflowResult
from harness.signals import Event


def test_verdict_must_cite_evidence():
    with pytest.raises(ValueError):
        Verdict("device", 0.9, [], "rerun")


def test_rules_run_before_model():
    calls = []

    class Model:
        def propose(self, task, context):
            calls.append(task)
            return Verdict("product_code", 0.5, [Evidence("m", "r", "s")], "block")

    rule = lambda ctx: Verdict("environment", 0.95, [Evidence("g", "r", "deploy unfinished")], "rerun") if ctx["bad"] else None
    brain = Brain(model=Model())
    assert brain.decide([rule], {"bad": True}, model_task="t").decided_by == "rule"
    assert calls == []
    assert brain.decide([rule], {"bad": False}, model_task="t").decided_by == "model"
    assert Brain().decide([rule], {"bad": False}, model_task="t").category == "unknown"


def test_outbox_allows_only_three_ways_to_act(tmp_path):
    box = Outbox(tmp_path)
    with pytest.raises(ForbiddenAction):
        box._emit("deploy", {})
    live = Outbox(tmp_path, dry_run=False)          # live without a transport must refuse
    with pytest.raises(ForbiddenAction):
        live.slack_card(channel="#x", title="t", verdict=None, suggested_action="a", module="m")


def test_adapters_expose_no_write_methods(tmp_path):
    adapters = FixtureAdapters(tmp_path)
    for name in ("gate_platform", "automation_service", "logs", "scm", "code_quality"):
        for method, _ in inspect.getmembers(getattr(adapters, name), inspect.ismethod):
            if not method.startswith("_"):
                assert method.split("_")[0] in {"get", "list", "query", "farm", "tasks", "case", "build"}, method


def _driver(handler, **kw):
    routes = [{"event": "cd_gate_result", "when": {"status": "failed"}, "workflow": "w"},
              {"event": "case_failure", "workflow": "w"}]
    return Driver(routes, {"w": handler}, **kw)


def test_driver_routes_by_rule_and_merges_duplicates():
    seen = []
    d = _driver(lambda e: seen.append(e.id) or WorkflowResult("w", "ok"))
    d.submit(Event("cd_gate_result", "gr-1", {"status": "passed"}))        # no route for a green gate
    first = Event("cd_gate_result", "gr-1", {"status": "failed"})
    d.submit(first)
    dup = Event("cd_gate_result", "gr-1", {"status": "failed"})
    d.submit(dup)
    assert seen == [first.id]
    assert d.ledger.last_status(dup.id) == "merged"


def test_driver_enforces_hop_limit():
    def loop(e):
        return WorkflowResult("w", "again", follow_ups=[e.child("case_failure", f"s{e.hop + 1}")])
    d = _driver(loop, hop_limit=3)
    d.submit(Event("case_failure", "s0"))
    assert sum(e["status"] == "routed" for e in d.ledger.entries) == 4      # hops 0..3
    assert any(e["status"] == "dropped_hop_limit" for e in d.ledger.entries)


def test_driver_suspends_until_a_person_decides(tmp_path):
    state = tmp_path / "suspended.json"
    d = _driver(lambda e: WorkflowResult("w", "card sent", wait_for="gate:gr-9"), state_path=state)
    ev = Event("cd_gate_result", "gr-9", {"status": "failed"})
    d.submit(ev)
    assert d.ledger.last_status(ev.id) == "suspended"
    d2 = _driver(lambda e: WorkflowResult("w", "x"), state_path=state, ledger=d.ledger)   # a new process
    out = d2.submit(Event("human_decision", "gate:gr-9", {"decision": "block", "by": "qa"}))
    assert out[0].data["human_decision"]["decision"] == "block"
    assert d.ledger.last_status(ev.id) == "done"


def test_a_failing_workflow_does_not_stop_the_loop():
    def boom(e):
        raise RuntimeError("x")
    d = _driver(boom)
    ev = Event("case_failure", "s")
    assert d.submit(ev) == []
    assert any(e["status"] == "failed" for e in d.ledger.history(ev.id))
