---
name: mobile-web-device-farm
description: Set up a Mac as a mobile device farm and test on it - installs Homebrew, git, Node, pnpm, Appium (UiAutomator2 + XCUITest), JDK, Android SDK (command line tools, platform-tools, platform, build-tools, system image, emulator), libimobiledevice / ideviceinstaller / ios-deploy / ffmpeg, mitmproxy and the shell environment; boots Android emulators and an iOS simulator and takes in real iPhones over USB (up to all connected, e.g. 11), with one mitmproxy and one Appium server per device; installs WebDriverAgent on iPhones that lack it; guides setting the proxy and mitmproxy certificate on real iPhones by hand; runs an Appium mobile-web test (default m.coupang.com - home, search, product) on every device; writes an HTML report of what is installed, the devices, the results and how to run / stop the farm. Use to bring up or verify a farm Mac, add iPhones to it, or smoke-test a mobile site through intercepted HTTPS on Android and iOS.
---

# Mobile-web device farm

One Mac becomes a farm: N Android emulators + 1 iOS simulator + the real iPhones on USB, each with its **own mitmproxy** (HTTPS
decrypted) and its **own Appium server**. One command runs an Appium test on every device and writes an HTML report.

```bash
cd skills/QA/mobile-web-device-farm/scripts
bash run_farm_test.sh --install --admin      # new Mac: all software + sudo steps (password asked once), farm, test, report
bash run_farm_test.sh                        # installed Mac: farm (1 Android + 1 simulator + connected iPhones), test, report
bash run_farm_test.sh --android-count 8      # 8 Android emulators + 1 iOS simulator
bash run_farm_test.sh --install-wda          # build + install WebDriverAgent on the iPhones that lack it, then the run
bash run_farm_test.sh --test-iphones         # also run the test on the real iPhones (Safari through WDA)
bash run_farm_test.sh --report-only          # only the report: installed software, devices, iPhone proxy steps, how to run / stop
bash run_farm_test.sh --stop-after           # stop everything (and the Mac's system proxy) after the report
bash setup_mac_external.sh --start --skip-android --skip-simulator   # proxies + Appium for the real iPhones only
bash setup_mac_external.sh --iphone-guide    # per-iPhone proxy (Mac IP:port), WDA status, certificate steps
bash setup_mac_external.sh --stop            # stop the farm (or farm-stop)
```

The report: `~/device-farm-reports/<run id>/report.html` (self-contained, screenshots embedded) + `report.md`. Sections: verdict,
**what is installed** (tools + versions, Android SDK packages, AVDs, Appium drivers, simulators, Homebrew packages), **devices** (Appium
URL, mitmproxy port, the proxy the device uses, WDA), **test results**, **how to run the farm** (start / test / own Appium tests / watch
traffic / **stop**), **real iPhones: proxy + certificate** steps with each phone's port, **WebDriverAgent** install steps.

## A person does these (Apple ID, passwords, taps on phones)

1. **Xcode** from the App Store (Apple ID), opened once. Android-only: `--skip-ios`.
2. **Admin password**: `run_farm_test.sh --install --admin` (or `setup_mac_external.sh --admin`) in Terminal as an admin user, once per
   Mac. It also writes a sudoers line so the farm can start / stop the **iOS device tunnel** (root) and the Mac's proxy unattended.
3. **Real iPhones**: unlocked, *Trust This Computer* accepted (with the passcode), *Settings → Privacy & Security → Developer Mode* ON.
4. **WDA signing** (only for iPhones without WDA): Xcode → *Settings → Accounts* → **+** → Apple ID of the team that owns the WDA bundle
   id (default `com.coupang.coupay.WebDriverAgentRunner`, change with `WDA_BUNDLE_ID`) → *Manage Certificates* → **+ Apple Development**.
   Then `run_farm_test.sh --install-wda`. If the phone shows "Untrusted Developer": *Settings → General → VPN & Device Management* → trust.
5. **Proxy + certificate on each real iPhone** (by hand, below).

## Real iPhones: proxy and mitmproxy certificate (by hand)

Every phone gets a fixed slot in `~/.device-farm/iphones.txt` → mitmproxy `8300+slot`, Appium `4800+slot`, WDA `8400+slot`. The slot never
changes when phones come and go, so the proxy typed into a phone stays right. `--iphone-guide` prints the table.

