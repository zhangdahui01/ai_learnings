"""Page objects for the Quiet Hall sample app (projects/quiet-hall). Locators are the app's React Native testIDs."""
from __future__ import annotations

from .. import locators
from ..locators import Loc
from .base import Page

T = Loc.test_id


class GatePage(Page):
    ENTER = T("gate.enter", "gate.enter")
    ERROR = T("gate.error", "gate.error")
    SERVER_TOGGLE = T("gate.server.toggle", "gate.server.toggle")
    SERVER = T("gate.server", "gate.server")

    def set_server(self, url: str) -> None:
        if not self.present(self.SERVER):
            self.tap(self.SERVER_TOGGLE)
        self.type(self.SERVER, url)

    def enter(self) -> "HallPage":
        """No ID to type: the app draws a random one for every visit."""
        self.tap(self.ENTER)
        return HallPage(self.driver)


class HallPage(Page):
    NAME = T("hall.me.name", "hall.me.name")
    HANDLE = T("hall.me.handle", "hall.me.handle")
    STATE = T("hall.me.state", "hall.me.state")
    TIMER = T("hall.me.timer", "hall.me.timer")
    TOTAL = T("hall.me.total", "hall.me.total")
    BOWS = T("hall.me.bows", "hall.me.bows")
    MERIT = T("hall.me.merit", "hall.me.merit")
    PROSTRATIONS = T("hall.me.prostrations", "hall.me.prostrations")
    BEADS = T("hall.me.beads", "hall.me.beads")
    PRESENT = T("hall.count", "hall.count")
    SITTING = T("hall.sitting", "hall.sitting")
    SIT = T("hall.sit", "hall.sit")
    STAND = T("hall.stand", "hall.stand")
    KNOCK = T("hall.knock", "hall.knock")
    PROSTRATE = T("hall.prostrate", "hall.prostrate")
    BEADS_OPEN = T("hall.beads", "hall.beads")
    BEAD = T("beads.bead", "beads.bead")
    BEADS_IN_ROUND = T("beads.count", "beads.count")
    BEADS_CLOSE = T("beads.close", "beads.close")
    BOW = T("hall.bow", "hall.bow")
    LEAVE = T("hall.leave", "hall.leave")
    NOTICE = T("hall.notice", "hall.notice")

    def loaded(self) -> "HallPage":
        self.el(self.NAME)
        return self

    def number(self, loc: Loc) -> int:
        return int(self.text(loc))

    def sit(self) -> None:
        self.tap(self.SIT)

    def stand(self) -> None:
        self.tap(self.STAND)

    def knock(self, times: int = 1) -> None:
        for _ in range(times):
            self.tap(self.KNOCK)

    def prostrate(self, times: int = 1) -> None:
        for _ in range(times):
            self.tap(self.PROSTRATE)

    def turn_beads(self, beads: int) -> None:
        self.tap(self.BEADS_OPEN)
        for _ in range(beads):
            self.tap(self.BEAD)
        self.expect_text(self.BEADS_IN_ROUND, str(beads % 108))
        self.tap(self.BEADS_CLOSE)

    def bow_to_all(self) -> None:
        self.tap(self.BOW)

    def leave(self) -> GatePage:
        self.tap(self.LEAVE)
        gate = GatePage(self.driver)
        gate.el(GatePage.ENTER)
        return gate

    def wait_timer_running(self) -> str:
        return locators.wait_until(lambda: self.text(self.TIMER), lambda v: v not in ("", "00:00"),
                                   what="the sitting timer did not move past 00:00", timeout=self.timeout)
