"""Collect this Mac's farm status into the snapshot shape the monitor reads.

Runs on a farm Mac (Mac Studio with Android emulators, Mac with iOS Simulators, Mac mini with
iPhones on a hub). Read-only: it only lists devices and probes local ports.

    python -m device_farm.collector --print
    python -m device_farm.collector --out var/farm_snapshot.json --history var/farm_history.json
    python -m device_farm.collector --watch 120 --dashboard var/farm-dashboard.html   # push every 2 min

Environment: FARM_REGION, FARM_MAC_ID, APPIUM_PORT (4723), PROXY_PORT (8080), ANDROID_APP_PACKAGE,
IOS_BUNDLE_ID, IPHONE_HUB (name of the hub real iPhones hang on; default hub-1).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any, Callable

Run = Callable[[list[str]], tuple[int, str]]


def _run(argv: list[str]) -> tuple[int, str]:
    if shutil.which(argv[0]) is None:
        return 127, ""
    try:
        proc = subprocess.run(argv, capture_output=True, text=True, timeout=30)
        return proc.returncode, proc.stdout
    except (subprocess.TimeoutExpired, OSError):
        return 124, ""


def _port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except OSError:
        return False


def _appium_up(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/status", timeout=2) as resp:
            return bool(json.load(resp).get("value", {}).get("ready", True))
    except Exception:
        return False


def android_emulators(run: Run, package: str | None) -> list[dict[str, Any]]:
    code, out = run(["adb", "devices"])
    devices = []
    for line in out.splitlines()[1:] if code == 0 else []:
        parts = line.split()
        if len(parts) < 2 or not parts[0].startswith("emulator-"):
            continue
        serial, state = parts[0], parts[1]
        online = state == "device"
        booted = online and run(["adb", "-s", serial, "shell", "getprop", "sys.boot_completed"])[1].strip() == "1"
        installed = True
        if package and booted:
            installed = f"package:{package}" in run(["adb", "-s", serial, "shell", "pm", "list", "packages", package])[1]
        devices.append({"id": serial, "kind": "android-emulator", "hub": None, "online": online, "booted": booted,
                        "wda_up": True, "app_installed": installed, "busy": False})
    return devices


def expected_avds(run: Run) -> list[str]:
    code, out = run(["emulator", "-list-avds"])
    return [l.strip() for l in out.splitlines() if l.strip() and not l.startswith("INFO")] if code == 0 else []


def ios_simulators(run: Run, bundle_id: str | None, only_booted: bool = False) -> list[dict[str, Any]]:
    code, out = run(["xcrun", "simctl", "list", "devices", "-j"])
    if code != 0 or not out:
        return []
    devices = []
    for runtime, sims in json.loads(out).get("devices", {}).items():
        if "iOS" not in runtime:
            continue
        for sim in sims:
            if not sim.get("isAvailable", True):
                continue
            booted = sim.get("state") == "Booted"
            if only_booted and not booted:
                continue
            installed = True
            if bundle_id and booted:
                installed = run(["xcrun", "simctl", "get_app_container", sim["udid"], bundle_id])[0] == 0
            devices.append({"id": sim["udid"], "name": sim.get("name"), "kind": "ios-simulator", "hub": None,
                            "online": booted, "booted": booted, "wda_up": True, "app_installed": installed, "busy": False})
    return devices


def real_iphones(run: Run, hub: str) -> list[dict[str, Any]]:
    code, out = run(["idevice_id", "-l"])                   # libimobiledevice, when installed
    udids = [l.strip() for l in out.splitlines() if l.strip()] if code == 0 else []
    if code != 0:
        code, out = run(["xcrun", "xctrace", "list", "devices"])
        section = out.split("== Simulators ==")[0] if code == 0 else ""
        udids = [m.group(1) for line in section.splitlines() if "iPhone" in line
                 for m in [re.search(r"\(([0-9A-Fa-f-]{24,40})\)\s*$", line)] if m]
    return [{"id": u, "kind": "ios-real", "hub": hub, "online": True, "booted": True, "wda_up": True,
             "app_installed": True, "busy": False} for u in udids]


def collect(run: Run = _run, env: dict[str, str] | None = None, known: list[dict[str, Any]] | None = None,
            port_open: Callable[[int], bool] = _port_open, appium_up: Callable[[int], bool] = _appium_up) -> dict[str, Any]:
    """`known` = devices seen in the previous snapshot: one that disappeared is reported offline, not forgotten."""
    env = dict(os.environ if env is None else env)
    devices = (android_emulators(run, env.get("ANDROID_APP_PACKAGE"))
               + ios_simulators(run, env.get("IOS_BUNDLE_ID"), only_booted=not known)
               + real_iphones(run, env.get("IPHONE_HUB", "hub-1")))
    seen = {d["id"] for d in devices}
    for old in known or []:
        if old["id"] not in seen and old.get("kind") != "ios-simulator":
            devices.append({**old, "online": False, "booted": False})
    devices = [d for d in devices if d["kind"] != "ios-simulator" or d["online"]
               or any(k["id"] == d["id"] for k in known or [])]
    kinds = {d["kind"] for d in devices}
    disk = shutil.disk_usage("/")
    mac = {"id": env.get("FARM_MAC_ID") or socket.gethostname().split(".")[0],
           "kind": "ios-real" if "ios-real" in kinds else "android-emulator" if "android-emulator" in kinds
           else "ios-simulator" if kinds else "android-emulator",
           "online": True, "last_heartbeat_s": 0,
           "appium_up": appium_up(int(env.get("APPIUM_PORT", "4723"))),
           "proxy_up": port_open(int(env.get("PROXY_PORT", "8080"))),
           "disk_free_gb": round(disk.free / 1e9, 1), "cpu_pct": round(os.getloadavg()[0] / (os.cpu_count() or 1) * 100),
           "queue": {"pending": 0, "oldest_wait_s": 0}, "devices": devices}
    now = time.time()
    return {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)), "now_ts": now,
            "regions": [{"id": env.get("FARM_REGION", "local"), "macs": [mac]}]}


def status_changes(previous: dict[str, Any] | None, current: dict[str, Any]) -> list[dict[str, Any]]:
    def flat(snap):
        return {d["id"]: (m["id"], d.get("online", True)) for r in snap.get("regions", []) for m in r["macs"] for d in m["devices"]}
    if not previous:
        return []
    before, after = flat(previous), flat(current)
    return [{"ts": current["now_ts"], "mac": mac, "target": dev, "action": "status_change",
             "result": "online" if online else "offline"}
            for dev, (mac, online) in after.items() if dev in before and before[dev][1] != online]


def main() -> None:
    ap = argparse.ArgumentParser(description="Collect this Mac's farm status.")
    ap.add_argument("--out", default="var/farm_snapshot.json")
    ap.add_argument("--history", default="var/farm_history.json")
    ap.add_argument("--print", action="store_true")
    ap.add_argument("--watch", type=int, metavar="SECONDS")
    ap.add_argument("--dashboard", help="regenerate this dashboard file after every collection")
    args = ap.parse_args()
    out, hist = Path(args.out), Path(args.history)
    while True:
        previous = json.loads(out.read_text()) if out.exists() else None
        known = [d for r in (previous or {}).get("regions", []) for m in r["macs"] for d in m["devices"]]
        snap = collect(known=known)
        if previous and previous.get("availability_trend"):
            snap["availability_trend"] = previous["availability_trend"]
        total = [d for r in snap["regions"] for m in r["macs"] for d in m["devices"]]
        healthy = sum(d["online"] and d["booted"] and d["app_installed"] for d in total)
        trend = snap.setdefault("availability_trend", [])
        trend.append({"hour": time.strftime("%H:%M"), "healthy_pct": round(healthy / len(total) * 100) if total else 0})
        del trend[:-24]
        if args.print:
            print(json.dumps(snap, indent=2))
            return
        out.parent.mkdir(parents=True, exist_ok=True)
        history = json.loads(hist.read_text()) if hist.exists() else []
        history = (status_changes(previous, snap) + history)[:500]
        out.write_text(json.dumps(snap, indent=1))
        hist.write_text(json.dumps(history, indent=1))
        if args.dashboard:
            from .dashboard.generate_dashboard import generate
            generate(out, hist, args.dashboard, Path(__file__).resolve().parent.parent / "policies" / "farm_policy.json")
        print(f"{snap['generated_at']} {len(total)} devices, {healthy} healthy -> {out}")
        if not args.watch:
            return
        time.sleep(args.watch)


if __name__ == "__main__":
    main()
