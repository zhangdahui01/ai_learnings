import { expect, scenario, test } from '../support/bdd';
import { Shop } from '../pages/shop';

scenario('login', async ({ page, bdd }) => {
  const shop = new Shop(page, test.info());

  await bdd.Given('the login page is open', async () => {
    await shop.open();
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  });
  await bdd.When('the member logs in with a valid member ID and password', async () => {
    await shop.loginAs('member', 'secret');
  });
  await bdd.Then('the product list is shown', async () => {
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(3);
  });
  await bdd.Cleanup('no side effect: logging in changes no data', async () => {});
});
