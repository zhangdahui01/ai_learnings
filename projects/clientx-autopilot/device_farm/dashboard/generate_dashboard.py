"""Generate the Device Farm monitor dashboard as one self-contained HTML file.

    python -m device_farm.dashboard.generate_dashboard \
        --snapshot fixtures/farm_snapshot.json --history fixtures/farm_history.json \
        --out var/farm-dashboard.html

No server, no external assets: open the file in a browser, attach it to a Slack card, or
publish it from CI. Re-run it on every status push or on a schedule.
"""
from __future__ import annotations

import argparse
import json
import time
from html import escape as e
from pathlib import Path
from typing import Any

from .. import pipeline
from ..model import DEVICE_KINDS, Device, Mac
from ..monitor import DISK_LOW_GB, QUEUE_STUCK_S

KIND_LABEL = {"android-emulator": "Android emulator", "ios-simulator": "iOS Simulator", "ios-real": "iPhone (real)"}
SEV_ICON = {"critical": "✕", "serious": "▲", "warning": "!", "good": "✓"}
OUTCOME = {"enqueue": ("good", "Queued"), "needs_approval": ("warning", "Needs approval"),
           "blocked": ("serious", "Blocked by policy"), "card_only": ("warning", "Card only"),
           "agent_task": ("warning", "To Farm Doctor agent")}

CSS = """
:root{--bg:#f4f4f1;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--line:#e1e0d9;
--good:#0ca30c;--warning:#fab219;--serious:#ec835a;--critical:#d03b3b;--busy:#2a78d6;--idle:#c9c8c0;--bar:#2a78d6}
@media (prefers-color-scheme:dark){:root{--bg:#111110;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--line:#2c2c2a;--idle:#4a4a46;--bar:#5b9be6}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1280px;margin:0 auto;padding:24px 16px 64px}
header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;justify-content:space-between;margin-bottom:16px}
h1{font-size:24px;margin:0}h2{font-size:17px;margin:32px 0 10px}h3{font-size:14px;margin:0}
.muted{color:var(--ink2)}.badge{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:13px;background:var(--surface)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.tile,.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.tile .n{font-size:32px;font-weight:650;line-height:1.1;font-variant-numeric:tabular-nums}.tile .l{color:var(--ink2);font-size:13px}
.tile .s{font-size:13px;margin-top:6px}
.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:20px 0 0}
select{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:5px 8px}
.st{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.dot{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;color:#fff;font-size:11px;font-weight:700;flex:none}
.dot.good{background:var(--good)}.dot.warning{background:var(--warning);color:#0b0b0b}.dot.serious{background:var(--serious)}.dot.critical{background:var(--critical)}
.bars{display:grid;grid-template-columns:150px 1fr 110px;gap:8px 12px;align-items:center}
.track{height:14px;background:var(--line);border-radius:4px;overflow:hidden}.fill{height:100%;background:var(--bar);border-radius:0 4px 4px 0}
.num{font-variant-numeric:tabular-nums;text-align:right}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px}
.macs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.mac{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.mac.bad{border-color:var(--critical)}.mac .top{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center}
.mac .meta{font-size:12px;color:var(--ink2);margin:2px 0 8px}
.chips{display:flex;flex-wrap:wrap;gap:4px}
.chip{width:24px;height:24px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;cursor:default;border:0;padding:0}
.chip.ok{background:var(--good)}.chip.busy{background:var(--busy)}.chip.deg{background:var(--warning);color:#0b0b0b}
.chip.off{background:var(--critical)}.chip.quar{background:var(--idle);color:var(--ink)}
.chip:focus-visible,.chip:hover{outline:2px solid var(--ink);outline-offset:1px}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--ink2);margin:0 0 10px}
.legend .chip{width:16px;height:16px;font-size:10px}
.scroll{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--ink2);font-weight:600;white-space:nowrap}tr:last-child td{border-bottom:0}
td.ev{color:var(--ink2);font-size:13px}code{font-size:13px}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--bg);padding:6px 9px;border-radius:6px;font-size:12.5px;max-width:280px;display:none;z-index:9}
svg text{fill:var(--ink2);font-size:11px}.spark{stroke:var(--bar);stroke-width:2;fill:none}.grid{stroke:var(--line);stroke-width:1}
"""

