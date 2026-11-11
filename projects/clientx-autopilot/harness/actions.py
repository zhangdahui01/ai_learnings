"""Actions: the only three ways the harness may change anything.

1. pull_request  - cases, fixes, role config. A person reviews and merges.
2. slack_card    - verdict, evidence, suggested action. A person decides.
3. farm_action   - an allowlisted typed action placed in the pull queue. The Mac pulls it.

`agent_task` is not a write: it hands work to the agent runtime the user chose.
Nothing here holds a production write credential. By default everything is written to a
local outbox directory (dry-run); a transport must be plugged in explicitly to deliver.
"""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Callable

KINDS = ("pull_request", "slack_card", "farm_action", "agent_task")
Transport = Callable[[str, dict[str, Any]], None]


class ForbiddenAction(Exception):
    pass


class Outbox:
    def __init__(self, root: str | Path, *, dry_run: bool = True,
                 transports: dict[str, Transport] | None = None) -> None:
        self.root = Path(root)
        self.dry_run = dry_run
        self.transports = transports or {}
        self.items: list[dict[str, Any]] = []

    def _emit(self, kind: str, body: dict[str, Any]) -> dict[str, Any]:
        if kind not in KINDS:
            raise ForbiddenAction(f"'{kind}' is not one of the allowed ways to act: {KINDS}")
        item = {"id": uuid.uuid4().hex[:12], "kind": kind, "ts": time.time(),
                "dry_run": self.dry_run, **body}
        folder = self.root / kind
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{item['id']}.json").write_text(json.dumps(item, indent=2, sort_keys=True))
        self.items.append(item)
        if not self.dry_run:
            transport = self.transports.get(kind)
            if transport is None:
                raise ForbiddenAction(f"no transport configured for '{kind}'; refusing to deliver")
            transport(kind, item)
        return item

    def pull_request(self, *, repo: str, title: str, files: dict[str, str], body: str,
                     module: str, evidence: list[dict[str, str]] | None = None) -> dict[str, Any]:
        return self._emit("pull_request", {"repo": repo, "title": title, "files": files, "body": body,
                                           "module": module, "evidence": evidence or [],
                                           "requires": "human review and merge"})

    def slack_card(self, *, channel: str, title: str, verdict: dict[str, Any] | None,
                   suggested_action: str, module: str, decision_key: str | None = None,
                   extra: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._emit("slack_card", {"channel": channel, "title": title, "verdict": verdict,
                                         "suggested_action": suggested_action, "module": module,
                                         "decision_key": decision_key, **(extra or {})})

    def farm_action(self, action: dict[str, Any]) -> dict[str, Any]:
        return self._emit("farm_action", {"action": action, "module": "farm_autopilot"})

    def agent_task(self, *, agent: str, task: str, context: dict[str, Any], module: str) -> dict[str, Any]:
        return self._emit("agent_task", {"agent": agent, "task": task, "context": context, "module": module})

    def of_kind(self, kind: str) -> list[dict[str, Any]]:
        return [i for i in self.items if i["kind"] == kind]
