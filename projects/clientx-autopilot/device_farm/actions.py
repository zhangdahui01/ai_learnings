"""Typed farm actions and the queue the Mac pulls them from.

The harness never calls into the farm. It places an allowlisted action in the same kind of
pull queue that device tasks use today (lease, ack, reaper); the Mac pulls it over the
signed channel it already has, runs it locally and acks. No new inbound path, no new credential.
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

ACTION_TYPES = ("restart_appium", "restart_wda", "restart_emulator", "reinstall_app",
                "restart_proxy", "quarantine_device", "reset_mac")
SCOPE = {"restart_appium": "mac", "restart_proxy": "mac", "reset_mac": "mac",
         "restart_wda": "device", "restart_emulator": "device", "reinstall_app": "device",
         "quarantine_device": "device"}


@dataclass
class FarmAction:
    type: str
    mac: str
    target: str                      # mac id or device id
    reason: str
    device_kind: str | None = None
    dry_run: bool = True
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    created_at: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        if self.type not in ACTION_TYPES:
            raise ValueError(f"'{self.type}' is not an allowlisted farm action")

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ActionQueue:
    """File-backed stand-in for the typed task queue: enqueue, pull with a lease, ack, reap."""

    def __init__(self, path: str | Path | None = None, lease_s: float = 300.0) -> None:
        self.path = Path(path) if path else None
        self.lease_s = lease_s
        self.items: list[dict[str, Any]] = []
        if self.path and self.path.exists():
            self.items = json.loads(self.path.read_text())

    def _save(self) -> None:
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self.items, indent=2))

    def enqueue(self, action: FarmAction) -> dict[str, Any]:
        item = {"action": action.to_dict(), "state": "queued", "leased_until": None, "result": None}
        self.items.append(item)
        self._save()
        return item

    def pull(self, mac: str, now: float | None = None) -> dict[str, Any] | None:
        now = now or time.time()
        for item in self.items:
            if item["state"] == "queued" and item["action"]["mac"] == mac:
                item["state"], item["leased_until"] = "leased", now + self.lease_s
                self._save()
                return item
        return None

    def ack(self, action_id: str, result: dict[str, Any]) -> None:
        for item in self.items:
            if item["action"]["id"] == action_id:
                item["state"], item["result"] = "acked", result
        self._save()

    def reap(self, now: float | None = None) -> int:
        """Return expired leases to the queue (the Mac died mid-action)."""
        now = now or time.time()
        n = 0
        for item in self.items:
            if item["state"] == "leased" and item["leased_until"] < now:
                item["state"], item["leased_until"] = "queued", None
                n += 1
        self._save()
        return n