JS = """
const tip=document.getElementById('tip');
document.addEventListener('pointermove',ev=>{const t=ev.target.closest('[data-tip]');
 if(!t){tip.style.display='none';return}
 tip.textContent=t.dataset.tip;tip.style.display='block';
 const x=Math.min(ev.clientX+12,innerWidth-tip.offsetWidth-8),y=ev.clientY+16;
 tip.style.left=x+'px';tip.style.top=(y+tip.offsetHeight>innerHeight?ev.clientY-tip.offsetHeight-8:y)+'px'});
document.addEventListener('focusin',ev=>{const t=ev.target.closest('[data-tip]');if(!t)return;
 const r=t.getBoundingClientRect();tip.textContent=t.dataset.tip;tip.style.display='block';
 tip.style.left=Math.min(r.left,innerWidth-tip.offsetWidth-8)+'px';tip.style.top=(r.bottom+6)+'px'});
document.addEventListener('focusout',()=>tip.style.display='none');
function applyFilters(){const r=document.getElementById('f-region').value,s=document.getElementById('f-sev').value;
 document.querySelectorAll('[data-region]').forEach(el=>{
  const okR=r==='all'||el.dataset.region===r, okS=s==='all'||!el.dataset.sev||el.dataset.sev===s;
  el.hidden=!(okR&&okS)})}
document.querySelectorAll('.filters select').forEach(s=>s.addEventListener('change',applyFilters));
"""


def _status(level: str, label: str) -> str:
    return f'<span class="st"><span class="dot {level}" aria-hidden="true">{SEV_ICON[level]}</span>{e(label)}</span>'


def _chip(d: Device, mac: Mac, silenced: set[str]) -> str:
    if d.quarantined:
        cls, glyph, state = "quar", "⊘", "quarantined"
    elif not mac.reachable:
        cls, glyph, state = "off", "✕", "unavailable: Mac unreachable"
    elif not d.online:
        cls, glyph, state = "off", "✕", "offline" + (" (hub fault)" if d.id in silenced else "")
    elif not d.healthy:
        why = [n for n, ok in (("not booted", d.booted), ("WDA down", d.wda_up or d.kind == "android-emulator"),
                                ("app missing", d.app_installed)) if not ok]
        cls, glyph, state = "deg", "!", "degraded: " + ", ".join(why)
    elif d.busy:
        cls, glyph, state = "busy", "●", "running a task"
    else:
        cls, glyph, state = "ok", "✓", "idle, healthy"
    tip = f"{d.id} · {KIND_LABEL.get(d.kind, d.kind)} · {state}" + (f" · {d.hub}" if d.hub else "")
    return f'<button type="button" class="chip {cls}" data-tip="{e(tip)}" aria-label="{e(tip)}">{glyph}</button>'


