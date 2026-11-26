#!/bin/bash
# setup_mac_external.sh — standalone installer of the software of a device farm Mac that can reach the INTERNET only.
#
# Copy this single file to the Mac and run it as the standard (non-admin) agent user. It needs nothing from the repo or from
# any internal (company network) host such as an internal GitHub or artifact store: every download comes from the
# public internet (hosts listed by --list and checked by --preflight).
#
#   bash setup_mac_external.sh --list                  # what is installed, with versions and download hosts
#   bash setup_mac_external.sh --preflight             # which of those hosts this Mac can reach
#   bash setup_mac_external.sh --check                 # what is already installed (changes nothing)
#   bash setup_mac_external.sh [options]               # install what is missing (idempotent, can be re-run)
#
# Options:
#   --skip-android          no Android SDK / emulator / chromedriver
#   --skip-ios              no libimobiledevice / ios-deploy / simulator / ffmpeg
#   --avd-names a,b,c       AVDs to create (default pixel_8_api36; pass the names your device plan uses)
#   --repo-dir <path>       a copy of the farm agent repo on this Mac: creates its .venv and installs requirements.txt from PyPI
#   --admin                 also do the admin steps with sudo (run as an admin user): Homebrew installer, Xcode license / first launch /
#                           iOS runtime download, sudoers for networksetup + shutdown for --agent-user, no-sleep settings
#   --agent-user <name>     user of the agent for the sudoers line (default: the user running this script)
#   --install-homebrew      only the Homebrew installer (implied by --admin)
#   --dry-run               print the commands only
#
# NOT installed here (cannot come from the public internet, or needs an Apple ID):
#   - Xcode.app (install it first; --admin then does the license, first launch, runtime and xcode-select)
#   - without --admin: the Xcode license / first launch / iOS runtime, sudoers for `networksetup`, no-sleep settings. This script
#     then only checks them and creates the iPhone simulator when the runtime exists.
#   - the agent code, the test repo, the App builds, GitHub token: they live on the internal network (see the end of the output).

set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-22}"
PYTHON_VERSION="${PYTHON_VERSION:-3.11.9}"
PNPM_VERSION="${PNPM_VERSION:-10.14.0}"
APPIUM_VERSION="${APPIUM_VERSION:-3.8.0}"
UIAUTOMATOR2_VERSION="${UIAUTOMATOR2_VERSION:-8.7.0}"
XCUITEST_VERSION="${XCUITEST_VERSION:-12.15.1}"
ANDROID_API="${ANDROID_API:-36}"
CHROMEDRIVER_VERSIONS="${CHROMEDRIVER_VERSIONS:-133.0.6943.141}"   # one per Chrome major on the emulator images, space separated
IOS_SIM_DEVICE="${IOS_SIM_DEVICE:-iPhone 17 Pro}"
IOS_SIM_DEVICE_TYPE="${IOS_SIM_DEVICE_TYPE:-com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro}"
BREW_FORMULAE=(xz openssl@3 pyenv "node@${NODE_MAJOR}" mitmproxy)
BREW_FORMULAE_IOS=(ffmpeg libimobiledevice libusbmuxd ios-deploy)
BREW_CASKS_ANDROID=(temurin android-commandlinetools)
SUDOERS_NAME="${SUDOERS_NAME:-device-farm-agent}"   # file name in /etc/sudoers.d (--admin)

