from workflows import case_care, case_factory, coverage, onboarding

GOOD_SPEC = """# Add to cart
## Given
a logged-in member on a product page
## When
the member taps Add to cart
## Then
the cart badge shows 1 and the cart lists the product
## Cleanup
empty the cart
"""
GOOD_CASE = "await page.getByRole('button', {name: 'Add to cart'}).click();\nawait expect(page.getByTestId('badge')).toHaveText('1');\n"


def test_case_state_machine():
    assert case_care.next_state({"state": "incubating", "consecutive_passes": 7, "pass_rate": 0.99})[0] == "warn"
    assert case_care.next_state({"state": "incubating", "consecutive_passes": 6, "pass_rate": 0.99})[0] == "incubating"
    assert case_care.next_state({"state": "warn", "consecutive_passes": 9, "pass_rate": 0.99})[0] == "warn"
    assert case_care.next_state({"state": "warn", "consecutive_passes": 9, "pass_rate": 0.99, "signed_off": True})[0] == "gated"
    assert case_care.next_state({"state": "gated", "recent_failures": 3})[0] == "quarantined"
    q = {"state": "quarantined", "quarantine": {"owner": "qa", "expires": "2026-11-10"}}
    assert case_care.next_state(q, today="2026-11-11")[0] == "retired"
    assert case_care.next_state({**q, "fixed": True}, today="2026-11-11")[0] == "incubating"


def test_repair_policy_levels():
    assert [case_care.classify(k) for k in ("locator", "timeout", "flow", "data", "assertion", "skip")] == \
        ["auto", "auto", "propose", "propose", "never", "never"]


def test_daily_failures_are_grouped_and_assertions_are_never_healed(loop, event):
    driver, ctx = loop
    plan = driver.submit(event("07_daily_failures"))[0].data["plan"]
    by_kind = {p["kind"]: p for p in plan}
    assert by_kind["locator"]["cases"] == ["web_cart_add", "web_cart_badge"]        # one group, fixed once
    assert by_kind["locator"]["action"].startswith("agent task: healer")
    assert by_kind["assertion"]["action"] == "card: possible product bug"
    assert len([t for t in ctx.outbox.of_kind("agent_task") if t["agent"] == "healer"]) == 1


def test_healer_patch_gate(loop):
    _, ctx = loop
    base = dict(service="sample-checkout", repo="cases", group="locator|#add-to-cart", kind="locator",
                files={"tests/cart.spec.ts": "..."}, rerun_passed=True)
    ok_diff = "-  page.locator('#add-to-cart')\n+  page.getByRole('button', {name: 'Add to cart'})"
    assert case_care.submit_patch(ctx, origin="daily", diff=ok_diff, selectors={"cart.add": "role=button"}, **base)["accepted"]
    assert ctx.kb.load("sample-checkout", "operational")["selectors"]["cart.add"]["selector"] == "role=button"
    weak = "-  await expect(badge).toHaveText('1')\n+  await expect(badge).toBeVisible()"
    assert "assertions" in case_care.submit_patch(ctx, origin="daily", diff=weak, **base)["reason"]
    assert "gate" in case_care.submit_patch(ctx, origin="gate", diff=ok_diff, **base)["reason"]
    assert "rerun" in case_care.submit_patch(ctx, origin="daily", diff=ok_diff, **{**base, "rerun_passed": False})["reason"]
    assert "side-effect" in case_care.submit_patch(ctx, origin="daily", diff=ok_diff, tags=["@payment"], **base)["reason"]
    assert len(ctx.outbox.of_kind("pull_request")) == 1


def test_case_auditor_checks():
    rules = {i["rule"] for i in case_factory.audit_case(
        "test.skip('x')\nawait page.waitForTimeout(3000)\nawait page.locator('div:nth-child(3)').click()\n")}
    assert rules == {"real_assertions", "no_hidden_skip", "stable_waits", "stable_locators"}
    assert case_factory.audit_case(GOOD_CASE) == []


def test_case_reaches_a_pr_only_through_every_gate(loop):
    _, ctx = loop
    args = dict(service="sample-checkout", repo="cases", scenario="cart-add", spec=GOOD_SPEC,
                case_path="tests/cart-add.spec.ts", case_source=GOOD_CASE)
    assert not case_factory.submit_case(ctx, qa_approved_by=None, local_run_passed=True, **args)["accepted"]
    assert not case_factory.submit_case(ctx, qa_approved_by="qa", local_run_passed=False, **args)["accepted"]
    bad = case_factory.submit_case(ctx, qa_approved_by="qa", local_run_passed=True, **{**args, "spec": "# x\n## When\ntap"})
    assert any("Then" in p for p in bad["problems"])
    done = case_factory.submit_case(ctx, qa_approved_by="qa", local_run_passed=True, **args)
    assert done == {"accepted": True, "pr": ctx.outbox.of_kind("pull_request")[0]["id"], "state": "incubating"}


def test_graduation_needs_7_passes_98_percent_and_sign_off():
    assert case_factory.graduation({"consecutive_passes": 7, "pass_rate": 0.98, "signed_off": True}) == (True, [])
    ok, missing = case_factory.graduation({"consecutive_passes": 7, "pass_rate": 0.97})
    assert not ok and len(missing) == 2


def test_four_gap_signals(loop):
    _, ctx = loop
    prs = [ctx.adapters.scm.get_pr("PR-503")]
    found = coverage.gaps(ctx.kb.coverage_map("sample-checkout"), graph=ctx.graphs["sample-checkout"], recent_prs=prs)
    assert {g["signal"] for g in found} == {"journey_without_case", "incident_without_case",
                                            "changed_code_no_case", "case_asserts_nothing"}
    assert found[0]["signal"] == "incident_without_case" and found[0]["incident"] == "INC-77"


def test_closed_incident_becomes_work_for_case_factory(loop, event):
    driver, ctx = loop
    results = driver.submit(event("06_incident_closed"))
    assert [r.workflow for r in results] == ["coverage", "case_factory"]
    task = next(t for t in ctx.outbox.of_kind("agent_task") if t["agent"] == "planner")
    assert "INC-77" in task["context"]["source"]


def test_onboarding_kit_is_one_pr_in_warn_mode(loop, event):
    driver, ctx = loop
    result = driver.submit(event("08_new_role"))[0]
    pr = ctx.outbox.of_kind("pull_request")[0]
    assert '"mode": "warn"' in pr["files"]["roles/market-web-listing.json"]
    assert {p.split("/")[-1] for p in pr["files"] if p.startswith("knowledge-base/")} == \
        {"strategic.json", "analytical.json", "operational.json"}
    assert result.data["todos"]                                   # unknowns are listed, not invented
    assert onboarding.build_kit({"role": "r", "service": "s", "owner": "o", "stack": "app", "repo": "x",
                                 "slack_channel": "#c"})["roles/r.json"].count("ios-real") == 1


def test_incomplete_inventory_is_not_guessed(loop):
    from harness.signals import Event
    driver, ctx = loop
    result = driver.submit(Event("new_role", "x", {"role": "x"}))[0]
    assert "owner" in result.data["missing"] and not ctx.outbox.of_kind("pull_request")
