"""BDD scenarios: features/*.feature bound to page objects."""
import re

from pytest_bdd import given, parsers, scenarios, then, when

from clientx_app.pages import CartPage, LoginPage, PayPage, ProductsPage

scenarios("../features/login.feature", "../features/cart.feature", "../features/checkout.feature")


@given("the login screen is open")
def login_screen(driver):
    assert LoginPage(driver).present(LoginPage.SUBMIT)


@when("the member logs in with a valid member ID and password")
def log_in(driver):
    LoginPage(driver).login("member", "secret")


@then("the product list is shown")
def product_list(driver):
    assert ProductsPage(driver).loaded().text(ProductsPage.TITLE) == "Products"


@given("a logged-in member on the product list", target_fixture="products")
def on_products(member):
    return member


@given(parsers.parse('a logged-in member with "{product}" in the cart'), target_fixture="products")
def with_product(member, product):
    member.add_to_cart(product)
    member.expect_badge(1)
    return member


@when(parsers.parse('the member adds "{product}" to the cart'))
def add(products, product):
    products.add_to_cart(product)


@when(parsers.parse('the member checks out and pays with "{method}"'))
def pay(products, method):
    products.open_cart().checkout().pay_with(method)


@when("the member checks out and pays without choosing a method")
def pay_without_method(products, driver):
    products.open_cart().checkout()
    PayPage(driver).tap(PayPage.SUBMIT)


@then(parsers.parse("the cart badge shows {count:d}"))
def badge(driver, count):
    ProductsPage(driver).expect_badge(count)


@then(parsers.parse('the cart lists "{product}" with quantity {quantity:d}'))
def cart_lists(products, driver, product, quantity):
    line = products.open_cart().line(product)
    assert re.search(rf"{product}\D+{quantity}\b", line, re.I), line
    CartPage(driver).tap(CartPage.BACK)


@then(parsers.parse('the confirmation says "{text}" with an order number'))
def confirmation(driver, text):
    status = PayPage(driver).expect_status(text)
    assert re.search(r"Order #\d{6}", status), status


@then(parsers.parse('the payment screen says "{text}"'))
def payment_says(driver, text):
    PayPage(driver).expect_status(text)
