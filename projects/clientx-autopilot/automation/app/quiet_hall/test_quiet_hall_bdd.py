import re
import time

from pytest_bdd import given, parsers, scenarios, then, when

from clientx_app.pages.hall import HallPage

scenarios("quiet_hall.feature")


@given("the temple gate is open", target_fixture="gate_page")
def gate_open(gate):
    return gate


@when("the visitor enters the temple", target_fixture="hall")
def enter(gate_page):
    return gate_page.enter().loaded()


@given("a monk who has entered the hall", target_fixture="hall")
def entered(gate):
    hall = gate.enter().loaded()
    hall.expect_text(HallPage.STATE, "未入坐")
    return hall


@then("the hall shows the visitor's monk with a dharma name")
def dharma_name(hall):
    name = hall.text(HallPage.NAME)
    assert re.fullmatch(r"[一-鿿]{2}", name), name


@then(parsers.parse('the monk is not sitting yet and the timer shows "{clock}"'))
def not_sitting(hall, clock):
    hall.expect_text(HallPage.STATE, "未入坐")
    hall.expect_text(HallPage.TIMER, clock)


@then(parsers.parse("the hall counts at least {n:d} monk present"))
def present(hall, n):
    count = hall.number(HallPage.PRESENT)
    assert count >= n, count


@when("the monk sits down")
def sit(hall):
    hall.sit()


@when("the monk stands up")
def stand(hall):
    hall.stand()


@then(parsers.parse('the state says "{state}"'))
def state(hall, state):
    hall.expect_text(HallPage.STATE, state)


@then(parsers.parse('the timer moves past "{clock}"'))
def timer_runs(hall, clock):
    assert hall.wait_timer_running() != clock


@then(parsers.parse('the accumulated time is more than "{clock}"'))
def accumulated(hall, clock):
    total = hall.text(HallPage.TOTAL)
    assert total != clock, total


@when("the monk bows to the hall")
def bow(hall):
    hall.bow_to_all()


@then(parsers.parse('the hall confirms "{text}"'))
def confirms(hall, text):
    hall.expect_text(HallPage.NOTICE, text)


@when(parsers.parse("the monk knocks the wooden fish {times:d} times"))
def knock(hall, times):
    hall.knock(times)


@then(parsers.parse("the merit shows {merit:d}"))
def merit_shows(hall, merit):
    hall.expect_text(HallPage.MERIT, str(merit))


@when(parsers.parse("the monk prostrates {times:d} times"))
def prostrate(hall, times):
    hall.prostrate(times)


@when(parsers.parse("the monk turns {beads:d} prayer beads"))
def turn_beads(hall, beads):
    hall.turn_beads(beads)


@then(parsers.parse("the prostration count shows {count:d}"))
def prostration_count(hall, count):
    hall.expect_text(HallPage.PROSTRATIONS, str(count))


@then(parsers.parse("the bead count shows {count:d}"))
def bead_count(hall, count):
    hall.expect_text(HallPage.BEADS, str(count))


@when("the visitor registers a new ID", target_fixture="registration")
def register(gate_page):
    handle = f"t{int(time.time() * 1000):x}"[-14:]
    gate_page.enter_with_id(handle)
    return {"handle": handle, "gate": gate_page}


@then("a return code is shown once", target_fixture="hall")
def return_code(registration):
    code, hall = registration["gate"].accept_return_code()
    assert re.fullmatch(r"[0-9A-F]{5}-[0-9A-F]{5}", code), code
    return hall.loaded()


@then("the hall shows the monk as registered")
def registered(hall):
    hall.el(HallPage.REGISTERED)


@when("the monk leaves and comes back with the same ID")
def come_back(hall, registration):
    hall.expect_text(HallPage.MERIT, "3")          # the count has reached the hall before leaving
    gate = hall.leave()
    gate.enter_with_id(registration["handle"])
    hall.loaded()


@then(parsers.parse('the newest line of the merit record is "{reason}" with "{change}"'))
def newest_line(hall, reason, change):
    hall.open_ledger()
    assert hall.ledger_entry(0) == (reason, change)
    hall.close_ledger()
