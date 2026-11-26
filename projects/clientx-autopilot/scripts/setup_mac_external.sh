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
#   bash setup_mac_external.sh --start [options]       # bring the farm up: create the AVDs, detect the Mac's IP, start one mitmproxy
#                                                      # per device, boot 8 Android emulators + 1 iOS simulator, put the mitmproxy CA
#                                                      # into each of them, set the emulators' proxy, start one Appium server per device
#   bash setup_mac_external.sh --status                # device / mitmproxy / Appium table
#   bash setup_mac_external.sh --stop                  # stop all of it
#
# New Mac, from zero: install Xcode.app (App Store) and open it once, then in a Terminal as an admin user:
#   bash setup_mac_external.sh --admin                 # Homebrew + all software + Xcode license / iOS runtime (asks the password once)
#   bash setup_mac_external.sh --start --android-count 1   # small Mac (e.g. Mac mini): 1 Android emulator + 1 iOS simulator
#
# Options:
#   --skip-android          no Android SDK / emulator / chromedriver
#   --skip-ios              no libimobiledevice / ios-deploy / simulator / ffmpeg
#   --android-count <n>     number of Android emulators / AVDs (default 8), named pixel_8_api<API>_1 .. _<n>
#   --avd-names a,b,c       AVD names instead of the default ones (their number then is the emulator count; pass the names your device plan uses)
#   --repo-dir <path>       a copy of the farm agent repo on this Mac: creates its .venv and installs requirements.txt from PyPI
#   --admin                 also do the admin steps with sudo (run as an admin user): Homebrew installer, Xcode license / first launch /
#                           iOS runtime download, sudoers for networksetup + shutdown for --agent-user, no-sleep settings
#   --agent-user <name>     user of the agent for the sudoers line (default: the user running this script)
#   --install-homebrew      (kept for compatibility) Homebrew is now installed automatically when missing: run as an admin user, the
#                           password is asked once (or set SUDO_ASKPASS to a helper that prints it, for unattended runs)
#   --headless              --start: emulators without a window (-no-window), Simulator.app not opened
#   --ios-system-proxy      --start: point the Mac's own HTTP/HTTPS proxy at the simulator's mitmproxy (the iOS simulator has no proxy
#                           setting of its own). Changes ALL traffic of this Mac until --stop; needs the sudoers line of --admin
#   --dry-run               print the commands only
#
# Ports (--start): emulator i = 0..n-1 has adb serial emulator-<5554+2i>, mitmproxy 8081+i, Appium 4723+i; the iOS simulator comes
# after them (mitmproxy 8081+n, Appium 4723+n). Each Appium server is bound to its device through default capabilities (udid,
# systemPort / wdaLocalPort ...), so a test only needs the server URL. The list is written to ~/.device-farm/devices.json.
# Environment: MITM_BASE_PORT, APPIUM_BASE_PORT, APPIUM_ADDRESS (127.0.0.1), MITM_LISTEN_HOST (0.0.0.0), EMULATOR_PROXY_HOST
# (10.0.2.2), EMULATOR_ARGS, MITM_ARGS (e.g. "-s addon.py"), APPIUM_ARGS, BOOT_TIMEOUT (900 s).
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

ADMIN=false; AGENT_USER="$(id -un)"; SKIP_ANDROID=false; SKIP_IOS=false; AVD_NAMES=""; ANDROID_COUNT="${ANDROID_COUNT:-8}"; HEADLESS=false; IOS_SYSTEM_PROXY=false; REPO_DIR=""; INSTALL_BREW=false; DRY_RUN=false; MODE="install"
_need_value() { [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || { echo "option $1 needs a value" >&2; exit 2; }; }
while [[ $# -gt 0 ]]; do
    case "$1" in
        --list|--preflight|--check|--start|--stop|--status) MODE="${1#--}" ;;
        --android-count) _need_value "$@"; ANDROID_COUNT="$2"; shift ;;
        --headless) HEADLESS=true ;;
        --ios-system-proxy) IOS_SYSTEM_PROXY=true ;;
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
[[ "${ANDROID_COUNT}" =~ ^[0-9]+$ ]] || { echo "--android-count needs a number" >&2; exit 2; }
if [[ -z "${AVD_NAMES}" ]]; then
    i=1; while [[ $i -le ${ANDROID_COUNT} ]]; do AVD_NAMES="${AVD_NAMES:+${AVD_NAMES},}pixel_8_api${ANDROID_API}_${i}"; i=$((i+1)); done
fi
ANDROID_IMAGE="system-images;android-${ANDROID_API};google_apis;arm64-v8a"

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
  Farm (--start)                                           one mitmproxy + one Appium server per emulator / simulator
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
# node@N of Homebrew is keg-only: use its own bin directory when no node is on PATH
if ! _have node && _have brew; then
    NODE_BIN="$(brew --prefix "node@${NODE_MAJOR}" 2>/dev/null || true)/bin"
    if [[ -x "${NODE_BIN}/node" ]]; then export PATH="${NODE_BIN}:${PATH}"; fi
fi
[[ "${MODE}" == "check" ]] && { cmd_check; exit 0; }