def _trend_svg(trend: list[dict[str, Any]]) -> str:
    if len(trend) < 2:
        return ""
    w, h, pl, pr, pt, pb = 560, 150, 34, 44, 10, 22
    lo = min(80, min(t["healthy_pct"] for t in trend) // 5 * 5)
    xs = [pl + i * (w - pl - pr) / (len(trend) - 1) for i in range(len(trend))]
    ys = [pt + (100 - t["healthy_pct"]) * (h - pt - pb) / (100 - lo) for t in trend]
    grid = "".join(
        f'<line class="grid" x1="{pl}" x2="{w - pr}" y1="{pt + (100 - v) * (h - pt - pb) / (100 - lo):.1f}" '
        f'y2="{pt + (100 - v) * (h - pt - pb) / (100 - lo):.1f}"/>'
        f'<text x="{pl - 6}" y="{pt + (100 - v) * (h - pt - pb) / (100 - lo) + 4:.1f}" text-anchor="end">{v}%</text>'
        for v in range(lo, 101, max(5, (100 - lo) // 4)))
    path = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in zip(xs, ys))
    step = max(1, len(trend) // 6)
    labels = "".join(f'<text x="{xs[i]:.1f}" y="{h - 6}" text-anchor="middle">{e(trend[i]["hour"])}</text>'
                     for i in range(0, len(trend), step))
    hits = "".join(
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="9" fill="transparent" tabindex="0" '
        f'data-tip="{e(t["hour"])} · {t["healthy_pct"]}% of devices healthy"/>'
        for x, y, t in zip(xs, ys, trend))
    last = (f'<circle cx="{xs[-1]:.1f}" cy="{ys[-1]:.1f}" r="4" fill="var(--bar)" stroke="var(--surface)" stroke-width="2"/>'
            f'<text x="{xs[-1] + 8:.1f}" y="{ys[-1] + 4:.1f}" style="fill:var(--ink);font-weight:600">{trend[-1]["healthy_pct"]}%</text>')
    return (f'<svg viewBox="0 0 {w} {h}" width="100%" role="img" aria-label="Healthy devices, last {len(trend)} hours">'
            f'{grid}<path class="spark" d="{path}"/>{last}{labels}{hits}</svg>')


def render(result: dict[str, Any], snapshot: dict[str, Any], history: list[dict[str, Any]]) -> str:
    farm, findings, decisions, now = result["farm"], result["findings"], result["decisions"], result["now"]
    diag_by_target = {d.finding.target + d.finding.rule: d for d in result["diagnoses"]}
    avail = farm.availability()
    total = sum(v["total"] for v in avail.values())
    healthy = sum(v["healthy"] for v in avail.values())
    macs_ok = sum(m.reachable for m in farm.macs)
    sev = {s: sum(f.severity == s for f in findings) for s in ("critical", "serious", "warning")}
    out_n = {o: sum(d.outcome == o for d in decisions) for o in OUTCOME}
    dry = all((d.action or {}).get("dry_run", True) for d in decisions)
    silenced = {x for f in findings for x in f.silenced}
    regions = sorted(farm.regions())

    tiles = f"""
<div class="tiles">
 <div class="tile"><div class="l">Devices healthy</div><div class="n">{healthy / total * 100 if total else 0:.0f}%</div><div class="s muted">{healthy} of {total}</div></div>
 <div class="tile"><div class="l">Macs reachable</div><div class="n">{macs_ok}/{len(farm.macs)}</div><div class="s muted">{len(regions)} regions</div></div>
 <div class="tile"><div class="l">Open findings</div><div class="n">{len(findings)}</div><div class="s">{_status('critical', f"{sev['critical']} critical")} &nbsp; {_status('serious', f"{sev['serious']} serious")} &nbsp; {_status('warning', f"{sev['warning']} warning")}</div></div>
 <div class="tile"><div class="l">Healing actions</div><div class="n">{out_n['enqueue']}</div><div class="s muted">queued · {out_n['needs_approval']} need approval · {out_n['blocked']} blocked · {out_n['agent_task']} to agent</div></div>
</div>"""

    bars = "".join(
        f'<div>{e(KIND_LABEL[k])}</div>'
        f'<div class="track" data-tip="{e(KIND_LABEL[k])}: {v["healthy"]} of {v["total"]} healthy" tabindex="0">'
        f'<div class="fill" style="width:{(v["healthy"] / v["total"] * 100) if v["total"] else 0:.1f}%"></div></div>'
        f'<div class="num">{v["healthy"]}/{v["total"]} · {(v["healthy"] / v["total"] * 100) if v["total"] else 0:.0f}%</div>'
        for k in DEVICE_KINDS for v in [avail[k]])

    topo = ""
    for region in regions:
        cards = ""
        for m in farm.regions()[region]:
            flags = []
            if not m.reachable:
                flags.append(_status("critical", "Unreachable"))
            else:
                if not m.appium_up:
                    flags.append(_status("serious", "Appium down"))
                if not m.proxy_up:
                    flags.append(_status("serious", "mitmproxy down"))
                if m.queue_oldest_wait_s > QUEUE_STUCK_S:
                    flags.append(_status("serious", "Queue stuck"))
                if m.disk_free_gb < DISK_LOW_GB:
                    flags.append(_status("warning", "Disk low"))
            head = " ".join(flags) or _status("good", "OK")
            cards += (f'<div class="mac{" bad" if not m.reachable else ""}"><div class="top"><h3>{e(m.id)}</h3>{head}</div>'
                      f'<div class="meta">{e(KIND_LABEL.get(m.kind, m.kind))} · queue {m.queue_pending}'
                      f' · oldest {int(m.queue_oldest_wait_s)}s · disk {m.disk_free_gb:g} GB</div>'
                      f'<div class="chips">{"".join(_chip(d, m, silenced) for d in m.devices)}</div></div>')
        topo += f'<div data-region="{e(region)}"><h3 style="margin:14px 0 8px;text-transform:capitalize">{e(region)}</h3><div class="macs">{cards}</div></div>'

    rows = ""
    for f in findings:
        d = diag_by_target.get(f.target + f.rule)
        decs = [x for x in decisions if x.diagnosis["finding"]["target"] == f.target and x.diagnosis["finding"]["rule"] == f.rule]
        dec_html = "<br>".join(
            _status(OUTCOME[x.outcome][0], OUTCOME[x.outcome][1]) +
            (f' <code>{e(x.action_type)}</code> → {e(x.target or "")}' if x.action_type else "") for x in decs[:6])
        if len(decs) > 6:
            dec_html += f'<br><span class="muted">+{len(decs) - 6} more</span>'
        sil = f'<br><span class="muted">{len(f.silenced)} child alerts silenced</span>' if f.silenced else ""
        cause = e(d.cause) if d and d.explained_by != "rule" else ""
        by = {"rule": "Rule", "doctor": "Farm Doctor (history)", "needs_agent": "Needs agent"}[d.explained_by] if d else ""
        rows += (f'<tr data-region="{e(f.region)}" data-sev="{f.severity}"><td>{_status(f.severity, f.severity.capitalize())}</td>'
                 f'<td><code>{e(f.rule)}</code><br><span class="muted">{e(f.scope)} · {e(f.target)}</span></td>'
                 f'<td>{e(f.summary)}{sil}</td><td>{cause or "<span class=muted>—</span>"}<br><span class="muted">{by}</span></td>'
                 f'<td class="ev">{"<br>".join(e(x) for x in (d.evidence if d else f.evidence)[:5])}</td><td>{dec_html}</td></tr>')
    findings_tbl = (f'<div class="scroll"><table><thead><tr><th>Severity</th><th>Rule · target</th><th>What the monitor saw</th>'
                    f'<th>Diagnosis</th><th>Evidence</th><th>Healing decision</th></tr></thead><tbody>{rows}</tbody></table></div>'
                    if findings else '<p class="muted">No open findings.</p>')

    hist_rows = "".join(
        f'<tr><td class="num" style="text-align:left">{int((now - h["ts"]) // 60)} min ago</td><td>{e(h.get("mac", ""))}</td>'
        f'<td>{e(h.get("target", ""))}</td><td><code>{e(h.get("action", ""))}</code></td><td>{e(str(h.get("result", "")))}</td></tr>'
        for h in sorted(history, key=lambda h: -h["ts"])[:30])
    region_opts = "".join(f'<option value="{e(r)}">{e(r.capitalize())}</option>' for r in regions)
    trend = _trend_svg(snapshot.get("availability_trend", []))

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Device Farm Monitor</title><style>{CSS}</style></head><body><main>
<header><div><h1>Device Farm Monitor</h1><div class="muted">Farm Autopilot · snapshot {e(farm.generated_at)} · rendered {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}</div></div>
<span class="badge">{'Dry-run: actions are recorded, not executed' if dry else 'LIVE: actions are delivered to the pull queue'}</span></header>
{tiles}
<div class="two" style="margin-top:12px">
 <div class="card"><h3 style="margin-bottom:12px">Healthy devices by type</h3><div class="bars">{bars}</div></div>
 <div class="card"><h3 style="margin-bottom:6px">Healthy devices, recent hours</h3>{trend or '<p class="muted">No trend data in this snapshot.</p>'}</div>
</div>
<div class="filters"><label>Region <select id="f-region"><option value="all">All regions</option>{region_opts}</select></label>
<label>Severity <select id="f-sev"><option value="all">All severities</option><option value="critical">Critical</option><option value="serious">Serious</option><option value="warning">Warning</option></select></label></div>
<h2>Topology: region → Mac → device</h2>
<div class="legend"><span class="st"><span class="chip ok">✓</span>Idle, healthy</span><span class="st"><span class="chip busy">●</span>Running a task</span>
<span class="st"><span class="chip deg">!</span>Degraded</span><span class="st"><span class="chip off">✕</span>Offline / unavailable</span><span class="st"><span class="chip quar">⊘</span>Quarantined</span></div>
{topo}
<h2>Findings, diagnosis and healing</h2>{findings_tbl}
<h2>Recovery history (last 30)</h2>
<div class="scroll"><table><thead><tr><th>When</th><th>Mac</th><th>Target</th><th>Action</th><th>Result</th></tr></thead><tbody>{hist_rows or '<tr><td colspan=5 class=muted>No history.</td></tr>'}</tbody></table></div>
</main><div id="tip" role="tooltip"></div><script>{JS}</script></body></html>
"""


def generate(snapshot_path: str | Path, history_path: str | Path | None, out: str | Path,
             policy_path: str | Path | None = None) -> Path:
    snapshot = json.loads(Path(snapshot_path).read_text())
    history = json.loads(Path(history_path).read_text()) if history_path else []
    policy = json.loads(Path(policy_path).read_text()) if policy_path else None
    result = pipeline.run(snapshot, history, policy)
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(result, snapshot, history))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate the Device Farm monitor dashboard (one HTML file).")
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--history")
    ap.add_argument("--policy")
    ap.add_argument("--out", default="var/farm-dashboard.html")
    args = ap.parse_args()
    print(generate(args.snapshot, args.history, args.out, args.policy))


if __name__ == "__main__":
    main()