1. Start the proxies: `farm-start --skip-android --skip-simulator` (or a full `farm-start`). The phone must reach the Mac's IP (same Wi-Fi /
   VLAN; the macOS firewall off or allowing `mitmdump`).
2. iPhone *Settings → Wi-Fi* → **ⓘ** of the connected network → *Configure Proxy* → **Manual** → Server = Mac IP, Port = the phone's port →
   Save.
3. **Safari** → `http://mitm.it` → under iOS **Get mitmproxy-ca-cert.pem** → Allow. ("traffic is not passing through mitmproxy" = step 2 wrong.)
4. *Settings → General → VPN & Device Management* → **mitmproxy** → Install (passcode) → Install → Done.
5. *Settings → General → About → Certificate Trust Settings* → **mitmproxy ON** → Continue. Without it HTTPS fails.
6. Check: Safari `https://example.com`; on the Mac `tail -f ~/logs/farm/mitmproxy-<port>.log` shows the request.
   Undo: proxy **Off**, remove the profile. A phone whose proxy points at a stopped farm has no internet.

## What each piece does

| Script | Job |
|---|---|
| `scripts/setup_mac_external.sh` | Installer and farm control. Install (idempotent): Homebrew, git, pyenv Python 3.11, Node 22, pnpm, Appium 3 + UiAutomator2 + XCUITest, JDK, Android command line tools / platform-tools / platform / build-tools / system image / emulator + AVDs, chromedriver, ffmpeg / libimobiledevice / ideviceinstaller / ios-deploy, mitmproxy + CA, iPhone simulator, `~/.zshrc` block (environment + `farm-start / farm-stop / farm-status / farm-check / farm-devices / farm-logs`). `--admin`: Xcode license / first launch / iOS runtime, sudoers (proxy, tunnel), no-sleep. `--start / --status / --stop`, `--install-wda`, `--iphone-guide`. |
| `scripts/run_farm_test.sh` | One command: (install) → check → venv with the Appium client → (WDA) → `--start` → `mweb_test.py` per device in parallel → `inventory.py` → `make_report.py`. |
| `scripts/mweb_test.py` | One device: home → search → first product, PASS / BLOCKED / FAIL per step with screenshots, plus what its mitmproxy decrypted. Android: UiAutomator2 drives Chrome by deep links and taps (chromedriver-driven Chrome gets 403 from bot protection) and closes Chrome's prompts. iOS simulator / iPhone: Safari through XCUITest. |
| `scripts/inventory.py` | Installed tools and versions, SDK packages, AVDs, drivers, simulators, iPhones + WDA → `inventory.json`. |
| `scripts/make_report.py` | `report.html` + `report.md`. |

## Ports

- Android emulator *i*: `emulator-<5554+2i>`, mitmproxy `8081+i` (emulator proxy `10.0.2.2:8081+i`), Appium `4723+i`.
- iOS simulator: mitmproxy `8081+n`, Appium `4723+n` (n = emulator count).
- Real iPhone in slot *s*: mitmproxy `8300+s` (phone proxy `<Mac IP>:8300+s`), Appium `4800+s`, WDA `8400+s`.
- Appium servers are bound to their device by default capabilities: a test needs only the URL. List: `~/.device-farm/devices.json`.
  Logs: `~/logs/farm/`.

## How the HTTPS interception works

- **Android**: `adb root`; CA into the system store (Android 14+: tmpfs over the conscrypt APEX, bind-mounted into zygote and apps; redone
  at every start) **and** the user store (Chrome trusts only its roots + user CAs). Chrome's first-run, notification and translate prompts
  are switched off.
- **iOS simulator**: `simctl keychain add-root-cert`; no proxy of its own → `--ios-system-proxy` (used by `run_farm_test.sh` unless
  `--no-ios-proxy`) points the **whole Mac's** proxy at it until `--stop`; meanwhile Mac browsers / Python see mitmproxy (`NO_PROXY='*'`).
- **Real iPhones**: Wi-Fi proxy + certificate by hand (above). Appium starts the preinstalled WDA through the xcuitest driver's **device
  tunnel** (iOS 17+, root, started by `--start` once `--admin` wrote its sudoers line).
- Certificate-pinning services (Google, some payment SDKs) always refuse mitmproxy: expected.