# =====================================================================================================================
# Farm runtime: --start / --stop / --status
#   Android emulator i (0-based): console port 5554+2i (adb serial emulator-<port>), mitmproxy MITM_BASE_PORT+i, Appium APPIUM_BASE_PORT+i
#   iOS simulator: mitmproxy MITM_BASE_PORT+<android count>, Appium APPIUM_BASE_PORT+<android count>
# =====================================================================================================================
FARM_DIR="${FARM_DIR:-${HOME}/.device-farm}"; RUN_DIR="${FARM_DIR}/run"; FARM_LOG_DIR="${LOG_DIR}/farm"
CA_PEM="${HOME}/.mitmproxy/mitmproxy-ca-cert.pem"
MITM_BASE_PORT="${MITM_BASE_PORT:-8081}"; APPIUM_BASE_PORT="${APPIUM_BASE_PORT:-4723}"
MITM_LISTEN_HOST="${MITM_LISTEN_HOST:-0.0.0.0}"; APPIUM_ADDRESS="${APPIUM_ADDRESS:-127.0.0.1}"
EMULATOR_PROXY_HOST="${EMULATOR_PROXY_HOST:-10.0.2.2}"   # the Mac as an Android emulator sees it; does not change when the Mac's IP does
BOOT_TIMEOUT="${BOOT_TIMEOUT:-900}"; EMULATOR_STAGGER="${EMULATOR_STAGGER:-5}"
EMULATOR_ARGS="${EMULATOR_ARGS:-}"; MITM_ARGS="${MITM_ARGS:-}"; APPIUM_ARGS="${APPIUM_ARGS:-}"

_avd_names() { echo "${AVD_NAMES//,/ }"; }
_avd_count() { local n=0 a; for a in $(_avd_names); do n=$((n+1)); done; echo "$n"; }

_local_ip() {   # IPv4 address of the interface of the default route, else of the first en* interface that has one
    local ifc="" ip=""
    ifc="$(route -n get default 2>/dev/null | awk '/interface:/ {print $2; exit}' || true)"
    if [[ -n "${ifc}" ]]; then ip="$(ipconfig getifaddr "${ifc}" 2>/dev/null || true)"; fi
    if [[ -z "${ip}" ]]; then
        for ifc in en0 en1 en2 en3 en4 en5 en6 en7 en8; do
            ip="$(ipconfig getifaddr "${ifc}" 2>/dev/null || true)"
            if [[ -n "${ip}" ]]; then break; fi
        done
    fi
    echo "${ip}"
}

