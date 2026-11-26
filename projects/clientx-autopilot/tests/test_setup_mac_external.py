"""scripts/setup_mac_external.sh: the modes that change nothing must work on any machine, with or without the tools."""
import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "setup_mac_external.sh"
# the script always loads Homebrew from /opt/homebrew or /usr/local, whatever PATH says: on a Mac that has it, the tools are
# found (and write their caches into HOME), so the "nothing installed" tests only mean something on a Mac without Homebrew
HAS_BREW = any(os.access(f"{p}/bin/brew", os.X_OK) for p in ("/opt/homebrew", "/usr/local"))
needs_no_brew = pytest.mark.skipif(HAS_BREW, reason="Homebrew is installed on this machine: the script finds the real tools")


def run(tmp_path, *args):
    env = {"HOME": str(tmp_path), "PATH": "/usr/bin:/bin"}
    return subprocess.run(["bash", str(SCRIPT), *args], env=env, capture_output=True, text=True, timeout=120)


def test_syntax():
    assert subprocess.run(["bash", "-n", str(SCRIPT)]).returncode == 0


def test_list_names_versions_and_hosts(tmp_path):
    r = run(tmp_path, "--list")
    assert r.returncode == 0
    assert "registry.npmjs.org" in r.stdout and "Appium drivers" in r.stdout


def test_help_prints_only_the_header(tmp_path):
    r = run(tmp_path, "--help")
    assert r.returncode == 0
    assert "--dry-run" in r.stdout and "set -euo" not in r.stdout and not r.stdout.startswith("#")


@needs_no_brew
def test_check_succeeds_when_nothing_is_installed(tmp_path):
    # it used to exit 1 on a Mac without ~/.appium, which also cut the summary of an install run short
    r = run(tmp_path, "--check")
    assert r.returncode == 0, r.stderr
    assert "MISSING  appium" in r.stdout


def test_option_without_value_is_reported(tmp_path):
    for opt in ("--avd-names", "--repo-dir", "--agent-user"):
        r = run(tmp_path, opt)
        assert r.returncode == 2 and "needs a value" in r.stderr


def test_unknown_option(tmp_path):
    assert run(tmp_path, "--nope").returncode == 2


@needs_no_brew
def test_dry_run_changes_nothing_and_reaches_the_end(tmp_path):
    r = run(tmp_path, "--dry-run")
    assert "Summary:" in r.stdout and "Still needed from the INTERNAL network" in r.stdout
    assert sorted(os.listdir(tmp_path)) == ["logs"]          # only its own log, no ~/.zprofile, no SDK folder


def test_no_internal_names():
    text = SCRIPT.read_text().lower()
    for word in ("coupa", "cpay", "fintech"):
        assert word not in text


def _plan(tmp_path, *args):
    # --skip-real-ios: the counts must not depend on the iPhones that happen to be plugged into the machine running the tests
    r = run(tmp_path, "--start", "--dry-run", "--skip-real-ios", *args)
    assert r.returncode == 0, r.stderr
    lines = [line.split("dry-run: ", 1)[1] for line in r.stdout.splitlines() if "dry-run: " in line]
    return r, lines


def test_start_plans_8_emulators_and_1_simulator_each_with_its_own_proxy_and_appium(tmp_path):
    import json, re
    r, lines = _plan(tmp_path)
    emulators = [l for l in lines if l.startswith("emulator -avd")]
    proxies = [l for l in lines if l.startswith("mitmdump")]
    appiums = [l for l in lines if l.startswith("appium server")]
    assert len(emulators) == 8 and len(proxies) == 9 and len(appiums) == 9
    assert len({re.search(r"-port (\d+)", l).group(1) for l in emulators}) == 8
    assert sorted(int(re.search(r"--listen-port (\d+)", l).group(1)) for l in proxies) == list(range(8081, 8090))
    assert sorted(int(re.search(r"--port (\d+)", l).group(1)) for l in appiums) == list(range(4723, 4732))
    caps = [json.loads(l[l.index("{"):l.rindex("}") + 1]) for l in appiums]
    assert [c["platformName"] for c in caps] == ["Android"] * 8 + ["iOS"]
    assert len({c["appium:udid"] for c in caps}) == 9
    assert len({c.get("appium:systemPort", c.get("appium:wdaLocalPort")) for c in caps}) == 9
    # every emulator is told to use its own proxy port
    for i in range(8):
        assert f"emulator-{5554 + 2 * i}: wait for boot, adb root, CA into the system store, http_proxy 10.0.2.2:{8081 + i}" in r.stdout
    assert sorted(os.listdir(tmp_path)) == ["logs"]


def test_start_counts_follow_the_options(tmp_path):
    _, lines = _plan(tmp_path, "--android-count", "2", "--skip-ios")
    assert sum(l.startswith("emulator -avd") for l in lines) == 2 and sum(l.startswith("appium server") for l in lines) == 2
    _, lines = _plan(tmp_path, "--avd-names", "a,b,c", "--headless")
    assert sum(l.startswith("emulator -avd") and "-no-window" in l for l in lines) == 3
    _, lines = _plan(tmp_path, "--skip-android")
    assert sum(l.startswith("mitmdump") for l in lines) == 1 and not any(l.startswith("emulator") for l in lines)


def test_the_macos_proxy_is_only_touched_on_request(tmp_path):
    r, _ = _plan(tmp_path)
    assert "networksetup" not in r.stdout.replace("--ios-system-proxy", "")
    assert "simulator proxy NOT set" in r.stdout


def test_stop_and_status_work_with_nothing_running(tmp_path):
    assert run(tmp_path, "--stop").returncode == 0
    r = run(tmp_path, "--status")
    assert r.returncode == 0 and r.stdout.count("down") >= 9


def test_real_iphones_get_fixed_ports_their_own_proxy_and_appium(tmp_path):
    import json, re
    udids = ["00008110-0000000000000001", "00008110-0000000000000002"]
    r = run(tmp_path, "--start", "--dry-run", "--skip-android", "--skip-simulator", "--iphones", ",".join(udids))
    assert r.returncode == 0, r.stdout + r.stderr
    lines = [line.split("dry-run: ", 1)[1] for line in r.stdout.splitlines() if "dry-run: " in line]
    proxies = sorted(int(re.search(r"--listen-port (\d+)", l).group(1)) for l in lines if l.startswith("mitmdump"))
    appiums = [l for l in lines if l.startswith("appium server")]
    assert proxies == [8300, 8301]                                     # 8300 + slot: the phone's Wi-Fi proxy port
    assert sorted(int(re.search(r"--port (\d+)", l).group(1)) for l in appiums) == [4800, 4801]
    caps = [json.loads(l[l.index("{"):l.rindex("}") + 1]) for l in appiums]
    assert {c["appium:udid"] for c in caps} == set(udids)
    assert all(c["appium:usePreinstalledWDA"] and c["platformName"] == "iOS" for c in caps)
    assert sorted(c["appium:wdaLocalPort"] for c in caps) == [8400, 8401]
    assert sorted(os.listdir(tmp_path)) == ["logs"]                  # --dry-run does not write the slot file
