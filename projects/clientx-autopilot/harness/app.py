"""Wire the harness: adapters + knowledge base + outbox + the six workflows + the driver."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from device_farm.actions import ActionQueue
from workflows import case_care, case_factory, coverage, farm_autopilot, onboarding, release_guard
from workflows.common import ROOT, Context

from .actions import Outbox
from .adapters import FixtureAdapters
from .brain import Brain
from .driver import Driver
from .kb import KnowledgeBase
from .ledger import Ledger


def load_graphs(folder: Path) -> dict[str, dict[str, Any]]:
    return {p.stem: json.loads(p.read_text()) for p in sorted(folder.glob("*.json"))} if folder.is_dir() else {}


def build(*, fixtures: str | Path = ROOT / "fixtures", kb_root: str | Path = ROOT / "knowledge-base",
          var: str | Path = ROOT / "var", adapters: Any = None, brain: Brain | None = None,
          graphs: dict[str, dict[str, Any]] | None = None) -> tuple[Driver, Context]:
    fixtures, var = Path(fixtures), Path(var)
    if graphs is None:
        graphs = {**load_graphs(fixtures / "code_graph"), **load_graphs(var / "code-graph")}
    ctx = Context(adapters=adapters or FixtureAdapters(fixtures, overlay=var / "runtime"), kb=KnowledgeBase(kb_root),
                  outbox=Outbox(var / "outbox", dry_run=True), brain=brain or Brain(), graphs=graphs,
                  farm_queue=ActionQueue(var / "farm_queue.json"))
    handlers = {
        "release_guard": release_guard.make_handler(ctx),
        "gate_selection": release_guard.select_handler(ctx),
        "case_care": case_care.make_handler(ctx),
        "coverage": coverage.make_handler(ctx),
        "case_factory": case_factory.make_handler(ctx),
        "onboarding": onboarding.make_handler(ctx),
        "farm_autopilot": farm_autopilot.make_handler(ctx),
    }
    driver = Driver.from_policy(ROOT / "policies" / "routing.json", handlers, ledger=Ledger(var / "ledger.jsonl"),
                                state_path=var / "suspended.json")
    return driver, ctx
