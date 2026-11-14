"""Brain: rules before model, evidence before verdict, confidence decides who acts."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Protocol


@dataclass
class Evidence:
    source: str     # which system the fact came from: gate-platform, automation-service, logs, scm ...
    ref: str        # a link or id a person can open
    summary: str    # the fact, in one line

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


@dataclass
class Verdict:
    category: str
    confidence: float
    evidence: list[Evidence]
    suggested_action: str
    decided_by: str = "rule"            # "rule" | "model" | "none"
    detail: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.evidence:
            raise ValueError("a verdict must cite evidence")
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("confidence must be within [0, 1]")

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["evidence"] = [e.to_dict() for e in self.evidence]
        return data


Rule = Callable[[dict[str, Any]], "Verdict | None"]


class ModelClient(Protocol):
    """The agent runtime is the user's choice; the harness only needs this one call."""

    def propose(self, task: str, context: dict[str, Any]) -> Verdict | None: ...


@dataclass
class ConfidencePolicy:
    propose_at: float = 0.6     # below this the card says "needs investigation", no suggestion
    auto_at: float = 0.9        # only rule verdicts at/above this may trigger automatic follow-ups

    def mode(self, verdict: Verdict) -> str:
        if verdict.decided_by == "rule" and verdict.confidence >= self.auto_at:
            return "auto_follow_up"
        if verdict.confidence >= self.propose_at:
            return "propose"
        return "needs_human"


class Brain:
    def __init__(self, model: ModelClient | None = None, policy: ConfidencePolicy | None = None) -> None:
        self.model = model
        self.policy = policy or ConfidencePolicy()

    def decide(self, rules: list[Rule], context: dict[str, Any], *, model_task: str | None = None,
               fallback_evidence: list[Evidence] | None = None) -> Verdict:
        """Run rules in order; the first one that fires gives the verdict.

        The model is asked only when no rule fires and a model_task is given.
        """
        for rule in rules:
            verdict = rule(context)
            if verdict is not None:
                return verdict
        if self.model is not None and model_task:
            verdict = self.model.propose(model_task, context)
            if verdict is not None:
                verdict.decided_by = "model"
                return verdict
        return Verdict(
            category="unknown", confidence=0.0, decided_by="none",
            evidence=fallback_evidence or [Evidence("harness", "-", "all rule checks passed; no model verdict")],
            suggested_action="A person investigates; no automatic action.",
        )
