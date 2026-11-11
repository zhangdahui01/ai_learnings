"""In-memory driver with the WebDriver calls the page objects use.

It models the sample shop app so the BDD scenarios and page objects can run with no device:
a smoke test of the framework itself, not of any real app.
"""
from __future__ import annotations

import random
from typing import Any


class FakeElement:
    def __init__(self, app: "FakeDriver", ident: str) -> None:
        self._app, self._id = app, ident

    @property
    def text(self) -> str:
        return self._app._text(self._id)

    def click(self) -> None:
        self._app._tap(self._id)

    def clear(self) -> None:
        self._app.fields[self._id] = ""

    def send_keys(self, text: str) -> None:
        self._app.fields[self._id] = self._app.fields.get(self._id, "") + text

    def is_displayed(self) -> bool:
        return True


class FakeDriver:
    clientx_platform = "fake"
    PRODUCTS = ("kettle", "toaster", "blender")

    def __init__(self) -> None:
        self.screen = "login"
        self.fields: dict[str, str] = {}
        self.cart: dict[str, int] = {}
        self.method: str | None = None
        self.status = ""
        self.error = ""
        self.quit_called = False

    def _visible(self) -> set[str]:
        ids = {"cart_badge"} if self.screen != "login" else set()
        if self.screen == "login":
            ids |= {"login_id_input", "login_password_input", "login_submit"} | ({"login_error"} if self.error else set())
        elif self.screen == "products":
            ids |= {"products_title", "cart_open"} | {f"product_add_{p}" for p in self.PRODUCTS}
            ids |= {"pay_status"} if self.status else set()
        elif self.screen == "cart":
            ids |= {"cart_back"} | {f"cart_line_{p}" for p in self.cart}
            ids |= {"cart_empty", "cart_checkout"} if self.cart else set()
        elif self.screen == "pay":
            ids |= {"pay_method_saved_card", "pay_method_balance", "pay_submit", "pay_status"}
        return ids

    def find_elements(self, by: str, value: str) -> list[FakeElement]:
        if by == "xpath" and value == "//*":                       # deliberately ambiguous query, for tests
            return [FakeElement(self, i) for i in sorted(self._visible())]
        return [FakeElement(self, value)] if value in self._visible() else []

    def _text(self, ident: str) -> str:
        if ident == "cart_badge":
            return str(sum(self.cart.values()))
        if ident.startswith("cart_line_"):
            product = ident[len("cart_line_"):]
            return f"{product.capitalize()} x {self.cart[product]}"
        return {"pay_status": self.status, "login_error": self.error, "products_title": "Products"}.get(ident, "")

    def _tap(self, ident: str) -> None:
        if ident == "login_submit":
            ok = self.fields.get("login_id_input") == "member" and self.fields.get("login_password_input") == "secret"
            self.screen, self.error = ("products", "") if ok else ("login", "Wrong member ID or password")
        elif ident.startswith("product_add_"):
            product = ident[len("product_add_"):]
            self.cart[product] = self.cart.get(product, 0) + 1
        elif ident == "cart_open":
            self.screen = "cart"
        elif ident == "cart_back":
            self.screen = "products"
        elif ident == "cart_empty":
            self.cart.clear()
        elif ident == "cart_checkout":
            self.screen = "pay"
        elif ident.startswith("pay_method_"):
            self.method = ident[len("pay_method_"):]
        elif ident == "pay_submit":
            if self.method is None:
                self.status = "Choose a payment method"
            else:
                self.cart.clear()
                self.status = f"Payment complete - Order #{random.randint(100000, 999999)}"
                self.screen = "products"

    # evidence + lifecycle calls used by conftest
    def get_screenshot_as_file(self, path: str) -> bool:
        return False

    @property
    def page_source(self) -> str:
        return f"<fake screen='{self.screen}' visible='{sorted(self._visible())}'/>"

    def quit(self) -> None:
        self.quit_called = True

    def __getattr__(self, name: str) -> Any:
        raise AttributeError(f"FakeDriver does not implement '{name}'")
