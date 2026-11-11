#!/usr/bin/env bash
# One-time setup of a farm Mac (Apple Silicon) for ClientX Autopilot app automation.
# Installs what is missing and skips what is already there. Safe to run again.
#
#   bash scripts/setup_mac.sh            # Android SDK + emulator + AVD, Appium + drivers, mitmproxy, Python deps
#   bash scripts/setup_mac.sh --check    # only report what is installed
#
# Not done here (needs you): installing Xcode from the App Store and accepting its license;
# signing WebDriverAgent for real iPhones (XCODE_ORG_ID / a provisioning profile).
set -euo pipefail
CHECK_ONLY=false; [[ "${1:-}" == "--check" ]] && CHECK_ONLY=true
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
API="${ANDROID_API:-35}"
ARCH="$([[ "$(uname -m)" == "arm64" ]] && echo arm64-v8a || echo x86_64)"
IMAGE="system-images;android-$API;google_apis;$ARCH"
AVD="${ANDROID_AVD:-clientx_api$API}"

have() { command -v "$1" >/dev/null 2>&1; }
# macOS ships a /usr/bin/java stub that exists even with no JDK installed, so test that Java really runs.
use_brew_jdk() {
  local home; home="$(brew --prefix openjdk@17 2>/dev/null)/libexec/openjdk.jdk/Contents/Home"
  [[ -x "$home/bin/java" ]] && export JAVA_HOME="$home" PATH="$home/bin:$PATH"
}
have_java() { java -version >/dev/null 2>&1; }
have brew && ! have_java && use_brew_jdk || true
say()  { printf '\n== %s\n' "$*"; }
ok()   { printf '   ok       %s\n' "$*"; }
miss() { printf '   MISSING  %s\n' "$*"; }

say "Report"
have brew     && ok "Homebrew"                                  || miss "Homebrew (https://brew.sh)"
have_java     && ok "Java: $(java -version 2>&1 | head -1)"     || miss "Java 17+ (a JDK, not the macOS java stub)"
have sdkmanager && ok "Android cmdline-tools"                   || miss "Android cmdline-tools"
have adb      && ok "adb"                                       || miss "Android platform-tools"
have emulator && ok "Android emulator"                          || miss "Android emulator"
{ have emulator && emulator -list-avds 2>/dev/null | grep -qx "$AVD"; } && ok "AVD $AVD" || miss "AVD $AVD"
have node     && ok "Node $(node --version)"                    || miss "Node.js"
have appium   && ok "Appium $(appium --version 2>/dev/null)"    || miss "Appium"
have mitmdump && ok "mitmproxy"                                 || miss "mitmproxy"
if xcode-select -p >/dev/null 2>&1 && xcrun simctl list devices >/dev/null 2>&1; then
  ok "Xcode + simctl ($(xcodebuild -version 2>/dev/null | head -1))"
else
  miss "Xcode with iOS Simulator (install Xcode from the App Store, open it once, then: sudo xcodebuild -license accept)"
fi
$CHECK_ONLY && exit 0

have brew || { echo "Install Homebrew first: https://brew.sh"; exit 1; }

say "Java, Node, mitmproxy, Android command-line tools"
if ! have_java; then
  brew install openjdk@17
  use_brew_jdk
  have_java || { echo "Java still does not run after installing openjdk@17"; exit 1; }
fi
have node     || brew install node
have mitmdump || brew install mitmproxy
if ! have sdkmanager; then
  brew install --cask android-commandlinetools
  mkdir -p "$ANDROID_HOME"
fi
SDKM="sdkmanager --sdk_root=$ANDROID_HOME"

say "Android SDK packages (platform-tools, emulator, platform $API, system image $ARCH)"
yes | $SDKM --licenses >/dev/null || true
$SDKM "platform-tools" "emulator" "platforms;android-$API" "$IMAGE"

say "AVD $AVD"
if ! emulator -list-avds 2>/dev/null | grep -qx "$AVD"; then
  echo no | avdmanager create avd -n "$AVD" -k "$IMAGE" -d pixel_7 --force
fi

say "Appium + drivers"
have appium || npm install -g appium
appium driver list --installed 2>&1 | grep -q uiautomator2 || appium driver install uiautomator2
appium driver list --installed 2>&1 | grep -q xcuitest     || appium driver install xcuitest

say "Python packages"
python3 -m pip install --user --quiet pytest pytest-bdd Appium-Python-Client graphifyy || \
  python3 -m pip install --user --quiet --break-system-packages pytest pytest-bdd Appium-Python-Client graphifyy

say "Web automation packages"
(cd "$ROOT/automation/web" && npm install --silent && npx playwright install chromium)

say "Shell profile"
PROFILE="$HOME/.zshrc"
grep -q "ANDROID_HOME" "$PROFILE" 2>/dev/null || cat >> "$PROFILE" <<EOP

# ClientX Autopilot
${JAVA_HOME:+export JAVA_HOME="$JAVA_HOME"}
export ANDROID_HOME="$ANDROID_HOME"
export PATH="\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/emulator:\$ANDROID_HOME/cmdline-tools/latest/bin:\$PATH"
EOP

say "Done. Next: bash scripts/start_local_farm.sh"
