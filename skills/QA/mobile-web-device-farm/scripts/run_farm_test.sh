#!/bin/bash
# run_farm_test.sh — one command: software setup (optional) -> farm start -> Appium mobile-web test on every device -> HTML report.
#
#   bash run_farm_test.sh --install --admin       # new Mac: all software + sudo steps (asks the admin password once), farm, test, report
#   bash run_farm_test.sh                         # installed Mac: start the farm, test emulators + simulator, write the report
#   bash run_farm_test.sh --android-count 8       # 8 Android emulators + 1 iOS simulator (default 1 + 1)
#   bash run_farm_test.sh --test-iphones          # also run the test on the real iPhones connected by USB (Safari, preinstalled WDA)
#   bash run_farm_test.sh --install-wda           # first build + install WDA on the iPhones that lack it (Apple ID in Xcode needed)
#   bash run_farm_test.sh --report-only           # no start, no test: what is installed, devices, how to use / stop, iPhone proxy steps
#   bash run_farm_test.sh --stop-after            # stop everything (and the Mac's system proxy) when the report is written
#
# Options: --skip-android | --skip-ios | --skip-simulator | --skip-real-ios | --iphones <udid,...> | --no-ios-proxy (the Mac's
#          proxy untouched; simulator traffic then not through mitmproxy) | --headless | --url <home URL> | --search-url <URL with {q}>
#          | --query <text> | --product-pattern <URL part> | --out <dir>
# Environment: MWEB_URL, MWEB_SEARCH_URL, MWEB_QUERY, MWEB_PRODUCT_PATTERN, ANDROID_COUNT, REPORT_ROOT (~/device-farm-reports),
#              WDA_BUNDLE_ID (com.coupang.coupay.WebDriverAgentRunner), WDA_TEAM_ID
# Exit code: 0 when the farm part passed on every tested device (a site that blocks the farm's IP does not fail the farm).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SETUP="${HERE}/setup_mac_external.sh"
export WDA_BUNDLE_ID="${WDA_BUNDLE_ID:-com.coupang.coupay.WebDriverAgentRunner}"

URL="${MWEB_URL:-https://m.coupang.com/}"
SEARCH_URL="${MWEB_SEARCH_URL:-https://m.coupang.com/nm/search?q={q}}"
QUERY="${MWEB_QUERY:-아이폰}"
PRODUCT_PATTERN="${MWEB_PRODUCT_PATTERN:-/products/}"
ANDROID_COUNT="${ANDROID_COUNT:-1}"
INSTALL=false; ADMIN=false; STOP_AFTER=false; IOS_PROXY=true; SKIP_ANDROID=false; SKIP_IOS=false; SKIP_SIM=false; SKIP_REAL=false
HEADLESS=false; TEST_IPHONES=false; INSTALL_WDA=false; REPORT_ONLY=false; IPHONES=""; OUT=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --install) INSTALL=true ;;
        --admin) INSTALL=true; ADMIN=true ;;
        --android-count) ANDROID_COUNT="$2"; shift ;;
        --skip-android) SKIP_ANDROID=true ;;
        --skip-ios) SKIP_IOS=true ;;
        --skip-simulator) SKIP_SIM=true ;;
        --skip-real-ios) SKIP_REAL=true ;;
        --iphones) IPHONES="$2"; shift ;;
        --test-iphones) TEST_IPHONES=true ;;
        --install-wda) INSTALL_WDA=true ;;
        --report-only) REPORT_ONLY=true ;;
        --no-ios-proxy) IOS_PROXY=false ;;
        --stop-after) STOP_AFTER=true ;;
        --headless) HEADLESS=true ;;
        --url) URL="$2"; shift ;;
        --search-url) SEARCH_URL="$2"; shift ;;
        --query) QUERY="$2"; shift ;;
        --product-pattern) PRODUCT_PATTERN="$2"; shift ;;
        --out) OUT="$2"; shift ;;
        -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
    shift
done
RUN_ID="$(date '+%Y%m%d-%H%M%S')"
OUT="${OUT:-${REPORT_ROOT:-${HOME}/device-farm-reports}/${RUN_ID}}"
mkdir -p "${OUT}/results" "${OUT}/shots"
say() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "${OUT}/run.log"; }

