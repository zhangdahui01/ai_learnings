#!/usr/bin/env python3
"""Render a self-contained, source-evidence HTML report from static scan artifacts."""
from __future__ import annotations

import argparse
import html
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""))


def table(rows: list[dict], columns: list[tuple[str, str]]) -> str:
    if not rows:
        return "<p class='empty'>No findings in this category.</p>"
    head = "".join(f"<th>{esc(label)}</th>" for _, label in columns)
    body = "".join("<tr>" + "".join(f"<td>{esc(row.get(key, ''))}</td>" for key, _ in columns) + "</tr>" for row in rows)
    return f"<div class='scroll'><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>"


def main() -> None:
    parser = argparse.ArgumentParser(description="Create report.html from a Regression Gap Analyzer output directory.")
    parser.add_argument("--out", required=True, help="Existing scan output directory.")
    args = parser.parse_args(); out = Path(args.out).expanduser().resolve()
    kb_path, ui_path = out / "knowledge-base.json", out / "static-ui-analysis.json"
    if not kb_path.is_file() or not ui_path.is_file(): parser.error("run static_index.py before rendering the HTML report")
    kb, ui = json.loads(kb_path.read_text(encoding="utf-8")), json.loads(ui_path.read_text(encoding="utf-8"))
    risks = ui.get("risks_and_gaps", []); counts = Counter(item.get("priority", "Unclassified") for item in risks)
    summary = {"Files": len({node.get("path") for node in kb.get("nodes", []) if node.get("kind") == "File"}), "Symbols": len(kb.get("symbols", [])), "Endpoints": len(kb.get("endpoints", [])), "UI tests": len(kb.get("tests", [])), "Risk / gap candidates": len(risks)}
    cards = "".join(f"<article><strong>{esc(value)}</strong><span>{esc(label)}</span></article>" for label, value in summary.items())
    graph = "graphs/overview.svg" if (out / "graphs/overview.svg").exists() else "graphs/overview.dot"
    risk_table = table(risks, [("priority", "Priority"), ("classification", "Classification"), ("confidence", "Confidence"), ("path", "Evidence file"), ("line", "Line"), ("reason", "Reason / review question")])
    endpoint_table = table(kb.get("endpoints", []), [("route", "Route"), ("path", "Source file"), ("line", "Line")])
    generated = kb.get("generated_at") or datetime.now(timezone.utc).isoformat()
    page = f"""<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Regression Gap Analysis Report</title><style>
body{{font:15px/1.55 system-ui,-apple-system,sans-serif;max-width:1280px;margin:auto;padding:28px;color:#172033;background:#f6f8fb}}h1,h2{{color:#102a43}}.meta,.notice{{color:#52606d}}.notice{{background:#fff4d6;border-left:4px solid #d99b00;padding:12px 16px;border-radius:5px}}.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}}article,section{{background:white;border:1px solid #d9e2ec;border-radius:12px;padding:16px;margin:16px 0}}article strong{{font-size:1.8rem;display:block;color:#0969da}}article span{{color:#52606d}}table{{border-collapse:collapse;width:100%;font-size:.9rem}}th{{background:#eef3f8;text-align:left}}td,th{{padding:9px;border-bottom:1px solid #d9e2ec;vertical-align:top}}.scroll{{overflow:auto}}.pill{{display:inline-block;background:#e6f0ff;padding:3px 8px;border-radius:99px;margin-right:6px}}a{{color:#0969da}}img{{max-width:100%;height:auto;border:1px solid #d9e2ec;border-radius:8px}}.empty{{color:#778899}}</style></head><body>
<h1>Regression Gap Analysis Report</h1><p class='meta'>Generated {esc(generated)} · Analysis mode: <b>static-only</b></p>
<p class='notice'>This report contains static candidates and inferences, not runtime coverage proof. Review P0/P1 items with the service owner and QE before scheduling work.</p>
<div class='cards'>{cards}</div><section><h2>Priority summary</h2>{''.join(f"<span class='pill'>{esc(key)}: {esc(value)}</span>" for key,value in sorted(counts.items())) or '<p class=empty>No candidates.</p>'}</section>
<section><h2>Code graph</h2><p><a href='{esc(graph)}'>Open graph artifact</a></p>{"<img src='graphs/overview.svg' alt='Code graph overview'>" if graph.endswith('.svg') else ''}</section>
<section><h2>Static UI risks and regression-gap candidates</h2>{risk_table}</section><section><h2>Discovered endpoints</h2>{endpoint_table}</section>
<section><h2>Evidence and limitations</h2><ul>{''.join(f'<li>{esc(item)}</li>' for item in kb.get('exclusions', []))}</ul><p>Machine-readable companion files: <a href='knowledge-base.json'>knowledge-base.json</a>, <a href='static-ui-analysis.json'>static-ui-analysis.json</a>, <a href='ui-static-risk-and-gaps.csv'>CSV backlog</a>.</p></section></body></html>"""
    (out / "report.html").write_text(page, encoding="utf-8")
    print(out / "report.html")


if __name__ == "__main__": main()
