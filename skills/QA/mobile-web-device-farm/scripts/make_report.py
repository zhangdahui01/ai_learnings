#!/usr/bin/env python3
"""Final report of a farm run: report.html (self-contained, screenshots embedded) + report.md.
Sections: verdict, what is installed, devices (emulators / simulator / real iPhones: ports, proxy, WDA), test results, how to run /
stop the farm, real-iPhone proxy + certificate steps, WDA install, farm start log.
usage: make_report.py <run dir>   (reads env.json, inventory.json, devices.json, results/*.json, farm_start.log, check.txt)"""
import base64, glob, html, json, os, subprocess, sys

run = sys.argv[1]


def load(name, default):
    p = f"{run}/{name}"
    try:
        return json.load(open(p)) if p.endswith(".json") else open(p, errors="replace").read()
    except Exception:
        return default


env, inv, devs = load("env.json", {}), load("inventory.json", {}), load("devices.json", {}).get("devices", [])
check, start_log = load("check.txt", ""), load("farm_start.log", "")
results = [json.load(open(f)) for f in sorted(glob.glob(f"{run}/results/*.json"))]
setup = env.get("setup", "setup_mac_external.sh")
here = os.path.dirname(setup)
mac_ip = inv.get("mac_ip") or load("devices.json", {}).get("mac_ip", "")
wda_id = env.get("wda_bundle_id") or inv.get("wda_bundle_id", "")
iphones = inv.get("iphones", [])
farm_lines = [l for l in start_log.splitlines() if l.startswith("[") and (" ok " in l or "FAIL" in l or "WARNING" in l or "===" in l)]
farm_fail = [l for l in farm_lines if "FAIL" in l]

tested = bool(results)
farm_ok = tested and all(r.get("farm_pass") for r in results)
site_ok = tested and all(r.get("site_pass") for r in results)
blocked = any(s["status"] == "BLOCKED" for r in results for s in r.get("steps", []))
v_farm = ("PASS" if farm_ok else "FAIL") if tested else "NOT TESTED"
v_site = ("PASS" if site_ok else ("BLOCKED" if blocked else "FAIL")) if tested else "NOT TESTED"
soft = inv.get("software", [])
missing = [s["name"] for s in soft if not s.get("installed")]
wda_missing = [p for p in iphones if p["wda"] != "installed"]
e = html.escape


def badge(t, cls=None):
    word = t.split()[0]
    c = cls or {"PASS": "ok", "installed": "ok", "up": "ok", "usb": "ok", "BLOCKED": "warn", "NOT": "mut", "MISSING": "bad"}.get(word, "bad")
    return f'<span class="b {c}">{e(t)}</span>'


def thumb(path):
    if not path or not os.path.exists(path):
        return ""
    small = path.replace(".png", "_thumb.png")
    if not os.path.exists(small) and subprocess.run(["sips", "-Z", "640", path, "--out", small], capture_output=True).returncode != 0:
        small = path
    return base64.b64encode(open(small, "rb").read()).decode()


def table(head, rows, cls=""):
    th = "".join(f"<th>{h}</th>" for h in head)
    tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class=scroll><table class="{cls}"><tr>{th}</tr>{tr}</table></div>'


def code(text):
    return f"<pre>{e(text)}</pre>"


# ---------------- sections ----------------
sec = []
# what is installed
rows = [[e(s["what"]), f"<code>{e(s['name'])}</code>", e(s["version"][:70]) if s.get("installed") else badge("MISSING")] for s in soft]
sdk = [[f"<code>{e(p['package'])}</code>", e(p["version"]), e(p["description"])] for p in inv.get("android_sdk", [])]
sims = inv.get("simulators", [])
sec.append(("installed", "What is installed", f"""
<p>{len(soft) - len(missing)} of {len(soft)} tools present{(' — missing: ' + ', '.join(missing)) if missing else ''}. Every setting and the
<code>farm-*</code> commands are in a managed block of <code>~/.zshrc</code> {badge('installed' if inv.get('zshrc_block') else 'MISSING')}.</p>
{table(['Component', 'Command', 'Version'], rows)}
<h3>Android SDK</h3>{table(['Package', 'Version', 'Description'], sdk) if sdk else '<p class=mut>not listed</p>'}
<p>AVDs: {', '.join(f'<code>{e(a)}</code>' for a in inv.get('avds', [])) or '—'} · Appium drivers: {', '.join(e(d) for d in inv.get('appium_drivers', [])) or '—'}<br>
iOS simulators: {', '.join(e(s['name']) + ' (' + e(s['runtime']) + ', ' + e(s['state']) + ')' for s in sims[:4]) or '—'}{' …' if len(sims) > 4 else ''}<br>
mitmproxy CA: <code>{e(inv.get('ca', ''))}</code></p>
<details><summary>Homebrew packages ({len(inv.get('brew', []))})</summary><p class=mono>{'<br>'.join(e(b) for b in inv.get('brew', []))}</p></details>"""))

