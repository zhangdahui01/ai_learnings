"""pytest wiring: device profile, driver lifecycle, evidence on failure, cleanup.

    pytest automation/app/tests --device-profile android-emulator
    pytest automation/app/tests --device-profile ios-simulator
    pytest automation/app/tests --device-profile ios-real
Default profile is `fake` (no device): it exercises the framework itself.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

APP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP_ROOT))

from clientx_app import driver as drivers  # noqa: E402
from clientx_app.pages import CartPage, LoginPage, ProductsPage  # noqa: E402


def pytest_addoption(parser):
    parser.addoption("--device-profile", default="fake",
                     help="android-emulator | ios-simulator | ios-real | fake")
    parser.addoption("--evidence-dir", default=str(APP_ROOT / "test-results"))


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    setattr(item, f"report_{report.when}", report)


@pytest.fixture
def driver(request):
    drv = drivers.create(request.config.getoption("--device-profile"))
    yield drv
    report = getattr(request.node, "report_call", None)
    if report is not None and report.failed:            # evidence for Release Guard / Case Care
        folder = Path(request.config.getoption("--evidence-dir")) / request.node.name
        folder.mkdir(parents=True, exist_ok=True)
        drv.get_screenshot_as_file(str(folder / "failure.png"))
        (folder / "page_source.xml").write_text(drv.page_source)
    drv.quit()


@pytest.fixture
def member(driver):
    """A logged-in member on the product list, with an empty cart; the cart is emptied again afterwards."""
    products = LoginPage(driver).login("member", "secret").loaded()
    yield products
    if ProductsPage(driver).present(ProductsPage.CART_OPEN):
        cart = ProductsPage(driver).open_cart()
        cart.empty()
