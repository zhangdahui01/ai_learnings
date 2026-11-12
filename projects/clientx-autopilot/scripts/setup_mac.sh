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
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# avdmanager has no --sdk_root: it always uses the SDK root its own cmdline-tools live in. With the
# Homebrew cask that is <brew prefix>/share/android-commandlinetools, so packages must go there too,
# otherwise avdmanager cannot see the system image sdkmanager installed.
sdk_root() {
  local brew_root; brew_root="$(brew --prefix 2>/dev/null)/share/android-commandlinetools"
  if [[ -d "$brew_root/cmdline-tools" ]]; then echo "$brew_root"
  else echo "${ANDROID_HOME:-$HOME/Library/Android/sdk}"; fi
}
use_sdk() {
  export ANDROID_HOME="$(sdk_root)"; export ANDROID_SDK_ROOT="$ANDROID_HOME"
  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
}
use_sdk
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
[[ -x "$ANDROID_HOME/platform-tools/adb" ]]  && ok "adb ($ANDROID_HOME)"            || miss "Android platform-tools in $ANDROID_HOME"
[[ -x "$ANDROID_HOME/emulator/emulator" ]]   && ok "Android emulator"                || miss "Android emulator in $ANDROID_HOME"
[[ -d "$ANDROID_HOME/system-images/android-$API" ]] && ok "System image android-$API" || miss "System image android-$API"
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
have sdkmanager || brew install --cask android-commandlinetools
use_sdk
mkdir -p "$ANDROID_HOME"
SDKM="sdkmanager --sdk_root=$ANDROID_HOME"
echo "   Android SDK root: $ANDROID_HOME"

say "Android SDK packages (platform-tools, emulator, platform $API, system image $ARCH)"
set +o pipefail                       # `yes` is killed by SIGPIPE when sdkmanager is done; that is not a failure
yes | $SDKM --licenses >/dev/null 2>&1 || true
yes | $SDKM "platform-tools" "emulator" "platforms;android-$API" "$IMAGE"
set -o pipefail
[[ -d "$ANDROID_HOME/system-images/android-$API" ]] || { echo "system image was not installed into $ANDROID_HOME"; exit 1; }

say "AVD $AVD"
if ! emulator -list-avds 2>/dev/null | grep -qx "$AVD"; then
  echo no | avdmanager create avd -n "$AVD" -k "$IMAGE" -d pixel_7 --force \
    || echo no | avdmanager create avd -n "$AVD" -k "$IMAGE" --force \
    || echo "   WARNING: could not create AVD $AVD; continuing with the rest of the setup"
fi
emulator -list-avds 2>/dev/null | grep -qx "$AVD" && ok "AVD $AVD" || miss "AVD $AVD"

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
mkdir -p "$HOME/.clientx-farm"          # read by farm-scripts/_common.sh so every script uses the same SDK and JDK
{ echo "export ANDROID_HOME=\"$ANDROID_HOME\""; echo "export ANDROID_SDK_ROOT=\"$ANDROID_HOME\""
  [[ -n "${JAVA_HOME:-}" ]] && echo "export JAVA_HOME=\"$JAVA_HOME\""; } > "$HOME/.clientx-farm/env"
grep -q "ANDROID_HOME=\"$ANDROID_HOME\"" "$PROFILE" 2>/dev/null || cat >> "$PROFILE" <<EOP

# ClientX Autopilot
${JAVA_HOME:+export JAVA_HOME="$JAVA_HOME"}
export ANDROID_HOME="$ANDROID_HOME"
export PATH="\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/emulator:\$ANDROID_HOME/cmdline-tools/latest/bin:\$PATH"
EOP

say "Done. Next: bash scripts/start_local_farm.sh"
