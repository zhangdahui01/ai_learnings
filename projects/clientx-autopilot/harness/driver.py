"""Driver: records every event, routes it by rule, merges duplicates, limits hops, suspends."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .ledger import Ledger
from .signals import Event


@dataclass
class WorkflowResult:
    workflow: str
    summary: str
    follow_ups: list[Event] = field(default_factory=list)
    wait_for: str | None = None          # decision key: the workflow is suspended until a person answers
    data: dict[str, Any] = field(default_factory=dict)


Handler = Callable[[Event], WorkflowResult]


def _matches(when: dict[str, Any], payload: dict[str, Any]) -> bool:
    for key, expected in when.items():
        actual = payload.get(key)
        if isinstance(expected, list):
            if actual not in expected:
                return False
        elif actual != expected:
            return False
    return True


class Driver:
    def __init__(self, routes: list[dict[str, Any]], handlers: dict[str, Handler], *,
                 ledger: Ledger | None = None, hop_limit: int = 4, merge_window_s: float = 300.0,
                 state_path: str | Path | None = None) -> None:
        self.routes = routes
        self.handlers = handlers
        self.ledger = ledger or Ledger()
        self.hop_limit = hop_limit
        self.merge_window_s = merge_window_s
        self._open: dict[str, Event] = {}            # fingerprint -> event being handled or suspended
        self._recent: dict[str, float] = {}          # fingerprint -> ts of last handled event
        self.results: list[WorkflowResult] = []
        # decision key -> {"event": ..., "workflow": ..., "summary": ...}; persisted so that a
        # person can answer a card long after the process that sent it has exited
        self.state_path = Path(state_path) if state_path else None
        self.suspended: dict[str, dict[str, Any]] = {}
        if self.state_path and self.state_path.exists():
            self.suspended = json.loads(self.state_path.read_text())

    def _save_state(self) -> None:
        if self.state_path:
            self.state_path.parent.mkdir(parents=True, exist_ok=True)
            self.state_path.write_text(json.dumps(self.suspended, indent=2))

    @classmethod
    def from_policy(cls, path: str | Path, handlers: dict[str, Handler], **kw: Any) -> "Driver":
        policy = json.loads(Path(path).read_text())
        return cls(policy["routes"], handlers, hop_limit=policy.get("hop_limit", 4),
                   merge_window_s=policy.get("merge_window_s", 300.0), **kw)

    def route(self, event: Event) -> list[str]:
        return [r["workflow"] for r in self.routes
                if r["event"] == event.type and _matches(r.get("when", {}), event.payload)]

    def submit(self, event: Event) -> list[WorkflowResult]:
        self.ledger.record(event.id, "received", type=event.type, subject=event.subject, hop=event.hop)
        if event.type == "human_decision":
            return self._resume(event)
        if event.hop > self.hop_limit:
            self.ledger.record(event.id, "dropped_hop_limit", hop=event.hop, limit=self.hop_limit)
            return []
        fp = event.fingerprint
        last = self._recent.get(fp)
        if fp in self._open or (last is not None and event.ts - last < self.merge_window_s):
            self.ledger.record(event.id, "merged", into=fp)
            return []
        workflows = self.route(event)
        if not workflows:
            self.ledger.record(event.id, "unrouted")
            return []
        self._open[fp] = event
        out: list[WorkflowResult] = []
        suspended = False
        for name in workflows:
            self.ledger.record(event.id, "routed", workflow=name)
            try:
                result = self.handlers[name](event)
            except Exception as exc:  # a failing workflow must not stop the loop
                self.ledger.record(event.id, "failed", workflow=name, error=repr(exc))
                continue
            out.append(result)
            self.results.append(result)
            if result.wait_for:
                suspended = True
                self.suspended[result.wait_for] = {"event": event.to_dict(), "workflow": name,
                                                   "summary": result.summary}
                self._save_state()
                self.ledger.record(event.id, "suspended", workflow=name, wait_for=result.wait_for)
            for follow_up in result.follow_ups:
                out.extend(self.submit(follow_up))
        self._recent[fp] = event.ts
        if not suspended:
            self._open.pop(fp, None)
            self.ledger.record(event.id, "done")
        return out

    def _resume(self, decision: Event) -> list[WorkflowResult]:
        key = decision.subject
        if key not in self.suspended:
            self.ledger.record(decision.id, "unrouted", reason="no suspended workflow for this decision")
            return []
        state = self.suspended.pop(key)
        self._save_state()
        event = Event.from_dict(state["event"])
        result = WorkflowResult(state["workflow"], state["summary"])
        self._open.pop(event.fingerprint, None)
        self.ledger.record(event.id, "resumed", decision=decision.payload.get("decision"),
                           by=decision.payload.get("by"))
        self.ledger.record(event.id, "done")
        result.data["human_decision"] = decision.payload
        return [result]
