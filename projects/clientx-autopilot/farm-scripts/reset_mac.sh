#!/usr/bin/env bash
# Reset this Mac's automation services (not a reboot): adb server, emulators, Appium, mitmproxy.
# Needs a person's approval in the policy gate before Farm Autopilot may queue it.
source "$(dirname "$0")/_common.sh"
here="$(dirname "$0")"
log "reset_mac: restarting adb, emulators, appium, mitmproxy"
adb kill-server >/dev/null 2>&1 || true
adb start-server >/dev/null 2>&1 || true
for f in "$FARM_STATE_DIR"/avd-*; do
  [[ -e "$f" ]] || continue
  EMULATOR_PORT="${f##*avd-}" "$here/start_android_emulator.sh" "emulator-${f##*avd-}" || log "emulator ${f##*avd-} failed to restart"
done
"$here/restart_appium.sh"
nc -z 127.0.0.1 "$PROXY_PORT" 2>/dev/null || "$here/restart_mitmproxy.sh" || true
log "reset_mac: done"
