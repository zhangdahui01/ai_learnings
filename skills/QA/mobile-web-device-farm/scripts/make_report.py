#!/usr/bin/env python3
"""Final report of a farm run: report.md + a self-contained report.html (screenshots embedded) in the run folder.
usage: make_report.py <run dir>   (reads results/*.json, env.json, check.txt, farm_start.log written by run_farm_test.sh)"""
import base64, html, json, os, subprocess, sys, glob

run = sys.argv[1]
results = [json.load(open(f)) for f in sorted(glob.glob(f"{run}/results/*.json"))]
env = json.load(open(f"{run}/env.json")) if os.path.exists(f"{run}/env.json") else {}
check = open(f"{run}/check.txt", errors="replace").read() if os.path.exists(f"{run}/check.txt") else ""
start_log = open(f"{run}/farm_start.log", errors="replace").read() if os.path.exists(f"{run}/farm_start.log") else ""
farm_lines = [l for l in start_log.splitlines() if l.startswith("[") and (" ok " in l or "FAIL" in l or "WARNING" in l or "===" in l)]
farm_fail = [l for l in farm_lines if "FAIL" in l]

farm_ok = bool(results) and all(r.get("farm_pass") for r in results) and not farm_fail
site_ok = bool(results) and all(r.get("site_pass") for r in results)
blocked = any(s["status"] == "BLOCKED" for r in results for s in r.get("steps", []))
verdict_farm = "PASS" if farm_ok else "FAIL"
verdict_site = "PASS" if site_ok else ("BLOCKED by the site" if blocked else "FAIL")


def thumb(path):
    """screenshot -> small base64 PNG (sips on macOS, else the original file)"""
    if not path or not os.path.exists(path):
        return ""
    small = path.replace(".png", "_thumb.png")
    if not os.path.exists(small):
        if subprocess.run(["sips", "-Z", "640", path, "--out", small], capture_output=True).returncode != 0:
            small = path
    return base64.b64encode(open(small, "rb").read()).decode()


# ---------------- Markdown ----------------
md = [f"# Device farm mobile-web test report", "",
      f"- Run: `{env.get('run_id', os.path.basename(run))}` on `{env.get('host', '?')}` (macOS {env.get('macos', '?')}, {env.get('xcode', '?')})",
      f"- Target: {env.get('url', '?')}  search: `{env.get('query', '')}`",
      f"- Mac local IP: {env.get('mac_ip', '?')}",
      f"- **Farm (Appium + mitmproxy): {verdict_farm}**",
      f"- **Site (home → search → product): {verdict_site}**", "",
      "## Devices", "", "| Platform | Device | UDID | Appium | mitmproxy | Session | Site requests decrypted | Cert rejections | Farm | Site |",
      "|---|---|---|---|---|---|---|---|---|---|"]
for r in results:
    m = r.get("mitm", {})
    md.append(f"| {r['platform']} | {r['name']} | `{r['udid']}` | {r['appium']} | :{r['mitm_port']} | {'yes' if r['session'] else 'NO'} | "
              f"{m.get('site_requests', 0)} | {m.get('site_cert_rejections', 0)} | {'PASS' if r['farm_pass'] else 'FAIL'} | "
              f"{'PASS' if r['site_pass'] else 'BLOCKED/FAIL'} |")
md += ["", "## Steps", "", "| Device | Step | Status | Detail | URL |", "|---|---|---|---|---|"]
for r in results:
    for s in r["steps"]:
        md.append(f"| {r['platform']} {r['name']} | {s['name']} | {s['status']} | {s['detail']} | {s['url'][:90]} |")
    if r.get("error"):
        md.append(f"| {r['platform']} {r['name']} | error | FAIL | {r['error'][:150]} | |")
md += ["", "## mitmproxy traffic (top hosts per device)", ""]
for r in results:
    m = r.get("mitm", {})
    md.append(f"- {r['platform']} :{r['mitm_port']} — {m.get('requests', 0)} requests in total, "
              + ", ".join(f"{h} {n}" for h, n in m.get("top_hosts", [])[:8]))
    if m.get("cert_rejections"):
        md.append(f"  - certificate rejections (pinned apps / services): {m['cert_rejections']}")
md += ["", "## Farm start", "", "```", *farm_lines[-40:], "```", "", "## Software", "", "```", check.strip(), "```", "",
       "## Notes", "",
       "- *Farm* = an Appium session ran on the device and its mitmproxy decrypted the site's HTTPS traffic with no certificate rejection.",
       "- *Site* = home, search and product pages loaded. BLOCKED means the site's bot protection answered with an access-denied page:"
       " the farm works, the site does not let this Mac / IP through (ask for an allowlist or use a test environment).",
       "- The iOS simulator uses the Mac's system proxy, so its mitmproxy also sees other traffic of this Mac."]
open(f"{run}/report.md", "w").write("\n".join(md) + "\n")

# ---------------- HTML ----------------
def badge(t):
    c = {"PASS": "ok", "BLOCKED": "warn"}.get(t.split()[0], "bad")
    return f'<span class="b {c}">{html.escape(t)}</span>'