# devices
rows = []
for d in devs:
    proxy = d.get("proxy", "")
    kind = {"android": "Android emulator", "ios": "iOS simulator", "iphone": "iPhone (USB)"}.get(d["platform"], d["platform"])
    wda = next((p["wda"] for p in iphones if p["udid"] == d["udid"]), "") if d["platform"] == "iphone" else ""
    rows.append([e(kind), e(d["name"]), f"<code>{e(d['udid'])}</code>", f"<code>{e(d['appium'])}</code>",
                 f":{d['mitmproxy_port']}", f"<code>{e(proxy)}</code>", badge(wda) if wda else "—"])
known = {d["udid"] for d in devs}
for p in iphones:
    if p["udid"] not in known:
        rows.append(["iPhone (USB)", e(p["name"]), f"<code>{e(p['udid'])}</code>", "not started", f":{p['proxy'].rsplit(':', 1)[-1]}",
                     f"<code>{e(p['proxy'])}</code>", badge(p["wda"])])
sec.append(("devices", "Devices", f"""
<p>Each device has its own mitmproxy and its own Appium server (bound to the device by default capabilities: a test needs only the
server URL). <b>Proxy</b> is what the device uses: emulators reach the Mac as <code>10.0.2.2</code>; the simulator uses the Mac's system
proxy; a real iPhone needs <code>{e(mac_ip)}:&lt;port&gt;</code> typed into its Wi-Fi settings.</p>
{table(['Kind', 'Name', 'UDID / serial', 'Appium', 'mitmproxy', 'Proxy', 'WDA'], rows)}"""))

# test results
if tested:
    cards = []
    for r in results:
        m = r.get("mitm", {})
        shots = "".join(f'<figure><img src="data:image/png;base64,{thumb(s["screenshot"])}" alt=""><figcaption>{e(s["name"])} {badge(s["status"])}</figcaption></figure>'
                        for s in r["steps"] if s.get("screenshot"))
        steps = [[e(s["name"]), badge(s["status"]), e(s["detail"]), f'<span class=u>{e(s["url"][:110])}</span>', f"{s['seconds']}s"] for s in r["steps"]]
        if r.get("error"):
            steps.append(["error", badge("FAIL"), e(r["error"][:300]), "", ""])
        site = "PASS" if r["site_pass"] else ("BLOCKED" if any(s["status"] == "BLOCKED" for s in r["steps"]) else "FAIL")
        cards.append(f"""<div class=dev><h3>{e(r['platform'])} · {e(r['name'])}</h3>
<p class=mut><code>{e(r['udid'])}</code> · {e(r['appium'])} · mitmproxy :{r['mitm_port']} · farm {badge('PASS' if r['farm_pass'] else 'FAIL')} · site {badge(site)}</p>
{table(['Step', 'Status', 'Detail', 'URL', 'Time'], steps)}
<p><b>{m.get('site_requests', 0)}</b> site requests decrypted · <b>{m.get('site_cert_rejections', 0)}</b> certificate rejections · {m.get('requests', 0)} requests in total
{('<br><span class=warn>' + e(m['note']) + '</span>') if m.get('note') else ''}</p>
<div class=shots>{shots}</div></div>""")
    sec.append(("results", f"Test results — {e(env.get('url', ''))}", "".join(cards)))

# how to use
logs_txt = ("tail -f ~/logs/farm/mitmproxy-<port>.log        # decrypted requests of that device\n"
            "farm-logs                                       # all logs: appium-*, mitmproxy-*, emulator-*, ios-tunnel")
stop_txt = ("farm-stop                     # Appium, mitmproxy, emulators, simulator, iOS tunnel; switches the Mac system proxy off\n"
            f"bash {setup} --stop")
