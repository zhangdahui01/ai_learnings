import json
import shutil
from pathlib import Path

import pytest

from harness.app import build
from harness.signals import Event

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def loop(tmp_path):
    """A full harness on a private copy of the knowledge base."""
    shutil.copytree(ROOT / "knowledge-base", tmp_path / "kb")
    driver, ctx = build(var=tmp_path / "var", kb_root=tmp_path / "kb")
    return driver, ctx


@pytest.fixture
def event():
    def load(name: str) -> Event:
        return Event.from_dict(json.loads((ROOT / "fixtures" / "events" / f"{name}.json").read_text()))
    return load


@pytest.fixture
def farm_data():
    f = ROOT / "fixtures"
    return json.loads((f / "farm_snapshot.json").read_text()), json.loads((f / "farm_history.json").read_text())
