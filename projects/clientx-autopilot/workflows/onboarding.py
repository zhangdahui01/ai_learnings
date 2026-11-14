"""Service Onboarding: one kit per role, delivered as one pull request.

inventory -> KB baseline -> smoke cases -> config PR -> warn mode -> gate live.
"""
from __future__ import annotations

import json
from typing import Any

from harness.driver import WorkflowResult
from harness.signals import Event

from .common import Context

REQUIRED = ("role", "service", "owner", "repo", "stack", "slack_channel")
RUNNER_IMAGE = {"web": "runner-web-playwright", "app": "mac-execution-engine"}


def build_kit(inv: dict[str, Any]) -> dict[str, str]:
    """Everything a role needs, as files for the config repo."""
    role, service = inv["role"], inv["service"]
    config = {
        "role": role, "service": service, "owner": inv["owner"], "stack": inv["stack"],
        "mode": "warn",                                  # starts non-blocking; a person flips it to "gate"
        "gates": inv.get("gates", ["ci", "cd"]),
        "runner": {"image": inv.get("runner_image", RUNNER_IMAGE.get(inv["stack"], "runner-generic")),
                   "cluster": inv.get("cluster", "TODO: cluster")},
        "environment_refresh": {"trigger": "pr_merge", "targets": inv.get("staging_targets", [service])},
        "accounts": {"pool": inv.get("account_pool", "TODO: account pool"), "lock": True},
        "proxy_routes": inv.get("proxy_routes", [{"match": f"{service}.*", "to": "staging"}]),
        "notify": {"slack_channel": inv["slack_channel"], "owner": inv["owner"]},
        "smoke_cases": inv.get("smoke_journeys", []),
    }
    if inv["stack"] == "app":
        config["devices"] = inv.get("devices", {"android-emulator": 2, "ios-simulator": 1, "ios-real": 1})
    kb = lambda layer, body: json.dumps({"service": service, "layer": layer, **body}, indent=2) + "\n"
    return {
        f"roles/{role}.json": json.dumps(config, indent=2) + "\n",
        f"knowledge-base/{service}/strategic.json": kb("strategic", {"coverage_map": {
            "smoke": [], "journeys": [{"id": j, "name": j, "priority": "P0", "code_paths": [], "cases": []}
                                      for j in inv.get("smoke_journeys", [])], "incidents": []}}),
        f"knowledge-base/{service}/analytical.json": kb("analytical", {"failure_patterns": {}}),
        f"knowledge-base/{service}/operational.json": kb("operational", {"selectors": {}, "environments": {}}),
    }


def make_handler(c: Context):
    def handle(event: Event) -> WorkflowResult:
        inv = event.payload
        missing = [k for k in REQUIRED if not inv.get(k)]
        if missing:
            c.outbox.slack_card(channel=c.default_channel, module="onboarding", verdict=None,
                                title=f"Onboarding {inv.get('role', event.subject)}: inventory is incomplete",
                                suggested_action=f"Provide: {', '.join(missing)}", extra={"missing": missing})
            return WorkflowResult("onboarding", f"blocked: missing {missing}", data={"missing": missing})
        files = build_kit(inv)
        todos = [f"{path}: {line.strip()}" for path, text in files.items() for line in text.splitlines() if "TODO" in line]
        pr = c.outbox.pull_request(
            repo=inv.get("config_repo", "gate-config"), module="onboarding", files=files,
            title=f"[onboarding] {inv['role']}: role config, knowledge-base baseline (warn mode)",
            body="Generated kit: role config, runner image, environment-refresh mapping, accounts, proxy routes, "
                 "notification owner, knowledge-base skeleton. The role starts in warn mode.\n\nOpen items:\n"
                 + ("\n".join(f"- {t}" for t in todos) or "- none"))
        c.outbox.agent_task(agent="onboarding", module="onboarding",
                            task="Fill the knowledge-base baseline: scan the repo with code_graph.scan, read PRD and manual "
                                 "cases, list core journeys with code paths. Then request smoke cases from Case Factory.",
                            context={"inventory": inv, "pr": pr["id"]})
        follow_ups = [event.child("new_feature", f"{inv['service']}:smoke:{j}",
                                  {"service": inv["service"], "stack": inv["stack"], "title": f"smoke case for journey {j}"})
                      for j in inv.get("smoke_journeys", [])]
        return WorkflowResult("onboarding", f"{inv['role']}: kit PR prepared, {len(todos)} open item(s)",
                              follow_ups=follow_ups, data={"pr": pr["id"], "todos": todos, "mode": "warn"})
    return handle