appium_rows = [[e(d["name"]), f"<code>{e(d['appium'])}</code>"] for d in devs[:6]]
sec.append(("howto", "How to run the farm", f"""
<p>Open a new Terminal (or <code>source ~/.zshrc</code>) so the tools and <code>farm-*</code> commands are on PATH.</p>
<h3>Start</h3>{code(f'''farm-start                                   # emulators (ANDROID_COUNT in ~/.zshrc) + iOS simulator + connected iPhones
farm-start --ios-system-proxy                # same, and route the simulator through its mitmproxy (whole Mac proxy until farm-stop)
farm-start --skip-android --skip-simulator   # real iPhones only: one mitmproxy + one Appium per phone
farm-status                                  # device / mitmproxy / Appium table
farm-devices                                 # ~/.device-farm/devices.json''')}
<h3>Test (one command: start + Appium test on every device + this report)</h3>{code(f'''bash {here}/run_farm_test.sh                    # 1 Android + 1 iOS simulator
bash {here}/run_farm_test.sh --android-count 8  # 8 Android + 1 iOS simulator
bash {here}/run_farm_test.sh --test-iphones     # also the real iPhones (Safari through WDA)
bash {here}/run_farm_test.sh --report-only      # this report without starting / testing''')}
<h3>Your own Appium tests</h3>
<p>Point the test at the device's server URL; the platform, UDID and ports come from the server.</p>
{table(['Device', 'Appium server'], appium_rows)}
{code('''from appium import webdriver
from appium.options.common import AppiumOptions
o = AppiumOptions()
o.set_capability("appium:app", "/path/to/app.apk")        # or "appium:bundleId": "<installed iOS app>"
d = webdriver.Remote("http://127.0.0.1:4723", options=o)   # the device's server from the table
...
d.quit()''')}
<h3>Watch the traffic</h3>{code(logs_txt)}
<h3>Stop</h3>{code(stop_txt)}"""))

# real iPhone proxy + certificate
rows = [[e(p["name"]), f"<code>{e(p['udid'])}</code>", f"<b><code>{e(p['proxy'].rsplit(':', 1)[0])}</code></b>",
         f"<b><code>{e(p['proxy'].rsplit(':', 1)[-1])}</code></b>", badge(p["wda"])] for p in iphones]
sec.append(("iphone-proxy", "Real iPhones: proxy and mitmproxy certificate (by hand)", f"""
<p>Each iPhone has its own mitmproxy port on this Mac (fixed per phone in <code>~/.device-farm/iphones.txt</code>). The phone must be on a
network that reaches <code>{e(mac_ip)}</code> (same office Wi-Fi / VLAN). Start the proxies first:
<code>farm-start --skip-android --skip-simulator</code> (or a full <code>farm-start</code>).</p>
{table(['iPhone', 'UDID', 'Proxy server', 'Port', 'WDA'], rows) if rows else '<p class=mut>no iPhone connected</p>'}
<ol class=steps>
<li><b>Set the proxy.</b> iPhone <i>Settings → Wi-Fi</i> → tap <b>ⓘ</b> next to the connected network → scroll down to <i>HTTP Proxy</i> →
<b>Configure Proxy → Manual</b> → Server <code>{e(mac_ip)}</code>, Port = the phone's port above, Authentication off → <b>Save</b>.</li>
<li><b>Download the certificate.</b> Open <b>Safari</b> (not Chrome) → <code>http://mitm.it</code>. The page lists the platforms
(if it says "traffic is not passing through mitmproxy", the proxy of step 1 is wrong). Under <b>iOS</b> tap <b>Get mitmproxy-ca-cert.pem</b> → <b>Allow</b> → "Profile Downloaded" → Close.</li>
<li><b>Install the profile.</b> <i>Settings → General → VPN &amp; Device Management</i> → under <i>Downloaded Profile</i> tap <b>mitmproxy</b> →
<b>Install</b> → passcode → <b>Install</b> → <b>Install</b> → <b>Done</b>. (iOS 18+: also shown at the top of Settings as "Profile Downloaded".)</li>
<li><b>Trust it for HTTPS.</b> <i>Settings → General → About</i> → scroll to the bottom → <b>Certificate Trust Settings</b> → switch <b>ON</b>
"mitmproxy" → <b>Continue</b>. Without this step HTTPS pages fail.</li>
<li><b>Check.</b> Safari → <code>https://example.com</code> loads. On the Mac: <code>tail -f ~/logs/farm/mitmproxy-&lt;port&gt;.log</code> shows
<code>GET https://example.com/</code>. The certificate stays installed; only the proxy needs the farm running.</li>
<li><b>Undo.</b> Configure Proxy → <b>Off</b>; <i>VPN &amp; Device Management → mitmproxy → Remove Profile</i>.</li>
</ol>
<p class=mut>Apps that pin their certificates (Google services, some payment / banking SDKs) still refuse mitmproxy: expected. When the farm
is stopped, a phone whose proxy still points at this Mac has no internet: switch its proxy off.</p>"""))

