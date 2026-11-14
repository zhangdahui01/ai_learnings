#!/usr/bin/env bash
# Restart the Appium server on this Mac.
source "$(dirname "$0")/_common.sh"
pkill -f "appium.*--port $APPIUM_PORT" 2>/dev/null || true
sleep 2
log "starting appium on $APPIUM_PORT"
nohup appium --port "$APPIUM_PORT" --log-timestamp --relaxed-security > "$FARM_LOG_DIR/appium.log" 2>&1 &
wait_port "$APPIUM_PORT" 40 && log "appium is up" || { log "appium did not come up"; exit 1; }
