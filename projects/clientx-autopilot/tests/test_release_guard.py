import pytest

from harness.signals import Event
from workflows import release_guard


@pytest.mark.parametrize("report_id,category,hop", [
    ("gr-1004", "environment", 1),      # staging deploy unfinished
    ("gr-1006", "test_data", 2),        # account expired mid-run (even though an assertion failed)
    ("gr-1001", "device", 3),           # every failed case ran on a Mac that went offline
    ("gr-1007", "app_build", 4),        # install exit code
    ("gr-1005", "network", 5),          # mitmproxy down
    ("gr-1003", "automation_case", 6),  # locator drift
    ("gr-1002", "product_code", 7),     # assertion + the PR reaches the journey through a dependency
])
def test_first_failed_hop_gives_the_verdict(loop, report_id, category, hop):
    _, ctx = loop
    verdict, _ = release_guard.triage(ctx, report_id)
    assert (verdict.category, verdict.detail["hop"]) == (category, hop)
    assert verdict.evidence


def test_assertion_failure_without_a_code_link_stays_unknown(loop):
    _, ctx = loop
    verdict, _ = release_guard.triage(ctx, "gr-1008")      # login assertion, PR only touches the cart
    assert verdict.category == "unknown" and verdict.decided_by == "none"


def test_device_verdict_hands_over_to_farm_autopilot_and_gate_stays_red(loop, event):
    driver, ctx = loop
    results = driver.submit(event("01_cd_gate_device"))
    assert [r.workflow for r in results] == ["release_guard", "farm_autopilot"]
    card = next(c for c in ctx.outbox.of_kind("slack_card") if c["module"] == "release_guard")
    assert "stays red" in card["gate_state"] and card["first_failed_hop"] == "device_queue"
    assert results[0].wait_for == "gate:gr-1001"
    actions = [a["action"] for a in ctx.outbox.of_kind("farm_action")]
    # hub fault on that Mac: phones are quarantined, not restarted
    assert {a["type"] for a in actions} == {"quarantine_device"} and all(a["mac"] == "sh-ios-03" and a["dry_run"] for a in actions)


def test_ci_gate_blocks_the_merge_and_never_heals(loop, event):
    driver, ctx = loop
    results = driver.submit(event("03_ci_gate_locator"))
    card = next(c for c in ctx.outbox.of_kind("slack_card") if c["module"] == "release_guard")
    assert card["gate"] == "ci" and "merge is blocked" in card["gate_state"]
    assert results[1].workflow == "case_care" and results[1].data["origin"] == "gate"
    assert not [t for t in ctx.outbox.of_kind("agent_task") if t["agent"] == "healer"]
    assert not ctx.outbox.of_kind("pull_request")


def test_model_hops_get_an_agent_task_with_the_rule_verdict(loop, event):
    driver, ctx = loop
    driver.submit(event("02_cd_gate_product"))
    task = next(t for t in ctx.outbox.of_kind("agent_task") if t["agent"] == "gate-triage")
    assert task["context"]["rule_verdict"]["category"] == "product_code"


def test_verdicts_are_written_back_to_the_knowledge_base(loop, event):
    driver, ctx = loop
    driver.submit(event("02_cd_gate_product"))
    patterns = ctx.kb.load("sample-checkout", "analytical")["failure_patterns"]
    assert patterns["product_code"]["last_reports"] == ["gr-1002"]


def test_ci_case_selection_follows_the_code_graph(loop, event):
    driver, _ = loop
    selection = driver.submit(event("04_pr_opened"))[0].data["selection"]
    # PR-501 changes shared/money.ts: pay and cart import it; login only runs as the smoke set
    assert set(selection["cases"]) == {"web_login", "web_cart_add", "web_cart_badge", "app_cart_add",
                                       "web_checkout_pay", "app_checkout_pay"}
    assert selection["cases"]["web_login"].startswith("smoke")


def test_changed_code_without_a_case_is_reported(loop):
    driver, ctx = loop
    driver.submit(Event("pr_opened", "PR-503", {"pr": "PR-503", "service": "sample-checkout"}))
    card = ctx.outbox.of_kind("slack_card")[0]
    assert card["journeys"] == ["coupon"]
