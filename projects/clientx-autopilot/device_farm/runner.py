"""Action runner: the Mac-side half. Pulls an action from the queue, runs it locally, acks.

Runs on each farm Mac next to the device-local agent. Commands come from
policies/farm_commands.json so each site can map an action type to its own scripts.
In dry-run (the default) the command is resolved and reported but never executed.

    python -m device_farm.runner --mac sh-and-01 --queue var/farm_queue.json [--execute]
"""
from __future__ import annotations

import argparse
import json
import shlex
import subprocess
from pathlib import Path
from typing import Any

from .actions import ActionQueue

DEFAULT_COMMANDS = Path(__file__).resolve().parent.parent / "policies" / "farm_commands.json"


def resolve(action: dict[str, Any], commands: dict[str, Any]) -> list[list[str]]:
    by_kind = commands.get(action["type"], {})
    templates = by_kind.get(action.get("device_kind") or "", by_kind.get("default"))
    if not templates:
        raise KeyError(f"no command configured for {action['type']} on {action.get('device_kind')}")
    values = {"target": action["target"], "mac": action["mac"]}
    return [[part.format(**values) for part in shlex.split(t)] for t in templates]


def run_once(mac: str, queue: ActionQueue, commands: dict[str, Any], execute: bool = False) -> dict[str, Any] | None:
    item = queue.pull(mac)
    if item is None:
        return None
    action = item["action"]
    try:
        argv_list = resolve(action, commands)
    except KeyError as exc:
        result: dict[str, Any] = {"ok": False, "error": str(exc)}
    else:
        if not execute or action.get("dry_run", True):
            result = {"ok": True, "dry_run": True, "would_run": [" ".join(a) for a in argv_list]}
        else:
            steps = []
            ok = True
            for argv in argv_list:
                proc = subprocess.run(argv, capture_output=True, text=True, timeout=300)
                steps.append({"cmd": " ".join(argv), "exit": proc.returncode, "stderr": proc.stderr[-500:]})
                if proc.returncode != 0:
                    ok = False
                    break
            result = {"ok": ok, "dry_run": False, "steps": steps}
    queue.ack(action["id"], result)
    return {"action": action, "result": result}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--mac", required=True)
    ap.add_argument("--queue", required=True)
    ap.add_argument("--commands", default=str(DEFAULT_COMMANDS))
    ap.add_argument("--execute", action="store_true", help="really run commands (still skipped for dry-run actions)")
    args = ap.parse_args()
    queue = ActionQueue(args.queue)
    commands = json.loads(Path(args.commands).read_text())
    while (done := run_once(args.mac, queue, commands, args.execute)) is not None:
        print(json.dumps(done, indent=2))


if __name__ == "__main__":
    main()
