#!/usr/bin/env python3
"""Mobile-web smoke test of one farm device through its Appium server; checks that the device's mitmproxy decrypts the traffic.

Android: UiAutomator2 drives Chrome like a user (deep links + taps, no chromedriver: sites with bot protection answer 403 to
         chromedriver-controlled Chrome).
iOS:     XCUITest drives Safari (web context).

Real iPhone (--platform iphone): Safari through XCUITest and the preinstalled WDA; its Wi-Fi proxy is set by hand on the phone, so
         no traffic in its mitmproxy means "proxy not set on the phone", not a farm failure.

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
p.add_argument("--platform", required=True, choices=["android", "ios", "iphone"], help="ios = simulator, iphone = real device (USB)")
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
tag = {"android": f"android-{a.udid.replace('emulator-', '')}", "ios": f"ios-{a.udid[:8]}", "iphone": f"iphone-{a.udid}"}[a.platform] if a.udid else f"{a.platform}-{a.name}"
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
    if a.platform == "ios":   # simulator: Safari web context; real iPhones: native Safari (no Web Inspector needed)
        opts.set_capability("browserName", "Safari")
        opts.set_capability("appium:wdaLaunchTimeout", 600000)   # the first session builds WebDriverAgent (minutes)
        opts.set_capability("appium:wdaConnectionTimeout", 600000)
    d = webdriver.Remote(a.appium, options=opts)
    res["session"] = True
    log(f"session {d.session_id}")

    if a.platform == "android":
        def dismiss_chrome_prompts():
            # Chrome promos / dialogs over the page (notifications, sign-in, translate) hide the URL bar from UiAutomator
            for _ in range(2):
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
    elif a.platform == "iphone":
        # Native Safari: the web context of a real iPhone needs Settings > Safari > Advanced > Web Inspector ON on every phone
        # ("The remote debugger did not return any connected web applications"). The page is read through the accessibility tree
        # instead, and the product request is confirmed in the phone's own mitmproxy log.
        SAFARI = "com.apple.mobilesafari"

        def mitm_new(since):
            try:
                with open(a.mitm_log, errors="replace") as f:
                    f.seek(since); return f.read()
            except FileNotFoundError:
                return ""

        def open_url(u):
            d.execute_script("mobile: deepLink", {"url": u, "bundleId": SAFARI})
            time.sleep(8)

        def page_text():
            src = d.page_source
            return src, " ".join(re.findall(r'(?:label|value)="([^"]{2,200})"', src))

        def address():
            for el in d.find_elements(AppiumBy.IOS_PREDICATE, "name IN {'URL', 'TabBarItemTitle', 'UnifiedTabBarItemView', 'Address'}"):
                v = el.get_attribute("value") or el.get_attribute("label") or ""
                if v:
                    return v
            return ""

        win = d.get_window_size()

        def dismiss_overlays():
            # "open in the app" banners / coupon pop-ups cover the result list (e.g. 쿠팡앱으로 보기 with a close button)
            for _ in range(3):
                hit = False
                for el in d.find_elements(AppiumBy.IOS_PREDICATE,
                        "visible == 1 AND (type IN {'XCUIElementTypeButton', 'XCUIElementTypeLink', 'XCUIElementTypeImage'}) AND "
                        "(label IN {'닫기', 'Close', 'close', '×', 'X', '✕', '오늘 하루 보지 않기', '다음에 할게요', 'Not now', 'No thanks'} "
                        "OR name CONTAINS[c] 'close' OR label CONTAINS '닫기')"):
                    try:
                        el.click(); hit = True; time.sleep(1)
                    except Exception:
                        pass
                if not hit:
                    # unlabeled close icon ("✕") in the top-right corner of a web pop-up: it has no label (not even ''), and an
                    # element click does not reach web content, so find it in the page source and tap its centre
                    for m in re.finditer(r"<XCUIElementTypeButton ([^>]*)>", d.page_source):
                        g = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
                        x, y, w, h = (int(g.get(k, 0) or 0) for k in ("x", "y", "width", "height"))
                        if g.get("visible") == "true" and not g.get("label") and 0 < w <= 48 and 0 < h <= 48 \
                                and x > win["width"] * 0.7 and y < win["height"] * 0.3:
                            d.execute_script("mobile: tap", {"x": x + w / 2, "y": y + h / 2}); hit = True; time.sleep(1.5); break
                if not hit:
                    return

        def product_links():
            # product tiles carry a price: a digit right before 원 ("1,575,200원") or ₩; "회원가입" (sign-up) also contains 원
            return d.find_elements(AppiumBy.IOS_PREDICATE,
                                   "type == 'XCUIElementTypeLink' AND visible == 1 AND (label MATCHES '.*[0-9]원.*' OR label CONTAINS '₩')")

        try:
            d.execute_script("mobile: unlock")
        except Exception:
            pass
        off = os.path.getsize(a.mitm_log) if os.path.exists(a.mitm_log) else 0
        open_url(a.url)
        src, txt = page_text()
        home_seen = site_domain in mitm_new(off) or site_domain in address()
        record(d, "home", "BLOCKED" if blocked(txt) else ("PASS" if home_seen else "FAIL"),
               "home page" if home_seen else "no request to the site (proxy / network?)", address())
        off = os.path.getsize(a.mitm_log) if os.path.exists(a.mitm_log) else 0
        open_url(search_url)
        src, txt = page_text()
        if blocked(txt):
            record(d, "search", "BLOCKED", "access denied by the site", address())
        else:
            dismiss_overlays()
            links = product_links()
            for _ in range(3):
                if links:
                    break
                d.execute_script("mobile: swipe", {"direction": "up"}); time.sleep(1.5); dismiss_overlays()
                links = product_links()
            record(d, "search", "PASS" if links else "FAIL", f"{len(links)} product links (with a price)" if links else "no product link visible", address())
            if links:
                off = os.path.getsize(a.mitm_log) if os.path.exists(a.mitm_log) else 0
                r = links[0].rect   # tap the tile (an element click does not reach web content)
                d.execute_script("mobile: tap", {"x": r["x"] + min(r["width"], 160) / 2, "y": r["y"] + min(r["height"], 40) / 2}); time.sleep(8)
                dismiss_overlays()
                src, txt = page_text()
                hit = re.search(r"(?:GET|POST) (https?://\S*" + re.escape(a.product_pattern) + r"\S*)", mitm_new(off))
                st = "BLOCKED" if blocked(txt) else ("PASS" if hit else "FAIL")
                record(d, "product", st, "access denied by the site" if st == "BLOCKED" else ("product page" if hit else "no product request seen"),
                       hit.group(1)[:150] if hit else address())
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
res["mitm"]["note"] = ""
if a.platform == "iphone" and site_reqs == 0:
    # the proxy of a real phone is set by hand: Appium worked, but this phone's traffic does not go through its mitmproxy (yet)
    res["mitm"]["note"] = "no traffic in this phone's mitmproxy: set its Wi-Fi proxy (see the iPhone proxy section)"
    res["farm_pass"] = bool(res["session"] and res["steps"])
res["site_pass"] = bool(res["steps"]) and all(s["status"] == "PASS" for s in res["steps"]) and len(res["steps"]) == 3
res["seconds"] = round(time.time() - t0, 1)
with open(a.out, "w") as f:
    json.dump(res, f, ensure_ascii=False, indent=2)
log(f"mitmproxy: {site_reqs} decrypted {site_domain} requests, {sum(site_rejected.values())} certificate rejections")
log(f"farm {'PASS' if res['farm_pass'] else 'FAIL'}, site {'PASS' if res['site_pass'] else 'BLOCKED/FAIL'}")
sys.exit(0 if res["farm_pass"] else 1)
