"""Farm Doctor: for what the monitor rules cannot explain on their own.

It reads the recovery history before an action is proposed again. If the same recovery was
already tried and did not hold, repeating it is not a fix: the Doctor changes the diagnosis,
escalates the action, or hands the case to the farm-doctor agent with the evidence collected.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from .monitor import Finding

REPEAT_WINDOW_S = 24 * 3600
REPEAT_LIMIT = 3
ESCALATION = {
    "restart_wda": ("reinstall_app", "WDA keeps dying after restarts: suspect a broken WDA/app install or an expired signing profile"),
    "restart_emulator": ("reset_mac", "The emulator keeps dying after restarts: suspect host resources or a corrupted AVD/simulator image"),
    "restart_appium": ("reset_mac", "Appium keeps dying after restarts: suspect the host (ports, node process leak, disk)"),
    "restart_proxy": ("reset_mac", "mitmproxy keeps dying after restarts: suspect the host network or certificate store"),
    "reinstall_app": ("quarantine_device", "Reinstall keeps failing: suspect the device storage or the build itself"),
}


@dataclass
class Diagnosis:
    finding: Finding
    cause: str
    confidence: float
    proposed_action: str | None
    action_targets: list[str]
    explained_by: str                      # "rule" | "doctor" | "needs_agent"
    evidence: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["finding"] = self.finding.to_dict()
        return data


def _recent(history: list[dict[str, Any]], now: float, target: str, action: str | None = None) -> list[dict[str, Any]]:
    return [h for h in history
            if h.get("target") == target and now - h.get("ts", 0) <= REPEAT_WINDOW_S
            and (action is None or h.get("action") == action)]


def diagnose(findings: list[Finding], history: list[dict[str, Any]], now: float) -> list[Diagnosis]:
    out: list[Diagnosis] = []
    for f in findings:
        evidence = list(f.evidence)
        action, targets = f.proposed_action, list(f.action_targets)
        cause, confidence, by = f.summary, 0.9, "rule"

        if action in ESCALATION and len(targets) == 1:
            tried = _recent(history, now, targets[0], action)
            if len(tried) >= REPEAT_LIMIT:
                escalated, why = ESCALATION[action]
                evidence.append(f"{action} already ran {len(tried)}x on {targets[0]} in the last 24h and the fault returned")
                cause, confidence, by = why, 0.7, "doctor"
                action = escalated
                targets = [f.mac] if escalated == "reset_mac" and f.mac else targets

        if f.rule in ("queue_stuck", "disk_low"):
            # Rules see the symptom but not the cause: collect what is known and ask the agent.
            related = [h for h in history if h.get("mac") == f.mac and now - h.get("ts", 0) <= REPEAT_WINDOW_S]
            evidence.append(f"{len(related)} recovery actions on {f.mac} in the last 24h")
            cause, confidence, by, action, targets = f"{f.summary}; cause not explained by rules", 0.4, "needs_agent", None, []

        if f.rule == "device_offline":
            flaps = [h for h in _recent(history, now, f.target) if h.get("action") == "status_change"]
            if len(flaps) >= 4:
                evidence.append(f"{f.target} changed online/offline {len(flaps)}x in 24h")
                cause, confidence, by = f"{f.target} is flapping: suspect its cable or hub port", 0.75, "doctor"

        out.append(Diagnosis(f, cause, confidence, action, targets, by, evidence))
    return out
