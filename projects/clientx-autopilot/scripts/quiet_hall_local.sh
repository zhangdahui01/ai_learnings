#!/usr/bin/env bash
# Build the Quiet Hall app, install it on a local emulator or simulator, and run its BDD app cases.
# Works from any directory: every path is taken from where this script lives.
#
#   bash scripts/quiet_hall_local.sh android               # build + install + test on the Android emulator
#   bash scripts/quiet_hall_local.sh ios                   # the same on the iOS Simulator
#   bash scripts/quiet_hall_local.sh android --build-only  # build and install, do not test
#   bash scripts/quiet_hall_local.sh android --test-only   # app already installed: only run the cases
#   bash scripts/quiet_hall_local.sh ios -- -k "wooden fish"   # anything after -- goes to pytest
#
# It starts what is missing: the device, Appium and the hall server (port 8787). The app is built as a
# release build, so it carries its own JavaScript and needs no Metro bundler while the cases run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/farm-scripts/_common.sh"
HALL="$(cd "$ROOT/.." && pwd)/quiet-hall"
APP_ID="dev.clientx.quiethall"
HALL_PORT="${HALL_PORT:-8787}"
AVD="${ANDROID_AVD:-clientx_api${ANDROID_API:-35}}"
have() { command -v "$1" >/dev/null 2>&1; }
die()  { echo "ERROR: $*" >&2; exit 1; }

PLATFORM="${1:-}"; shift || true
[[ "$PLATFORM" == "android" || "$PLATFORM" == "ios" ]] || die "usage: bash scripts/quiet_hall_local.sh android|ios [--build-only|--test-only] [-- pytest args]"
BUILD=true; TEST=true; PYTEST_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-only) TEST=false ;;
    --test-only)  BUILD=false ;;
    --) shift; PYTEST_ARGS=("$@"); break ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

[[ -f "$HALL/server/server.mjs" ]] || die "Quiet Hall is not at $HALL. This checkout is old or on another branch; run: git -C \"$ROOT\" checkout main && git -C \"$ROOT\" pull"
have node || die "Node.js is not installed; run: bash scripts/setup_mac.sh"

# ---- device
if [[ "$PLATFORM" == "android" ]]; then
  have adb || die "adb is not installed in $ANDROID_HOME; run: bash scripts/setup_mac.sh"
  if ! adb devices | grep -q "^emulator-.*device$"; then
    "$ROOT/farm-scripts/start_android_emulator.sh" "$AVD" || die "the Android emulator did not boot (see $FARM_LOG_DIR/emulator-5554.log)"
  fi
  export DEVICE_UDID="${DEVICE_UDID:-$(adb devices | awk '/^emulator-.*device$/{print $1; exit}')}"
  log "Android device $DEVICE_UDID"
else
  xcrun simctl list devices >/dev/null 2>&1 || die "Xcode with the iOS Simulator is not available"
  if [[ -z "${DEVICE_UDID:-}" ]]; then
    DEVICE_UDID="$(xcrun simctl list devices available -j | python3 -c "
import json,sys,os
want=os.environ.get('SIM_NAME')
sims=[s for r,v in json.load(sys.stdin)['devices'].items() if 'iOS' in r for s in v if 'iPhone' in s['name']]
pick=[s for s in sims if s['name']==want] or [s for s in sims if s['state']=='Booted'] or sims[-1:]
print(pick[0]['udid'] if pick else '')")"
  fi
  [[ -n "$DEVICE_UDID" ]] || die "no iPhone simulator found (Xcode > Settings > Components)"
  export DEVICE_UDID
  xcrun simctl boot "$DEVICE_UDID" 2>/dev/null || true
  xcrun simctl bootstatus "$DEVICE_UDID" -b >/dev/null 2>&1 || true
  log "iOS Simulator $DEVICE_UDID"
fi

# ---- hall server
if nc -z 127.0.0.1 "$HALL_PORT" 2>/dev/null; then
  log "hall server already running on port $HALL_PORT"
else
  (cd "$HALL" && nohup node server/server.mjs --residents 12 > "$FARM_LOG_DIR/quiet-hall-server.log" 2>&1 &)
  wait_port "$HALL_PORT" 20 || die "the hall server did not start (see $FARM_LOG_DIR/quiet-hall-server.log)"
  log "hall server started on port $HALL_PORT (log: $FARM_LOG_DIR/quiet-hall-server.log)"
fi

# ---- build and install
if $BUILD; then
  cd "$HALL/app"
  [[ -d node_modules ]] || npm install
  log "building Quiet Hall for $PLATFORM (the first build takes ten minutes or more)"
  if [[ "$PLATFORM" == "android" ]]; then
    npx expo run:android --variant release --no-bundler --device "$DEVICE_UDID" \
      || npx expo run:android --variant release --no-bundler
  else
    npx expo run:ios --configuration Release --no-bundler --device "$DEVICE_UDID"
  fi
fi

# An interrupted or failed build can still exit 0, so check the device itself before testing.
app_installed() {
  if [[ "$PLATFORM" == "android" ]]; then
    adb -s "$DEVICE_UDID" shell pm list packages 2>/dev/null | tr -d '\r' | grep -qx "package:$APP_ID"
  else
    xcrun simctl get_app_container "$DEVICE_UDID" "$APP_ID" >/dev/null 2>&1
  fi
}
if app_installed; then
  log "Quiet Hall ($APP_ID) is installed on $DEVICE_UDID"
else
  die "Quiet Hall ($APP_ID) is not installed on $DEVICE_UDID: the build did not finish. Run this script again without --test-only; a build that stops early continues from its cache."
fi
$TEST || exit 0

# ---- Appium and the cases
have appium || die "Appium is not installed; run: bash scripts/setup_mac.sh"
nc -z 127.0.0.1 "$APPIUM_PORT" 2>/dev/null || "$ROOT/farm-scripts/restart_appium.sh" || die "Appium did not start (see $FARM_LOG_DIR/appium.log)"
cd "$ROOT"
if [[ "$PLATFORM" == "android" ]]; then
  export ANDROID_APP_PACKAGE="$APP_ID" ANDROID_APP_ACTIVITY=".MainActivity"
  PROFILE_NAME="android-emulator"
else
  export IOS_BUNDLE_ID="$APP_ID"
  PROFILE_NAME="ios-simulator"
fi
log "running the Quiet Hall cases with $(command -v python3) on $PROFILE_NAME"
python3 -m pytest automation/app/quiet_hall --device-profile "$PROFILE_NAME" -v ${PYTEST_ARGS[@]+"${PYTEST_ARGS[@]}"}