_alive() { local f="${RUN_DIR}/$1.pid" pid=""; [[ -f "$f" ]] || return 1; pid="$(cat "$f" 2>/dev/null || true)"; [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; }
_spawn() {   # _spawn <name> <command...>: start in the background, PID in ${RUN_DIR}/<name>.pid, output in ${FARM_LOG_DIR}/<name>.log
    local name="$1"; shift
    # reuse a running process only when it was started with the same command: with another device count the same port belongs
    # to another device (e.g. Appium 4724 was the iOS simulator's with 1 emulator, the 2nd emulator's with 2) and the old
    # server kept its old default capabilities (the 2nd emulator's sessions went to the simulator's WDA port)
    if _alive "${name}"; then
        if [[ "$(cat "${RUN_DIR}/${name}.cmd" 2>/dev/null || true)" == "$*" ]]; then _ok "${name} already running (pid $(cat "${RUN_DIR}/${name}.pid"))"; return 0; fi
        _log "${name} runs with other settings: restart"; _kill "${name}"; sleep 2
    fi
    if [[ "${DRY_RUN}" == "true" ]]; then _log "dry-run: $*"; return 0; fi
    nohup "$@" >> "${FARM_LOG_DIR}/${name}.log" 2>&1 </dev/null 3<&- &
    echo $! > "${RUN_DIR}/${name}.pid"; echo "$*" > "${RUN_DIR}/${name}.cmd"
    _log "started ${name} (pid $!, log ${FARM_LOG_DIR}/${name}.log)"
}
_kill() {   # _kill <name>
    local f="${RUN_DIR}/$1.pid" pid=""
    [[ -f "$f" ]] || return 0
    pid="$(cat "$f" 2>/dev/null || true)"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then kill "${pid}" 2>/dev/null || true; _log "stopped $1 (pid ${pid})"; fi
    rm -f "$f" 2>/dev/null || mv -f "$f" "$f.old" 2>/dev/null || true
    rm -f "${RUN_DIR}/$1.cmd" 2>/dev/null || true
}
_port_open() { nc -z 127.0.0.1 "$1" &>/dev/null || (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
_wait_port() { local n=0; while ! _port_open "$1"; do n=$((n+1)); [[ $n -ge "$2" ]] && return 1; sleep 1; done; return 0; }
_http_code() { curl -s -o /dev/null -m "${2:-5}" -w '%{http_code}' "$1" 2>/dev/null || true; }

_ensure_ca() {
    if [[ -f "${CA_PEM}" ]]; then return 0; fi
    _have mitmdump || return 1
    # the first start of mitmdump can take longer than the 3 s this used to wait: wait for the file, 30 s at most
    _run bash -c "mitmdump --listen-port 0 -q >/dev/null 2>&1 & p=\$!; for i in \$(seq 1 30); do [ -f '${CA_PEM}' ] && break; sleep 1; done; kill \$p 2>/dev/null; wait \$p 2>/dev/null; true"
    [[ -f "${CA_PEM}" ]]
}
_ca_hash() {   # file name Android expects for the CA: <subject_hash_old>.0
    local ossl="openssl" brew_ossl=""
    brew_ossl="$(brew --prefix openssl@3 2>/dev/null || true)/bin/openssl"
    if [[ -x "${brew_ossl}" ]]; then ossl="${brew_ossl}"; fi
    local out=""; out="$("${ossl}" x509 -inform PEM -subject_hash_old -noout -in "${CA_PEM}" 2>/dev/null || true)"
    echo "${out%%$'\n'*}"
}

_write_inject_script() {
    cat > "${FARM_DIR}/inject_ca.sh" <<'INJECT'
#!/system/bin/sh
# Adds one CA to the system trust store of a running emulator, until its next reboot (run as root: adb root).
# Android 14+ reads the system CAs from the conscrypt APEX, which cannot be remounted: the new store is a tmpfs copy that is
# bind-mounted over the APEX folder inside zygote and every app process, so apps started later inherit it.
H="$1"; SRC="/data/local/tmp/$H.0"; DST=/system/etc/security/cacerts; APEX=/apex/com.android.conscrypt/cacerts
[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }
# User store too: Chrome (Chrome Root Store) ignores CAs added to the system store and trusts only its own roots + the user-added
# ones, so without this Chrome / Custom Tabs reject mitmproxy ("certificate unknown"). /data survives reboots.
U=/data/misc/user/0/cacerts-added
mkdir -p "$U" && cp "$SRC" "$U/$H.0" && chown system:system "$U" "$U/$H.0" && chmod 755 "$U" && chmod 644 "$U/$H.0" || echo "user store copy failed"
if [ -f "$DST/$H.0" ]; then echo "already injected $H"; exit 0; fi
TMP=/data/local/tmp/ca-copy; rm -rf "$TMP"; mkdir -p -m 700 "$TMP"
if [ -d "$APEX" ]; then cp "$APEX"/* "$TMP"/; else cp "$DST"/* "$TMP"/; fi
mount -t tmpfs tmpfs "$DST" || { echo "tmpfs mount failed (not root?)"; exit 1; }
cp "$TMP"/* "$DST"/; cp "$SRC" "$DST/$H.0"
chown root:root "$DST"/*; chmod 644 "$DST"/*; chcon u:object_r:system_file:s0 "$DST"/*
rm -rf "$TMP"
if [ -d "$APEX" ]; then
    ZP="$(pidof zygote) $(pidof zygote64)"
    for Z in $ZP; do nsenter --mount=/proc/$Z/ns/mnt -- /bin/mount --bind "$DST" "$APEX"; done
    for Z in $ZP; do
        for P in $(ps -o PID -P "$Z" | grep -v PID); do nsenter --mount=/proc/$P/ns/mnt -- /bin/mount --bind "$DST" "$APEX" & done
    done
    wait
fi
if [ -f "$DST/$H.0" ]; then echo "injected $H"; else echo "injection failed"; exit 1; fi
INJECT
}

_adb_out() { local s="$1" out=""; shift; out="$(adb -s "$s" "$@" 2>/dev/null || true)"; echo "${out//$'\r'/}"; }

_create_avd() {   # _create_avd <name>
    local avd="$1"
    if _has_line "$(emulator -list-avds 2>/dev/null || true)" -x "${avd}"; then _ok "AVD ${avd}"; return 0; fi
    _run bash -c "echo no | avdmanager create avd -n '${avd}' -d pixel_8 -k '${ANDROID_IMAGE}' >/dev/null" \
        && _ok "AVD ${avd} created" || _err "AVD ${avd} (is ${ANDROID_IMAGE} installed? run this script without --start first)"
}

_android_prepare() {   # _android_prepare <serial> <mitm port> <ca hash>: wait for the boot, CA into the system store, proxy
    local s="$1" port="$2" hash="$3" waited=0 out=""
    while [[ "$(_adb_out "$s" shell getprop sys.boot_completed)" != "1" ]]; do
        waited=$((waited+5)); if [[ ${waited} -ge ${BOOT_TIMEOUT} ]]; then _err "$s did not boot in ${BOOT_TIMEOUT}s (log ${FARM_LOG_DIR}/emulator-${s#emulator-}.log)"; return 1; fi
        sleep 5
    done
    _ok "$s booted"
    adb -s "$s" root &>/dev/null || true
    waited=0
    while [[ "$(_adb_out "$s" shell id -u)" != "0" ]]; do
        waited=$((waited+1)); if [[ ${waited} -ge 60 ]]; then _err "$s: adb root refused (a google_apis image is needed, not google_apis_playstore)"; return 1; fi
        sleep 1
    done
    if adb -s "$s" push "${CA_PEM}" "/data/local/tmp/${hash}.0" &>/dev/null && adb -s "$s" push "${FARM_DIR}/inject_ca.sh" /data/local/tmp/inject_ca.sh &>/dev/null; then
        out="$(_adb_out "$s" shell sh /data/local/tmp/inject_ca.sh "${hash}")"
        if _has_line "${out}" -E "injected ${hash}"; then _ok "$s mitmproxy CA in the system store (${out##*$'\n'})"; else _err "$s CA not installed: ${out}"; fi
    else
        _err "$s: adb push of the CA failed"
    fi
    # Chrome: no first-run / welcome screens, or a test that opens a URL stays on FirstRunActivity and never loads it
    adb -s "$s" shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run --disable-features=TranslateUI" > /data/local/tmp/chrome-command-line; chmod 644 /data/local/tmp/chrome-command-line' &>/dev/null || true
    adb -s "$s" shell am set-debug-app --persistent com.android.chrome &>/dev/null || true
    # with the permission already granted, Chrome does not show its "Chrome notifications make things easier" dialog over the page
    adb -s "$s" shell pm grant com.android.chrome android.permission.POST_NOTIFICATIONS &>/dev/null || true
    adb -s "$s" shell am force-stop com.android.chrome &>/dev/null || true
    adb -s "$s" shell settings put global http_proxy "${EMULATOR_PROXY_HOST}:${port}" &>/dev/null || true
    if [[ "$(_adb_out "$s" shell settings get global http_proxy)" == "${EMULATOR_PROXY_HOST}:${port}" ]]; then _ok "$s proxy ${EMULATOR_PROXY_HOST}:${port}"; else _err "$s proxy not set"; fi
}

_ios_udid() {   # udid of the simulator named ${IOS_SIM_DEVICE}: the booted one, else the one of the newest runtime
    xcrun simctl list devices available -j 2>/dev/null | python3 -c "
import json, sys
name = sys.argv[1]; found = []
for runtime, devs in sorted(json.load(sys.stdin).get('devices', {}).items()):
    if 'iOS' not in runtime: continue
    for d in devs:
        if d.get('name') == name: found.append((d.get('state') == 'Booted', runtime, d['udid']))
print(sorted(found)[-1][2] if found else '')" "${IOS_SIM_DEVICE}" 2>/dev/null || true
}

_open_simulator_window() {   # show the booted simulator. `open -a Simulator` failed silently: on a fresh Xcode the app is not
    # registered by name, and Xcode 27 has no Simulator.app at all (DeviceHub.app in Contents/Applications replaces it)
    local dev="" app=""
    dev="$(xcode-select -p 2>/dev/null || true)"
    for app in "${dev}/Applications/Simulator.app" "${dev%/Developer}/Applications/DeviceHub.app" "${dev%/Developer}/Applications/Simulator.app"; do
        if [[ -d "${app}" ]]; then
            if open -a "${app}" --args -CurrentDeviceUDID "$1" &>/dev/null; then _ok "window: ${app##*/}"; else _log "WARNING: could not open ${app}"; fi
            return 0
        fi
    done
    _log "WARNING: no Simulator.app / DeviceHub.app in ${dev%/Developer}: the simulator runs without a window (automation still works)"
}

_net_service() {   # macOS network service (e.g. "Ethernet", "Wi-Fi") of the default route's interface
    local ifc=""; ifc="$(route -n get default 2>/dev/null | awk '/interface:/ {print $2; exit}' || true)"
    [[ -n "${ifc}" ]] || return 0
    networksetup -listnetworkserviceorder 2>/dev/null | awk -v d="${ifc}" '/^\([0-9]+\)/ {sub(/^\([0-9]+\) /, ""); name=$0} index($0, "Device: " d ")") {print name; exit}' || true
}
_system_proxy() {   # _system_proxy on <port> | off     (the iOS simulator has no proxy of its own: it uses the Mac's)
    local svc=""; svc="$(_net_service)"
    if [[ "$1" == "off" ]]; then
        [[ -f "${RUN_DIR}/system_proxy" ]] || return 0
        svc="$(cat "${RUN_DIR}/system_proxy" 2>/dev/null || true)"
        if sudo -n networksetup -setwebproxystate "${svc}" off && sudo -n networksetup -setsecurewebproxystate "${svc}" off; then _ok "macOS proxy of \"${svc}\" off"
        else _err "could not switch the macOS proxy of \"${svc}\" off: sudo networksetup -setwebproxystate \"${svc}\" off; sudo networksetup -setsecurewebproxystate \"${svc}\" off"; fi
        rm -f "${RUN_DIR}/system_proxy" 2>/dev/null || : > "${RUN_DIR}/system_proxy"
        return 0
    fi
    if [[ -z "${svc}" ]]; then _err "no network service found for the macOS proxy"; return 0; fi
    if [[ "${DRY_RUN}" == "true" ]]; then _log "dry-run: sudo -n networksetup -setwebproxy/-setsecurewebproxy \"${svc}\" 127.0.0.1 $2"; return 0; fi
    if sudo -n networksetup -setwebproxy "${svc}" 127.0.0.1 "$2" && sudo -n networksetup -setsecurewebproxy "${svc}" 127.0.0.1 "$2" \
        && sudo -n networksetup -setproxybypassdomains "${svc}" localhost 127.0.0.1 ::1 "*.local" 169.254/16; then
        echo "${svc}" > "${RUN_DIR}/system_proxy"; _ok "macOS proxy of \"${svc}\" -> 127.0.0.1:$2 (all traffic of this Mac, until --stop)"
    else
        _err "macOS proxy not set (needs the sudoers line of --admin). By hand: sudo networksetup -setwebproxy \"${svc}\" 127.0.0.1 $2; sudo networksetup -setsecurewebproxy \"${svc}\" 127.0.0.1 $2"
    fi
}

farm_plan() {   # one line per device: kind|name|serial|mitm port|appium port|extra port
    local i=0 a n; n="$(_avd_count)"
    if [[ "${SKIP_ANDROID}" != "true" ]]; then for a in $(_avd_names); do
        echo "android|${a}|emulator-$((5554 + 2*i))|$((MITM_BASE_PORT + i))|$((APPIUM_BASE_PORT + i))|$((8200 + i))"; i=$((i+1))
    done; else n=0; fi
    if [[ "${SKIP_IOS}" != "true" ]]; then echo "ios|${IOS_SIM_DEVICE}|-|$((MITM_BASE_PORT + n))|$((APPIUM_BASE_PORT + n))|$((8100 + n))"; fi
}

farm_start() {
    local ip="" hash="" line kind name serial mport aport xport caps udid="" code idx=0 running=""
    _run mkdir -p "${RUN_DIR}" "${FARM_LOG_DIR}"
    _log "=== Farm start: $(_avd_count) Android emulator(s)$([[ "${SKIP_ANDROID}" == "true" ]] && echo " skipped"), iOS simulator $([[ "${SKIP_IOS}" == "true" ]] && echo skipped || echo "${IOS_SIM_DEVICE}") ==="
    if [[ "${DRY_RUN}" != "true" ]]; then
        for c in appium mitmdump curl; do _have "$c" || { _err "$c is not installed: run this script without --start first"; return 0; }; done
        if [[ "${SKIP_ANDROID}" != "true" ]]; then for c in adb emulator avdmanager; do _have "$c" || { _err "$c is not installed: run this script without --start first"; return 0; }; done; fi
    fi
    if /usr/libexec/java_home &>/dev/null; then export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home)}"; fi
    ip="$(_local_ip)"
    if [[ -n "${ip}" ]]; then _ok "Mac local IP ${ip} (proxy host for real iPhones / other machines; emulators use ${EMULATOR_PROXY_HOST})"; else _log "WARNING: no local IP found (no network?)"; fi

    _log "--- mitmproxy: one per device ---"
    if [[ "${DRY_RUN}" != "true" ]]; then
        _ensure_ca || { _err "mitmproxy CA not generated (${CA_PEM})"; return 0; }
        hash="$(_ca_hash)"; [[ -n "${hash}" ]] || { _err "openssl could not compute the CA hash"; return 0; }
        _write_inject_script
    fi
    while IFS='|' read -r kind name serial mport aport xport <&3; do
        # shellcheck disable=SC2086
        _spawn "mitmproxy-${mport}" mitmdump --listen-host "${MITM_LISTEN_HOST}" --listen-port "${mport}" --set "confdir=${HOME}/.mitmproxy" ${MITM_ARGS}
    done 3< <(farm_plan)

    if [[ "${SKIP_ANDROID}" != "true" ]]; then
        _log "--- Android: AVDs, emulators, CA, proxy ---"
        if [[ "${DRY_RUN}" != "true" ]]; then adb start-server &>/dev/null || true; hash -r; fi
        while IFS='|' read -r kind name serial mport aport xport <&3; do
            [[ "${kind}" == "android" ]] || continue
            if [[ "${DRY_RUN}" != "true" ]]; then _create_avd "${name}"; running="$(adb devices 2>/dev/null || true)"; fi
            if [[ -n "${running}" ]] && _has_line "${running}" -E "^${serial}[[:space:]]"; then _ok "${serial} (${name}) already running"; continue; fi
            # shellcheck disable=SC2086
            _spawn "emulator-${serial#emulator-}" emulator -avd "${name}" -port "${serial#emulator-}" -no-snapshot-save -no-boot-anim -no-audio \
                $([[ "${HEADLESS}" == "true" ]] && echo "-no-window") ${EMULATOR_ARGS}
            [[ "${DRY_RUN}" == "true" ]] || sleep "${EMULATOR_STAGGER}"
        done 3< <(farm_plan)
        while IFS='|' read -r kind name serial mport aport xport <&3; do
            [[ "${kind}" == "android" ]] || continue
            if [[ "${DRY_RUN}" == "true" ]]; then _log "dry-run: ${serial}: wait for boot, adb root, CA into the system store, http_proxy ${EMULATOR_PROXY_HOST}:${mport}"
            else _android_prepare "${serial}" "${mport}" "${hash}" </dev/null || true; fi
        done 3< <(farm_plan)
    fi

    if [[ "${SKIP_IOS}" != "true" ]]; then
        _log "--- iOS simulator: boot, CA ---"
        while IFS='|' read -r kind name serial mport aport xport <&3; do
            [[ "${kind}" == "ios" ]] || continue
            if [[ "${DRY_RUN}" == "true" ]]; then _log "dry-run: xcrun simctl boot / bootstatus / keychain add-root-cert for ${name}"
            else
                udid="$(_ios_udid)"
                if [[ -z "${udid}" ]]; then _err "no simulator named ${name}: run this script without --start first (needs Xcode and the iOS runtime)"; continue; fi
                xcrun simctl boot "${udid}" &>/dev/null || true
                if xcrun simctl bootstatus "${udid}" -b &>/dev/null </dev/null; then _ok "simulator ${name} booted (${udid})"; else _err "simulator ${name} did not boot"; fi
                if xcrun simctl keychain "${udid}" add-root-cert "${CA_PEM}" &>/dev/null </dev/null; then _ok "simulator ${name}: mitmproxy CA trusted"; else _err "simulator ${name}: CA not installed"; fi
                if [[ "${HEADLESS}" != "true" ]]; then _open_simulator_window "${udid}"; fi
                echo "${udid}" > "${RUN_DIR}/ios_udid"
            fi
            if [[ "${IOS_SYSTEM_PROXY}" == "true" ]]; then _system_proxy on "${mport}"
            else _log "simulator proxy NOT set: the simulator uses the Mac's own network settings. Re-run with --ios-system-proxy to point the Mac's HTTP/HTTPS proxy at 127.0.0.1:${mport} (changes all traffic of this Mac until --stop)"; fi
        done 3< <(farm_plan)
    fi

    _log "--- Appium: one server per device ---"
    while IFS='|' read -r kind name serial mport aport xport <&3; do
        if [[ "${kind}" == "android" ]]; then
            caps="{\"platformName\":\"Android\",\"appium:automationName\":\"UiAutomator2\",\"appium:udid\":\"${serial}\",\"appium:systemPort\":${xport},\"appium:chromedriverPort\":$((xport + 1315)),\"appium:mjpegServerPort\":$((xport + 1000))}"
        else
            [[ -n "${udid}" || "${DRY_RUN}" == "true" ]] || continue
            caps="{\"platformName\":\"iOS\",\"appium:automationName\":\"XCUITest\",\"appium:udid\":\"${udid:-<udid>}\",\"appium:wdaLocalPort\":${xport},\"appium:mjpegServerPort\":$((xport + 1000))}"
        fi
        # shellcheck disable=SC2086
        _spawn "appium-${aport}" appium server --address "${APPIUM_ADDRESS}" --port "${aport}" --log-timestamp --local-timezone --default-capabilities "${caps}" ${APPIUM_ARGS}
    done 3< <(farm_plan)
    [[ "${DRY_RUN}" == "true" ]] && return 0

    _log "--- Checks ---"
    {
        echo "{\"mac_ip\": \"${ip}\", \"ca\": \"${CA_PEM}\", \"devices\": ["
        while IFS='|' read -r kind name serial mport aport xport <&3; do
            [[ ${idx} -eq 0 ]] || echo ","
            if [[ "${kind}" == "ios" ]]; then serial="${udid}"; fi
            printf '  {"platform": "%s", "name": "%s", "udid": "%s", "appium": "http://%s:%s", "mitmproxy_port": %s, "proxy": "%s:%s"}' \
                "${kind}" "${name}" "${serial}" "127.0.0.1" "${aport}" "${mport}" "$([[ "${kind}" == "android" ]] && echo "${EMULATOR_PROXY_HOST}" || echo 127.0.0.1)" "${mport}"
            idx=$((idx+1))
        done 3< <(farm_plan)
        printf '\n]}\n'
    } > "${FARM_DIR}/devices.json"
    while IFS='|' read -r kind name serial mport aport xport <&3; do
        if _wait_port "${mport}" 30; then
            code="$(curl -s -o /dev/null -m 20 -x "http://127.0.0.1:${mport}" --cacert "${CA_PEM}" -w '%{http_code}' https://www.gstatic.com/generate_204 2>/dev/null || true)"
            if [[ "${code}" =~ ^[23] ]]; then _ok "mitmproxy :${mport} decrypts HTTPS with its CA (HTTP ${code})"; else _log "WARNING: mitmproxy :${mport} listens, but an HTTPS request through it failed (${code:-no answer}; no internet?)"; fi
        else _err "mitmproxy :${mport} is not listening (${FARM_LOG_DIR}/mitmproxy-${mport}.log)"; fi
        if [[ "${kind}" == "ios" && -z "${udid}" ]]; then continue; fi
        if _wait_port "${aport}" 60 && [[ "$(_http_code "http://127.0.0.1:${aport}/status" 10)" == "200" ]]; then _ok "Appium :${aport} ready for ${name}"
        else _err "Appium :${aport} is not answering (${FARM_LOG_DIR}/appium-${aport}.log)"; fi
    done 3< <(farm_plan)
    echo; farm_status
    _log "=== Farm start: ${FAILS} problem(s). Device list: ${FARM_DIR}/devices.json. Stop: bash $0 --stop ==="
}

farm_status() {
    local kind name serial mport aport xport state running=""
    running="$(adb devices 2>/dev/null || true)"
    printf '%-8s %-22s %-16s %-10s %-22s %s\n' PLATFORM NAME SERIAL STATE "MITMPROXY (device proxy)" APPIUM
    while IFS='|' read -r kind name serial mport aport xport <&3; do
        if [[ "${kind}" == "android" ]]; then
            if _has_line "${running}" -E "^${serial}[[:space:]]+device"; then state="up"; else state="down"; fi
        else
            serial="$(cat "${RUN_DIR}/ios_udid" 2>/dev/null || true)"; serial="${serial:--}"
            if _has_line "$(xcrun simctl list devices booted 2>/dev/null || true)" -F "${name} ("; then state="up"; else state="down"; fi
        fi
        printf '%-8s %-22s %-16.16s %-10s %-22s %s\n' "${kind}" "${name}" "${serial}" "${state}" \
            ":${mport} $(_port_open "${mport}" && echo up || echo down)" "http://127.0.0.1:${aport} $([[ "$(_http_code "http://127.0.0.1:${aport}/status" 3)" == "200" ]] && echo up || echo down)"
    done 3< <(farm_plan)
    echo "Mac local IP: $(_local_ip)"
}

farm_stop() {
    local kind name serial mport aport xport udid="" f
    _log "=== Farm stop ==="
    while IFS='|' read -r kind name serial mport aport xport <&3; do
        _kill "appium-${aport}"; _kill "mitmproxy-${mport}"
        if [[ "${kind}" == "android" ]]; then
            if _has_line "$(adb devices 2>/dev/null || true)" -E "^${serial}[[:space:]]"; then adb -s "${serial}" emu kill &>/dev/null </dev/null || true; _log "stopped ${serial}"; fi
            _kill "emulator-${serial#emulator-}"
        else
            udid="$(cat "${RUN_DIR}/ios_udid" 2>/dev/null || true)"
            if [[ -n "${udid}" ]]; then xcrun simctl shutdown "${udid}" &>/dev/null </dev/null || true; _log "stopped simulator ${name}"; fi
        fi
    done 3< <(farm_plan)
    # whatever an earlier --start with other options (more devices, other ports) left behind
    for f in "${RUN_DIR}"/*.pid; do
        [[ -f "$f" ]] || continue
        name="${f##*/}"; name="${name%.pid}"
        if [[ "${name}" == emulator-* ]] && _alive "${name}"; then adb -s "${name}" emu kill &>/dev/null </dev/null || true; fi
        _kill "${name}"
    done
    _system_proxy off
}

case "${MODE}" in
    start)  farm_start; exit $((FAILS > 0)) ;;
    stop)   farm_stop; exit 0 ;;
    status) farm_status; exit 0 ;;
