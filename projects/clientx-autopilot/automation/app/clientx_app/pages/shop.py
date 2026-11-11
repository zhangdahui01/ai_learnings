"""Page objects for the shop journeys.

The accessibility ids below are the locator contract of the sample app (and of the fake driver).
For a real app, explore the screens with Appium Inspector or the Appium MCP server, then put the
ids here; where Android and iOS differ, set `android=` / `ios=` on that one locator.
"""
from __future__ import annotations

from ..locators import IOS_PREDICATE, Loc
from .base import Page


def _slug(name: str) -> str:
    return name.lower().replace(" ", "_")


class LoginPage(Page):
    MEMBER_ID = Loc("login.member_id", "login_id_input")
    PASSWORD = Loc("login.password", "login_password_input")
    SUBMIT = Loc("login.submit", "login_submit",
                 ios=(IOS_PREDICATE, "type == 'XCUIElementTypeButton' AND name == 'login_submit'"))
    ERROR = Loc("login.error", "login_error")

    def login(self, member_id: str, password: str) -> "ProductsPage":
        self.type(self.MEMBER_ID, member_id)
        self.type(self.PASSWORD, password)
        self.tap(self.SUBMIT)
        return ProductsPage(self.driver)


class ProductsPage(Page):
    TITLE = Loc("products.title", "products_title")
    CART_BADGE = Loc("cart.badge", "cart_badge")
    CART_OPEN = Loc("cart.open", "cart_open")

    def loaded(self) -> "ProductsPage":
        self.el(self.TITLE)
        return self

    def add_to_cart(self, product: str) -> None:
        self.tap(Loc(f"cart.add.{_slug(product)}", f"product_add_{_slug(product)}"))

    def expect_badge(self, count: int) -> None:
        self.expect_text(self.CART_BADGE, str(count))

    def open_cart(self) -> "CartPage":
        self.tap(self.CART_OPEN)
        return CartPage(self.driver)


class CartPage(Page):
    EMPTY = Loc("cart.empty", "cart_empty")
    CHECKOUT = Loc("cart.checkout", "cart_checkout")
    BACK = Loc("cart.back", "cart_back")

    def line(self, product: str) -> str:
        return self.text(Loc(f"cart.line.{_slug(product)}", f"cart_line_{_slug(product)}"))

    def empty(self) -> None:
        if self.present(self.EMPTY):
            self.tap(self.EMPTY)

    def checkout(self) -> "PayPage":
        self.tap(self.CHECKOUT)
        return PayPage(self.driver)


class PayPage(Page):
    SUBMIT = Loc("pay.submit", "pay_submit")
    STATUS = Loc("pay.status", "pay_status")

    def pay_with(self, method: str) -> None:
        self.tap(Loc(f"pay.method.{_slug(method)}", f"pay_method_{_slug(method)}"))
        self.tap(self.SUBMIT)          # side-effect step: never retried, never auto-repaired

    def expect_status(self, text: str) -> str:
        return self.expect_text(self.STATUS, text)