cards = []
for r in results:
    shots = "".join(f'<figure><img src="data:image/png;base64,{thumb(s["screenshot"])}" alt=""><figcaption>{html.escape(s["name"])} '
                    f'{badge(s["status"])}</figcaption></figure>' for s in r["steps"] if s.get("screenshot"))
    rows = "".join(f"<tr><td>{html.escape(s['name'])}</td><td>{badge(s['status'])}</td><td>{html.escape(s['detail'])}</td>"
                   f"<td class=u>{html.escape(s['url'][:110])}</td><td>{s['seconds']}s</td></tr>" for s in r["steps"])
    if r.get("error"):
        rows += f"<tr><td>error</td><td>{badge('FAIL')}</td><td colspan=3>{html.escape(r['error'])}</td></tr>"
    m = r.get("mitm", {})
    hosts = "".join(f"<li>{html.escape(h)} <b>{n}</b></li>" for h, n in m.get("top_hosts", [])[:10])
    cards.append(f"""<section class=card><h2>{html.escape(r['platform'].upper())} · {html.escape(r['name'])}</h2>
<p class=meta>UDID <code>{html.escape(r['udid'])}</code> · Appium {html.escape(r['appium'])} · mitmproxy :{r['mitm_port']} ·
farm {badge('PASS' if r['farm_pass'] else 'FAIL')} · site {badge('PASS' if r['site_pass'] else ('BLOCKED' if any(s['status']=='BLOCKED' for s in r['steps']) else 'FAIL'))}</p>
<div class=scroll><table><tr><th>Step</th><th>Status</th><th>Detail</th><th>URL</th><th>Time</th></tr>{rows}</table></div>
<p><b>{m.get('site_requests', 0)}</b> site requests decrypted by mitmproxy · <b>{m.get('site_cert_rejections', 0)}</b> certificate rejections · {m.get('requests', 0)} requests in total</p>
<details><summary>Top hosts</summary><ul class=hosts>{hosts}</ul></details>
<div class=shots>{shots}</div></section>""")

page = f"""<title>Farm Test Report</title><meta charset=utf-8>
<style>
:root{{--bg:#f6f7f9;--fg:#1b1f24;--card:#fff;--mut:#5b6573;--line:#dde1e6;--ok:#1a7f37;--warn:#9a6700;--bad:#cf222e}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0f1216;--fg:#e6e9ed;--card:#171b21;--mut:#9aa4b1;--line:#2a313a;--ok:#3fb950;--warn:#d29922;--bad:#f85149;color-scheme:dark}}}}
body{{background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:24px 16px}}
main{{max-width:1100px;margin:auto}} h1{{margin:0 0 4px}} .meta,.mut{{color:var(--mut)}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:16px 0}}
.verdict{{display:flex;gap:12px;flex-wrap:wrap}} .verdict div{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;flex:1;min-width:220px}}
.b{{font-weight:600;padding:1px 8px;border-radius:999px;border:1px solid currentColor;font-size:12px}} .ok{{color:var(--ok)}} .warn{{color:var(--warn)}} .bad{{color:var(--bad)}}
table{{border-collapse:collapse;width:100%}} td,th{{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}} .u{{word-break:break-all;color:var(--mut)}}
.scroll{{overflow-x:auto}} .shots{{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}} figure{{margin:0;width:200px;max-width:100%}}
figure img{{width:100%;border:1px solid var(--line);border-radius:8px}} figcaption{{font-size:12px;color:var(--mut)}}
pre{{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto;font-size:12px}} .hosts{{columns:2}}
</style>
<main>
<h1>Device farm · mobile-web test</h1>
<p class=mut>{html.escape(env.get('run_id', ''))} · {html.escape(env.get('host', ''))} · macOS {html.escape(env.get('macos', ''))} · {html.escape(env.get('xcode', ''))} · Mac IP {html.escape(env.get('mac_ip', ''))}<br>
Target {html.escape(env.get('url', ''))} · search “{html.escape(env.get('query', ''))}”</p>
<div class=verdict><div>Farm (Appium + mitmproxy)<br>{badge(verdict_farm)}</div><div>Site (home → search → product)<br>{badge(verdict_site)}</div></div>
{''.join(cards)}
<section class=card><h2>Farm start</h2><pre>{html.escape(chr(10).join(farm_lines[-40:]))}</pre></section>
<section class=card><h2>Software</h2><pre>{html.escape(check.strip())}</pre></section>
<section class=card><h2>How to read this</h2><ul>
<li><b>Farm</b> passes when each device ran an Appium session and its own mitmproxy decrypted the site's HTTPS traffic without a certificate rejection.</li>
<li><b>Site</b> passes when home, search and a product page loaded. <span class=warn>BLOCKED</span> means the site's bot protection answered with an access-denied page: the farm works, but the site does not let this Mac / IP through — ask for an allowlist or use a test environment.</li>
<li>The iOS simulator has no proxy of its own; it uses the Mac's system proxy, so its mitmproxy also sees the Mac's other traffic.</li></ul></section>
</main>"""
open(f"{run}/report.html", "w").write(page)
print(f"report: {run}/report.html  {run}/report.md  (farm {verdict_farm}, site {verdict_site})")
sys.exit(0 if farm_ok else 1)
