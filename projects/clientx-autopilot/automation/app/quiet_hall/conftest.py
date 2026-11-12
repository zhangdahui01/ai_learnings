"""Quiet Hall on a device. Needs the app installed and the hall server reachable from the device.

    cd projects/quiet-hall && node server/server.mjs --residents 12 &
    export ANDROID_APP_PACKAGE=dev.clientx.quiethall ANDROID_APP_ACTIVITY=.MainActivity
    pytest automation/app/quiet_hall --device-profile android-emulator
    export IOS_BUNDLE_ID=dev.clientx.quiethall DEVICE_UDID=<booted simulator udid>
    pytest automation/app/quiet_hall --device-profile ios-simulator

HALL_SERVER overrides the server address typed at the gate (default: the app's own default,
which is the host machine for an emulator or simulator).
"""
import os

import pytest

from clientx_app.pages.hall import GatePage, HallPage


@pytest.fixture
def gate(driver, request):
    if request.config.getoption("--device-profile") == "fake":
        pytest.fail("Quiet Hall cases need a real device profile: android-emulator, ios-simulator or ios-real")
    page = GatePage(driver)
    page.el(GatePage.ENTER)
    if os.environ.get("HALL_SERVER"):
        page.set_server(os.environ["HALL_SERVER"])
    yield page
    hall = HallPage(driver)                       # cleanup: leave the temple so the cushion is freed
    if hall.present(HallPage.LEAVE):
        hall.leave()
