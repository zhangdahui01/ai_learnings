"""Knowledge base: per service, three layers, updated by every run and every verdict.

strategic    - business rules, journeys, priority, incident gaps      (from PRD, wiki, incidents)
analytical   - failure patterns, selector stability, reusable steps   (from runs and triage verdicts)
operational  - selectors, auth flows, preconditions, environments, code graph summary (from code, UI, case repos)
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

LAYERS = ("strategic", "analytical", "operational")


class KnowledgeBase:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)

    def services(self) -> list[str]:
        return sorted(p.name for p in self.root.iterdir() if p.is_dir() and not p.name.startswith("_"))

    def _path(self, service: str, layer: str) -> Path:
        if layer not in LAYERS:
            raise ValueError(f"unknown layer: {layer}")
        return self.root / service / f"{layer}.json"

    def load(self, service: str, layer: str) -> dict[str, Any]:
        path = self._path(service, layer)
        return json.loads(path.read_text()) if path.exists() else {}

    def save(self, service: str, layer: str, data: dict[str, Any]) -> None:
        path = self._path(service, layer)
        path.parent.mkdir(parents=True, exist_ok=True)
        data["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        path.write_text(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n")

    def record_verdict(self, service: str, verdict: dict[str, Any], *, report_id: str) -> None:
        data = self.load(service, "analytical")
        patterns = data.setdefault("failure_patterns", {})
        entry = patterns.setdefault(verdict["category"], {"count": 0, "last_reports": []})
        entry["count"] += 1
        entry["last_reports"] = ([report_id] + entry["last_reports"])[:10]
        self.save(service, "analytical", data)

    def record_selector(self, service: str, name: str, selector: str, *, source: str) -> None:
        data = self.load(service, "operational")
        data.setdefault("selectors", {})[name] = {"selector": selector, "source": source}
        self.save(service, "operational", data)

    def coverage_map(self, service: str) -> dict[str, Any]:
        return self.load(service, "strategic").get("coverage_map", {"journeys": []})
