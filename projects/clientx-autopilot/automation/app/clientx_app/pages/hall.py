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
    MINE = T("gate.mine", "gate.mine")
    HANDLE = T("gate.handle", "gate.handle")
    OWN = T("gate.own", "gate.own")
    CODE = T("gate.code", "gate.code")
    CODE_DONE = T("gate.code.done", "gate.code.done")
    CODE_INPUT = T("gate.code.input", "gate.code.input")

    def set_server(self, url: str) -> None:
        if not self.present(self.SERVER):
            self.tap(self.SERVER_TOGGLE)
        self.type(self.SERVER, url)

    def enter(self) -> "HallPage":
        """No ID to type: the app draws a random one for every visit."""
        self.tap(self.ENTER)
        return HallPage(self.driver)


    def enter_with_id(self, handle: str) -> None:
        """A new ID is registered (a return code follows); an ID this device knows walks straight back in."""
        self.tap(self.MINE)
        self.type(self.HANDLE, handle)
        self.tap(self.OWN)

    def accept_return_code(self) -> tuple[str, "HallPage"]:
        code = self.text(self.CODE)
        self.tap(self.CODE_DONE)
        return code, HallPage(self.driver)


class HallPage(Page):
    REGISTERED = T("hall.me.registered", "hall.me.registered")
    TRIALS = T("hall.me.trials", "hall.me.trials")
    SUMMON_DOG = T("hall.summon.dog", "hall.summon.dog")
    SUMMON_FAIRIES = T("hall.summon.fairies", "hall.summon.fairies")
    TRIAL_TITLE = T("hall.trial", "hall.trial")
    LEDGER = T("hall.ledger", "hall.ledger")
    LEDGER_PANEL = T("ledger.panel", "ledger.panel")
    LEDGER_CLOSE = T("ledger.close", "ledger.close")
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

    def summon(self, kind: str) -> None:
        self.tap(self.SUMMON_DOG if kind == "dog" else self.SUMMON_FAIRIES)
        self.el(self.TRIAL_TITLE)

    def ledger_entry(self, row: int) -> tuple[str, str]:
        """(reason, change) of one line of the merit record; row 0 is the newest."""
        return (self.text(T(f"ledger.reason.{row}", f"ledger.reason.{row}")),
                self.text(T(f"ledger.delta.{row}", f"ledger.delta.{row}")))

    def open_ledger(self) -> None:
        self.tap(self.LEDGER)
        self.el(self.LEDGER_PANEL)

    def close_ledger(self) -> None:
        self.tap(self.LEDGER_CLOSE)

    def bow_to_all(self) -> None:
        self.tap(self.BOW)

    def leave(self) -> GatePage:
        self.tap(self.LEAVE)
        gate = GatePage(self.driver)
        gate.el(GatePage.MINE)
        return gate

    def wait_timer_running(self) -> str:
        return locators.wait_until(lambda: self.text(self.TIMER), lambda v: v not in ("", "00:00"),
                                   what="the sitting timer did not move past 00:00", timeout=self.timeout)
