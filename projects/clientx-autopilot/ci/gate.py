"""CI/CD gate runner: select cases, run them, record the gate run, triage a red gate.

  ci  Quality Gate, before merge: the smoke set + gated cases of every journey the PR reaches.
      Red blocks the merge.
  cd  Release Gate, after merge on staging: every gated case of the service. Red blocks the release.

    python -m ci.gate plan     --gate ci --service sample-checkout --changed checkout/cart.ts
    python -m ci.gate run      --gate ci --service sample-checkout --pr PR-9 --changed checkout/cart.ts
    python -m ci.gate run      --gate cd --service sample-checkout --device-profile android-emulator
    python -m ci.gate register --service S --case web_x --journey j --stack web --spec x
    python -m ci.gate promote  --service S --case web_x --passes 7 --pass-rate 0.99 --signed-off-by qa
    python -m ci.gate status   --service S

Exit code: 0 green, 1 red, 2 usage. Cases in `warn` run but do not block. Nothing is retried and
nothing is repaired here. Zero selected cases, a missing result or a skipped case is red.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from code_graph import queries
from harness import results as res
from harness.app import build
from harness.signals import Event
from workflows import case_care
from workflows.common import ROOT, policy

WEB = ROOT / "automation" / "web"


def _cases(cmap: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {c["id"]: {**c, "journey": j["id"]} for j in cmap.get("journeys", []) for c in j.get("cases", [])}


def select(ctx, gate: str, service: str, changed: list[str]) -> dict[str, Any]:
    cmap = ctx.kb.coverage_map(service)
    cases = _cases(cmap)
    if gate == "ci":
        cfg = policy("gates")["ci"]["selection"]
        sel = queries.select_cases(ctx.graphs.get(service), changed, cmap, smoke=cmap.get("smoke", []),
                                   limit=cfg["limit"], states=("gated", "warn"))
        why, touched, uncovered = sel["cases"], sel["journeys"], sel["changed_without_case"]
    else:
        why = {cid: "release gate runs every gated case" for cid, c in cases.items() if c.get("state") in ("gated", "warn")}
        touched, uncovered = [], []
    blocking = {cid: r for cid, r in why.items() if cases.get(cid, {}).get("state", "gated") == "gated"}
    warn = {cid: r for cid, r in why.items() if cid not in blocking}
    quarantined = [cid for cid, c in cases.items() if c.get("state") == "quarantined"]
    return {"gate": gate, "service": service, "blocking": blocking, "warn": warn, "quarantined": quarantined,
            "journeys": touched, "changed_without_case": uncovered, "cases": cases}


def commands(sel: dict[str, Any], device_profile: str, out: Path) -> dict[str, Any]:
    ids = list(sel["blocking"]) + list(sel["warn"])
    cases = sel["cases"]
    app_tests = sorted({cases[i]["run"]["test"] for i in ids if cases[i].get("stack") == "app" and "test" in cases[i].get("run", {})})
    unmapped = [i for i in ids if not ({"spec", "test"} & set(cases[i].get("run", {})))]
    plan: dict[str, Any] = {"unmapped": unmapped, "web": None, "app": None}
    # a web case may name its own Playwright config and test folder (run.config / run.dir); default: the main suite
    groups: dict[tuple[str, str], set[str]] = {}
    for i in ids:
        run = cases[i].get("run", {})
        if cases[i].get("stack") == "web" and "spec" in run:
            groups.setdefault((run.get("config", ""), run.get("dir", "tests")), set()).add(run["spec"])
    for (config, folder), specs in sorted(groups.items()):
        key = "web" if not config else f"web:{config}"
        report = WEB / "test-results" / "report.json"
        plan[key] = {"cwd": str(WEB), "report": str(report), "stack": "web",
                     "argv": ["npx", "playwright", "test", *(["-c", config] if config else []),
                              *[f"{folder}/{s}.spec.ts" for s in sorted(specs)], "--retries=0", "--trace", "off"]}
    if app_tests:
        junit = out / "app-junit.xml"
        plan["app"] = {"cwd": str(ROOT), "report": str(junit), "stack": "app",
                       "argv": [sys.executable, "-m", "pytest", "automation/app/tests", "-q", "-p", "no:cacheprovider",
                                "-k", " or ".join(app_tests), "--device-profile", device_profile,
                                f"--junitxml={junit}"]}
    return plan


def execute(plan: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for name, step in plan.items():
        if name == "unmapped" or not step:
            continue
        stack = step["stack"]
        report = Path(step["report"])
        report.unlink(missing_ok=True)
        proc = subprocess.run(step["argv"], cwd=step["cwd"], capture_output=True, text=True)
        if not report.exists():
            out.append({"case": f"<{stack} run>", "stack": stack, "status": "failed", "runner_error": True,
                        "failure": {"kind": "unknown", "message": (proc.stderr or proc.stdout)[-300:]}})
            continue
        out.extend(res.parse_playwright_report(report) if stack == "web" else res.parse_junit(report))
    return out


def judge(sel: dict[str, Any], results: list[dict[str, Any]]) -> dict[str, Any]:
    cases = sel["cases"]
    by_key: dict[str, dict[str, Any]] = {}
    for r in results:
        by_key[r["case"] if r["stack"] == "web" else r.get("title", "")] = r
    rows = []
    for cid in list(sel["blocking"]) + list(sel["warn"]):
        run = cases[cid].get("run", {})
        r = by_key.get(run.get("spec") if cases[cid].get("stack") == "web" else run.get("test"))
        status = r["status"] if r else "missing"
        rows.append({"case": cid, "status": status, "blocking": cid in sel["blocking"],
                     "reason": sel["blocking"].get(cid) or sel["warn"].get(cid), "task_id": None,
                     **({"failure": r["failure"], "evidence": r.get("evidence", [])} if r and r.get("failure") else {})})
    reasons = []
    if not sel["blocking"]:
        reasons.append("zero blocking cases selected: nothing was verified")
    for row in rows:
        if row["blocking"] and row["status"] != "passed":
            reasons.append(f"{row['case']}: {row['status']}")
    if any(r.get("runner_error") for r in results):
        reasons.append("a test runner did not produce a report")
    return {"rows": rows, "red": bool(reasons), "reasons": reasons}


def record(sel: dict[str, Any], verdict: dict[str, Any], *, pr: str | None, changed: list[str], var: Path) -> dict[str, Any]:
    stacks = {sel["cases"][r["case"]].get("stack") for r in verdict["rows"]}
    report_id = f"{sel['gate']}-{time.strftime('%Y%m%d-%H%M%S')}"
    cases = []
    for row in verdict["rows"]:
        failure = row.get("failure") or ({"kind": "missing", "message": "no result was reported"} if row["status"] != "passed" else None)
        cases.append({"case": row["case"], "blocking": row["blocking"], "task_id": None,
                      "status": "passed" if row["status"] == "passed" else "failed" if row["blocking"] else "warn_failed",
                      **({"failure": failure, "evidence": row.get("evidence", [])} if failure else {})})
    run = {"report_id": report_id, "gate": sel["gate"], "role": f"{sel['service']}-{sel['gate']}", "service": sel["service"],
           "platform": "app" if stacks == {"app"} else "web", "pr": pr, "status": "failed" if verdict["red"] else "passed",
           "environment": {}, "accounts": {}, "route": {}, "install": {}, "tasks": [], "cases": cases,
           "reasons": verdict["reasons"], "quarantined": sel["quarantined"]}
    (var / "runtime" / "gate_runs").mkdir(parents=True, exist_ok=True)
    (var / "runtime" / "gate_runs" / f"{report_id}.json").write_text(json.dumps(run, indent=2))
    if pr:
        (var / "runtime" / "prs").mkdir(parents=True, exist_ok=True)
        (var / "runtime" / "prs" / f"{pr}.json").write_text(json.dumps({"id": pr, "files": changed, "title": "", "author": ""}))
    return run


def _changed(args) -> list[str]:
    if args.changed:
        return args.changed
    if args.diff_base:
        proc = subprocess.run(["git", "-C", args.repo, "diff", "--name-only", f"{args.diff_base}...HEAD"],
                              capture_output=True, text=True)
        return [l for l in proc.stdout.splitlines() if l]
    return []


def _edit_case(kb, service: str, case_id: str, fn) -> dict[str, Any]:
    data = kb.load(service, "strategic")
    for journey in data.setdefault("coverage_map", {"smoke": [], "journeys": [], "incidents": []})["journeys"]:
        for case in journey.get("cases", []):
            if case["id"] == case_id:
                fn(case, journey, data)
                kb.save(service, "strategic", data)
                return case
    raise SystemExit(f"case '{case_id}' is not registered for service '{service}'")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="ci.gate", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--var", default=str(ROOT / "var"))
    ap.add_argument("--kb", default=str(ROOT / "knowledge-base"))
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("plan", "run"):
        s = sub.add_parser(name)
        s.add_argument("--gate", required=True, choices=["ci", "cd"])
        s.add_argument("--service", required=True)
        s.add_argument("--pr")
        s.add_argument("--changed", nargs="*")
        s.add_argument("--diff-base")
        s.add_argument("--repo", default=".")
        s.add_argument("--device-profile", default="fake")
    r = sub.add_parser("register")
    r.add_argument("--service", required=True); r.add_argument("--case", required=True)
    r.add_argument("--journey", required=True); r.add_argument("--stack", required=True, choices=["web", "app"])
    r.add_argument("--spec"); r.add_argument("--test"); r.add_argument("--asserts", type=int, default=1)
    r.add_argument("--config", help="web: Playwright config for this case, when it is not the main suite")
    r.add_argument("--dir", help="web: test folder for this case (default: tests)")
    r.add_argument("--priority", default="P1"); r.add_argument("--code-paths", nargs="*", default=[])
    p = sub.add_parser("promote")
    p.add_argument("--service", required=True); p.add_argument("--case", required=True)
    p.add_argument("--passes", type=int, required=True); p.add_argument("--pass-rate", type=float, required=True)
    p.add_argument("--recent-failures", type=int, default=0); p.add_argument("--signed-off-by")
    st = sub.add_parser("status"); st.add_argument("--service", required=True)
    args = ap.parse_args(argv)
    var = Path(args.var)
    driver, ctx = build(var=var, kb_root=args.kb)

    if args.cmd == "register":
        if not (args.spec or args.test):
            ap.error("--spec (web) or --test (app) is required")
        data = ctx.kb.load(args.service, "strategic")
        cmap = data.setdefault("coverage_map", {"smoke": [], "journeys": [], "incidents": []})
        journey = next((j for j in cmap["journeys"] if j["id"] == args.journey), None)
        if journey is None:
            journey = {"id": args.journey, "name": args.journey, "priority": args.priority,
                       "code_paths": args.code_paths, "specs": [], "cases": []}
            cmap["journeys"].append(journey)
        if any(c["id"] == args.case for c in journey["cases"]):
            raise SystemExit(f"case '{args.case}' is already registered")
        journey["cases"].append({"id": args.case, "stack": args.stack, "state": "incubating", "asserts": args.asserts,
                                 "run": ({"spec": args.spec, **({"config": args.config} if args.config else {}),
                                          **({"dir": args.dir} if args.dir else {})} if args.spec else {"test": args.test})})
        ctx.kb.save(args.service, "strategic", data)
        print(f"{args.case}: registered as incubating (daily run only). It joins the gates after graduation.")
        return 0

    if args.cmd == "promote":
        def apply(case, journey, data):
            stats = {**case, "consecutive_passes": args.passes, "pass_rate": args.pass_rate,
                     "recent_failures": args.recent_failures, "signed_off": bool(args.signed_off_by)}
            before = case.get("state", "incubating")
            state, reason = case_care.next_state(stats)
            case["state"] = state
            if state == "gated" and args.signed_off_by:
                case["signed_off_by"] = args.signed_off_by
            print(f"{case['id']}: {before} -> {state} ({reason})")
        _edit_case(ctx.kb, args.service, args.case, apply)
        return 0

    if args.cmd == "status":
        for cid, c in _cases(ctx.kb.coverage_map(args.service)).items():
            print(f"{c.get('state', 'gated'):12} {cid:28} journey={c['journey']} stack={c.get('stack')} run={c.get('run')}")
        return 0

    changed = _changed(args)
    sel = select(ctx, args.gate, args.service, changed)
    out = var / "gate"
    out.mkdir(parents=True, exist_ok=True)
    plan = commands(sel, args.device_profile, out)
    name = policy("gates")[args.gate]["name"]
    print(f"{name} · {args.service}: {len(sel['blocking'])} blocking, {len(sel['warn'])} warn, "
          f"{len(sel['quarantined'])} quarantined (not counted as passing)")
    for cid, why in {**sel["blocking"], **sel["warn"]}.items():
        print(f"  {'BLOCK' if cid in sel['blocking'] else 'warn '} {cid}: {why}")
    if sel["changed_without_case"]:
        print(f"  changed code reaches journeys with no case: {sel['changed_without_case']}")
    if args.cmd == "plan":
        for name, step in plan.items():
            if name != "unmapped" and step:
                print(f"  {name}: {' '.join(step['argv'])}")
        return 0

    verdict = judge(sel, execute(plan))
    run = record(sel, verdict, pr=args.pr, changed=changed, var=var)
    for row in verdict["rows"]:
        print(f"  {row['status']:8} {row['case']}" + (f"  [{row['failure']['kind']}] {row['failure']['message'][:90]}" if row.get("failure") else ""))
    if not verdict["red"]:
        print(f"GREEN  {run['report_id']}")
        return 0
    print(f"RED    {run['report_id']}: " + "; ".join(verdict["reasons"]))
    driver, ctx = build(var=var, kb_root=args.kb)          # reload so the adapters see the recorded run
    done = driver.submit(Event(f"{args.gate}_gate_result", run["report_id"], {"report_id": run["report_id"], "status": "failed"}))
    for d in done:
        print(f"  [{d.workflow}] {d.summary}")
    print(f"  the {'merge' if args.gate == 'ci' else 'release'} is blocked until a person decides: "
          f"python -m harness decide gate:{run['report_id']} rerun|block|override --by <name>")
    return 1


if __name__ == "__main__":
    sys.exit(main())
