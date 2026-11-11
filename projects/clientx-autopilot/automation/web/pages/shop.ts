import { expect, type Page, type TestInfo } from '@playwright/test';
import { by, strict } from '../support/strict';

/** Page object for the shop journeys: login, cart, checkout. Locators are role/label/test-id contracts. */
export class Shop {
  constructor(private page: Page, private info?: TestInfo) {}

  async open() { await this.page.goto('/'); }

  async loginAs(user: string, password: string) {
    await this.page.getByLabel('Member ID').fill(user);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Log in' }).click();
    await expect(this.page.getByRole('heading', { name: 'Products' })).toBeVisible();
  }

  async addToCart(product: string) {
    const card = this.page.getByRole('listitem').filter({ hasText: product });
    const button = await strict('cart.add', [
      { description: `role=button[name=Add to cart] in "${product}"`, locator: card.getByRole('button', { name: 'Add to cart' }) },
      { description: `testid=add-${product}`, locator: this.page.getByTestId(`add-${product.toLowerCase()}`) },
    ], this.info);
    await button.click();
  }

  cartBadge() { return this.page.getByTestId('cart-badge'); }

  async openCart() { await this.page.getByRole('link', { name: /Cart/ }).click(); }

  cartLine(product: string) { return this.page.getByRole('row').filter({ hasText: product }); }

  async emptyCart() {
    await this.openCart();
    const clear = this.page.getByRole('button', { name: 'Empty cart' });
    if (await clear.isEnabled()) await clear.click();
    await expect(this.cartBadge()).toHaveText('0');
  }

  async checkout() { await this.page.getByRole('button', { name: 'Checkout' }).click(); }

  async payWith(method: string) {
    await this.page.getByRole('radio', { name: method }).check();
    const pay = await strict('checkout.pay', [by.role(this.page, 'button', 'Pay now'), by.testId(this.page, 'pay')], this.info);
    await pay.click();   // side-effect step: never retried, never auto-repaired
  }

  confirmation() { return this.page.getByRole('status'); }
}
