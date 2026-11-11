"""Monitor rules. Topology aware: a parent fault silences its children.

Order of evaluation: region -> Mac -> hub -> device. Once a parent is faulty, the devices
under it are listed as `silenced` on the parent finding instead of raising their own alerts.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from .model import HEARTBEAT_STALE_S, Farm, Mac

SEVERITY_ORDER = {"critical": 0, "serious": 1, "warning": 2}
DISK_LOW_GB = 10
QUEUE_STUCK_S = 600
HUB_MIN_DEVICES = 2
HUB_OFFLINE_RATIO = 0.6


@dataclass
class Finding:
    rule: str
    severity: str                 # critical | serious | warning
    scope: str                    # region | mac | hub | device
    target: str
    region: str
    mac: str | None
    summary: str
    evidence: list[str]
    proposed_action: str | None = None        # one of device_farm.actions.ACTION_TYPES, or None = card only
    action_targets: list[str] = field(default_factory=list)
    silenced: list[str] = field(default_factory=list)
    device_kind: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _mac_findings(mac: Mac) -> tuple[list[Finding], bool]:
    """Returns the Mac-level findings and whether the Mac silences everything below it."""
    out: list[Finding] = []
    children = [d.id for d in mac.devices]
    if not mac.reachable:
        why = "reported offline" if not mac.online else f"no heartbeat for {int(mac.last_heartbeat_s)}s"
        out.append(Finding("mac_offline", "critical", "mac", mac.id, mac.region, mac.id,
                           f"Mac {mac.id} is unreachable ({why}); {len(children)} devices unavailable",
                           [f"online={mac.online}", f"last_heartbeat_s={mac.last_heartbeat_s} (stale>{HEARTBEAT_STALE_S})"],
                           proposed_action="reset_mac", action_targets=[mac.id], silenced=children,
                           device_kind=mac.kind))
        return out, True
    if not mac.appium_up:
        out.append(Finding("appium_down", "serious", "mac", mac.id, mac.region, mac.id,
                           f"Appium server is down on {mac.id}", ["appium_up=false"],
                           proposed_action="restart_appium", action_targets=[mac.id], device_kind=mac.kind))
    if not mac.proxy_up:
        out.append(Finding("proxy_down", "serious", "mac", mac.id, mac.region, mac.id,
                           f"mitmproxy is down on {mac.id}; app traffic cannot reach staging",
                           ["proxy_up=false"], proposed_action="restart_proxy", action_targets=[mac.id],
                           device_kind=mac.kind))
    if mac.disk_free_gb < DISK_LOW_GB:
        out.append(Finding("disk_low", "warning", "mac", mac.id, mac.region, mac.id,
                           f"{mac.id} has {mac.disk_free_gb} GB free disk",
                           [f"disk_free_gb={mac.disk_free_gb} (<{DISK_LOW_GB})"], device_kind=mac.kind))
    if mac.queue_oldest_wait_s > QUEUE_STUCK_S:
        out.append(Finding("queue_stuck", "serious", "mac", mac.id, mac.region, mac.id,
                           f"{mac.queue_pending} tasks waiting on {mac.id}, oldest for {int(mac.queue_oldest_wait_s)}s",
                           [f"queue.pending={mac.queue_pending}", f"queue.oldest_wait_s={mac.queue_oldest_wait_s} (>{QUEUE_STUCK_S})"],
                           device_kind=mac.kind))
    return out, False


def _device_findings(mac: Mac) -> list[Finding]:
    out: list[Finding] = []
    hub_silenced: set[str] = set()
    for hub_id, devices in mac.hubs().items():
        offline = [d for d in devices if not d.online and not d.quarantined]
        if (len(devices) >= HUB_MIN_DEVICES and len(offline) >= 2
                and len(offline) / len(devices) >= HUB_OFFLINE_RATIO):
            ids = [d.id for d in offline]
            hub_silenced.update(ids)
            out.append(Finding("hub_fault", "critical", "hub", f"{mac.id}/{hub_id}", mac.region, mac.id,
                               f"{len(offline)} of {len(devices)} iPhones on hub {hub_id} ({mac.id}) dropped together: "
                               "the hub is the likely fault, not the phones",
                               [f"{d.id}: online=false" for d in offline],
                               proposed_action="quarantine_device", action_targets=ids, silenced=ids,
                               device_kind="ios-real"))
    for d in mac.devices:
        if d.id in hub_silenced or d.quarantined:
            continue
        base = dict(scope="device", target=d.id, region=mac.region, mac=mac.id, device_kind=d.kind)
        if not d.online:
            if d.kind == "ios-real":
                out.append(Finding("device_offline", "serious", summary=f"iPhone {d.id} is offline",
                                   evidence=["online=false"], proposed_action="quarantine_device",
                                   action_targets=[d.id], **base))
            else:
                out.append(Finding("emulator_down", "serious", summary=f"{d.kind} {d.id} is not running",
                                   evidence=["online=false"], proposed_action="restart_emulator",
                                   action_targets=[d.id], **base))
        elif not d.booted:
            out.append(Finding("emulator_down", "serious", summary=f"{d.kind} {d.id} is not booted",
                               evidence=["booted=false"], proposed_action="restart_emulator",
                               action_targets=[d.id], **base))
        elif d.kind != "android-emulator" and not d.wda_up:
            out.append(Finding("wda_down", "serious", summary=f"WebDriverAgent is down on {d.id}",
                               evidence=["wda_up=false"], proposed_action="restart_wda",
                               action_targets=[d.id], **base))
        elif not d.app_installed:
            out.append(Finding("app_missing", "warning", summary=f"App under test is not installed on {d.id}",
                               evidence=["app_installed=false"], proposed_action="reinstall_app",
                               action_targets=[d.id], **base))
    return out


def evaluate(farm: Farm) -> list[Finding]:
    findings: list[Finding] = []
    for region, macs in farm.regions().items():
        if len(macs) >= 2 and not any(m.reachable for m in macs):
            findings.append(Finding(
                "region_unreachable", "critical", "region", region, region, None,
                f"All {len(macs)} Macs in {region} are unreachable: suspect the site network, not the Macs",
                [f"{m.id}: online={m.online}, last_heartbeat_s={m.last_heartbeat_s}" for m in macs],
                silenced=[m.id for m in macs] + [d.id for m in macs for d in m.devices]))
            continue
        for mac in macs:
            mac_level, silences = _mac_findings(mac)
            findings.extend(mac_level)
            if not silences:
                findings.extend(_device_findings(mac))
    findings.sort(key=lambda f: (SEVERITY_ORDER[f.severity], f.region, f.target))
    return findings