# WDA
sec.append(("wda", "Real iPhones: WebDriverAgent (WDA)", f"""
<p>Appium drives a real iPhone through WDA, installed on the phone as <code>{e(wda_id)}.xctrunner</code>.
{('<b class=bad>Missing on ' + str(len(wda_missing)) + ':</b> ' + ', '.join(e(p['name']) for p in wda_missing) + '.') if wda_missing else 'Installed on every connected iPhone.'}</p>
<ol class=steps>
<li><b>Apple ID in Xcode</b> (a person, once per Mac): Xcode → <i>Settings → Accounts</i> → <b>+</b> → Apple ID → sign in (password + two-factor code)
with an account of the developer team that owns <code>{e(wda_id)}</code>. Select the team → <b>Manage Certificates</b> → <b>+ Apple Development</b>.</li>
<li><b>Each phone</b>: unlocked, <i>Trust This Computer</i> accepted, <i>Settings → Privacy &amp; Security → Developer Mode</i> ON.</li>
<li><b>Build + install</b>: <code>WDA_BUNDLE_ID={e(wda_id)} bash {e(setup)} --install-wda</code> (only phones without WDA; <code>--iphones &lt;udid&gt;</code>
for one, <code>--force</code> to reinstall; several teams in Xcode: <code>WDA_TEAM_ID=&lt;team id&gt;</code>).</li>
<li><b>First launch</b>: if the phone says "Untrusted Developer": <i>Settings → General → VPN &amp; Device Management → Developer App</i> → Trust.</li>
<li><b>iOS 17+ device tunnel</b> (root): Appium starts the preinstalled WDA through the xcuitest driver's tunnel. <code>farm-start</code> starts it
when <code>bash {e(setup)} --admin</code> has added its sudoers line once; otherwise run it in a Terminal:
<code>sudo /opt/homebrew/bin/node {e(os.path.join(os.path.expanduser('~'), '.appium/node_modules/appium-xcuitest-driver/scripts/tunnel-creation.mjs'))}</code> (keep it running).</li>
</ol>"""))

if farm_lines:
    sec.append(("log", "Farm start log", code("\n".join(farm_lines[-60:]))))
if check:
    sec.append(("check", "Software check", code(check.strip())))