FLAGS=(--android-count "${ANDROID_COUNT}")
[[ "${SKIP_ANDROID}" == "true" ]] && FLAGS+=(--skip-android)
[[ "${SKIP_IOS}" == "true" ]] && FLAGS+=(--skip-ios)
[[ "${SKIP_SIM}" == "true" ]] && FLAGS+=(--skip-simulator)
[[ "${SKIP_REAL}" == "true" ]] && FLAGS+=(--skip-real-ios)
[[ -n "${IPHONES}" ]] && FLAGS+=(--iphones "${IPHONES}")

# ---- 1. software ----
if [[ "${INSTALL}" == "true" ]]; then
    say "1. install the software (log ${OUT}/install.log)"
    if [[ "${ADMIN}" == "true" ]]; then bash "${SETUP}" --admin "${FLAGS[@]}" 2>&1 | tee "${OUT}/install.log" || true
    else bash "${SETUP}" "${FLAGS[@]}" 2>&1 | tee "${OUT}/install.log" || true; fi
else
    say "1. software check (no --install)"
fi
bash "${SETUP}" --check "${FLAGS[@]}" > "${OUT}/check.txt" 2>&1 || true
for prefix in /opt/homebrew /usr/local; do [[ -x "${prefix}/bin/brew" ]] && eval "$("${prefix}/bin/brew" shellenv)" && break; done
export ANDROID_HOME="${ANDROID_HOME:-${HOME}/Library/Android/sdk}"
export PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${HOME}/.npm-global/bin:${PATH}"
if grep -q "MISSING  appium\|MISSING  mitmdump" "${OUT}/check.txt"; then
    say "Appium / mitmproxy missing: run again with --install"; cat "${OUT}/check.txt"; exit 1
fi

# ---- 2. test client (Python venv with the Appium client) ----
VENV="${HOME}/.device-farm/venv"
PY="$(ls "${HOME}"/.pyenv/versions/*/bin/python3 2>/dev/null | tail -1 || true)"; PY="${PY:-$(command -v python3)}"
if [[ ! -x "${VENV}/bin/python" ]]; then say "2. create ${VENV}"; "${PY}" -m venv "${VENV}"; fi
# NO_PROXY: with the iOS system proxy on, the Mac's proxy is mitmproxy, whose CA Python does not trust
if ! "${VENV}/bin/python" -c "import appium" 2>/dev/null; then
    NO_PROXY='*' no_proxy='*' "${VENV}/bin/pip" install -q -r "${HERE}/requirements.txt"
fi
say "2. test client ready ($("${VENV}/bin/python" -c 'import importlib.metadata as m; print("Appium-Python-Client", m.version("Appium-Python-Client"))'))"

# ---- 2b. WDA on real iPhones ----
if [[ "${INSTALL_WDA}" == "true" ]]; then
    say "2b. WebDriverAgent ${WDA_BUNDLE_ID} on the iPhones that lack it (log ${OUT}/install_wda.log)"
    bash "${SETUP}" --install-wda "${FLAGS[@]}" 2>&1 | tee "${OUT}/install_wda.log" || true
fi

write_env() {
    "${VENV}/bin/python" -c "
import json, sys
json.dump(dict(zip(['run_id','host','macos','xcode','url','query','setup','report_only','wda_bundle_id'], sys.argv[1:10])), open(sys.argv[10], 'w'), ensure_ascii=False)" \
        "${RUN_ID}" "$(scutil --get LocalHostName 2>/dev/null || hostname)" "$(sw_vers -productVersion 2>/dev/null || echo ?)" \
        "$(xcodebuild -version 2>/dev/null | head -1 || echo 'no Xcode')" "${URL}" "${QUERY}" "${SETUP}" "${REPORT_ONLY}" "${WDA_BUNDLE_ID}" "${OUT}/env.json"
}