ADMIN=false; AGENT_USER="$(id -un)"; SKIP_ANDROID=false; SKIP_IOS=false; AVD_NAMES="pixel_8_api36"; REPO_DIR=""; INSTALL_BREW=false; DRY_RUN=false; MODE="install"
_need_value() { [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || { echo "option $1 needs a value" >&2; exit 2; }; }
while [[ $# -gt 0 ]]; do
    case "$1" in
        --list|--preflight|--check) MODE="${1#--}" ;;
        --skip-android) SKIP_ANDROID=true ;;
        --skip-ios) SKIP_IOS=true ;;
        --avd-names) _need_value "$@"; AVD_NAMES="$2"; shift ;;
        --repo-dir) _need_value "$@"; REPO_DIR="$2"; shift ;;
        --install-homebrew) INSTALL_BREW=true ;;
        --admin) ADMIN=true; INSTALL_BREW=true ;;
        --agent-user) _need_value "$@"; AGENT_USER="$2"; shift ;;
        --dry-run) DRY_RUN=true ;;
        -h|--help) awk 'NR>1 && !/^#/ {exit} NR>1 {sub(/^# ?/, ""); print}' "$0"; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
    shift
done

LOG_DIR="${HOME}/logs"; mkdir -p "${LOG_DIR}"; LOG_FILE="${LOG_DIR}/setup_mac_external.log"
_log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "${LOG_FILE}"; }
_ok()  { _log "ok   $*"; }
_err() { _log "FAIL $*"; FAILS=$((FAILS+1)); }
_run() { if [[ "${DRY_RUN}" == "true" ]]; then _log "dry-run: $*"; else "$@"; fi; }
FAILS=0

# host -> what needs it (public internet only)
HOSTS=(
  "raw.githubusercontent.com|Homebrew installer script (only with --install-homebrew)"
  "github.com|Homebrew itself / pyenv / Appium drivers (public GitHub, not an internal one)"
  "formulae.brew.sh|Homebrew formula index"
  "ghcr.io|Homebrew bottles (xz, openssl, pyenv, node, mitmproxy, ffmpeg, libimobiledevice, ios-deploy)"
  "www.python.org|Python ${PYTHON_VERSION} source (pyenv)"
  "registry.npmjs.org|npm: pnpm, appium, appium drivers"
  "pypi.org|pip: requirements of the agent"
  "files.pythonhosted.org|pip downloads"
  "dl.google.com|Android command line tools, SDK packages, emulator, system image"
  "storage.googleapis.com|chromedriver (Chrome for Testing)"
  "swcdn.apple.com|iOS simulator runtime (xcodebuild -downloadPlatform, admin)"
)

cmd_list() {
    cat <<EOF
Software (all from the public internet)                    version
  Homebrew formulae: ${BREW_FORMULAE[*]}$([[ "${SKIP_IOS}" == "true" ]] || echo " ${BREW_FORMULAE_IOS[*]}")
  Homebrew casks (Android): ${BREW_CASKS_ANDROID[*]}
  Python (pyenv)                                           ${PYTHON_VERSION}
  Node.js                                                  ${NODE_MAJOR}.x
  pnpm / appium (npm -g, prefix ~/.npm-global)             ${PNPM_VERSION} / ${APPIUM_VERSION}
  Appium drivers uiautomator2 / xcuitest                   ${UIAUTOMATOR2_VERSION} / ${XCUITEST_VERSION}
  Android SDK: platform-tools, emulator, platforms;android-${ANDROID_API}, build-tools;${ANDROID_API}.0.0, system-images;android-${ANDROID_API};google_apis;arm64-v8a
  AVDs                                                     ${AVD_NAMES}
  chromedriver (Chrome for Testing)                        ${CHROMEDRIVER_VERSIONS}
  mitmproxy CA (generated locally)
  iOS simulator device                                     ${IOS_SIM_DEVICE} (needs Xcode + the iOS runtime from IT)
Download hosts:
EOF
    for h in "${HOSTS[@]}"; do echo "  ${h%%|*}  —  ${h#*|}"; done
}

cmd_preflight() {
    local bad=0
    for h in "${HOSTS[@]}"; do
        local host="${h%%|*}" code
        code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "https://${host}/" || true)"
        if [[ "${code}" =~ ^[2345][0-9][0-9]$ ]]; then echo "reachable  ${host} (HTTP ${code})"; else echo "BLOCKED    ${host}"; bad=$((bad+1)); fi
    done
    echo "${bad} host(s) blocked (a 4xx/5xx answer still means the host is reachable)"
    return $((bad > 0))
}

