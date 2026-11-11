"""Harness CLI.

    python -m harness emit fixtures/events/01_cd_gate_device.json   # one event through the loop
    python -m harness demo                                          # replay every fixture event
    python -m harness decide gate:gr-1001 block --by alice          # a person answers a card
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from workflows.common import ROOT

from .app import build
from .signals import Event


def _print(results, ctx) -> None:
    for r in results:
        print(f"  [{r.workflow}] {r.summary}" + (f"  (waiting for: {r.wait_for})" if r.wait_for else ""))
    kinds = {}
    for item in ctx.outbox.items:
        kinds[item["kind"]] = kinds.get(item["kind"], 0) + 1
    print(f"  outbox so far: {kinds}")


def main() -> None:
    ap = argparse.ArgumentParser(prog="harness")
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("emit"); e.add_argument("event")
    sub.add_parser("demo")
    d = sub.add_parser("decide"); d.add_argument("key"); d.add_argument("decision"); d.add_argument("--by", required=True)
    ap.add_argument("--var", default=str(ROOT / "var"))
    args = ap.parse_args()
    var = Path(args.var)
    if args.cmd == "demo":      # the demo works on a copy so the committed knowledge base stays clean
        shutil.rmtree(var, ignore_errors=True)
        shutil.copytree(ROOT / "knowledge-base", var / "knowledge-base")
        driver, ctx = build(var=var, kb_root=var / "knowledge-base")
    else:
        driver, ctx = build(var=var)
    if args.cmd == "emit":
        paths = [Path(args.event)]
    elif args.cmd == "demo":
        paths = sorted((ROOT / "fixtures" / "events").glob("*.json"))
    else:
        done = driver.submit(Event("human_decision", args.key, {"decision": args.decision, "by": args.by}, source="human"))
        print(f"{args.key}: " + (f"resumed {done[0].workflow} with '{args.decision}' by {args.by}" if done
                                 else "no suspended workflow is waiting for this key"))
        return
    for path in paths:
        event = Event.from_dict(json.loads(path.read_text()))
        print(f"{path.name}: {event.type} {event.subject}")
        _print(driver.submit(event), ctx)
    print(f"\nledger: {driver.ledger.path}  outbox: {ctx.outbox.root}")


if __name__ == "__main__":
    main()
