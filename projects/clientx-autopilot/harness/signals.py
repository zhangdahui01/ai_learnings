"""Signals: the one event model shared by every automation stack."""
from __future__ import annotations

import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any

EVENT_TYPES = {
    "ci_gate_result",      # pre-merge Quality Gate: a selected subset of cases ran on a PR
    "cd_gate_result",      # post-merge Release Gate: regression on the staging environment
    "pr_merged",
    "pr_opened",           # asks for CI-gate case selection
    "device_status",       # farm status push (every 2 min and on change)
    "queue_timeout",       # a device task was not pulled / not acked in time
    "daily_schedule",
    "case_failure",        # failed cases (origin: daily | gate) -> Case Care
    "incident_closed",
    "coverage_gap",        # produced by Coverage Intelligence -> Case Factory
    "new_feature",         # a feature spec is ready -> Case Factory
    "new_role",            # a service/role asks to onboard
    "device_fault_suspected",  # produced by Release Guard -> Farm Autopilot
    "human_decision",      # resumes a suspended workflow
}


@dataclass
class Event:
    type: str
    subject: str                      # what the event is about: gate run id, device id, PR id ...
    payload: dict[str, Any] = field(default_factory=dict)
    source: str = "runtime"
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    ts: float = field(default_factory=time.time)
    hop: int = 0                      # how many harness-generated hops led to this event
    parent_id: str | None = None

    def __post_init__(self) -> None:
        if self.type not in EVENT_TYPES:
            raise ValueError(f"unknown event type: {self.type}")

    @property
    def fingerprint(self) -> str:
        """Events with the same fingerprint describe the same thing and are merged."""
        return f"{self.type}:{self.subject}"

    def child(self, type: str, subject: str, payload: dict[str, Any] | None = None) -> "Event":
        return Event(type=type, subject=subject, payload=payload or {}, source="harness",
                     hop=self.hop + 1, parent_id=self.id)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Event":
        return cls(**data)