_have() { command -v "$1" &>/dev/null; }
_ver()  { local out; out="$("$@" 2>&1 || true)"; echo "${out%%$'\n'*}"; }
# Whole output first, grep after: with `set -o pipefail`, `tool | grep -q x` reports a failure when grep exits at the first match and the
# tool is killed by SIGPIPE, so an installed driver / AVD / Python looked missing now and then.
_drivers() { appium driver list --installed 2>&1 || true; }
_has_line() { local text="$1"; shift; grep "$@" <<<"${text}" >/dev/null; }

cmd_check() {
    for c in brew pyenv python3 node npm pnpm appium mitmdump; do
        if _have "$c"; then echo "present  $c  $(_ver "$c" --version)"; else echo "MISSING  $c"; fi
    done
    if [[ "${SKIP_ANDROID}" != "true" ]]; then for c in adb sdkmanager emulator avdmanager; do
        if _have "$c"; then echo "present  $c"; else echo "MISSING  $c"; fi; done; fi
    if [[ "${SKIP_IOS}" != "true" ]]; then for c in idevice_id ios-deploy ffmpeg iproxy xcodebuild; do
        if _have "$c"; then echo "present  $c"; else echo "MISSING  $c"; fi; done; fi
    # was `[[ -d ... ]] && appium ...`: on a Mac without Appium that made the function return 1, so `--check` exited 1 and, with
    # `set -e -o pipefail`, the install run stopped at the summary before its last lines
    if [[ -d "${HOME}/.appium/node_modules" ]] && _have appium; then _drivers | sed 's/^/  /' | head -6 || true; fi
    return 0
}

[[ "${MODE}" == "list" ]] && { cmd_list; exit 0; }
[[ "${MODE}" == "preflight" ]] && { cmd_preflight; exit $?; }

# PATH of the tools installed below (idempotent, also for the current session)
for prefix in /opt/homebrew /usr/local; do [[ -x "${prefix}/bin/brew" ]] && eval "$("${prefix}/bin/brew" shellenv)" && break; done
export PYENV_ROOT="${HOME}/.pyenv"; export PATH="${PYENV_ROOT}/bin:${HOME}/.npm-global/bin:${HOME}/.local/bin:${PATH}"
export ANDROID_HOME="${ANDROID_HOME:-${HOME}/Library/Android/sdk}"; export ANDROID_SDK_ROOT="${ANDROID_HOME}"
export PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${PATH}"
[[ "${MODE}" == "check" ]] && { cmd_check; exit 0; }

_log "=== Device farm Mac: software from the public internet ($(id -un), $(sw_vers -productVersion 2>/dev/null || echo ?)) ==="
cmd_preflight || _log "WARNING: some hosts are blocked, the steps that need them will fail (see above)"

# ---- 0. Admin steps (sudo) ----
if [[ "${ADMIN}" == "true" ]]; then
    _log "--- 0. Admin steps (sudo) ---"
    _run sudo -v || _err "this user cannot sudo"
    XCODE="/Applications/Xcode.app/Contents/Developer"
    if [[ -d "${XCODE}" ]]; then
        _run sudo xcode-select -s "${XCODE}" && _run sudo xcodebuild -license accept && _run sudo xcodebuild -runFirstLaunch && _ok "Xcode selected, license accepted, first launch done" || _err "Xcode admin steps"
        if [[ "${SKIP_IOS}" == "false" ]] && ! _has_line "$(xcrun simctl list runtimes 2>/dev/null || true)" iOS; then
            _log "downloading the iOS simulator runtime (several GB, Apple CDN)..."
            _run xcodebuild -downloadPlatform iOS || _err "iOS runtime download"
        fi
    else
        _err "Xcode.app is not at /Applications/Xcode.app: install Xcode first (App Store / developer.apple.com, Apple ID)"
    fi
    if id "${AGENT_USER}" &>/dev/null; then
        TMP="$(mktemp)"; echo "${AGENT_USER} ALL=(root) NOPASSWD: /usr/sbin/networksetup, /sbin/shutdown" > "${TMP}"
        if [[ "${DRY_RUN}" == "true" ]]; then _log "dry-run: write /etc/sudoers.d/${SUDOERS_NAME} for ${AGENT_USER}"
        elif sudo visudo -cf "${TMP}" &>/dev/null && sudo install -m 0440 -o root -g wheel "${TMP}" /etc/sudoers.d/${SUDOERS_NAME}; then _ok "sudoers: ${AGENT_USER} may run networksetup and shutdown without a password (iOS simulator system proxy)"
        else _err "sudoers file not written"; fi
        rm -f "${TMP}"
    else
        _err "agent user ${AGENT_USER} does not exist"
    fi
    _run sudo pmset -a sleep 0 disksleep 0 displaysleep 0 autorestart 1 && _ok "pmset: never sleep, restart after a power failure"
