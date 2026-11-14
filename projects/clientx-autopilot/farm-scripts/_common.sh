#!/usr/bin/env bash
# Shared settings for the farm scripts. Override any of these in the environment of the device-local agent.
set -euo pipefail
[[ -f "$HOME/.clientx-farm/env" ]] && source "$HOME/.clientx-farm/env"     # written by scripts/setup_mac.sh
if [[ -z "${ANDROID_HOME:-}" ]]; then       # no env file yet: prefer the Homebrew SDK root that setup_mac.sh uses
  for sdk in /opt/homebrew/share/android-commandlinetools /usr/local/share/android-commandlinetools "$HOME/Library/Android/sdk"; do
    [[ -d "$sdk/platform-tools" ]] && export ANDROID_HOME="$sdk" && break
  done
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! java -version >/dev/null 2>&1; then     # macOS java stub without a JDK: use the Homebrew JDK when present
  for jdk in /opt/homebrew/opt/openjdk@17 /usr/local/opt/openjdk@17; do
    [[ -x "$jdk/libexec/openjdk.jdk/Contents/Home/bin/java" ]] && export JAVA_HOME="$jdk/libexec/openjdk.jdk/Contents/Home" PATH="$jdk/bin:$PATH" && break
  done
fi
command -v appium >/dev/null 2>&1 || { command -v npm >/dev/null 2>&1 && export PATH="$(npm prefix -g)/bin:$PATH"; }
export FARM_LOG_DIR="${FARM_LOG_DIR:-$HOME/.clientx-farm/logs}"
export FARM_STATE_DIR="${FARM_STATE_DIR:-$HOME/.clientx-farm}"
export APPIUM_PORT="${APPIUM_PORT:-4723}"
export PROXY_PORT="${PROXY_PORT:-8080}"
mkdir -p "$FARM_LOG_DIR" "$FARM_STATE_DIR"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$FARM_LOG_DIR/actions.log"; }
wait_port() { for _ in $(seq 1 "${2:-30}"); do nc -z 127.0.0.1 "$1" 2>/dev/null && return 0; sleep 1; done; return 1; }
