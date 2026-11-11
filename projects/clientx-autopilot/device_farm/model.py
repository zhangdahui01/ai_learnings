"""Farm topology: region -> Mac -> hub -> device.

Device kinds:
  android-emulator  Android emulators running on a Mac Studio
  ios-simulator     iOS Simulators running on a Mac
  ios-real          real iPhones attached through a USB hub
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterator

DEVICE_KINDS = ("android-emulator", "ios-simulator", "ios-real")
HEARTBEAT_STALE_S = 360          # status is pushed every 2 min; three missed pushes = stale


@dataclass
class Device:
    id: str
    kind: str
    region: str
    mac: str
    hub: str | None
    online: bool = True
    booted: bool = True              # emulators / simulators
    wda_up: bool = True              # iOS only
    app_installed: bool = True
    busy: bool = False
    quarantined: bool = False
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def healthy(self) -> bool:
        ios = self.kind in ("ios-simulator", "ios-real")
        return (self.online and self.booted and self.app_installed and not self.quarantined
                and (self.wda_up or not ios))


@dataclass
class Mac:
    id: str
    region: str
    kind: str
    online: bool = True
    last_heartbeat_s: float = 0
    appium_up: bool = True
    proxy_up: bool = True            # mitmproxy that routes app traffic to the staging environment
    disk_free_gb: float = 100
    cpu_pct: float = 0
    queue_pending: int = 0
    queue_oldest_wait_s: float = 0
    devices: list[Device] = field(default_factory=list)

    @property
    def reachable(self) -> bool:
        return self.online and self.last_heartbeat_s <= HEARTBEAT_STALE_S

    def hubs(self) -> dict[str, list[Device]]:
        out: dict[str, list[Device]] = {}
        for d in self.devices:
            if d.hub:
                out.setdefault(d.hub, []).append(d)
        return out


@dataclass
class Farm:
    generated_at: str
    macs: list[Mac]

    @classmethod
    def from_snapshot(cls, snap: dict[str, Any]) -> "Farm":
        macs: list[Mac] = []
        for region in snap.get("regions", []):
            for m in region.get("macs", []):
                queue = m.get("queue", {})
                mac = Mac(id=m["id"], region=region["id"], kind=m.get("kind", "android-emulator"),
                          online=m.get("online", True), last_heartbeat_s=m.get("last_heartbeat_s", 0),
                          appium_up=m.get("appium_up", True), proxy_up=m.get("proxy_up", True),
                          disk_free_gb=m.get("disk_free_gb", 100), cpu_pct=m.get("cpu_pct", 0),
                          queue_pending=queue.get("pending", 0),
                          queue_oldest_wait_s=queue.get("oldest_wait_s", 0))
                for d in m.get("devices", []):
                    mac.devices.append(Device(
                        id=d["id"], kind=d.get("kind", mac.kind), region=mac.region, mac=mac.id,
                        hub=d.get("hub"), online=d.get("online", True), booted=d.get("booted", True),
                        wda_up=d.get("wda_up", True), app_installed=d.get("app_installed", True),
                        busy=d.get("busy", False), quarantined=d.get("quarantined", False), raw=d))
                macs.append(mac)
        return cls(generated_at=snap.get("generated_at", ""), macs=macs)

    def regions(self) -> dict[str, list[Mac]]:
        out: dict[str, list[Mac]] = {}
        for m in self.macs:
            out.setdefault(m.region, []).append(m)
        return out

    def devices(self) -> Iterator[Device]:
        for m in self.macs:
            yield from m.devices

    def availability(self) -> dict[str, dict[str, int]]:
        """Healthy/total device counts per device kind. A device on an unreachable Mac is not healthy."""
        out = {k: {"healthy": 0, "total": 0} for k in DEVICE_KINDS}
        for m in self.macs:
            for d in m.devices:
                out.setdefault(d.kind, {"healthy": 0, "total": 0})
                out[d.kind]["total"] += 1
                out[d.kind]["healthy"] += int(m.reachable and d.healthy)
        return out
