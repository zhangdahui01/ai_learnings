"""Create the driver for a device profile."""
from __future__ import annotations

from typing import Any

from . import config
from .fake import FakeDriver


def create(profile: str, env: dict[str, str] | None = None) -> Any:
    cfg = config.load(profile, env)
    if cfg["platform"] == "fake":
        return FakeDriver()
    from appium import webdriver                                   # imported late: the fake profile needs no Appium
    from appium.options.android import UiAutomator2Options
    from appium.options.ios import XCUITestOptions

    options = (UiAutomator2Options() if cfg["platform"] == "android" else XCUITestOptions())
    options.load_capabilities(cfg["capabilities"])
    driver = webdriver.Remote(cfg["server"], options=options)
    driver.clientx_platform = cfg["platform"]
    return driver


def platform_of(driver: Any) -> str:
    return getattr(driver, "clientx_platform", "fake")
