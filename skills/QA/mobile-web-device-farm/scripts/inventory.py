#!/usr/bin/env python3
"""What is installed on this farm Mac, and which devices it has: writes inventory.json for the report.
usage: inventory.py <out.json> <setup_mac_external.sh>"""
import json, os, re, shutil, subprocess, sys

out_file, setup = sys.argv[1], sys.argv[2]
HOME = os.path.expanduser("~")
SDK = os.environ.get("ANDROID_HOME", f"{HOME}/Library/Android/sdk")


def run(*cmd, timeout=60):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return (r.stdout + r.stderr).strip()
    except Exception as e:
        return f"error: {e}"


def first(text):
    return text.splitlines()[0].strip() if text else ""


def tool(name, *args):
    path = shutil.which(name)
    return {"name": name, "version": first(run(path, *args)) if path else "", "path": path or "", "installed": bool(path)}


inv = {"software": [], "brew": [], "android_sdk": [], "appium_drivers": [], "avds": [], "simulators": [], "iphones": []}

# command line tools with versions
for name, args, what in [
    ("brew", ["--version"], "Homebrew package manager"),
    ("git", ["--version"], "Git"),
    ("python3", ["--version"], "Python (pyenv)"),
    ("node", ["--version"], "Node.js"),
    ("npm", ["--version"], "npm"),
    ("pnpm", ["--version"], "pnpm"),
    ("appium", ["--version"], "Appium server"),
    ("mitmdump", ["--version"], "mitmproxy (HTTPS interception)"),
    ("adb", ["--version"], "Android platform-tools (adb)"),
    ("sdkmanager", ["--version"], "Android command line tools (sdkmanager)"),
    ("avdmanager", ["list", "target", "-c"], "Android command line tools (avdmanager)"),
    ("emulator", ["-version"], "Android emulator"),
    ("idevice_id", ["--version"], "libimobiledevice (USB iPhones)"),
    ("ideviceinstaller", ["--version"], "ideviceinstaller (iPhone apps)"),
    ("ios-deploy", ["--version"], "ios-deploy"),
    ("iproxy", ["--version"], "usbmuxd iproxy"),
    ("ffmpeg", ["-version"], "ffmpeg (screen recording)"),
    ("xcodebuild", ["-version"], "Xcode"),
]:
    t = tool(name, *args)
    if name == "avdmanager" and t["installed"]:
        t["version"] = "installed"
    t["what"] = what
    inv["software"].append(t)
java = run("/usr/libexec/java_home")
inv["software"].append({"name": "java", "what": "JDK (Temurin)", "installed": not java.startswith("error") and "Unable" not in java,
                        "version": first(run("java", "-version")), "path": java})

# Homebrew formulae / casks the setup script installs
if shutil.which("brew"):
    for line in run("brew", "list", "--versions").splitlines():
        inv["brew"].append(line)
    for line in run("brew", "list", "--cask", "--versions").splitlines():
        inv["brew"].append(line + " (cask)")

# Android SDK packages
sdkm = shutil.which("sdkmanager")
if sdkm:
    txt = run(sdkm, f"--sdk_root={SDK}", "--list_installed", timeout=120)
    for line in txt.splitlines():
        # old sdkmanager: "pkg;ver | 1.0 | desc |"; new Android CLI: "  build-tools/36.0.0   36.0.0   Android SDK Build-Tools 36"
        m = (re.match(r"\s*([a-z][\w;.\-]+)\s*\|\s*([\w.\-]+)\s*\|\s*(.+?)\s*\|", line)
             or re.match(r"\s+([a-z][\w.\-]*(?:/[\w.\-]+)*)\s{2,}([\w.\-]+)\s{2,}(.+?)\s*$", line))
        if m and (";" in m.group(1) or "/" in m.group(1) or m.group(1) in ("emulator", "platform-tools")):
            inv["android_sdk"].append({"package": m.group(1), "version": m.group(2), "description": m.group(3)})
if shutil.which("emulator"):
    inv["avds"] = [a for a in run("emulator", "-list-avds").splitlines() if a and not a.startswith("INFO")]

# Appium drivers
if shutil.which("appium"):
    for line in run("appium", "driver", "list", "--installed").splitlines():
        m = re.search(r"-\s+(\S+)@(\S+)", line)
        if m:
            inv["appium_drivers"].append(f"{m.group(1)} {m.group(2)}")

# iOS simulators (booted ones first) and runtimes
sims = run("xcrun", "simctl", "list", "devices", "available", "-j")
try:
    for rt, devs in json.loads(sims)["devices"].items():
        for d in devs:
            if "iPhone" in d["name"]:
                inv["simulators"].append({"name": d["name"], "udid": d["udid"], "state": d["state"], "runtime": rt.split(".")[-1]})
    inv["simulators"].sort(key=lambda d: d["state"] != "Booted")
except Exception:
    pass

