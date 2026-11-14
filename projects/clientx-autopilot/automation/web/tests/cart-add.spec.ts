import { expect, scenario } from '../support/bdd';
import { test } from '../support/bdd';
import { Shop } from '../pages/shop';

scenario('cart-add', async ({ page, bdd }) => {
  const shop = new Shop(page, test.info());

  await bdd.Given('a logged-in member on the product list', async () => {
    await shop.open();
    await shop.loginAs('member', 'secret');
  });
  await bdd.When('the member adds "Kettle" to the cart', async () => {
    await shop.addToCart('Kettle');
  });
  await bdd.Then('the cart badge shows 1', async () => {
    await expect(shop.cartBadge()).toHaveText('1');
  });
  await bdd.Then('the cart lists "Kettle" with quantity 1', async () => {
    await shop.openCart();
    await expect(shop.cartLine('Kettle')).toContainText('× 1');
  });
  await bdd.Cleanup('empty the cart', async () => {
    await shop.emptyCart();
  });
});
