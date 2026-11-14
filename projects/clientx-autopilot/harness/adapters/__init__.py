"""Read-only adapters to the runtime systems. No adapter exposes a write method."""
from .base import Adapters, ReadOnlyViolation
from .fixture import FixtureAdapters

__all__ = ["Adapters", "FixtureAdapters", "ReadOnlyViolation"]