fi

# ---- 1. Homebrew packages ----
_log "--- 1. Homebrew ---"
if ! _have brew; then
    if [[ "${INSTALL_BREW}" == "true" ]]; then
        if [[ "${DRY_RUN}" == "true" ]]; then _log "dry-run: download and run https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh"
        elif BREW_INSTALLER="$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" && [[ -n "${BREW_INSTALLER}" ]]; then
            /bin/bash -c "${BREW_INSTALLER}" || _err "Homebrew installer failed"
        else _err "Homebrew installer could not be downloaded (raw.githubusercontent.com)"; fi
        for prefix in /opt/homebrew /usr/local; do [[ -x "${prefix}/bin/brew" ]] && eval "$("${prefix}/bin/brew" shellenv)" && break; done
    else
        _err "Homebrew is missing: ask IT to install it, or re-run with --install-homebrew (admin password)"
    fi
fi
MISSING_BREW=()
_brew_pkg() {   # _brew_pkg <name> [cask]   (bash 3.2 of macOS: no empty-array expansion under set -u)
    local kind="formula" flag=""
    [[ "${2:-}" == "cask" ]] && { kind="cask"; flag="--cask"; }
    if brew list ${flag} "$1" &>/dev/null; then _ok "brew ${kind} $1"; return 0; fi
    if [[ -w "$(brew --prefix)/Cellar" ]]; then
        _run brew install ${flag} "$1" && _ok "brew ${kind} $1 installed" || _err "brew install $1 failed"
    else
        _err "brew ${kind} $1 missing and Homebrew is not writable for $(id -un): IT must run: brew install ${flag} $1"
        MISSING_BREW+=("$1")
    fi
}
if _have brew; then
    for p in "${BREW_FORMULAE[@]}"; do _brew_pkg "$p"; done
    [[ "${SKIP_IOS}" == "true" ]] || for p in "${BREW_FORMULAE_IOS[@]}"; do _brew_pkg "$p"; done
    if [[ "${SKIP_ANDROID}" != "true" ]]; then for p in "${BREW_CASKS_ANDROID[@]}"; do
        # the temurin cask is a .pkg that asks for an admin password: do not ask for it when a JDK is already there
        if [[ "$p" == "temurin" ]] && /usr/libexec/java_home -v 17+ &>/dev/null; then _ok "JDK already installed ($(/usr/libexec/java_home -v 17+)), temurin not needed"; continue; fi
        _brew_pkg "$p" cask
    done; fi
    # node@N is keg-only: `brew link` refuses when another node is linked, and then node/npm were "missing" below. Use its own bin dir.
    if ! _have node; then
        _run brew link --overwrite "node@${NODE_MAJOR}" &>/dev/null || true
        NODE_BIN="$(brew --prefix "node@${NODE_MAJOR}" 2>/dev/null || true)/bin"
        if ! _have node && [[ -x "${NODE_BIN}/node" ]]; then export PATH="${NODE_BIN}:${PATH}"; fi
    fi
    hash -r