esac

_log "=== Device farm Mac: software from the public internet ($(id -un), $(sw_vers -productVersion 2>/dev/null || echo ?)) ==="
cmd_preflight || _log "WARNING: some hosts are blocked, the steps that need them will fail (see above)"

_sudo_prime() {   # ask for the admin password once (Terminal prompt, or the SUDO_ASKPASS helper) and keep sudo cached for this run
    [[ "${SUDO_PRIMED:-}" == "true" ]] && return 0
    [[ "${DRY_RUN}" == "true" ]] && return 0
    if ! id -Gn | tr ' ' '\n' | grep -qx admin; then _log "$(id -un) is not an admin user (needed for sudo)"; return 1; fi
    if [[ -n "${SUDO_ASKPASS:-}" ]]; then sudo -A -v || return 1; else sudo -v || return 1; fi
    SUDO_PRIMED=true
    ( while kill -0 $$ 2>/dev/null; do sudo -n true 2>/dev/null; sleep 50; done ) </dev/null &>/dev/null &
}

# ---- 0. Admin steps (sudo) ----
if [[ "${ADMIN}" == "true" ]]; then
    _log "--- 0. Admin steps (sudo) ---"
    _sudo_prime || _err "this user cannot sudo"
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
if ! _have brew; then   # installed automatically when missing (needs an admin user: asks for the password once)
    if [[ "${DRY_RUN}" == "true" ]]; then _log "dry-run: download and run https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh"
    elif ! _sudo_prime; then _err "Homebrew needs an admin password: run this script as an admin user in a Terminal"
    elif BREW_INSTALLER="$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" && [[ -n "${BREW_INSTALLER}" ]]; then
        _log "installing Homebrew (also installs the Xcode Command Line Tools when missing)..."
        NONINTERACTIVE=1 /bin/bash -c "${BREW_INSTALLER}" </dev/null || _err "Homebrew installer failed"
    else _err "Homebrew installer could not be downloaded (raw.githubusercontent.com)"; fi
    for prefix in /opt/homebrew /usr/local; do [[ -x "${prefix}/bin/brew" ]] && eval "$("${prefix}/bin/brew" shellenv)" && break; done
    _have brew && _ok "Homebrew $(brew --version 2>/dev/null | head -1)"
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
            "build-tools;${ANDROID_API}.0.0" "${ANDROID_IMAGE}" 2>&1 | tail -3 \
            || _err "sdkmanager packages"
        # avdmanager has no --sdk_root: it uses the SDK its own cmdline-tools live in. bash still remembers the Homebrew sdkmanager
        # path, so forget it: avdmanager must be the one just installed in ${ANDROID_HOME}, or it does not see the system image.
        hash -r
        for avd in $(_avd_names); do _create_avd "${avd}"; done
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
        # the newest available iOS runtime that supports the device type (Xcode also ships device-specific runtimes, e.g.
        # iOS-27-2-iPhone19-4 for one model only: taking simply the last runtime made `simctl create` fail)
        runtime="$(xcrun simctl list runtimes -j 2>/dev/null | python3 -c "
