import copy
import json

from device_farm import pipeline
from device_farm.actions import ActionQueue, FarmAction
from device_farm.dashboard.generate_dashboard import generate
from device_farm.model import Farm
from device_farm.monitor import evaluate
from device_farm.runner import run_once
from workflows.common import ROOT, policy


def _by_rule(findings):
    return {f.rule + ":" + f.target: f for f in findings}


def test_topology_parent_fault_silences_children(farm_data):
    snap, _ = farm_data
    f = _by_rule(evaluate(Farm.from_snapshot(snap)))
    hub = f["hub_fault:sh-ios-03/hub-1"]
    assert hub.proposed_action == "quarantine_device" and len(hub.silenced) == 5
    assert not any(k.startswith("device_offline:sh-ios-03") for k in f)        # phones are not alerted one by one
    mac = f["mac_offline:se-and-02"]
    assert len(mac.silenced) == 6 and not any(x.mac == "se-and-02" and x.scope == "device" for x in f.values())


def test_a_whole_region_down_points_at_the_site(farm_data):
    snap = copy.deepcopy(farm_data[0])
    for m in snap["regions"][1]["macs"]:
        m["online"] = False
    findings = evaluate(Farm.from_snapshot(snap))
    seoul = [x for x in findings if x.region == "seoul"]
    assert [x.rule for x in seoul] == ["region_unreachable"] and seoul[0].proposed_action is None


def test_device_kinds_get_their_own_recovery(farm_data):
    snap, _ = farm_data
    f = _by_rule(evaluate(Farm.from_snapshot(snap)))
    assert f["emulator_down:sh-and-04-d6"].device_kind == "android-emulator"
    assert f["emulator_down:sh-sim-01-d3"].device_kind == "ios-simulator"
    assert f["wda_down:sh-ios-05-d4"].proposed_action == "restart_wda"
    assert f["device_offline:sh-ios-02-d1"].proposed_action == "quarantine_device"   # a real iPhone is not "restarted"
    assert f["proxy_down:se-ios-01"].proposed_action == "restart_proxy"


def test_doctor_escalates_when_a_recovery_does_not_hold(farm_data):
    snap, history = farm_data
    result = pipeline.run(snap, history)
    d = {x.finding.target: x for x in result["diagnoses"]}
    assert d["sh-ios-01-d2"].proposed_action == "reinstall_app" and d["sh-ios-01-d2"].explained_by == "doctor"
    assert d["sh-ios-05-d4"].proposed_action == "restart_wda" and d["sh-ios-05-d4"].explained_by == "rule"
    assert "flapping" in d["sh-ios-02-d1"].cause
    assert d["sh-and-02"].explained_by == "needs_agent"


def test_policy_gate_allowlist_cooldown_budget_approval(farm_data):
    snap, history = farm_data
    out = {(d.action_type, d.target): d for d in pipeline.run(snap, history, policy("farm_policy"))["decisions"]}
    assert out[("reset_mac", "se-and-02")].outcome == "needs_approval"
    assert out[("restart_emulator", "sh-and-04-d6")].outcome == "blocked" and "cooldown" in out[("restart_emulator", "sh-and-04-d6")].reason
    assert all(d.action["dry_run"] for d in out.values() if d.action)
    approved = pipeline.run(snap, history, approvals={"reset_mac:se-and-02"})["decisions"]
    assert next(d for d in approved if d.action_type == "reset_mac").outcome == "enqueue"
    narrow = pipeline.run(snap, history, {"allowlist": ["quarantine_device"]})["decisions"]
    assert {d.action_type for d in narrow if d.outcome == "enqueue"} == {"quarantine_device"}
    tight = pipeline.run(snap, [{"ts": snap["now_ts"] - 60, "mac": "sh-and-07", "target": "x", "action": "restart_appium"}] * 6)
    assert "budget" in next(d for d in tight["decisions"] if d.target == "sh-and-07").reason


def test_pull_queue_lease_ack_reap_and_dry_run_runner(tmp_path):
    q = ActionQueue(tmp_path / "q.json", lease_s=10)
    q.enqueue(FarmAction("restart_emulator", "sh-sim-01", "UDID-1", "sim down", device_kind="ios-simulator"))
    assert q.pull("other-mac") is None                       # a Mac only pulls its own actions
    item = q.pull("sh-sim-01", now=100)
    assert item["state"] == "leased" and q.pull("sh-sim-01", now=101) is None
    assert q.reap(now=200) == 1                              # the Mac died: the action returns to the queue
    commands = json.loads((ROOT / "policies" / "farm_commands.json").read_text())
    done = run_once("sh-sim-01", q, commands, execute=True)  # the action itself is dry-run: nothing is executed
    assert done["result"] == {"ok": True, "dry_run": True,
                              "would_run": ["xcrun simctl shutdown UDID-1", "xcrun simctl boot UDID-1"]}
    assert ActionQueue(tmp_path / "q.json").items[0]["state"] == "acked"


def test_farm_autopilot_does_not_stack_queued_actions(loop, event):
    driver, ctx = loop
    driver.submit(event("05_device_status"))
    first = len(ctx.outbox.of_kind("farm_action"))
    from harness.signals import Event
    driver.submit(Event("queue_timeout", "sh-and-02", {}))
    assert first == 12 and len(ctx.outbox.of_kind("farm_action")) == first


def test_dashboard_is_one_self_contained_file(tmp_path):
    f = ROOT / "fixtures"
    out = generate(f / "farm_snapshot.json", f / "farm_history.json", tmp_path / "d.html", ROOT / "policies" / "farm_policy.json")
    html = out.read_text()
    assert "http://" not in html and "https://" not in html          # no external assets
    for needle in ("Device Farm Monitor", "hub_fault", "Needs approval", "Dry-run", "sh-ios-03", "88%"):
        assert needle in html
