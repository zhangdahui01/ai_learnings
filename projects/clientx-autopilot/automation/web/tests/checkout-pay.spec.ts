import { expect, scenario, test } from '../support/bdd';
import { Shop } from '../pages/shop';

scenario('checkout-pay', async ({ page, bdd }) => {
  const shop = new Shop(page, test.info());

  await bdd.Given('a logged-in member with "Kettle" in the cart', async () => {
    await shop.open();
    await shop.loginAs('member', 'secret');
    await shop.addToCart('Kettle');
    await expect(shop.cartBadge()).toHaveText('1');
  });
  await bdd.When('the member checks out and pays with "Saved card"', async () => {
    await shop.openCart();
    await shop.checkout();
    await shop.payWith('Saved card');
  });
  await bdd.Then('the confirmation says "Payment complete" with an order number', async () => {
    await expect(shop.confirmation()).toContainText('Payment complete');
    await expect(shop.confirmation()).toContainText(/Order #\d{6}/);
  });
  await bdd.Then('the cart badge shows 0', async () => {
    await expect(shop.cartBadge()).toHaveText('0');
  });
  await bdd.Cleanup('no side effect outside the test account: the order is created in the test tenant', async () => {});
});