# iOS simulator of the farm: Xcode, license, runtimes, the device, mitmproxy CA in its trust store, WDA built for simulators
def sim_status():
    import glob, hashlib, sqlite3, ssl
    st = {"xcode": first(run("xcodebuild", "-version")), "xcode_select": run("xcode-select", "-p"),
          "first_launch_done": subprocess.run(["xcodebuild", "-checkFirstLaunchStatus"], capture_output=True).returncode == 0,
          "runtimes": [], "device": os.environ.get("IOS_SIM_DEVICE", "iPhone 17 Pro"), "exists": False, "udid": "", "state": "",
          "runtime": "", "ca_trusted": False, "wda_built": False, "window_app": ""}
    try:
        for r in json.loads(run("xcrun", "simctl", "list", "runtimes", "-j"))["runtimes"]:
            if "iOS" in r.get("identifier", ""):
                st["runtimes"].append(f"{r.get('name')} ({r.get('buildversion', '')}){'' if r.get('isAvailable') else ' unavailable'}")
        found = []
        for rt, devs in json.loads(run("xcrun", "simctl", "list", "devices", "-j"))["devices"].items():
            for d in devs:
                if d["name"] == st["device"] and "iOS" in rt:
                    found.append((d["state"] == "Booted", rt, d))
        if found:
            booted, rt, d = sorted(found, key=lambda x: (x[0], x[1]))[-1]
            st.update(exists=True, udid=d["udid"], state=d["state"], runtime=rt.split(".")[-1])
    except Exception:
        pass
    ca = f"{HOME}/.mitmproxy/mitmproxy-ca-cert.pem"
    if st["udid"] and os.path.exists(ca):
        der = ssl.PEM_cert_to_DER_cert(open(ca).read())   # iOS 17+ trust store: sha256 column (older: sha1)
        db = f"{HOME}/Library/Developer/CoreSimulator/Devices/{st['udid']}/data/private/var/protected/trustd/private/TrustStore.sqlite3"
        try:
            con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            cols = [c[1] for c in con.execute("pragma table_info(tsettings)")]
            col, digest = ("sha256", hashlib.sha256(der).digest()) if "sha256" in cols else ("sha1", hashlib.sha1(der).digest())
            st["ca_trusted"] = any(bytes(r[0]) == digest for r in con.execute(f"select {col} from tsettings"))
            con.close()
        except Exception:
            pass
    st["wda_built"] = bool(glob.glob(f"{HOME}/Library/Developer/Xcode/DerivedData/WebDriverAgent-*/Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app"))
    dev = st["xcode_select"]
    for app in (f"{dev}/Applications/Simulator.app", f"{dev.rsplit('/Developer', 1)[0]}/Applications/DeviceHub.app"):
        if os.path.isdir(app):
            st["window_app"] = os.path.basename(app); break
    return st


inv["ios_simulator"] = sim_status()

# real iPhones: slot, ports, WDA (from the setup script's guide)
guide = run("bash", setup, "--iphone-guide", timeout=300)
m = re.search(r"mitmproxy on this Mac \(([^)]*)\)", guide)
inv["mac_ip"] = m.group(1) if m else ""
for line in guide.splitlines():
    m = re.match(r"\s{2}(.+?)\s+([0-9A-F]{8}-[0-9A-F]{16}|[0-9a-f]{40})\s+(\S+:\d+)\s+(installed|MISSING)\s*$", line)
    if m:
        inv["iphones"].append({"name": m.group(1).strip(), "udid": m.group(2), "proxy": m.group(3), "wda": m.group(4)})
# did the phone really go through its mitmproxy? clients other than this Mac in the proxy's log
for ph in inv["iphones"]:
    port = ph["proxy"].rsplit(":", 1)[-1]
    clients, reqs, rejects = set(), 0, 0
    try:
        for line in open(f"{HOME}/logs/farm/mitmproxy-{port}.log", errors="replace"):
            m = re.search(r"\]\[(\d+\.\d+\.\d+\.\d+):\d+\] ", line)
            if not m or m.group(1) in ("127.0.0.1", inv["mac_ip"]):
                continue
            clients.add(m.group(1))
            reqs += bool(re.search(r" (GET|POST|PUT|HEAD) https?://", line))
            rejects += "does not trust the proxy" in line and "disconnected during" not in line
    except FileNotFoundError:
        pass
    ph.update(phone_ips=sorted(clients), phone_requests=reqs, phone_cert_rejections=rejects)
inv["wda_bundle_id"] = os.environ.get("WDA_BUNDLE_ID", "com.coupang.coupay.WebDriverAgentRunner")
inv["ca"] = f"{HOME}/.mitmproxy/mitmproxy-ca-cert.pem"
inv["zshrc_block"] = "device-farm (managed by setup_mac_external.sh)" in open(f"{HOME}/.zshrc").read() if os.path.exists(f"{HOME}/.zshrc") else False
json.dump(inv, open(out_file, "w"), ensure_ascii=False, indent=2)
print(f"inventory: {sum(1 for s in inv['software'] if s['installed'])}/{len(inv['software'])} tools, "
      f"{len(inv['android_sdk'])} SDK packages, {len(inv['avds'])} AVDs, {len(inv['iphones'])} iPhones")
