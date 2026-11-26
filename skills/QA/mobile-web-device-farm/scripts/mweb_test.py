#!/usr/bin/env python3
"""Mobile-web smoke test of one farm device through its Appium server; checks that the device's mitmproxy decrypts the traffic.

Android: UiAutomator2 drives Chrome like a user (deep links + taps, no chromedriver: sites with bot protection answer 403 to
         chromedriver-controlled Chrome).
iOS:     XCUITest drives Safari (web context).

Steps: home page -> search -> first product page. Each step is PASS, BLOCKED (the site answered with an access-denied / bot
protection page) or FAIL. Writes one JSON result file; screenshots go to --shots.
"""
import argparse, json, os, re, sys, time, urllib.parse

from appium import webdriver
from appium.options.common import AppiumOptions
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.common.by import By

BLOCK_MARKERS = ("Access Denied", "error403", "사용권한이 없습니다", "You don't have permission", "Request blocked")
REQ_RE = re.compile(r" (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) https?://([^/:\s]+)")
REJECT = "does not trust the proxy's certificate"

p = argparse.ArgumentParser()
p.add_argument("--platform", required=True, choices=["android", "ios"])
p.add_argument("--name", default="")
p.add_argument("--udid", default="")
p.add_argument("--appium", required=True, help="Appium server URL of the device, e.g. http://127.0.0.1:4723")
p.add_argument("--mitm-log", required=True, help="log file of the device's mitmproxy")
p.add_argument("--mitm-port", type=int, default=0)
p.add_argument("--url", default="https://m.coupang.com/")
p.add_argument("--search-url", default="https://m.coupang.com/nm/search?q={q}")
p.add_argument("--query", default="아이폰")
p.add_argument("--product-pattern", default="/products/", help="substring of a product page URL")
p.add_argument("--shots", required=True)
p.add_argument("--out", required=True, help="result JSON file")
a = p.parse_args()

os.makedirs(a.shots, exist_ok=True)
site_host = urllib.parse.urlparse(a.url).hostname or ""
site_domain = ".".join(site_host.split(".")[-2:])          # e.g. coupang.com: counts www., m., cdn hosts of the site
search_url = a.search_url.replace("{q}", urllib.parse.quote(a.query))
# android: emulator-5554 -> android-5554; ios: first 8 characters of the UDID (unique per device)
tag = (f"android-{a.udid.replace('emulator-', '')}" if a.platform == "android" else f"ios-{a.udid[:8]}") if a.udid else f"{a.platform}-{a.name}"
tag = tag.replace(" ", "_")
res = {"platform": a.platform, "name": a.name, "udid": a.udid, "appium": a.appium, "mitm_port": a.mitm_port,
       "url": a.url, "search_url": search_url, "query": a.query, "session": False, "steps": [], "error": ""}
log_start = os.path.getsize(a.mitm_log) if os.path.exists(a.mitm_log) else 0
t0 = time.time()


def log(msg):
    print(f"[{a.platform} {time.time() - t0:5.1f}s] {msg}", flush=True)


def blocked(text):
    return any(m in (text or "") for m in BLOCK_MARKERS)


def record(d, name, status, detail, url="", title=""):
    shot = f"{a.shots}/{tag}_{len(res['steps']) + 1}_{name}.png"
    try:
        d.save_screenshot(shot)
    except Exception:
        shot = ""
    res["steps"].append({"name": name, "status": status, "detail": detail, "url": url, "title": title,
                         "screenshot": shot, "seconds": round(time.time() - t0, 1)})
    log(f"{name}: {status} {detail} {url}")


