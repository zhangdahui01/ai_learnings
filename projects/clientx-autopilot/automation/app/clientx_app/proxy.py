"""mitmproxy for app traffic: start it, check it, point a device at it.

App traffic from the farm reaches the staging environment through mitmproxy running on each Mac.
The addon in proxy/route_to_staging.py rewrites the hosts listed in the routes file and marks the
requests as test traffic. This module only builds and runs local commands on the Mac; it is used by
the device-local agent before a run and by Release Guard's traffic-route hop as a health check.
"""
from __future__ import annotations

import socket
import subprocess
from pathlib import Path

ADDON = Path(__file__).resolve().parent.parent / "proxy" / "route_to_staging.py"


def is_up(host: str = "127.0.0.1", port: int = 8080, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def start_command(port: int = 8080, routes: str = "proxy/routes.json", flag_header: str = "x-test-traffic") -> list[str]:
    return ["mitmdump", "--listen-port", str(port), "-s", str(ADDON),
            "--set", f"clientx_routes={routes}", "--set", f"clientx_flag_header={flag_header}"]


def device_proxy_commands(profile: str, udid: str, host: str, port: int = 8080) -> list[list[str]]:
    """Commands that point one device at the proxy. iOS needs the mitmproxy CA trusted once per device."""
    if profile == "android-emulator":
        # the emulator reaches the Mac's loopback as 10.0.2.2
        target = "10.0.2.2" if host in ("127.0.0.1", "localhost") else host
        return [["adb", "-s", udid, "shell", "settings", "put", "global", "http_proxy", f"{target}:{port}"]]
    if profile == "ios-simulator":
        # a Simulator shares the Mac's network stack: trust the CA in the simulator, proxy is set on the Mac
        return [["xcrun", "simctl", "keychain", udid, "add-root-cert", str(Path.home() / ".mitmproxy" / "mitmproxy-ca-cert.pem")]]
    if profile == "ios-real":
        # a real iPhone takes its proxy from the Wi-Fi profile (MDM / configuration profile); nothing to run here
        return []
    raise KeyError(profile)


def clear_device_proxy_commands(profile: str, udid: str) -> list[list[str]]:
    if profile == "android-emulator":
        return [["adb", "-s", udid, "shell", "settings", "put", "global", "http_proxy", ":0"]]
    return []


def run(commands: list[list[str]], execute: bool = False) -> list[dict]:
    out = []
    for argv in commands:
        if not execute:
            out.append({"cmd": " ".join(argv), "dry_run": True})
            continue
        proc = subprocess.run(argv, capture_output=True, text=True, timeout=60)
        out.append({"cmd": " ".join(argv), "exit": proc.returncode, "stderr": proc.stderr[-300:]})
    return out
