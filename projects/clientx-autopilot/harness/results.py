"""Test results -> one evidence model. Deterministic failure diagnosis before any agent looks.

Reads the Playwright JSON report (web) and pytest JUnit XML (app), classifies each failure,
and turns the failures into a `case_failure` event or a gate-run record.
"""
from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from .signals import Event

# First match wins. Order matters: guard-rail errors, then device/network, then assertion vs locator vs timeout.
PATTERNS: list[tuple[str, re.Pattern]] = [
    ("spec_drift", re.compile(r"SPEC_DRIFT|SPEC_INVALID")),
    ("locator", re.compile(r"LOCATOR_AMBIGUOUS|strict mode violation|resolved to \d+ elements")),
    ("device", re.compile(r"session (?:not created|is either terminated|deleted)|Could not start a new session|"
                          r"WebDriverAgent|xcodebuild failed|device .* (?:offline|not found)|adb: |ECONNREFUSED.*4723|"
                          r"instrumentation process is not running|socket hang up", re.I)),
    ("network", re.compile(r"net::ERR_|ERR_PROXY|ECONNRESET|ENOTFOUND|502 Bad Gateway|503 Service|proxy", re.I)),
    ("account", re.compile(r"account (?:locked|expired)|session expired|login required", re.I)),
    ("locator", re.compile(r"waiting for (?:locator|getBy)|ElementNotFound|NoSuchElement|not found within|"
                           r"no such element|element not interactable|resolved to 0 elements", re.I)),
    ("assertion", re.compile(r"expect\(|AssertionError|toHave\w+|toBe\w+|toContain\w+|assert |expected it to contain|"
                             r"Expected (?:string|pattern|value)|Should (?:Be|Contain)", re.I)),
    ("timeout", re.compile(r"Timeout|timed out|exceeded", re.I)),
]
SELECTOR = re.compile(r"(?:locator|getBy\w+)\(([^)]{1,120})\)|\(([\w -]+=[^)]{1,80})\) not found|'([\w.]+)' \(")


def classify_failure(message: str) -> dict[str, Any]:
    """Return {"kind", "message", "selector"?}. `unknown` when nothing matches."""
    text = re.sub(r"\x1b\[[0-9;]*m", "", message or "")
    kind = next((k for k, pat in PATTERNS if pat.search(text)), "unknown")
    first = next((l.strip() for l in text.splitlines() if l.strip()), "")
    out: dict[str, Any] = {"kind": kind, "message": first[:300]}
    if kind == "locator":
        m = SELECTOR.search(text)
        if m:
            out["selector"] = next(g for g in m.groups() if g)
    return out


def parse_playwright_report(path: str | Path) -> list[dict[str, Any]]:
    report = json.loads(Path(path).read_text())
    results: list[dict[str, Any]] = []

    def walk(suite: dict[str, Any]) -> None:
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                annotations = {a["type"]: a.get("description", "") for a in test.get("annotations", [])}
                if "spec" not in annotations:          # not a spec-driven case (e.g. the framework's own tests)
                    continue
                runs = test.get("results", [])
                last = runs[-1] if runs else {}
                status = {"expected": "passed", "unexpected": "failed", "flaky": "flaky",
                          "skipped": "skipped"}.get(test.get("status"), "failed")
                case_id = Path(annotations.get("spec", "")).stem or spec.get("title", "")
                item: dict[str, Any] = {"case": case_id, "title": spec.get("title"), "status": status, "stack": "web",
                                        "file": spec.get("file"), "tags": spec.get("tags", []),
                                        "journey": annotations.get("journey"), "service": annotations.get("service"),
                                        "retries": max(0, len(runs) - 1),
                                        "evidence": [a["path"] for a in last.get("attachments", []) if a.get("path")],
                                        "locator_notes": [a.get("description", "") for a in test.get("annotations", [])
                                                          if a["type"] == "locator"]}
                if status in ("failed", "flaky"):
                    failed = next((r for r in runs if r.get("status") != "passed"), last)
                    err = (failed.get("errors") or [failed.get("error") or {}])[0]
                    item["failure"] = classify_failure(err.get("message", "") + "\n" + err.get("stack", ""))
                results.append(item)
        for child in suite.get("suites", []):
            walk(child)

    for suite in report.get("suites", []):
        walk(suite)
    return results


def parse_junit(path: str | Path, evidence_dir: str | Path | None = None) -> list[dict[str, Any]]:
    root = ET.parse(str(path)).getroot()
    results = []
    for case in root.iter("testcase"):
        name = case.get("name", "")
        bad = case.find("failure") if case.find("failure") is not None else case.find("error")
        status = "skipped" if case.find("skipped") is not None else "failed" if bad is not None else "passed"
        item: dict[str, Any] = {"case": re.sub(r"^test_", "", name), "title": name, "status": status, "stack": "app",
                                "file": case.get("classname"), "evidence": []}
        if bad is not None:
            item["failure"] = classify_failure((bad.get("message") or "") + "\n" + (bad.text or ""))
            if evidence_dir and (Path(evidence_dir) / name).is_dir():
                item["evidence"] = sorted(str(p) for p in (Path(evidence_dir) / name).iterdir())
        results.append(item)
    return results


def failures(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"case": r["case"], "stack": r["stack"], "file": r.get("file"), "evidence": r.get("evidence", []),
             "tags": r.get("tags", []), **r["failure"]} for r in results if r["status"] == "failed"]


def to_case_failure_event(results: list[dict[str, Any]], *, origin: str, service: str, run_id: str,
                          pr: str | None = None) -> Event | None:
    failed = failures(results)
    if not failed:
        return None
    return Event("case_failure", f"{origin}:{run_id}", {"origin": origin, "service": service, "pr": pr,
                                                        "failures": failed})


def locator_drift(results: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Cases that passed only because a fallback locator matched: drift to fix before it becomes a failure."""
    return [{"case": r["case"], "note": n} for r in results for n in r.get("locator_notes", []) if "fallback#" in n]


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    kinds: dict[str, int] = {}
    for f in failures(results):
        kinds[f["kind"]] = kinds.get(f["kind"], 0) + 1
    return {"total": len(results), **counts, "failure_kinds": kinds,
            "first_run_pass": sum(r["status"] == "passed" and not r.get("retries") for r in results),
            "passed_on_fallback_locator": len(locator_drift(results))}