if [[ "${REPORT_ONLY}" != "true" ]]; then
    # ---- 3. farm: emulators / simulator / real iPhones, mitmproxy, Appium ----
    START=(--start "${FLAGS[@]}")
    [[ "${IOS_PROXY}" == "true" && "${SKIP_IOS}" != "true" && "${SKIP_SIM}" != "true" ]] && START+=(--ios-system-proxy)
    [[ "${HEADLESS}" == "true" ]] && START+=(--headless)
    say "3. start the farm: ${START[*]} (log ${OUT}/farm_start.log)"
    bash "${SETUP}" "${START[@]}" > "${OUT}/farm_start.log" 2>&1 || say "farm start reported problems (see the report)"
    grep -E '^\[.*(ok|FAIL|WARNING)' "${OUT}/farm_start.log" | tail -25 || true
    DEVICES="${HOME}/.device-farm/devices.json"
    [[ -f "${DEVICES}" ]] || { say "no ${DEVICES}: the farm did not start"; exit 1; }
    cp "${DEVICES}" "${OUT}/devices.json"

    # ---- 4. tests: one per device, in parallel (real iPhones only with --test-iphones) ----
    say "4. mobile-web test: ${URL} (search '${QUERY}')$([[ "${TEST_IPHONES}" == "true" ]] && echo ', real iPhones included')"
    PIDS=""
    while IFS='|' read -r platform name udid appium mport; do
        [[ -n "${platform}" ]] || continue
        if [[ "${platform}" == "iphone" && "${TEST_IPHONES}" != "true" ]]; then continue; fi
        case "${platform}" in android) tag="android-${udid#emulator-}" ;; iphone) tag="iphone-${udid}" ;; *) tag="${platform}-$(echo "${udid}" | cut -c1-8)" ;; esac
        "${VENV}/bin/python" "${HERE}/mweb_test.py" --platform "${platform}" --name "${name}" --udid "${udid}" --appium "${appium}" \
            --mitm-log "${HOME}/logs/farm/mitmproxy-${mport}.log" --mitm-port "${mport}" --url "${URL}" --search-url "${SEARCH_URL}" \
            --query "${QUERY}" --product-pattern "${PRODUCT_PATTERN}" --shots "${OUT}/shots" --out "${OUT}/results/${tag}.json" \
            > "${OUT}/results/${tag}.log" 2>&1 &
        PIDS="${PIDS} $!"
    done < <("${VENV}/bin/python" -c "
import json, sys
for d in json.load(open(sys.argv[1]))['devices']:
    print('|'.join(str(d[k]) for k in ('platform', 'name', 'udid', 'appium', 'mitmproxy_port')))" "${DEVICES}")
    for p in ${PIDS}; do wait "$p" || true; done
    cat "${OUT}"/results/*.log 2>/dev/null | grep -E '\] (home|search|product|session|mitmproxy|farm|ERROR)' || true
else
    say "3-4. --report-only: no farm start, no test"
    [[ -f "${HOME}/.device-farm/devices.json" ]] && cp "${HOME}/.device-farm/devices.json" "${OUT}/devices.json"
    bash "${SETUP}" --status "${FLAGS[@]}" > "${OUT}/status.txt" 2>&1 || true
fi

# ---- 5. report: installed software, devices, results, how to use / stop, iPhone proxy + certificate steps ----
say "5. inventory + report"
"${VENV}/bin/python" "${HERE}/inventory.py" "${OUT}/inventory.json" "${SETUP}" 2>&1 | tee -a "${OUT}/run.log" || true
write_env
RC=0; "${VENV}/bin/python" "${HERE}/make_report.py" "${OUT}" | tee -a "${OUT}/run.log" || RC=$?

if [[ "${STOP_AFTER}" == "true" ]]; then say "6. stop the farm"; bash "${SETUP}" --stop "${FLAGS[@]}" >> "${OUT}/run.log" 2>&1 || true
elif [[ "${REPORT_ONLY}" != "true" && "${IOS_PROXY}" == "true" && "${SKIP_IOS}" != "true" && "${SKIP_SIM}" != "true" ]]; then
    say "NOTE: the Mac's system proxy points at the iOS simulator's mitmproxy (browsers on this Mac show certificate errors) until: bash ${SETUP} --stop"
fi
say "report: ${OUT}/report.html"
exit "${RC}"
