from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from harness.actions import Outbox
from harness.adapters.base import Adapters
from harness.brain import Brain
from harness.kb import KnowledgeBase

ROOT = Path(__file__).resolve().parent.parent


def policy(name: str) -> dict[str, Any]:
    return json.loads((ROOT / "policies" / f"{name}.json").read_text())


@dataclass
class Context:
    adapters: Adapters
    kb: KnowledgeBase
    outbox: Outbox
    brain: Brain = field(default_factory=Brain)
    graphs: dict[str, dict[str, Any]] = field(default_factory=dict)   # service -> normalized code graph
    farm_queue: Any = None
    default_channel: str = "#clientx-autopilot"