import sys, json
dt = sys.argv[1]
ok = [x for x in json.load(sys.stdin)['runtimes'] if x.get('isAvailable') and x.get('platform', 'iOS') == 'iOS' and 'iOS' in x['identifier']]
fit = [x for x in ok if any(d.get('identifier') == dt for d in x.get('supportedDeviceTypes', []))] or [x for x in ok if not x.get('supportedDeviceTypes')]
fit.sort(key=lambda x: [int(p) for p in x.get('version', '0').split('.') if p.isdigit()])
print(fit[-1]['identifier'] if fit else '')" "${IOS_SIM_DEVICE_TYPE}" 2>/dev/null || true)"
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
_ensure_ca || true
if [[ "${DRY_RUN}" == "true" ]]; then _log "dry-run: CA not checked"
elif [[ -f "${HOME}/.mitmproxy/mitmproxy-ca-cert.pem" ]]; then _ok "CA ${HOME}/.mitmproxy/mitmproxy-ca-cert.pem (--start puts it into the emulators and the simulator; iPhones by hand)"
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

# ---- 8. Shell environment and farm commands in ~/.zshrc ----
# One managed block between the markers below, rewritten on every run (never duplicated). Edit the values there, or re-run this
# script with other options. Login and interactive zsh both read ~/.zshrc.
_log "--- 8. ~/.zshrc (environment + farm commands) ---"
ZSHRC="${HOME}/.zshrc"; BEGIN_MARK="# >>> device-farm (managed by setup_mac_external.sh) >>>"; END_MARK="# <<< device-farm <<<"
FARM_SCRIPT="${FARM_DIR}/setup_mac_external.sh"
if [[ "${DRY_RUN}" != "true" ]]; then
    mkdir -p "${FARM_DIR}"
    # a stable copy of this script for the farm-* commands, wherever this one was copied to
    if [[ "$(cd "$(dirname "$0")" && pwd)/$(basename "$0")" != "${FARM_SCRIPT}" ]]; then cp -f "$0" "${FARM_SCRIPT}" && chmod +x "${FARM_SCRIPT}"; fi