d = None
try:
    opts = AppiumOptions()
    opts.set_capability("appium:newCommandTimeout", 180)      # platform, udid and ports come from the server's defaults
    if a.platform == "ios":
        opts.set_capability("browserName", "Safari")
        opts.set_capability("appium:wdaLaunchTimeout", 600000)   # the first session builds WebDriverAgent (minutes)
        opts.set_capability("appium:wdaConnectionTimeout", 600000)
    d = webdriver.Remote(a.appium, options=opts)
    res["session"] = True
    log(f"session {d.session_id}")

    if a.platform == "android":
        def dismiss_chrome_prompts():
            # Chrome promos / dialogs over the page (notifications, sign-in, translate) hide the URL bar from UiAutomator
            for _ in range(3):
                hit = False
                for txt in ("No thanks", "No, thanks", "Not now", "Skip", "Dismiss", "Got it"):
                    for el in d.find_elements(AppiumBy.XPATH, f"//*[@text='{txt}' and @clickable='true']"):
                        try:
                            el.click(); hit = True; time.sleep(1)
                        except Exception:
                            pass
                if not hit:
                    return

        def open_url(u):
            d.execute_script("mobile: deepLink", {"url": u, "package": "com.android.chrome"})
            time.sleep(7)
            dismiss_chrome_prompts()

        def url_bar():
            try:
                return d.find_element(AppiumBy.ID, "com.android.chrome:id/url_bar").text
            except Exception:
                return ""

        open_url(a.url)
        src = d.page_source
        record(d, "home", "BLOCKED" if blocked(src) else ("PASS" if site_domain in url_bar() else "FAIL"),
               "home page" if site_domain in url_bar() else "unexpected page", url_bar())
        open_url(search_url)
        src = d.page_source
        if blocked(src):
            record(d, "search", "BLOCKED", "access denied by the site", url_bar())
        else:
            texts = [e for e in d.find_elements(AppiumBy.XPATH, "//android.webkit.WebView//*[@clickable='true'][string-length(@text) > 12]")]
            record(d, "search", "PASS" if texts else "FAIL", f"{len(texts)} result links", url_bar())
            if texts:
                texts[0].click()
                time.sleep(7)
                dismiss_chrome_prompts()
                src, u = d.page_source, url_bar()
                if blocked(src):
                    record(d, "product", "BLOCKED", "access denied by the site", u)
                else:
                    record(d, "product", "PASS" if "product" in u or a.product_pattern in u else "FAIL", "product page", u)
    else:
        d.set_page_load_timeout(90)
        d.get(a.url)
        time.sleep(3)
        record(d, "home", "BLOCKED" if blocked(d.page_source) else "PASS", "home page", d.current_url, d.title)
        d.get(search_url)
        time.sleep(4)
        if blocked(d.page_source):
            record(d, "search", "BLOCKED", "access denied by the site", d.current_url, d.title)
        else:
            hrefs = [h for h in (x.get_attribute("href") for x in d.find_elements(By.CSS_SELECTOR, f"a[href*='{a.product_pattern}']")) if h]
            record(d, "search", "PASS" if hrefs else "FAIL", f"{len(hrefs)} product links", d.current_url, d.title)
            if hrefs:
                d.get(hrefs[0])
                time.sleep(5)
                st = "BLOCKED" if blocked(d.page_source) else ("PASS" if a.product_pattern in d.current_url else "FAIL")
                record(d, "product", st, "access denied by the site" if st == "BLOCKED" else "product page", d.current_url, d.title)
except Exception as e:
    res["error"] = f"{type(e).__name__}: {str(e)[:400]}"
    log(f"ERROR {res['error']}")
finally:
    if d is not None:
        try:
            d.quit()
        except Exception:
            pass

# mitmproxy evidence: requests of this run (log lines after the start offset)
time.sleep(2)
hosts, site_reqs, rejected = {}, 0, {}
if os.path.exists(a.mitm_log):
    with open(a.mitm_log, errors="replace") as f:
        f.seek(log_start)
        for line in f:
            m = REQ_RE.search(line)
            if m:
                h = m.group(2)
                hosts[h] = hosts.get(h, 0) + 1
                if h == site_domain or h.endswith("." + site_domain) or site_domain.split(".")[0] in h:
                    site_reqs += 1
            elif REJECT in line and "disconnected during" not in line:
                h = (re.search(r"certificate for (\S+)", line) or [None, "?"])[1]
                rejected[h] = rejected.get(h, 0) + 1
site_rejected = {h: n for h, n in rejected.items() if site_domain.split(".")[0] in h}
res["mitm"] = {"log": a.mitm_log, "requests": sum(hosts.values()), "site_requests": site_reqs,
               "top_hosts": sorted(hosts.items(), key=lambda x: -x[1])[:12], "cert_rejections": rejected,
               "site_cert_rejections": sum(site_rejected.values())}
# farm verdict: automation + decrypted traffic work; site verdict: the site itself let the device through
res["farm_pass"] = bool(res["session"] and res["steps"] and site_reqs > 0 and not site_rejected)
res["site_pass"] = bool(res["steps"]) and all(s["status"] == "PASS" for s in res["steps"]) and len(res["steps"]) == 3
res["seconds"] = round(time.time() - t0, 1)
with open(a.out, "w") as f:
    json.dump(res, f, ensure_ascii=False, indent=2)
log(f"mitmproxy: {site_reqs} decrypted {site_domain} requests, {sum(site_rejected.values())} certificate rejections")
log(f"farm {'PASS' if res['farm_pass'] else 'FAIL'}, site {'PASS' if res['site_pass'] else 'BLOCKED/FAIL'}")
sys.exit(0 if res["farm_pass"] else 1)
