---
name: mobile-web-device-farm
description: Set up a Mac as a mobile device farm and test a mobile website on it - installs Homebrew, Node, Appium (UiAutomator2 + XCUITest), Android SDK, mitmproxy and the shell environment, boots Android emulators and an iOS simulator, starts one mitmproxy and one Appium server per device with the mitmproxy CA trusted, runs an Appium mobile-web test (default m.coupang.com - home, search, product) on every device, and writes an HTML/Markdown report. Use to bring up or verify a farm Mac, or to smoke-test a mobile site through intercepted HTTPS on Android and iOS.
---

# Mobile-web device farm

One Mac becomes a farm: N Android emulators + 1 iOS simulator, each with its **own mitmproxy** (HTTPS decrypted) and its **own
Appium server**. Then one Appium test runs on every device and a report says whether the farm works and whether the site let it in.

```bash
cd skills/QA/mobile-web-device-farm/scripts
bash run_farm_test.sh --install --admin      # new Mac: everything (asks the admin password once), farm, test, report
bash run_farm_test.sh                        # installed Mac: farm, test, report (1 Android + 1 iOS)
bash run_farm_test.sh --android-count 8      # bigger Mac: 8 Android emulators + 1 iOS simulator
bash run_farm_test.sh --stop-after           # stop everything (and the Mac's system proxy) after the report
bash setup_mac_external.sh --stop            # stop the farm by hand
```

The report is `~/device-farm-reports/<run id>/report.html` (self-contained, screenshots embedded) and `report.md`.

## Before the first run (a person does these)

1. **Xcode** from the App Store (needs an Apple ID): install it and open it once. Without Xcode the Android part still works
   (`--skip-ios`).
2. Run as an **admin user in Terminal**: Homebrew and `--admin` ask for the password once. For an unattended run, set `SUDO_ASKPASS`
   to a helper that prints the password, and delete the helper afterwards.
3. Copying this folder is enough; `setup_mac_external.sh` reaches only the public internet (`bash setup_mac_external.sh --preflight`
   lists the hosts).

## What each piece does

| Script | Job |
|---|---|
| `scripts/setup_mac_external.sh` | Installer and farm control. Install (idempotent): Homebrew, pyenv Python 3.11, Node 22, pnpm, Appium 3 + UiAutomator2 + XCUITest, JDK, Android SDK + system image + AVDs, chromedriver, ffmpeg / libimobiledevice / ios-deploy, mitmproxy + its CA, iPhone simulator; `--admin`: Xcode license / first launch / iOS runtime, sudoers for `networksetup`, no-sleep. Writes every setting and the `farm-start / farm-stop / farm-status / farm-check / farm-devices / farm-logs` commands into a managed block of `~/.zshrc`. `--start / --status / --stop` run the farm. |
| `scripts/run_farm_test.sh` | One command: (install) → check → Python venv with the Appium client (`~/.device-farm/venv`) → `--start` → `mweb_test.py` on every device in parallel → `make_report.py`. |
| `scripts/mweb_test.py` | Test of one device: home → search → first product. Android: UiAutomator2 drives Chrome by deep links and taps (not chromedriver: bot protection answers 403 to chromedriver-controlled Chrome). iOS: Safari through XCUITest. Each step is PASS / BLOCKED / FAIL, with a screenshot; counts what the device's mitmproxy decrypted. |
| `scripts/make_report.py` | `report.html` + `report.md`: verdicts, per-device steps and screenshots, mitmproxy hosts, farm start log, software versions. |

## Ports and files (`--start`)

- Android emulator *i* (0-based): adb `emulator-<5554+2i>`, mitmproxy `8081+i` (emulator proxy `10.0.2.2:8081+i`), Appium `4723+i`.
- iOS simulator after them: mitmproxy `8081+n`, Appium `4723+n`. Each Appium server is bound to its device by default
  capabilities, so a test needs only the server URL. Device list: `~/.device-farm/devices.json`.
- Logs: `~/logs/farm/` (`mitmproxy-<port>.log`, `appium-<port>.log`, `emulator-<port>.log`). Watch traffic:
  `tail -f ~/logs/farm/mitmproxy-8081.log`.

## How the HTTPS interception is made to work

- **Android**: `adb root`; the mitmproxy CA goes into the system store (Android 14+: tmpfs over the conscrypt APEX, bind-mounted into
  zygote and the apps; redone at every start) **and** into the user store — Chrome trusts only its own roots plus user-added CAs, so
  a system-store-only CA made Chrome reject mitmproxy. Chrome's first-run screens are switched off.
- **iOS**: `simctl keychain add-root-cert`. The simulator has no proxy of its own: `--ios-system-proxy` (used by `run_farm_test.sh`
  unless `--no-ios-proxy`) points **the whole Mac's** HTTP/HTTPS proxy at the simulator's mitmproxy until `--stop`. Meanwhile
  browsers and Python on the Mac see mitmproxy's certificate and complain; `NO_PROXY='*'` helps for command-line tools.
- Google services (`accounts.google.com`, `*.googleapis.com`) pin their certificates and always fail through mitmproxy: expected.

## Reading the report

- **Farm PASS**: every device ran an Appium session and its mitmproxy decrypted the site's HTTPS with no certificate rejection.
  This is the exit code of `run_farm_test.sh`.
- **Site PASS / BLOCKED / FAIL**: whether home, search and product pages loaded. **BLOCKED** = the site's bot protection (e.g.
  Akamai "Access Denied", "사용권한이 없습니다") refused this Mac / IP — not a farm fault; it happens with the proxy off too. Ask the site
  owners to allowlist the farm IPs, or test a staging environment. Do not try to evade the bot protection.
- Another site: `--url https://m.example.com/ --search-url 'https://m.example.com/search?q={q}' --query shoes --product-pattern /item/`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `gh`, `adb`, `appium`: command not found | Open a new Terminal (the `~/.zshrc` block) or `source ~/.zshrc`. |
| No iOS simulator window | Xcode 27 has no Simulator.app: the farm opens `DeviceHub.app`; automation works without a window. |
| `simctl create` fails | The script picks the newest runtime that supports the device type; download one: `xcodebuild -downloadPlatform iOS`. |
| Chrome stays on "Welcome to Chrome" | Re-run `--start` (switches the first-run screens off). |
| "client does not trust the proxy's certificate" for the site | Re-run `--start` (CA injection lasts until the emulator reboots). |
| pip / curl SSL errors on the Mac during a run | The iOS system proxy: `NO_PROXY='*' <command>`, or `setup_mac_external.sh --stop`. |
| 8 emulators swap on a 24 GB Mac | `EMULATOR_ARGS="-memory 1536 -cores 2"` or fewer emulators. |

## Tested

Mac mini (Apple silicon, 24 GB, macOS 27, Xcode 27.2, iOS 27.2 runtime, Android 16 / API 36 emulators, Appium 3.8, mitmproxy 12),
`run_farm_test.sh --install` with 1 Android + 1 iOS and `--android-count 2 --stop-after` with 2 Android + 1 iOS:
**farm PASS on every device** (Appium session, site HTTPS decrypted by the device's own mitmproxy, 0 certificate rejections).
Site: home and search loaded on iOS and on a fresh emulator; search / product pages answered BLOCKED (Akamai) to this Mac's IP,
the same with the proxy off — a site-side block, not a farm fault.

Re-running with another device count is safe: a mitmproxy / Appium process started with other settings (the same port now
belongs to another device) is restarted instead of reused.
