#!/usr/bin/env bash
# Start a local farm on this Mac and show its dashboard:
#   Android emulator (headless) + iOS Simulator + Appium + mitmproxy -> status snapshot -> dashboard.
#
#   bash scripts/start_local_farm.sh                 # start everything that is installed
#   SIM_NAME="iPhone 16" bash scripts/start_local_farm.sh
#   bash scripts/start_local_farm.sh --stop
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/farm-scripts/_common.sh"
cd "$ROOT"
AVD="${ANDROID_AVD:-clientx_api${ANDROID_API:-35}}"
have() { command -v "$1" >/dev/null 2>&1; }

if [[ "${1:-}" == "--stop" ]]; then
  pkill -f "device_farm.collector" 2>/dev/null || true
  adb devices 2>/dev/null | awk '/^emulator-/{print $1}' | xargs -n1 -I{} adb -s {} emu kill 2>/dev/null || true
  pkill -f "appium.*--port $APPIUM_PORT" 2>/dev/null || true
  pkill -f "mitmdump.*--listen-port $PROXY_PORT" 2>/dev/null || true
  xcrun simctl shutdown all 2>/dev/null || true
  log "local farm stopped"; exit 0
fi

if have emulator && emulator -list-avds 2>/dev/null | grep -qx "$AVD"; then
  adb devices | grep -q "^emulator-5554" || farm-scripts/start_android_emulator.sh "$AVD" || log "Android emulator failed to boot (see $FARM_LOG_DIR/emulator-5554.log)"
else
  log "skip Android emulator: AVD $AVD not found (run scripts/setup_mac.sh)"
fi

if xcrun simctl list devices >/dev/null 2>&1; then
  SIM_UDID="$(xcrun simctl list devices available -j | python3 -c "
import json,sys,os
want=os.environ.get('SIM_NAME')
sims=[s for r,v in json.load(sys.stdin)['devices'].items() if 'iOS' in r for s in v if 'iPhone' in s['name']]
pick=[s for s in sims if s['name']==want] or [s for s in sims if s['state']=='Booted'] or sims[-1:]
print(pick[0]['udid'] if pick else '')")"
  if [[ -n "$SIM_UDID" ]]; then
    xcrun simctl boot "$SIM_UDID" 2>/dev/null || true
    xcrun simctl bootstatus "$SIM_UDID" -b >/dev/null 2>&1 || true
    log "iOS Simulator $SIM_UDID booted"
  else
    log "skip iOS Simulator: no iPhone simulator runtime installed (Xcode > Settings > Components)"
  fi
else
  log "skip iOS Simulator: Xcode command-line tools not available"
fi

if have appium; then
  nc -z 127.0.0.1 "$APPIUM_PORT" 2>/dev/null || farm-scripts/restart_appium.sh || log "Appium failed to start (see $FARM_LOG_DIR/appium.log)"
else log "skip Appium: not installed (run scripts/setup_mac.sh)"; fi
if have mitmdump; then
  nc -z 127.0.0.1 "$PROXY_PORT" 2>/dev/null || farm-scripts/restart_mitmproxy.sh || log "mitmproxy failed to start (see $FARM_LOG_DIR/mitmproxy.log)"
else log "skip mitmproxy: not installed"; fi

mkdir -p var
python3 -m device_farm.collector --out var/farm_snapshot.json --history var/farm_history.json --dashboard var/farm-dashboard.html
pkill -f "device_farm.collector" 2>/dev/null || true
nohup python3 -m device_farm.collector --out var/farm_snapshot.json --history var/farm_history.json \
  --dashboard var/farm-dashboard.html --watch 120 > "$FARM_LOG_DIR/collector.log" 2>&1 &
log "collector refreshes the dashboard every 2 minutes"
open var/farm-dashboard.html 2>/dev/null || echo "dashboard: $ROOT/var/farm-dashboard.html"

cat <<EOT

Local farm is up. Try:
  python3 -m pytest automation/app/tests --device-profile fake          # framework smoke, no device
  ANDROID_APP_PACKAGE=<pkg> ANDROID_APP_ACTIVITY=<activity> \\
    python3 -m pytest automation/app/tests --device-profile android-emulator
  IOS_BUNDLE_ID=<bundle> DEVICE_UDID=${SIM_UDID:-<simulator udid>} \\
    python3 -m pytest automation/app/tests --device-profile ios-simulator
  python3 -m harness emit fixtures/events/05_device_status.json          # Farm Autopilot on sample data
EOT
