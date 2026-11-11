from __future__ import annotations

from typing import Any

from .. import locators
from ..driver import platform_of
from ..locators import Loc


class Page:
    timeout = 10.0

    def __init__(self, driver: Any) -> None:
        self.driver = driver
        self.platform = platform_of(driver)

    def el(self, loc: Loc) -> Any:
        return locators.find(self.driver, loc, self.platform, timeout=self.timeout)

    def tap(self, loc: Loc) -> None:
        self.el(loc).click()

    def type(self, loc: Loc, text: str) -> None:
        element = self.el(loc)
        element.clear()
        element.send_keys(text)

    def text(self, loc: Loc) -> str:
        return self.el(loc).text

    def expect_text(self, loc: Loc, expected: str) -> str:
        return locators.wait_text(self.driver, loc, self.platform, expected, timeout=self.timeout)

    def present(self, loc: Loc) -> bool:
        return len(self.driver.find_elements(*loc.strategy(self.platform))) == 1
