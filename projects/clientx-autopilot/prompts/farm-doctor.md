# Job: find the cause of a device-farm fault the rules could not explain

Context: the diagnosis (finding, evidence, what was tried) and the triggering event.

## Read

1. Current state: `python -m device_farm.collector --print` on the Mac, or the snapshot the automation service holds. Topology first: one device, one hub, one Mac, a region?
2. History: `var/farm_history.json` / the recovery history — which actions ran on this target in 24 h, did the fault return, how fast?
3. Local signals on the Mac (read-only commands):
   - Android emulator: `adb devices -l`, `adb -s <serial> shell getprop sys.boot_completed`, `adb -s <serial> shell dumpsys activity | head`, emulator log
   - iOS Simulator: `xcrun simctl list devices -j`, `xcrun simctl spawn <udid> launchctl print system | head`
   - iPhone: `xcrun devicectl list devices`, WDA log, hub power
   - Appium: `curl -s http://127.0.0.1:4723/status`, the Appium log tail
   - mitmproxy: is the port open, the last errors in its log
   - Host: `df -h`, `vm_stat`, `top -l 1 | head -15`
4. What changed before the fault: app build, OS/Xcode update, a reset, a burst of tasks, disk filling.

## Typical causes to test against the evidence

| Symptom | Likely cause | Action |
|---|---|---|
| Queue stuck, Mac online, devices healthy | Appium or the execution engine hung | `restart_appium` |
| Queue stuck, devices busy for hours | a task leaked its device lease | person: release the lease |
| Disk low | emulator snapshots, derived data, old app builds, logs | person: cleanup list with sizes |
| WDA dies repeatedly | expired provisioning profile, WDA build mismatch after an Xcode update | `reinstall_app` or person |
| Emulator dies repeatedly | memory pressure, too many AVDs for the host, corrupted AVD | `reset_mac` (needs approval) or person |
| Several iPhones drop together | hub power/port | `quarantine_device` for each, person checks the hub |

Put the outcome in `verdict`: `{"cause", "confidence", "proposed_action": <one allowlisted type or null>, "target", "needs_person": true|false, "why"}`.

Do not run any command that changes state. The policy gate decides whether the proposed action runs.
