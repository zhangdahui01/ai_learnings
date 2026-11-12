"""Cross-platform locators with the strict rule: 0 matches -> wait, 1 -> act, >1 -> fail.

A locator is a contract name plus per-platform strategies. Accessibility id is the default on
both platforms; override one side only where the apps differ. Never index into a list of matches.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

ACCESSIBILITY_ID = "accessibility id"       # == AppiumBy.ACCESSIBILITY_ID
ANDROID_UIAUTOMATOR = "-android uiautomator"
IOS_PREDICATE = "-ios predicate string"
IOS_CLASS_CHAIN = "-ios class chain"
XPATH = "xpath"


class LocatorAmbiguous(Exception):
    pass


class ElementNotFound(Exception):
    pass


@dataclass(frozen=True)
class Loc:
    name: str                                   # contract name, e.g. "cart.add.kettle"
    default: str | None = None                  # accessibility id used on every platform
    android: tuple[str, str] | None = None
    ios: tuple[str, str] | None = None

    @classmethod
    def test_id(cls, name: str, test_id: str) -> "Loc":
        """A React Native `testID`: the accessibility identifier on iOS, the resource-id on Android.

        UiAutomator's own selector is used on Android because the plain `id` strategy prefixes the
        app package, and a React Native resource-id has none.
        """
        return cls(name, default=test_id, android=(ANDROID_UIAUTOMATOR, f'new UiSelector().resourceId("{test_id}")'))

    def strategy(self, platform: str) -> tuple[str, str]:
        specific = {"android": self.android, "ios": self.ios}.get(platform)
        if specific:
            return specific
        if self.default is None:
            raise ElementNotFound(f"locator '{self.name}' has no strategy for platform '{platform}'")
        return (ACCESSIBILITY_ID, self.default)


def find(driver: Any, loc: Loc, platform: str, timeout: float = 10.0, poll: float = 0.25) -> Any:
    by, value = loc.strategy(platform)
    deadline = time.monotonic() + timeout
    while True:
        found = driver.find_elements(by, value)
        if len(found) > 1:
            raise LocatorAmbiguous(f"LOCATOR_AMBIGUOUS: '{loc.name}' ({by}={value}) matches {len(found)} elements")
        if len(found) == 1:
            return found[0]
        if time.monotonic() >= deadline:
            raise ElementNotFound(f"'{loc.name}' ({by}={value}) not found within {timeout}s")
        time.sleep(poll)


def wait_until(read, accept, *, what: str, timeout: float = 10.0, poll: float = 0.25):
    """Poll `read()` until `accept(value)` is true; return the value. A state wait, never a sleep."""
    deadline = time.monotonic() + timeout
    while True:
        value = read()
        if accept(value):
            return value
        if time.monotonic() >= deadline:
            raise AssertionError(f"{what}: last value was {value!r}")
        time.sleep(poll)


def wait_text(driver: Any, loc: Loc, platform: str, expected: str, timeout: float = 10.0, poll: float = 0.25) -> str:
    """State wait instead of a fixed sleep: poll until the element's text contains `expected`."""
    deadline = time.monotonic() + timeout
    last = ""
    while True:
        try:
            last = find(driver, loc, platform, timeout=poll, poll=poll).text
        except ElementNotFound:
            last = ""
        if expected in last:
            return last
        if time.monotonic() >= deadline:
            raise AssertionError(f"'{loc.name}' text is {last!r}; expected it to contain {expected!r}")
        time.sleep(poll)
