"""Append-only event ledger. Every event and what the driver did with it is recorded."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

STATUSES = {"received", "merged", "routed", "unrouted", "suspended", "resumed", "done",
            "dropped_hop_limit", "failed"}


class Ledger:
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path) if path else None
        self.entries: list[dict[str, Any]] = []
        if self.path and self.path.exists():
            self.entries = [json.loads(line) for line in self.path.read_text().splitlines() if line.strip()]

    def record(self, event_id: str, status: str, **detail: Any) -> dict[str, Any]:
        if status not in STATUSES:
            raise ValueError(f"unknown ledger status: {status}")
        entry = {"ts": time.time(), "event_id": event_id, "status": status, **detail}
        self.entries.append(entry)
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a") as fh:
                fh.write(json.dumps(entry, sort_keys=True) + "\n")
        return entry

    def history(self, event_id: str) -> list[dict[str, Any]]:
        return [e for e in self.entries if e["event_id"] == event_id]

    def last_status(self, event_id: str) -> str | None:
        hist = self.history(event_id)
        return hist[-1]["status"] if hist else None
