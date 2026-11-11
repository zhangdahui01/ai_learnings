"""Harness CLI.

    python -m harness emit fixtures/events/01_cd_gate_device.json   # one event through the loop
    python -m harness demo                                          # replay every fixture event
    python -m harness decide gate:gr-1001 block --by alice          # a person answers a card
    python -m harness feature --service S --stack web --title "..." [--input prd.md]   # ask Case Factory for a case
    python -m harness ingest --web automation/web/test-results/report.json --service S  # daily results -> diagnosis -> Case Care
    python -m harness ingest --app var/app-junit.xml --service S
    python -m harness agents [--run] [--agent healer] [--limit 3]  # compose (and with --run execute) pending agent tasks
"""
from __future__ import annotations

import argparse
import json
import shutil
import time
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
    f = sub.add_parser("feature"); f.add_argument("--service", required=True); f.add_argument("--stack", required=True, choices=["web", "app"])
    f.add_argument("--title", required=True); f.add_argument("--input"); f.add_argument("--kind", default="progression", choices=["progression", "regression"])
    i = sub.add_parser("ingest"); i.add_argument("--web"); i.add_argument("--app"); i.add_argument("--service", required=True)
    i.add_argument("--origin", default="daily", choices=["daily"]); i.add_argument("--pr"); i.add_argument("--evidence-dir")
    a = sub.add_parser("agents"); a.add_argument("--run", action="store_true"); a.add_argument("--agent"); a.add_argument("--limit", type=int)
    ap.add_argument("--var", default=str(ROOT / "var"))
    args = ap.parse_args()
    var = Path(args.var)
    if args.cmd == "demo":      # the demo works on a copy so the committed knowledge base stays clean
        shutil.rmtree(var, ignore_errors=True)
        shutil.copytree(ROOT / "knowledge-base", var / "knowledge-base")
        driver, ctx = build(var=var, kb_root=var / "knowledge-base")
    else:
        driver, ctx = build(var=var)
    if args.cmd == "agents":
        from . import agent_runner
        done = agent_runner.run_pending(var, execute=args.run, agent=args.agent, limit=args.limit)
        for r in done:
            state = (f"exit {r['exit_code']}, status {(r.get('result') or {}).get('status', 'no result block')}"
                     if r["executed"] else "composed (not run; add --run)")
            print(f"  {r['agent']:13} {r['task_id']}  {r['template']:18} {state}\n      {r['prompt_file']}")
        print(f"{len(done)} task(s)")
        return
    if args.cmd == "feature":
        payload = {"service": args.service, "stack": args.stack, "title": args.title, "kind": args.kind,
                   "source_text": Path(args.input).read_text() if args.input else None}
        _print(driver.submit(Event("new_feature", f"{args.service}:{args.title}", payload)), ctx)
        return
    if args.cmd == "ingest":
        from . import results
        parsed = (results.parse_playwright_report(args.web) if args.web else []) + \
                 (results.parse_junit(args.app, args.evidence_dir) if args.app else [])
        print(json.dumps(results.summarize(parsed)))
        event = results.to_case_failure_event(parsed, origin=args.origin, service=args.service,
                                              run_id=time.strftime("%Y%m%d-%H%M%S"), pr=args.pr)
        drift = results.locator_drift(parsed)
        if drift:
            for d in drift:
                print(f"  drift  {d['case']:21} passed on {d['note']}")
            ctx.outbox.agent_task(agent="healer", module="case_care",
                                  task="These cases pass only through a fallback locator. Make the fallback the primary "
                                       "contract in the page object, keep every assertion, rerun, then call submit_patch.",
                                  context={"kind": "locator", "level": "auto", "service": args.service, "stack": "web",
                                           "group": "locator|fallback-in-use", "cases": sorted({d["case"] for d in drift}),
                                           "drift": drift})
        if event is None:
            print("no failures" + (f"; {len(drift)} locator drift note(s) sent to the healer" if drift else ""))
            return
        for f in event.payload["failures"]:
            print(f"  {f['case']:28} [{f['kind']}] {f['message'][:90]}")
        _print(driver.submit(event), ctx)
        return
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
