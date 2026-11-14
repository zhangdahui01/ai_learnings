"""Adapter contract. Real implementations wrap read-only MCP servers or read-only API tokens.

System names are generic on purpose; map them to the real systems in config/systems.local.json
(not committed):
  gate_platform       - CI/CD quality-gate platform (triggers runs, owns gate reports)
  automation_service  - device/account allocation, task queue, farm status tables
  logs                - log store (runner pods, automation service, farm telemetry)
  scm                 - source control: PRs and diffs
  code_quality        - static analysis / build status
"""
from __future__ import annotations

from typing import Any, Protocol


class ReadOnlyViolation(Exception):
    pass


class GatePlatform(Protocol):
    def get_gate_run(self, report_id: str) -> dict[str, Any]: ...
    def list_gate_runs(self) -> list[dict[str, Any]]: ...
    def case_history(self, case_id: str) -> list[dict[str, Any]]: ...


class AutomationService(Protocol):
    def farm_snapshot(self) -> dict[str, Any]: ...
    def farm_history(self) -> list[dict[str, Any]]: ...
    def tasks_for_run(self, report_id: str) -> list[dict[str, Any]]: ...


class LogStore(Protocol):
    def query(self, selector: str, contains: str = "", limit: int = 50) -> list[dict[str, Any]]: ...


class Scm(Protocol):
    def get_pr(self, pr_id: str) -> dict[str, Any]: ...


class CodeQuality(Protocol):
    def build_status(self, ref: str) -> dict[str, Any]: ...


class Adapters:
    gate_platform: GatePlatform
    automation_service: AutomationService
    logs: LogStore
    scm: Scm
    code_quality: CodeQuality
