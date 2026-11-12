import { expect, scenario } from '../support/bdd';
import { QuietHall } from '../pages/hall';

scenario('hall-id-taken', async ({ page, bdd }) => {
  const first = new QuietHall(page);
  const id = QuietHall.newId();
  const other = await page.context().browser()!.newContext();          // a second person: separate storage
  const second = new QuietHall(await other.newPage());

  await bdd.Given('a monk who has entered the hall with an ID', async () => {
    await first.openGate();
    await first.enterAs(id);
    await expect(first.myName()).toBeVisible();
  });
  await bdd.When('a second visitor tries to enter with the same ID', async () => {
    await second.openGate();
    await second.enterAs(id.toUpperCase());
  });
  await bdd.Then('the gate says "这个 ID 已有人在用，请换一个"', async () => {
    await expect(second.gateError()).toHaveText('这个 ID 已有人在用，请换一个');
  });
  await bdd.Then('the second visitor stays at the gate', async () => {
    await expect(second.enterButton()).toBeVisible();
    await expect(second.myName()).toHaveCount(0);
  });
  await bdd.Cleanup('the first monk leaves the temple', async () => { await first.leave(); await other.close(); });
});
