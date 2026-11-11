"""Results -> diagnosis -> agent tasks -> gate: the pieces that make authoring and fixing automatic."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from ci import gate
from device_farm import collector
from harness import agent_runner, results
from harness.app import build
from workflows.common import ROOT


@pytest.mark.parametrize("message,kind", [
    ("TimeoutError: locator.click: Timeout 10000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Add to cart' })", "locator"),
    ("Error: LOCATOR_AMBIGUOUS: 'cart.add' candidate role=button matches 3 elements", "locator"),
    ("Error: expect(locator).toHaveText(expected) failed\nExpected string: \"1\"\nReceived string: \"0\"", "assertion"),
    ("AssertionError: 'pay.status' text is 'Processing'; expected it to contain 'Payment complete'", "assertion"),
    ("clientx_app.locators.ElementNotFound: 'cart.open' (accessibility id=cart_open) not found within 10.0s", "locator"),
    ("selenium.common.exceptions.InvalidSessionIdException: A session is either terminated or not started", "device"),
    ("WebDriverException: Unable to launch WebDriverAgent because of xcodebuild failure", "device"),
    ("page.goto: net::ERR_PROXY_CONNECTION_FAILED at https://shop", "network"),
    ("Error: SPEC_DRIFT in cart-add: test runs \"When x\" but the spec's next step is \"When y\"", "spec_drift"),
    ("page.goto: Timeout 20000ms exceeded.", "timeout"),
    ("something nobody has seen", "unknown"),
])
def test_failure_diagnosis(message, kind):
    assert results.classify_failure(message)["kind"] == kind


def test_locator_failure_keeps_the_selector():
    f = results.classify_failure("TimeoutError: waiting for getByRole('button', { name: 'Add to cart' })")
    assert "Add to cart" in f["selector"]


PW_REPORT = {"suites": [{"specs": [], "suites": [{"specs": [
    {"title": "Member adds a product", "file": "tests/cart-add.spec.ts", "tags": ["gated"], "tests": [{
        "status": "unexpected", "annotations": [{"type": "spec", "description": "specs/cart-add.md"}, {"type": "journey", "description": "cart"}],
        "results": [{"status": "failed", "attachments": [{"name": "screenshot", "path": "/tmp/a.png"}],
                     "errors": [{"message": "TimeoutError: locator.click: Timeout\n waiting for getByRole('button', { name: 'Add to cart' })"}]}]}]},
    {"title": "Member logs in", "file": "tests/login.spec.ts", "tests": [{
        "status": "expected", "annotations": [{"type": "spec", "description": "specs/login.md"},
                                              {"type": "locator", "description": "login.submit: fallback#1 testid=login"}],
        "results": [{"status": "passed", "attachments": []}]}]},
    {"title": "framework self-test", "file": "tests/framework.spec.ts", "tests": [{
        "status": "unexpected", "annotations": [], "results": [{"status": "failed", "errors": [{"message": "x"}]}]}]},
]}]}]}


def test_playwright_report_becomes_case_results(tmp_path):
    (tmp_path / "r.json").write_text(json.dumps(PW_REPORT))
    parsed = results.parse_playwright_report(tmp_path / "r.json")
    assert [(r["case"], r["status"]) for r in parsed] == [("cart-add", "failed"), ("login", "passed")]   # no spec, no case
    assert parsed[0]["failure"]["kind"] == "locator" and parsed[0]["evidence"] == ["/tmp/a.png"]
    assert results.locator_drift(parsed) == [{"case": "login", "note": "login.submit: fallback#1 testid=login"}]
    event = results.to_case_failure_event(parsed, origin="daily", service="s", run_id="r1")
    assert event.payload["failures"][0]["stack"] == "web"
    assert results.summarize(parsed)["failure_kinds"] == {"locator": 1}


def test_junit_becomes_case_results(tmp_path):
    (tmp_path / "j.xml").write_text(
        '<testsuite><testcase classname="t" name="test_member_logs_in"/>'
        '<testcase classname="t" name="test_pay"><failure message="AssertionError: text is \'x\'; expected it to contain \'y\'">tb</failure></testcase>'
        '<testcase classname="t" name="test_skip"><skipped/></testcase></testsuite>')
    parsed = results.parse_junit(tmp_path / "j.xml")
    assert [(r["title"], r["status"]) for r in parsed] == [("test_member_logs_in", "passed"), ("test_pay", "failed"), ("test_skip", "skipped")]
    assert parsed[1]["failure"]["kind"] == "assertion"


@pytest.fixture
def var_with_tasks(tmp_path):
    shutil.copytree(ROOT / "knowledge-base", tmp_path / "kb")
    driver, ctx = build(var=tmp_path / "var", kb_root=tmp_path / "kb")
    (tmp_path / "r.json").write_text(json.dumps(PW_REPORT))
    parsed = results.parse_playwright_report(tmp_path / "r.json")
    driver.submit(results.to_case_failure_event(parsed, origin="daily", service="sample-checkout", run_id="r1"))
    ctx.outbox.agent_task(agent="case-author", module="case_factory", task="implement", context={"stack": "app"})
    return tmp_path / "var"


def test_agent_tasks_get_the_stack_specific_prompt(var_with_tasks):
    done = agent_runner.run_pending(var_with_tasks)
    by_agent = {r["agent"]: r for r in done}
    assert by_agent["healer"]["template"] == "heal-web.md" and by_agent["case-author"]["template"] == "author-app.md"
    text = Path(by_agent["healer"]["prompt_file"]).read_text()
    for needle in ("# System", "Never", "submit_patch", "## Context", '"kind": "locator"', "## How to finish"):
        assert needle in text
    assert all(not r["executed"] for r in done)
    assert len(agent_runner.run_pending(var_with_tasks)) == 2          # composing does not mark a task as done


def test_agent_runner_executes_and_parses_the_result_block(var_with_tasks):
    calls = []

    def fake(argv, **kw):
        calls.append(argv)
        answer = 'Fixed.\n```json\n{"task_id": "x", "status": "done", "summary": "locator updated", "evidence": []}\n```'
        return subprocess.CompletedProcess(argv, 0, stdout=json.dumps({"result": answer}), stderr="")

    done = agent_runner.run_pending(var_with_tasks, execute=True, agent="healer", runner=fake)
    assert done[0]["result"]["status"] == "done" and calls[0][0] == "claude"
    assert "Edit" in calls[0][calls[0].index("--allowedTools") + 1]
    assert agent_runner.pending(var_with_tasks / "outbox", var_with_tasks / "agent_runs", "healer") == []


def test_every_agent_has_a_prompt_template():
    for (agent, _), template in agent_runner.TEMPLATES.items():
        assert (ROOT / "agents" / f"{agent}.md").exists() and (ROOT / "prompts" / template).exists()


def _gate_ctx(tmp_path):
    shutil.copytree(ROOT / "knowledge-base", tmp_path / "kb")
    return build(var=tmp_path / "var", kb_root=tmp_path / "kb")


def test_ci_gate_selects_by_change_and_cd_gate_takes_everything(tmp_path):
    _, ctx = _gate_ctx(tmp_path)
    ci = gate.select(ctx, "ci", "sample-checkout", ["checkout/cart.ts"])
    assert set(ci["blocking"]) == {"web_login", "web_cart_add", "web_cart_badge", "app_cart_add"}
    cd = gate.select(ctx, "cd", "sample-checkout", [])
    assert len(cd["blocking"]) == 7
    plan = gate.commands(ci, "android-emulator", tmp_path)
    assert plan["web"]["argv"][3:5] == ["tests/cart-add.spec.ts", "tests/login.spec.ts"]
    assert "test_member_adds_a_product_to_the_cart" in " ".join(plan["app"]["argv"]) and "android-emulator" in plan["app"]["argv"]


def test_gate_is_red_on_failure_missing_result_or_nothing_selected(tmp_path):
    _, ctx = _gate_ctx(tmp_path)
    sel = gate.select(ctx, "ci", "sample-checkout", ["checkout/cart.ts"])
    ok = [{"case": "cart-add", "stack": "web", "status": "passed"}, {"case": "login", "stack": "web", "status": "passed"},
          {"case": "x", "title": "test_member_adds_a_product_to_the_cart", "stack": "app", "status": "passed"}]
    assert gate.judge(sel, ok)["red"] is False
    assert "app_cart_add: missing" in gate.judge(sel, ok[:2])["reasons"]
    skipped = [dict(ok[0], status="skipped")] + ok[1:]
    assert gate.judge(sel, skipped)["red"] is True                               # a skip is not a pass
    empty = gate.select(ctx, "ci", "no-such-service", ["a.ts"])
    assert "zero blocking cases" in gate.judge(empty, [])["reasons"][0]


def test_warn_cases_run_but_do_not_block(tmp_path):
    _, ctx = _gate_ctx(tmp_path)
    data = ctx.kb.load("sample-checkout", "strategic")
    data["coverage_map"]["journeys"][1]["cases"][0]["state"] = "warn"            # web_cart_add
    ctx.kb.save("sample-checkout", "strategic", data)
    sel = gate.select(ctx, "ci", "sample-checkout", ["checkout/cart.ts"])
    assert "web_cart_add" in sel["warn"] and "web_cart_add" not in sel["blocking"]


def test_red_gate_run_is_recorded_and_triaged(tmp_path):
    driver, ctx = _gate_ctx(tmp_path)
    sel = gate.select(ctx, "ci", "sample-checkout", ["checkout/cart.ts"])
    res = [{"case": "cart-add", "stack": "web", "status": "failed", "failure": {"kind": "locator", "message": "0 elements"}},
           {"case": "login", "stack": "web", "status": "passed"},
           {"case": "x", "title": "test_member_adds_a_product_to_the_cart", "stack": "app", "status": "passed"}]
    run = gate.record(sel, gate.judge(sel, res), pr="PR-9", changed=["checkout/cart.ts"], var=tmp_path / "var")
    driver, ctx = build(var=tmp_path / "var", kb_root=tmp_path / "kb")
    from harness.signals import Event
    out = driver.submit(Event("ci_gate_result", run["report_id"], {"report_id": run["report_id"], "status": "failed"}))
    assert out[0].data["verdict"]["category"] == "automation_case" and out[1].workflow == "case_care"
    assert ctx.adapters.scm.get_pr("PR-9")["files"] == ["checkout/cart.ts"]


def test_case_registration_and_promotion(tmp_path, capsys):
    shutil.copytree(ROOT / "knowledge-base", tmp_path / "kb")
    base = ["--var", str(tmp_path / "var"), "--kb", str(tmp_path / "kb")]
    reg = base + ["register", "--service", "sample-checkout", "--case", "web_coupon", "--journey", "coupon", "--stack", "web", "--spec", "coupon"]
    assert gate.main(reg) == 0
    with pytest.raises(SystemExit):
        gate.main(reg)                                                         # no duplicates
    promote = base + ["promote", "--service", "sample-checkout", "--case", "web_coupon"]
    gate.main(promote + ["--passes", "7", "--pass-rate", "0.99"])
    gate.main(promote + ["--passes", "9", "--pass-rate", "0.99"])              # stable but not signed off
    gate.main(promote + ["--passes", "9", "--pass-rate", "0.99", "--signed-off-by", "qa-lead"])
    out = capsys.readouterr().out
    assert "incubating -> warn" in out and "warn -> warn" in out and "warn -> gated" in out
    _, ctx = build(var=tmp_path / "var", kb_root=tmp_path / "kb")
    assert "web_coupon" in gate.select(ctx, "cd", "sample-checkout", [])["blocking"]


def test_collector_builds_a_snapshot_from_local_tools():
    def run(argv):
        key = " ".join(argv)
        if key == "adb devices":
            return 0, "List of devices attached\nemulator-5554\tdevice\nemulator-5556\toffline\n"
        if "getprop sys.boot_completed" in key:
            return 0, "1\n"
        if "pm list packages" in key:
            return 0, "package:com.example.shop\n" if "5554" in key else ""
        if key == "xcrun simctl list devices -j":
            return 0, json.dumps({"devices": {"com.apple.CoreSimulator.SimRuntime.iOS-18-0": [
                {"udid": "SIM-1", "name": "iPhone 16", "state": "Booted", "isAvailable": True},
                {"udid": "SIM-2", "name": "iPhone 15", "state": "Shutdown", "isAvailable": True}]}})
        if key.startswith("xcrun simctl get_app_container"):
            return 1, ""
        if key == "idevice_id -l":
            return 0, "00008110-000A1B2C3D4E5F60\n"
        return 127, ""

    snap = collector.collect(run, {"ANDROID_APP_PACKAGE": "com.example.shop", "IOS_BUNDLE_ID": "com.example.shop",
                                   "FARM_MAC_ID": "studio-1", "FARM_REGION": "seoul"},
                             port_open=lambda p: p == 8080, appium_up=lambda p: True)
    mac = snap["regions"][0]["macs"][0]
    dev = {d["id"]: d for d in mac["devices"]}
    assert (mac["id"], snap["regions"][0]["id"], mac["appium_up"], mac["proxy_up"]) == ("studio-1", "seoul", True, True)
    assert dev["emulator-5554"]["booted"] and not dev["emulator-5556"]["online"]
    assert set(dev) == {"emulator-5554", "emulator-5556", "SIM-1", "00008110-000A1B2C3D4E5F60"}   # shut-down simulators are not farm devices
    assert dev["SIM-1"]["app_installed"] is False and dev["00008110-000A1B2C3D4E5F60"]["kind"] == "ios-real"
    from device_farm import pipeline
    rules = {f.rule for f in pipeline.run(snap, [])["findings"]}
    assert rules == {"emulator_down", "app_missing"}
    gone = collector.collect(lambda argv: (127, ""), {}, known=list(dev.values()), port_open=lambda p: False, appium_up=lambda p: False)
    assert {d["id"]: d["online"] for d in gone["regions"][0]["macs"][0]["devices"]} == {"emulator-5554": False, "emulator-5556": False, "00008110-000A1B2C3D4E5F60": False}
    assert len(collector.status_changes(snap, gone)) == 2
