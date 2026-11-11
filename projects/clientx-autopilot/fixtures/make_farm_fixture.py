"""Generate the sanitized farm fixture: topology shaped like the real farm, faults injected by hand.

    python fixtures/make_farm_fixture.py
"""
import json
from pathlib import Path

NOW = 1794387600  # fixed so the fixture is reproducible
HERE = Path(__file__).parent


def mac(mid, kind, n, hub=None):
    devices = [{"id": f"{mid}-d{i + 1}", "kind": kind, "hub": hub, "online": True, "booted": True,
                "wda_up": True, "app_installed": True, "busy": i % 3 == 0} for i in range(n)]
    return {"id": mid, "kind": kind, "online": True, "last_heartbeat_s": 35, "appium_up": True,
            "proxy_up": True, "disk_free_gb": 180, "cpu_pct": 40, "queue": {"pending": 1, "oldest_wait_s": 20},
            "devices": devices}


shanghai = [mac(f"sh-and-{i:02d}", "android-emulator", 8) for i in range(1, 10)]
shanghai += [mac(f"sh-ios-{i:02d}", "ios-real", 6 + i % 3, hub="hub-1") for i in range(1, 7)]
shanghai += [mac("sh-sim-01", "ios-simulator", 6)]
seoul = [mac(f"se-and-{i:02d}", "android-emulator", 6) for i in range(1, 5)]
seoul += [mac("se-ios-01", "ios-real", 6, hub="hub-1"), mac("se-sim-01", "ios-simulator", 4)]
by_id = {m["id"]: m for m in shanghai + seoul}


def dev(mid, n):
    return by_id[mid]["devices"][n - 1]


# --- injected faults -------------------------------------------------------
for n in (1, 2, 3, 4, 5):                       # hub fault: most iPhones on one Mac mini drop together
    dev("sh-ios-03", n)["online"] = False
by_id["se-and-02"].update(online=False, last_heartbeat_s=1900)       # Mac offline
dev("sh-ios-01", 2)["wda_up"] = False                               # WDA down, restarted 3x already
dev("sh-ios-05", 4)["wda_up"] = False                               # WDA down, first time
dev("sh-and-04", 6)["booted"] = False                               # emulator not booted
dev("sh-sim-01", 3)["online"] = False                               # simulator down
by_id["sh-and-07"]["appium_up"] = False                             # Appium down
by_id["se-ios-01"]["proxy_up"] = False                              # mitmproxy down
dev("se-and-03", 2)["app_installed"] = False                        # app missing
by_id["sh-and-02"]["queue"] = {"pending": 9, "oldest_wait_s": 1500}  # queue stuck
by_id["sh-and-09"]["disk_free_gb"] = 6                              # disk low
dev("sh-ios-02", 1)["online"] = False                               # single iPhone offline, flapping
dev("sh-ios-04", 3)["quarantined"] = True

snapshot = {"generated_at": "2026-11-11T09:00:00Z", "now_ts": NOW,
            "regions": [{"id": "shanghai", "macs": shanghai}, {"id": "seoul", "macs": seoul}]}

history = []
for k in range(3):   # WDA restarted three times and the fault came back
    history.append({"ts": NOW - 3600 * (k + 2), "mac": "sh-ios-01", "target": "sh-ios-01-d2",
                    "action": "restart_wda", "result": "ok"})
for k in range(5):   # flapping iPhone
    history.append({"ts": NOW - 1800 * (k + 1), "mac": "sh-ios-02", "target": "sh-ios-02-d1",
                    "action": "status_change", "result": "offline" if k % 2 == 0 else "online"})
history.append({"ts": NOW - 400, "mac": "sh-and-04", "target": "sh-and-04-d6",
                "action": "restart_emulator", "result": "ok"})   # inside cooldown
history.append({"ts": NOW - 7200, "mac": "sh-and-01", "target": "sh-and-01-d3",
                "action": "restart_emulator", "result": "ok"})
history.sort(key=lambda h: -h["ts"])

trend = [{"hour": f"{h:02d}:00", "healthy_pct": p} for h, p in
         zip(range(22, 34), [97, 97, 96, 97, 98, 98, 97, 95, 94, 93, 90, 88])]
for t in trend:
    t["hour"] = f"{int(t['hour'][:2]) % 24:02d}:00"
snapshot["availability_trend"] = trend

(HERE / "farm_snapshot.json").write_text(json.dumps(snapshot, indent=1) + "\n")
(HERE / "farm_history.json").write_text(json.dumps(history, indent=1) + "\n")
print("wrote farm_snapshot.json, farm_history.json")
