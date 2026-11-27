#!/usr/bin/env python3
"""Build one stock daily report page from its data file, and refresh the archive index.

Usage (from the repository root):
    python3 skills/stock-daily-report/build.py 2026-11-28

Reads   docs/reports/stock-daily/data/<date>.json
Writes  docs/reports/stock-daily/<date>/index.html
        docs/reports/stock-daily/index.html   (archive, newest first)

The script refuses to build when the data file fails validation, and prints every
percentage it derives so the numbers can be checked against the sources.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKILL = Path(__file__).resolve().parent
OUT = ROOT / "docs" / "reports" / "stock-daily"
DATA = OUT / "data"

TOP = ["date", "weekday", "headline", "asof", "dataNotes", "dates", "lead",
       "market", "stocks", "mview", "mscen", "cal"]
STOCK = ["t", "n", "base", "lo", "hi", "cap", "tgt", "px", "notes",
         "bias", "conf", "view", "sc", "watch"]


def validate(d, date):
    errs = []
    for k in TOP:
        if k not in d:
            errs.append(f"missing top-level field: {k}")
    if errs:
        return errs
    if d["date"] != date:
        errs.append(f"date field {d['date']} does not match file name {date}")
    n = len(d["dates"])
    if n < 7:
        errs.append("dates needs at least 7 trading days (5-day change uses the 6th from last)")
    if len(d["mscen"]) != 3:
        errs.append("mscen needs exactly 3 scenarios: 基准, 上行, 下行")
    for m in d["market"]:
        if not {"k", "v", "d"} <= set(m):
            errs.append(f"market tile needs k, v, d: {m}")
    seen = set()
    for s in d["stocks"]:
        t = s.get("t", "?")
        if t in seen:
            errs.append(f"{t}: listed twice")
        seen.add(t)
        for k in STOCK:
            if k not in s:
                errs.append(f"{t}: missing {k}")
        if any(k not in s for k in STOCK):
            continue
        px = s["px"]
        if len(px) != n:
            errs.append(f"{t}: px has {len(px)} values, dates has {n}")
            continue
        if px[-1] is None or px[-2] is None:
            errs.append(f"{t}: the last two closes must be present")
        vals = [v for v in px if v is not None]
        if len(vals) < n * 0.7:
            errs.append(f"{t}: too many missing closes ({n - len(vals)} of {n})")
        if not (s["lo"] < s["hi"]):
            errs.append(f"{t}: 52-week low must be below the high")
        if len(s["sc"]) != 3 or any(len(c) != 2 for c in s["sc"]):
            errs.append(f"{t}: sc needs 3 scenarios of [condition, level]")
        if len(s["notes"]) < 2:
            errs.append(f"{t}: needs at least 2 sourced notes")
        for note in s["notes"]:
            if len(note) != 2 or not str(note[1]).startswith("http"):
                errs.append(f"{t}: every note needs [text, source URL]")
    blob = json.dumps(d, ensure_ascii=False)
    for bad in ("TODO", "TBD", "待补"):
        if bad in blob:
            errs.append(f"placeholder text left in data: {bad}")
    return errs


def pct(a, b):
    return None if a is None or b is None else (a / b - 1) * 100


def show(v):
    return "   n/a" if v is None else f"{v:+7.2f}%"


def build(date):
    f = DATA / f"{date}.json"
    if not f.exists():
        sys.exit(f"no data file: {f}")
    d = json.loads(f.read_text(encoding="utf-8"))
    errs = validate(d, date)
    if errs:
        sys.exit("data file failed validation:\n  - " + "\n  - ".join(errs))

    print(f"{'ticker':6} {'close':>9} {'1D':>8} {'5D':>8} {'1M':>8} {'YTD':>8} {'vs target':>10}")
    for s in d["stocks"]:
        p = s["px"]
        first = next(v for v in p if v is not None)
        print(f"{s['t']:6} {p[-1]:9.2f} {show(pct(p[-1], p[-2]))} {show(pct(p[-1], p[-6]))} "
              f"{show(pct(p[-1], first))} {show(pct(p[-1], s['base']))} {show(pct(s['tgt'], p[-1]))}")

    t = (SKILL / "template.html").read_text(encoding="utf-8")
    payload = json.dumps(d, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    marker = "/*__DATA__*/null"
    if marker not in t:
        sys.exit("template.html has no data marker")
    page = t.replace(marker, payload)
    for key, val in {"__MMDD__": date[5:], "__DATE__": date, "__WEEKDAY__": d["weekday"],
                     "__ASOF__": d["asof"], "__NOTES__": d["dataNotes"]}.items():
        page = page.replace(key, html.escape(str(val)))
    dest = OUT / date
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "index.html").write_text(page, encoding="utf-8")
    print(f"wrote {dest / 'index.html'}")

    items = []
    for jf in sorted(DATA.glob("*.json"), reverse=True):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", jf.stem):
            continue
        j = json.loads(jf.read_text(encoding="utf-8"))
        items.append(f'<li><a href="{jf.stem}/">{jf.stem}（{html.escape(j.get("weekday", ""))}）</a>'
                     f'<span>{html.escape(j.get("headline", ""))}</span></li>')
    index = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>美股观察日报</title><style>body{{font:16px/1.6 system-ui,"PingFang SC","Noto Sans SC",sans-serif;max-width:760px;margin:0 auto;padding:40px 20px;color:#14212e;background:#f3f5f7}}h1{{font-size:1.8rem;margin:0 0 6px}}p{{color:#5d6b79;margin:0 0 20px}}ul{{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}}li{{background:#fff;border:1px solid #dde3e9;border-radius:10px;padding:14px 16px}}a{{color:#0b5c7a;font-weight:600}}span{{color:#5d6b79;font-size:14px;display:block}}</style></head><body>
<h1>美股观察日报</h1>
<p>每日行情、图表、情报、分析与情景预测。只整理公开信息，分析与预测可能出错，不构成投资建议。最新一期：<a href="{items and sorted(DATA.glob('*.json'))[-1].stem}/">打开</a></p>
<ul>
{chr(10).join(items)}
</ul>
</body></html>
"""
    (OUT / "index.html").write_text(index, encoding="utf-8")
    print(f"archive lists {len(items)} report(s)")


if __name__ == "__main__":
    if len(sys.argv) != 2 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", sys.argv[1]):
        sys.exit("usage: build.py YYYY-MM-DD")
    build(sys.argv[1])