## Reading the report

- **Farm PASS**: each tested device ran an Appium session and its mitmproxy decrypted the site's HTTPS, no certificate rejection. Real
  iPhones: no traffic means the phone's proxy is not set — reported as a note, not a failure. This is the exit code.
- **Site BLOCKED**: the site's bot protection (e.g. Akamai "Access Denied", "사용권한이 없습니다") refused this Mac / IP — also with the
  proxy off; ask for an allowlist of the farm IPs or use a test environment. Do not try to evade the bot protection.
- Another site: `--url https://m.example.com/ --search-url 'https://m.example.com/search?q={q}' --query shoes --product-pattern /item/`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `adb` / `appium` / `gh`: command not found | New Terminal or `source ~/.zshrc`. |
| iPhone: "Failed to start the preinstalled WebDriverAgent" | The device tunnel is not running: `bash setup_mac_external.sh --admin` once, then `farm-start`; or `sudo /opt/homebrew/bin/node ~/.appium/node_modules/appium-xcuitest-driver/scripts/tunnel-creation.mjs` in a Terminal. |
| iPhone: WDA installed but "Failed to start the preinstalled WebDriverAgent in 120000 ms" (tunnel up) | The WDA on the phone is an older build the current xcuitest driver cannot start: `--install-wda --force --iphones <udid>` (same team / bundle id). |
| Appium log: "EACCES ... strongbox/tunnelRegistryPort" | A root tunnel created `~/Library/Application Support/appium-xcuitest-driver-nodejs` as root: `sudo chown -R $USER "~/Library/Application Support/appium-xcuitest-driver-nodejs"`. `--start` now creates it as the user first. |
| iPhone: `--install-wda` "no Apple ID in Xcode" / signing errors | Sign in (step 4 above); the Apple ID must be in the team that owns the bundle id; several teams: `WDA_TEAM_ID=<id>`. |
| iPhone "Pairing dialog response pending" / unpaired | Unlock the phone, tap **Trust**, enter the passcode. |
| Phone has no internet with the proxy on | Check the Server field character by character (a typo such as `172.18.73.159` for `172.18.63.159` sends all traffic nowhere), then that the certificate is trusted (step 5): without it every HTTPS request and iOS's own connectivity check fail. |
| Safari opens `https://mitm.it` and the download fails | Open `http://<Mac IP>:8399/mitmproxy-ca-cert.pem` instead (served by `--start` when iPhones are connected). |
| iPhone: "Unable to launch … because the device is locked" | Unlock the phone; set *Display & Brightness → Auto-Lock → Never* on farm phones. |
| Phone: `http://mitm.it` says traffic not through mitmproxy | Wrong proxy server / port, or phone not on a network that reaches the Mac. |
| No iOS simulator window | Xcode 27 has no Simulator.app: the farm opens `DeviceHub.app`; automation works without a window. |
| `simctl create` fails | `xcodebuild -downloadPlatform iOS`; the newest runtime supporting the device type is used. |
| pip / curl SSL errors on the Mac during a run | The iOS system proxy: `NO_PROXY='*' <command>` or `farm-stop`. |
| 8 emulators swap on a 24 GB Mac | `EMULATOR_ARGS="-memory 1536 -cores 2"` or fewer emulators. |

## Tested

Mac mini (Apple silicon, 24 GB, macOS 27, Xcode 27.2, iOS 27.2 runtime, Android 16 / API 36 emulators, Appium 3.8, mitmproxy 12) with 11
real iPhones on USB (iPhone 14 – 18 Pro Max, iPhone Air):
- `run_farm_test.sh --install --stop-after`: 1 Android + 1 simulator **farm PASS** (site BLOCKED by Akamai for this Mac's IP); 11 iPhones
  each got their own mitmproxy (8300–8310, reachable on the LAN, `http://mitm.it` serves the CA) and Appium server (4800–4810).
- WDA built with the Xcode team (detected from a phone) and installed on all 11 (`--install-wda`, `--force` for the 8 older builds);
  with the device tunnel up, **an Appium session opened on every one of the 11 iPhones in 1–2 s** (iOS 26.0 / 26.6 / 27.0).
- `--android-count 2` after a 1+1 start: stale Appium restarted, farm PASS on all 3 devices.
