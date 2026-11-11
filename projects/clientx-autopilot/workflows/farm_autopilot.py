"""Farm Autopilot: monitor, diagnose and heal over the pull channel.

Wakes on a device status push, a queue timeout, a device fault suspected by Release Guard,
or the daily schedule. Produces typed farm actions (dry-run by default), cards for what a
person must decide, and agent tasks for what the rules cannot explain.
"""
from __future__ import annotations

from device_farm import pipeline
from device_farm.actions import FarmAction
from harness.driver import WorkflowResult
from harness.signals import Event

from .common import Context, policy


def make_handler(c: Context):
    def handle(event: Event) -> WorkflowResult:
        snapshot = event.payload.get("snapshot") or c.adapters.automation_service.farm_snapshot()
        history = c.adapters.automation_service.farm_history()
        result = pipeline.run(snapshot, history, policy("farm_policy"),
                              approvals=set(event.payload.get("approvals", [])))
        focus = event.payload.get("mac")
        decisions = [d for d in result["decisions"] if not focus or d.mac == focus]
        pending = {(i["action"]["type"], i["action"]["target"]) for i in (c.farm_queue.items if c.farm_queue else [])
                   if i["state"] in ("queued", "leased")}
        for d in decisions:
            if d.outcome == "enqueue":
                if (d.action_type, d.target) in pending:      # already waiting in the queue: do not stack it
                    d.outcome, d.reason = "blocked", "the same action is already queued for this target"
                    continue
                pending.add((d.action_type, d.target))
                c.outbox.farm_action(d.action)
                if c.farm_queue is not None:
                    c.farm_queue.enqueue(FarmAction(**d.action))
            elif d.outcome == "agent_task":
                c.outbox.agent_task(agent="farm-doctor", module="farm_autopilot",
                                    task="Find the cause from status history and logs; propose one allowlisted action "
                                         "or state that a person must look. Cite evidence.",
                                    context={"diagnosis": d.diagnosis, "from_event": event.type})
        need_person = [d for d in decisions if d.outcome == "needs_approval" or (d.outcome == "blocked" and "already queued" not in d.reason)]
        critical = [f for f in result["findings"] if f.severity == "critical" and (not focus or f.mac == focus)]
        if need_person or critical:
            c.outbox.slack_card(
                channel="#device-farm-oncall", module="farm_autopilot", verdict=None,
                title=f"Device farm: {len(critical)} critical finding(s), {len(need_person)} action(s) need a person",
                suggested_action="Approve or reject the listed actions; runs are moved to healthy Macs meanwhile.",
                extra={"critical": [f.to_dict() for f in critical],
                       "needs_person": [{"action": d.action_type, "target": d.target, "outcome": d.outcome,
                                         "reason": d.reason} for d in need_person]})
        counts = {o: sum(d.outcome == o for d in decisions) for o in ("enqueue", "needs_approval", "blocked", "agent_task")}
        return WorkflowResult("farm_autopilot", f"{len(result['findings'])} finding(s); {counts}",
                              data={"counts": counts, "findings": [f.to_dict() for f in result["findings"]]})
    return handle
