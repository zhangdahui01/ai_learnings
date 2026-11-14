"""The framework's own guard rails: capabilities per device kind, strict locators, proxy commands."""
import importlib.util
from pathlib import Path

import pytest

from clientx_app import config, locators, proxy
from clientx_app.fake import FakeDriver
from clientx_app.locators import Loc

ENV = {"ANDROID_APP_PACKAGE": "com.example.shop", "ANDROID_APP_ACTIVITY": ".MainActivity",
       "IOS_BUNDLE_ID": "com.example.shop", "DEVICE_UDID": "UDID-1", "XCODE_ORG_ID": "TEAM123"}


def test_android_emulator_capabilities():
    cfg = config.load("android-emulator", {k: v for k, v in ENV.items() if k != "DEVICE_UDID"})
    caps = cfg["capabilities"]
    assert caps["appium:automationName"] == "UiAutomator2" and caps["appium:udid"] == "emulator-5554"
    assert caps["appium:systemPort"] == 8200 and "appium:avd" not in caps and "appium:app" not in caps
    assert caps["appium:appPackage"] == "com.example.shop"


def test_ios_simulator_and_real_device_differ_only_in_signing():
    sim = config.load("ios-simulator", ENV)["capabilities"]
    real = config.load("ios-real", ENV)["capabilities"]
    assert sim["appium:automationName"] == real["appium:automationName"] == "XCUITest"
    assert "appium:xcodeOrgId" not in sim and real["appium:xcodeOrgId"] == "TEAM123"
    assert real["appium:usePrebuiltWDA"] is True and real["appium:noReset"] is True


def test_missing_settings_are_named_not_guessed():
    with pytest.raises(config.MissingSetting, match="DEVICE_UDID.*IOS_BUNDLE_ID.*XCODE_ORG_ID"):
        config.load("ios-real", {})


def test_parallel_devices_get_their_own_ports():
    a = config.load("ios-real", {**ENV, "WDA_PORT": "8101"})["capabilities"]
    b = config.load("ios-real", {**ENV, "DEVICE_UDID": "UDID-2", "WDA_PORT": "8102"})["capabilities"]
    assert (a["appium:wdaLocalPort"], b["appium:wdaLocalPort"]) == (8101, 8102)


def test_strict_locator_rule():
    drv = FakeDriver()
    assert locators.find(drv, Loc("login.submit", "login_submit"), "fake", timeout=0.1)
    with pytest.raises(locators.LocatorAmbiguous):
        locators.find(drv, Loc("any", android=("xpath", "//*")), "android", timeout=0.1)
    with pytest.raises(locators.ElementNotFound):
        locators.find(drv, Loc("cart.open", "cart_open"), "fake", timeout=0.3)


def test_platform_specific_strategy():
    loc = Loc("login.submit", "login_submit", ios=(locators.IOS_PREDICATE, "name == 'login_submit'"))
    assert loc.strategy("android") == ("accessibility id", "login_submit")
    assert loc.strategy("ios")[0] == "-ios predicate string"


def test_proxy_commands_per_device_kind():
    android = proxy.device_proxy_commands("android-emulator", "emulator-5554", "127.0.0.1", 8080)
    assert android == [["adb", "-s", "emulator-5554", "shell", "settings", "put", "global", "http_proxy", "10.0.2.2:8080"]]
    assert proxy.device_proxy_commands("ios-simulator", "SIM-1", "127.0.0.1")[0][:3] == ["xcrun", "simctl", "keychain"]
    assert proxy.device_proxy_commands("ios-real", "UDID-1", "127.0.0.1") == []
    assert proxy.run(android)[0]["dry_run"] is True
    assert "route_to_staging.py" in " ".join(proxy.start_command())
    assert proxy.is_up(port=1) is False


def test_route_rewrite_rules():
    spec = importlib.util.spec_from_file_location("addon", Path(proxy.ADDON))
    addon = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(addon)
    routes = {"api.shop.com": "api.stg", "*.pay.shop.com": "pay.stg", "*.shop.com": "any.stg"}
    assert addon.rewrite("api.shop.com", routes) == "api.stg"
    assert addon.rewrite("m.pay.shop.com", routes) == "pay.stg"          # longest suffix wins
    assert addon.rewrite("other.com", routes) is None
