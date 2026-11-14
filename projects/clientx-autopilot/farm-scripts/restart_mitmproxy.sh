#!/usr/bin/env bash
# Restart mitmproxy with the route-to-staging addon.
source "$(dirname "$0")/_common.sh"
root="$(cd "$(dirname "$0")/.." && pwd)"
pkill -f "mitmdump.*--listen-port $PROXY_PORT" 2>/dev/null || true
sleep 1
routes="${CLIENTX_ROUTES:-$root/automation/app/proxy/routes.json}"
log "starting mitmdump on $PROXY_PORT (routes: $routes)"
nohup mitmdump --listen-port "$PROXY_PORT" -s "$root/automation/app/proxy/route_to_staging.py" \
  --set "clientx_routes=$routes" > "$FARM_LOG_DIR/mitmproxy.log" 2>&1 &
wait_port "$PROXY_PORT" 20 && log "mitmproxy is up" || { log "mitmproxy did not come up"; exit 1; }
