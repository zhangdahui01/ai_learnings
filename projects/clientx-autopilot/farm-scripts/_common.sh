#!/usr/bin/env bash
# Shared settings for the farm scripts. Override any of these in the environment of the device-local agent.
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! java -version >/dev/null 2>&1; then     # macOS java stub without a JDK: use the Homebrew JDK when present
  for jdk in /opt/homebrew/opt/openjdk@17 /usr/local/opt/openjdk@17; do
    [[ -x "$jdk/libexec/openjdk.jdk/Contents/Home/bin/java" ]] && export JAVA_HOME="$jdk/libexec/openjdk.jdk/Contents/Home" PATH="$jdk/bin:$PATH" && break
  done
fi
export FARM_LOG_DIR="${FARM_LOG_DIR:-$HOME/.clientx-farm/logs}"
export FARM_STATE_DIR="${FARM_STATE_DIR:-$HOME/.clientx-farm}"
export APPIUM_PORT="${APPIUM_PORT:-4723}"
export PROXY_PORT="${PROXY_PORT:-8080}"
mkdir -p "$FARM_LOG_DIR" "$FARM_STATE_DIR"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$FARM_LOG_DIR/actions.log"; }
wait_port() { for _ in $(seq 1 "${2:-30}"); do nc -z 127.0.0.1 "$1" 2>/dev/null && return 0; sleep 1; done; return 1; }
