#!/usr/bin/env bash
# Reinstall the app under test on one device.
#   reinstall_app.sh android|ios-simulator|ios-real <device id>
# Needs ANDROID_APP_PATH (+ANDROID_APP_PACKAGE) or IOS_APP_PATH (+IOS_BUNDLE_ID): the build the gate is testing.
source "$(dirname "$0")/_common.sh"
kind="${1:?android|ios-simulator|ios-real}"; id="${2:?device id}"
case "$kind" in
  android)
    : "${ANDROID_APP_PATH:?ANDROID_APP_PATH is not set}"
    [[ -n "${ANDROID_APP_PACKAGE:-}" ]] && adb -s "$id" uninstall "$ANDROID_APP_PACKAGE" >/dev/null 2>&1 || true
    adb -s "$id" install -r -g "$ANDROID_APP_PATH" ;;
  ios-simulator)
    : "${IOS_APP_PATH:?IOS_APP_PATH is not set}"
    [[ -n "${IOS_BUNDLE_ID:-}" ]] && xcrun simctl uninstall "$id" "$IOS_BUNDLE_ID" >/dev/null 2>&1 || true
    xcrun simctl install "$id" "$IOS_APP_PATH" ;;
  ios-real)
    : "${IOS_APP_PATH:?IOS_APP_PATH is not set}"
    xcrun devicectl device install app --device "$id" "$IOS_APP_PATH" ;;
  *) echo "unknown kind $kind" >&2; exit 2 ;;
esac
log "reinstalled app on $kind $id"