fi
BREW_LINE=""; for prefix in /opt/homebrew /usr/local; do [[ -x "${prefix}/bin/brew" ]] && { BREW_LINE="eval \"\$(${prefix}/bin/brew shellenv)\""; break; }; done
NODE_LINE=""; if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN}/node" ]]; then NODE_LINE="export PATH=\"${NODE_BIN}:\${PATH}\""; fi
FARM_BLOCK_FILE="$(mktemp)"
cat > "${FARM_BLOCK_FILE}" <<EOF
${BEGIN_MARK}
# --- tools ---
${BREW_LINE}
export PYENV_ROOT="\${HOME}/.pyenv"
export PATH="\${PYENV_ROOT}/bin:\${HOME}/.npm-global/bin:\${HOME}/.local/bin:\${PATH}"
command -v pyenv >/dev/null && eval "\$(pyenv init - zsh)"
${NODE_LINE}
export ANDROID_HOME="\${HOME}/Library/Android/sdk"
export ANDROID_SDK_ROOT="\${ANDROID_HOME}"
export PATH="\${ANDROID_HOME}/cmdline-tools/latest/bin:\${ANDROID_HOME}/platform-tools:\${ANDROID_HOME}/emulator:\${PATH}"
/usr/libexec/java_home >/dev/null 2>&1 && export JAVA_HOME="\$(/usr/libexec/java_home)"
# --- device farm settings (read by setup_mac_external.sh; change them here) ---
export FARM_SCRIPT="${FARM_SCRIPT}"
export ANDROID_COUNT="${ANDROID_COUNT}"          # Android emulators started by farm-start
export ANDROID_API="${ANDROID_API}"
export IOS_SIM_DEVICE="${IOS_SIM_DEVICE}"
export MITM_BASE_PORT="${MITM_BASE_PORT}"         # mitmproxy of device i: MITM_BASE_PORT+i (iOS simulator last)
export APPIUM_BASE_PORT="${APPIUM_BASE_PORT}"     # Appium of device i: APPIUM_BASE_PORT+i
export MITM_LISTEN_HOST="${MITM_LISTEN_HOST}"
export APPIUM_ADDRESS="${APPIUM_ADDRESS}"
export EMULATOR_PROXY_HOST="${EMULATOR_PROXY_HOST}"
export BOOT_TIMEOUT="${BOOT_TIMEOUT}"
farm-local-ip() { local i; i="\$(route -n get default 2>/dev/null | awk '/interface:/ {print \$2; exit}')"; ipconfig getifaddr "\${i:-en0}"; }
export FARM_MAC_IP="\$(farm-local-ip 2>/dev/null)"   # this Mac's LAN IP (proxy host for real devices / other machines)
# --- farm commands ---
farm-start()   { bash "\${FARM_SCRIPT}" --start "\$@"; }     # e.g. farm-start --headless / --ios-system-proxy / --skip-ios
farm-stop()    { bash "\${FARM_SCRIPT}" --stop "\$@"; }
farm-status()  { bash "\${FARM_SCRIPT}" --status "\$@"; }
farm-check()   { bash "\${FARM_SCRIPT}" --check "\$@"; }
farm-install() { bash "\${FARM_SCRIPT}" "\$@"; }              # re-run the installer (idempotent)
farm-devices() { cat "${FARM_DIR}/devices.json"; }
farm-logs()    { ls -1t "${FARM_LOG_DIR}"; echo "tail -f ${FARM_LOG_DIR}/<name>.log"; }
${END_MARK}
EOF
if [[ "${DRY_RUN}" == "true" ]]; then
    _log "dry-run: write the device-farm block to ${ZSHRC}:"; cat "${FARM_BLOCK_FILE}"
else
    touch "${ZSHRC}"
    # drop the old block (if any), then append the new one
    awk -v b="${BEGIN_MARK}" -v e="${END_MARK}" '$0==b {skip=1; next} $0==e {skip=0; next} !skip' "${ZSHRC}" > "${ZSHRC}.farm-tmp"
    cat "${FARM_BLOCK_FILE}" >> "${ZSHRC}.farm-tmp"
    cat "${ZSHRC}.farm-tmp" > "${ZSHRC}" && rm -f "${ZSHRC}.farm-tmp"
    _ok "environment + farm-start/stop/status/check in ${ZSHRC} (open a new Terminal, or: source ~/.zshrc)"
fi
rm -f "${FARM_BLOCK_FILE}"

echo
_log "=== Summary: ${FAILS} problem(s). Next: source ~/.zshrc && farm-start ==="
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
