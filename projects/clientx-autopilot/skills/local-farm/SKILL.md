---
name: local-farm
description: Set up and start a local device farm on a Mac - Android SDK and emulator, iOS Simulator, Appium with UiAutomator2 and XCUITest drivers, mitmproxy - then collect live status and open the dashboard. Use on a Mac Studio or Mac mini to prepare app automation or to bring a farm Mac up.
---
# Local farm on a Mac

```bash
bash scripts/setup_mac.sh --check     # what is installed
bash scripts/setup_mac.sh             # install what is missing (Homebrew, JDK, Android SDK + AVD, Appium + drivers, mitmproxy)
bash scripts/start_local_farm.sh      # boot emulator + simulator, start Appium and mitmproxy, open the dashboard
bash scripts/start_local_farm.sh --stop
```

- Xcode must be installed from the App Store and its license accepted by a person; the script reports it when missing.
- Live status: `python -m device_farm.collector --watch 120 --dashboard var/farm-dashboard.html`.
- Recovery scripts used by Farm Autopilot: `farm-scripts/` (mapped in `policies/farm_commands.json`). Run a queued action: `python -m device_farm.runner --mac <id> --queue var/farm_queue.json --execute`.
- App cases: `pytest automation/app/tests --device-profile android-emulator|ios-simulator|ios-real` with the app's identifiers in the environment (`automation/app/config/devices.json`).
