"""Run graph: join one gate run to its PR, role, tasks, devices, cases and evidence.

The IDs already exist in the runtime systems; nothing new is collected, it is only joined.
PR -> role -> gate run (report_id) -> Mac task (task_id, mac) -> device run -> case result -> evidence
"""
from __future__ import annotations

from typing import Any

from .adapters.base import Adapters


def build(adapters: Adapters, report_id: str) -> dict[str, Any]:
    run = adapters.gate_platform.get_gate_run(report_id)
    pr = adapters.scm.get_pr(run["pr"]) if run.get("pr") else None
    tasks = {t["task_id"]: dict(t, cases=[]) for t in run.get("tasks", [])}
    unassigned: list[dict[str, Any]] = []
    for case in run.get("cases", []):
        (tasks[case["task_id"]]["cases"] if case.get("task_id") in tasks else unassigned).append(case)
    return {
        "report_id": report_id,
        "gate": run.get("gate"),
        "role": run.get("role"),
        "platform": run.get("platform"),
        "status": run.get("status"),
        "pr": pr,
        "build": adapters.code_quality.build_status(run["pr"]) if run.get("pr") else None,
        "environment": run.get("environment", {}),
        "accounts": run.get("accounts", {}),
        "install": run.get("install", {}),
        "route": run.get("route", {}),
        "tasks": list(tasks.values()),
        "cases_without_task": unassigned,
        "cases": run.get("cases", []),
    }


def failed_cases(graph: dict[str, Any]) -> list[dict[str, Any]]:
    return [c for c in graph["cases"] if c.get("status") == "failed"]
