"""One pass of Farm Autopilot: snapshot -> findings -> diagnoses -> policy decisions."""
from __future__ import annotations

import time
from typing import Any

from . import doctor, healer, monitor
from .model import Farm


def run(snapshot: dict[str, Any], history: list[dict[str, Any]], policy: dict[str, Any] | None = None,
        now: float | None = None, approvals: set[str] | None = None) -> dict[str, Any]:
    now = now or snapshot.get("now_ts") or time.time()
    farm = Farm.from_snapshot(snapshot)
    findings = monitor.evaluate(farm)
    diagnoses = doctor.diagnose(findings, history, now)
    decisions = healer.plan(diagnoses, history, now, policy, approvals)
    return {"farm": farm, "findings": findings, "diagnoses": diagnoses, "decisions": decisions, "now": now}