# ---------------- HTML ----------------
nav = " · ".join(f'<a href="#{k}">{e(t.split(" —")[0])}</a>' for k, t, _ in sec)
body = "".join(f'<section class=card id="{k}"><h2>{t}</h2>{c}</section>' for k, t, c in sec)
summary = f"""<div class=verdict>
<div><span class=k>Farm (Appium + mitmproxy)</span>{badge(v_farm)}</div>
<div><span class=k>Site (home → search → product)</span>{badge(v_site)}</div>
<div><span class=k>Software</span>{badge('PASS' if not missing else f'MISSING {len(missing)}')}</div>
<div><span class=k>Real iPhones</span>{badge(f'{len(iphones) - len(wda_missing)}/{len(iphones)} with WDA', 'ok' if not wda_missing else 'warn')}</div></div>"""
page = f"""<title>Farm Report</title><meta charset=utf-8>
<style>
:root{{--bg:#f6f7f9;--fg:#1b1f24;--card:#fff;--mut:#5b6573;--line:#dde1e6;--ok:#1a7f37;--warn:#9a6700;--bad:#cf222e;--acc:#0969da}}
@media (prefers-color-scheme:dark){{:root:not([data-theme=light]){{--bg:#0f1216;--fg:#e6e9ed;--card:#171b21;--mut:#9aa4b1;--line:#2a313a;--ok:#3fb950;--warn:#d29922;--bad:#f85149;--acc:#58a6ff;color-scheme:dark}}}}
:root[data-theme=dark]{{--bg:#0f1216;--fg:#e6e9ed;--card:#171b21;--mut:#9aa4b1;--line:#2a313a;--ok:#3fb950;--warn:#d29922;--bad:#f85149;--acc:#58a6ff;color-scheme:dark}}
body{{background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,system-ui,"Apple SD Gothic Neo",sans-serif;margin:0;padding:24px 16px}}
main{{max-width:1120px;margin:auto}} h1{{margin:0 0 4px;font-size:24px}} h2{{margin:0 0 10px;font-size:18px}} h3{{font-size:15px;margin:16px 0 6px}}
a{{color:var(--acc)}} .mut{{color:var(--mut)}} nav{{margin:8px 0 4px;font-size:13px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:14px 0}}
.verdict{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:14px 0}}
.verdict div{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}}
.k{{color:var(--mut);font-size:12px}} .b{{font-weight:600;padding:1px 9px;border-radius:999px;border:1px solid currentColor;font-size:12px;white-space:nowrap;width:fit-content}}
.ok{{color:var(--ok)}} .warn{{color:var(--warn)}} .bad{{color:var(--bad)}}
table{{border-collapse:collapse;width:100%;font-size:13px}} td,th{{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}}
th{{color:var(--mut);font-weight:600}} .scroll{{overflow-x:auto}} .u{{word-break:break-all;color:var(--mut)}}
code{{font:12px ui-monospace,SFMono-Regular,Menlo,monospace}} .mono{{font:12px ui-monospace,Menlo,monospace;columns:2}}
pre{{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px 12px;overflow-x:auto;font-size:12px;line-height:1.5}}
.steps li{{margin:6px 0}} .dev{{border-top:1px solid var(--line);padding-top:8px;margin-top:8px}}
.shots{{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px}} figure{{margin:0;width:180px;max-width:100%}}
figure img{{width:100%;border:1px solid var(--line);border-radius:8px}} figcaption{{font-size:12px;color:var(--mut)}}
</style>
<main>
<h1>Device farm report</h1>
<p class=mut>{e(env.get('run_id', ''))} · {e(env.get('host', ''))} · macOS {e(env.get('macos', ''))} · {e(env.get('xcode', ''))} · Mac IP {e(mac_ip)}
{(' · target ' + e(env.get('url', '')) + ' “' + e(env.get('query', '')) + '”') if tested else ' · report only (no test run)'}</p>
{summary}
<nav>{nav}</nav>
{body}
<p class=mut><b>Farm</b> = each tested device ran an Appium session and its own mitmproxy decrypted the site's HTTPS with no certificate
rejection (real iPhones: the proxy is set by hand, so no traffic is reported, not failed). <b>Site BLOCKED</b> = the site's bot
protection answered with an access-denied page: the farm works, the site does not let this Mac / IP through.</p>
</main>"""
open(f"{run}/report.html", "w").write(page)

# ---------------- Markdown ----------------
md = [f"# Device farm report", "", f"- Run `{env.get('run_id', '')}` on `{env.get('host', '')}` (macOS {env.get('macos', '')}, {env.get('xcode', '')}), Mac IP {mac_ip}",
      f"- Farm: **{v_farm}** · Site: **{v_site}** · Software missing: {', '.join(missing) or 'none'} · iPhones with WDA: {len(iphones) - len(wda_missing)}/{len(iphones)}", "",
      "## Devices", "", "| Kind | Name | UDID | Appium | mitmproxy | Proxy |", "|---|---|---|---|---|---|"]
md += [f"| {d['platform']} | {d['name']} | `{d['udid']}` | {d['appium']} | :{d['mitmproxy_port']} | {d.get('proxy', '')} |" for d in devs]
if tested:
    md += ["", "## Results", "", "| Device | Step | Status | Detail |", "|---|---|---|---|"]
    md += [f"| {r['platform']} {r['name']} | {s['name']} | {s['status']} | {s['detail']} |" for r in results for s in r["steps"]]
md += ["", "## Real iPhones: proxy", "", "| iPhone | UDID | Proxy | WDA |", "|---|---|---|---|"]
md += [f"| {p['name']} | `{p['udid']}` | {p['proxy']} | {p['wda']} |" for p in iphones]
md += ["", "Steps: Settings > Wi-Fi > (i) > Configure Proxy > Manual (server/port above) > Save; Safari http://mitm.it > iOS > Allow;",
       "Settings > General > VPN & Device Management > mitmproxy > Install; Settings > General > About > Certificate Trust Settings > mitmproxy ON.",
       "", "Stop: `farm-stop`. Full instructions: report.html."]
open(f"{run}/report.md", "w").write("\n".join(md) + "\n")
print(f"report: {run}/report.html  {run}/report.md  (farm {v_farm}, site {v_site}, iPhones with WDA {len(iphones) - len(wda_missing)}/{len(iphones)})")
sys.exit(0 if (farm_ok or not tested) else 1)
