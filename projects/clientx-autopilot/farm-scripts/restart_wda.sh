#!/usr/bin/env bash
# Restart WebDriverAgent on one iOS device (Simulator or real iPhone).
#   restart_wda.sh <udid>
# WDA_BUNDLE_ID defaults to the stock runner id; real devices use the re-signed id of your team.
source "$(dirname "$0")/_common.sh"
udid="${1:?udid}"
bundle="${WDA_BUNDLE_ID:-com.facebook.WebDriverAgentRunner.xctrunner}"
if xcrun simctl list devices | grep -q "$udid"; then
  xcrun simctl terminate "$udid" "$bundle" >/dev/null 2>&1 || true
  log "WDA terminated on simulator $udid; Appium starts it again with the next session"
else
  xcrun devicectl device process terminate --device "$udid" --bundle-identifier "$bundle" >/dev/null 2>&1 \
    || log "devicectl could not terminate WDA on $udid (it may already be gone)"
  log "WDA terminated on iPhone $udid; Appium (usePrebuiltWDA) starts it again with the next session"
fi
