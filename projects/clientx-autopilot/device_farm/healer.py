"""Healer policy gate: allowlist, budget, cooldown, approval. Everything is dry-run unless enabled."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from .actions import ACTION_TYPES, SCOPE, FarmAction
from .doctor import Diagnosis

DEFAULT_POLICY: dict[str, Any] = {
    "dry_run": True,
    "allowlist": list(ACTION_TYPES),
    "needs_approval": ["reset_mac"],
    "cooldown_s": {"default": 900, "reset_mac": 6 * 3600, "reinstall_app": 1800},
    "budget_per_mac_per_hour": 6,
    "min_confidence": 0.6,
}


@dataclass
class Decision:
    action_type: str | None
    target: str | None
    mac: str | None
    outcome: str            # enqueue | needs_approval | blocked | card_only | agent_task
    reason: str
    diagnosis: dict[str, Any]
    action: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def plan(diagnoses: list[Diagnosis], history: list[dict[str, Any]], now: float,
         policy: dict[str, Any] | None = None, approvals: set[str] | None = None) -> list[Decision]:
    policy = {**DEFAULT_POLICY, **(policy or {})}
    approvals = approvals or set()
    spent: dict[str, int] = {}
    for h in history:
        if h.get("action") in ACTION_TYPES and now - h.get("ts", 0) <= 3600:
            spent[h.get("mac", "")] = spent.get(h.get("mac", ""), 0) + 1

    decisions: list[Decision] = []
    for d in diagnoses:
        f, dd = d.finding, d.to_dict()
        if d.explained_by == "needs_agent":
            decisions.append(Decision(None, f.target, f.mac, "agent_task",
                                      "rules cannot explain this; evidence handed to the farm-doctor agent", dd))
            continue
        if not d.proposed_action:
            decisions.append(Decision(None, f.target, f.mac, "card_only", "no automatic action for this finding", dd))
            continue
        a = d.proposed_action
        for target in d.action_targets:
            mac = f.mac or target
            def blocked(reason: str) -> Decision:
                return Decision(a, target, mac, "blocked", reason, dd)
            if a not in policy["allowlist"]:
                decisions.append(blocked(f"{a} is not on the allowlist")); continue
            if d.confidence < policy["min_confidence"]:
                decisions.append(blocked(f"confidence {d.confidence} below {policy['min_confidence']}")); continue
            cooldown = policy["cooldown_s"].get(a, policy["cooldown_s"]["default"])
            last = max((h.get("ts", 0) for h in history if h.get("action") == a and h.get("target") == target), default=None)
            if last is not None and now - last < cooldown:
                decisions.append(blocked(f"cooldown: {a} ran on {target} {int(now - last)}s ago (<{cooldown}s)")); continue
            if a != "quarantine_device" and spent.get(mac, 0) >= policy["budget_per_mac_per_hour"]:
                decisions.append(blocked(f"budget: {spent[mac]} actions on {mac} in the last hour")); continue
            action = FarmAction(type=a, mac=mac, target=target, reason=d.cause,
                                device_kind=f.device_kind, dry_run=policy["dry_run"])
            if a in policy["needs_approval"] and f"{a}:{target}" not in approvals:
                decisions.append(Decision(a, target, mac, "needs_approval",
                                          f"{a} needs a person's approval ({SCOPE[a]} scope)", dd, action.to_dict()))
                continue
            spent[mac] = spent.get(mac, 0) + 1
            decisions.append(Decision(a, target, mac, "enqueue",
                                      "dry-run: recorded, not executed" if policy["dry_run"] else "allowed by policy",
                                      dd, action.to_dict()))
    return decisions