fi

# ---- 2. Python via pyenv ----
_log "--- 2. Python ${PYTHON_VERSION} ---"
if _have pyenv; then
    eval "$(pyenv init - bash 2>/dev/null || pyenv init -)" || true
    if ! _has_line "$(pyenv versions --bare 2>/dev/null || true)" -x "${PYTHON_VERSION}"; then
        OPENSSL_PREFIX="$(brew --prefix openssl@3 2>/dev/null || echo /opt/homebrew/opt/openssl@3)"
        _run env LDFLAGS="-L${OPENSSL_PREFIX}/lib" CPPFLAGS="-I${OPENSSL_PREFIX}/include" PKG_CONFIG_PATH="${OPENSSL_PREFIX}/lib/pkgconfig" \
            PYTHON_CONFIGURE_OPTS="--with-openssl=${OPENSSL_PREFIX}" pyenv install "${PYTHON_VERSION}" || _err "pyenv install ${PYTHON_VERSION}"
    fi
    if _has_line "$(pyenv versions --bare 2>/dev/null || true)" -x "${PYTHON_VERSION}"; then _ok "python ${PYTHON_VERSION} (pyenv)"; fi
else
    _err "pyenv missing"
fi

# ---- 3. Node tools and Appium ----
_log "--- 3. pnpm, Appium, drivers ---"
if _have npm; then
    if [[ ! -w "$(npm config get prefix)/lib" ]]; then _run npm config set prefix "${HOME}/.npm-global" || _err "npm config set prefix"; fi
    _run mkdir -p "${HOME}/.npm-global/bin"
    [[ "$(pnpm --version 2>/dev/null || true)" == "${PNPM_VERSION}" ]] || _run npm install -g "pnpm@${PNPM_VERSION}" || _err "pnpm"
    [[ "$(appium --version 2>/dev/null || true)" == "${APPIUM_VERSION}" ]] || _run npm install -g "appium@${APPIUM_VERSION}" || _err "appium"
    hash -r
    if _have appium; then
        DRIVERS="$(_drivers)"
        _has_line "${DRIVERS}" uiautomator2 || _run appium driver install "uiautomator2@${UIAUTOMATOR2_VERSION}" || _err "uiautomator2 driver"
        if [[ "${SKIP_IOS}" == "false" ]] && ! _has_line "${DRIVERS}" xcuitest; then
            _run appium driver install "xcuitest@${XCUITEST_VERSION}" || _err "xcuitest driver"
        fi
        _ok "appium $(appium --version 2>/dev/null)"
    fi
else
    _err "npm missing (brew node@${NODE_MAJOR})"
fi

