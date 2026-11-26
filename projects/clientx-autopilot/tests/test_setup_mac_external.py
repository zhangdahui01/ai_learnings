"""scripts/setup_mac_external.sh: the modes that change nothing must work on any machine, with or without the tools."""
import os
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "setup_mac_external.sh"


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


def test_dry_run_changes_nothing_and_reaches_the_end(tmp_path):
    r = run(tmp_path, "--dry-run")
    assert "Summary:" in r.stdout and "Still needed from the INTERNAL network" in r.stdout
    assert sorted(os.listdir(tmp_path)) == ["logs"]          # only its own log, no ~/.zprofile, no SDK folder


def test_no_internal_names():
    text = SCRIPT.read_text().lower()
    for word in ("coupa", "cpay", "fintech"):
        assert word not in text
