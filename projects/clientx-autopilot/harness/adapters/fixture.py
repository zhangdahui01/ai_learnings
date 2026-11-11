"""Fixture-backed adapters: run the whole loop offline from sanitized sample data."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .base import Adapters


def _load(path: Path, default: Any) -> Any:
    return json.loads(path.read_text()) if path.exists() else default


class _GatePlatform:
    def __init__(self, root: Path) -> None:
        self._runs = {r["report_id"]: r for r in _load(root / "gate_runs.json", [])}
        self._history = _load(root / "case_history.json", {})

    def get_gate_run(self, report_id: str) -> dict[str, Any]:
        return self._runs[report_id]

    def list_gate_runs(self) -> list[dict[str, Any]]:
        return list(self._runs.values())

    def case_history(self, case_id: str) -> list[dict[str, Any]]:
        return self._history.get(case_id, [])


class _AutomationService:
    def __init__(self, root: Path, runs: _GatePlatform) -> None:
        self._root = root
        self._runs = runs

    def farm_snapshot(self) -> dict[str, Any]:
        return _load(self._root / "farm_snapshot.json", {})

    def farm_history(self) -> list[dict[str, Any]]:
        return _load(self._root / "farm_history.json", [])

    def tasks_for_run(self, report_id: str) -> list[dict[str, Any]]:
        return self._runs.get_gate_run(report_id).get("tasks", [])


class _Logs:
    def __init__(self, root: Path) -> None:
        self._lines = _load(root / "logs.json", [])

    def query(self, selector: str, contains: str = "", limit: int = 50) -> list[dict[str, Any]]:
        hits = [l for l in self._lines if selector in l.get("stream", "") and contains in l.get("line", "")]
        return hits[:limit]


class _Scm:
    def __init__(self, root: Path) -> None:
        self._prs = {p["id"]: p for p in _load(root / "prs.json", [])}

    def get_pr(self, pr_id: str) -> dict[str, Any]:
        return self._prs.get(pr_id, {"id": pr_id, "files": [], "title": "", "author": ""})


class _CodeQuality:
    def __init__(self, root: Path) -> None:
        self._builds = _load(root / "builds.json", {})

    def build_status(self, ref: str) -> dict[str, Any]:
        return self._builds.get(ref, {"ref": ref, "status": "unknown"})


class FixtureAdapters(Adapters):
    def __init__(self, root: str | Path) -> None:
        root = Path(root)
        self.gate_platform = _GatePlatform(root)
        self.automation_service = _AutomationService(root, self.gate_platform)
        self.logs = _Logs(root)
        self.scm = _Scm(root)
        self.code_quality = _CodeQuality(root)