# ---- 4. Android SDK, AVDs, chromedriver ----
if [[ "${SKIP_ANDROID}" == "false" ]]; then
    _log "--- 4. Android SDK ---"
    /usr/libexec/java_home &>/dev/null && { export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home)}"; _ok "java ${JAVA_HOME}"; } || _err "no JDK (brew cask temurin)"
    _run mkdir -p "${ANDROID_HOME}"
    if _have sdkmanager; then
        _run bash -c "yes | sdkmanager --sdk_root='${ANDROID_HOME}' --licenses >/dev/null 2>&1" || true
        _run sdkmanager --sdk_root="${ANDROID_HOME}" "cmdline-tools;latest" "platform-tools" "emulator" "platforms;android-${ANDROID_API}" \
            "build-tools;${ANDROID_API}.0.0" "system-images;android-${ANDROID_API};google_apis;arm64-v8a" 2>&1 | tail -3 \
            || _err "sdkmanager packages"
        # avdmanager has no --sdk_root: it uses the SDK its own cmdline-tools live in. bash still remembers the Homebrew sdkmanager
        # path, so forget it: avdmanager must be the one just installed in ${ANDROID_HOME}, or it does not see the system image.
        hash -r
        AVDS="$(emulator -list-avds 2>/dev/null || true)"
        for avd in ${AVD_NAMES//,/ }; do
            if _has_line "${AVDS}" -x "${avd}"; then _ok "AVD ${avd}"; else
                _run bash -c "echo no | avdmanager create avd -n '${avd}' -d pixel_8 -k 'system-images;android-${ANDROID_API};google_apis;arm64-v8a' >/dev/null" \
                    && _ok "AVD ${avd} created" || _err "AVD ${avd}"
            fi
        done
    else
        _err "sdkmanager missing (brew cask android-commandlinetools, then re-run)"
    fi
    # chromedriver for the Chrome of the emulator images: Appium does not find it by itself, the agent picks the binary of the matching major
    _CD_DIR="${HOME}/.appium/node_modules/appium-uiautomator2-driver/node_modules/appium-chromedriver/chromedriver/mac"
    for ver in ${CHROMEDRIVER_VERSIONS}; do
        dest="${_CD_DIR}/chromedriver_mac_arm64_v${ver}"
        if [[ -x "${dest}/chromedriver" ]]; then _ok "chromedriver ${ver}"; continue; fi
        _run bash -c "mkdir -p '${dest}' && cd \$(mktemp -d) && curl -fsSL -o cd.zip 'https://storage.googleapis.com/chrome-for-testing-public/${ver}/mac-arm64/chromedriver-mac-arm64.zip' \
            && unzip -q cd.zip && cp chromedriver-mac-arm64/chromedriver '${dest}/chromedriver' && chmod +x '${dest}/chromedriver'" \
            && _ok "chromedriver ${ver} installed" || _err "chromedriver ${ver} (is the Chrome-for-Testing version right? https://googlechromelabs.github.io/chrome-for-testing/)"
    done
fi

# ---- 5. iOS: only checks and the simulator device ----
if [[ "${SKIP_IOS}" == "false" ]]; then
    _log "--- 5. iOS (Xcode and the runtime come from IT) ---"
    if [[ "$(xcode-select -p 2>/dev/null)" == *Xcode.app* ]]; then
        _ok "xcode-select $(xcode-select -p)"
        xcodebuild -checkFirstLaunchStatus &>/dev/null || _err "Xcode license / first launch: IT runs 'sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch'"
        runtime="$(xcrun simctl list runtimes -j 2>/dev/null | python3 -c "import sys,json; r=[x['identifier'] for x in json.load(sys.stdin)['runtimes'] if x.get('isAvailable') and 'iOS' in x['identifier']]; print(r[-1] if r else '')" 2>/dev/null || true)"
        if [[ -z "${runtime}" ]]; then
            _err "no iOS simulator runtime: IT runs 'xcodebuild -downloadPlatform iOS' (Apple CDN, admin)"
        elif ! _has_line "$(xcrun simctl list devices 2>/dev/null || true)" -F "${IOS_SIM_DEVICE} ("; then
            _run xcrun simctl create "${IOS_SIM_DEVICE}" "${IOS_SIM_DEVICE_TYPE}" "${runtime}" && _ok "simulator ${IOS_SIM_DEVICE}" || _err "simulator ${IOS_SIM_DEVICE}"
        else
            _ok "simulator ${IOS_SIM_DEVICE}"
        fi
    else
        _err "Xcode.app is not selected (xcode-select -p = $(xcode-select -p 2>/dev/null)): install Xcode (IT, Apple ID) and 'sudo xcode-select -s /Applications/Xcode.app/Contents/Developer'"
    fi
fi

# ---- 6. mitmproxy CA (generated locally on first start) ----
_log "--- 6. mitmproxy CA ---"
if _have mitmdump && [[ ! -f "${HOME}/.mitmproxy/mitmproxy-ca-cert.pem" ]]; then
    # the first start of mitmdump can take longer than the 3 s this used to wait: wait for the file, 30 s at most
    _run bash -c "mitmdump --listen-port 0 -q >/dev/null 2>&1 & p=\$!; for i in \$(seq 1 30); do [ -f '${HOME}/.mitmproxy/mitmproxy-ca-cert.pem' ] && break; sleep 1; done; kill \$p 2>/dev/null; wait \$p 2>/dev/null; true"
fi
if [[ "${DRY_RUN}" == "true" ]]; then _log "dry-run: CA not checked"
elif [[ -f "${HOME}/.mitmproxy/mitmproxy-ca-cert.pem" ]]; then _ok "CA ${HOME}/.mitmproxy/mitmproxy-ca-cert.pem (emulators / simulators get it from the agent; iPhones by hand)"
else _err "mitmproxy CA not generated"; fi

# ---- 7. The agent's Python environment (needs a copy of the repo on this Mac) ----
_log "--- 7. Agent virtualenv ---"
if [[ -n "${REPO_DIR}" ]]; then
    if [[ -f "${REPO_DIR}/requirements.txt" ]]; then
        PY="${PYENV_ROOT}/versions/${PYTHON_VERSION}/bin/python3"; [[ -x "${PY}" ]] || PY="$(command -v python3)"
        [[ -d "${REPO_DIR}/.venv" ]] || _run "${PY}" -m venv "${REPO_DIR}/.venv"
        _run "${REPO_DIR}/.venv/bin/pip" install --quiet --upgrade pip && _run "${REPO_DIR}/.venv/bin/pip" install --quiet -r "${REPO_DIR}/requirements.txt" \
            && _ok "agent dependencies installed in ${REPO_DIR}/.venv" || _err "pip install -r requirements.txt"
    else
        _err "${REPO_DIR}/requirements.txt not found (copy the agent repo folder first)"
    fi
else
    _log "skipped (no --repo-dir): copy the agent repo to this Mac, then: bash setup_mac_external.sh --repo-dir <path>"
fi

# ---- 8. Shell profile ----
_log "--- 8. Shell profile ---"
PROFILE="${HOME}/.zprofile"
_append() {   # --dry-run used to write the profile too
    if grep -qF "$1" "${PROFILE}" 2>/dev/null; then return 0; fi
    if [[ "${DRY_RUN}" == "true" ]]; then _log "dry-run: add the $1 lines to ${PROFILE}"; else printf '%s\n' "$2" >> "${PROFILE}"; fi
}
_append "PYENV_ROOT" 'export PYENV_ROOT="${HOME}/.pyenv"
export PATH="${PYENV_ROOT}/bin:${PATH}"
command -v pyenv >/dev/null && eval "$(pyenv init -)"'
_append ".npm-global" 'export PATH="${HOME}/.npm-global/bin:${HOME}/.local/bin:${PATH}"'
if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN}/node" && "$(command -v node)" == "${NODE_BIN}/node" ]]; then _append "${NODE_BIN}" "export PATH=\"${NODE_BIN}:\${PATH}\""; fi
[[ "${SKIP_ANDROID}" == "true" ]] || _append "ANDROID_HOME" 'export ANDROID_HOME="${HOME}/Library/Android/sdk"
export PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${PATH}"'
[[ "${DRY_RUN}" == "true" ]] || _ok "PATH lines are in ${PROFILE}"

echo
_log "=== Summary: ${FAILS} problem(s) ==="
cmd_check | sed 's/^/  /' || true
[[ "${#MISSING_BREW[@]}" -eq 0 ]] || _log "IT must install: brew install ${MISSING_BREW[*]}"
cat <<'EOF'

Still needed from the INTERNAL network (not done by this script):
  - the agent repo and its config: copy the folder here (scp / USB), then re-run with --repo-dir <path>
  - the test repo and the App builds: they come from the internal Git server and artifact store, so the agent needs a route to
    the internal network (or a repo cache and the App files copied from a Mac that has them)
  - the services the agent reports to: internal network
  - iPhones: Apple ID in Xcode, signing, WDA, manual proxy and CA
EOF
[[ "${FAILS}" -eq 0 ]]
