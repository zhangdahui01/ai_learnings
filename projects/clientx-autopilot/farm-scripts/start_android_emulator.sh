#!/usr/bin/env bash
# Start (or restart) one Android emulator headless and wait until it has booted.
#   start_android_emulator.sh <serial|avd-name>     e.g. emulator-5554 or clientx_api35
source "$(dirname "$0")/_common.sh"
target="${1:?serial or AVD name}"
if [[ "$target" == emulator-* ]]; then
  port="${target#emulator-}"
  avd="$(adb -s "$target" emu avd name 2>/dev/null | head -1 | tr -d '\r' || true)"
  [[ -n "$avd" && "$avd" != "OK" ]] || avd="$(cat "$FARM_STATE_DIR/avd-$port" 2>/dev/null || true)"
  [[ -n "$avd" ]] || { log "cannot resolve the AVD behind $target"; exit 2; }
  adb -s "$target" emu kill >/dev/null 2>&1 || true
  sleep 3
else
  avd="$target"; port="${EMULATOR_PORT:-5554}"
fi
echo "$avd" > "$FARM_STATE_DIR/avd-$port"
log "starting AVD $avd on port $port"
nohup emulator -avd "$avd" -port "$port" -no-window -no-audio -no-boot-anim -no-snapshot-save \
  > "$FARM_LOG_DIR/emulator-$port.log" 2>&1 &
adb -s "emulator-$port" wait-for-device
for _ in $(seq 1 120); do
  [[ "$(adb -s "emulator-$port" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]] && { log "emulator-$port booted"; exit 0; }
  sleep 2
done
log "emulator-$port did not boot in time"; exit 1
