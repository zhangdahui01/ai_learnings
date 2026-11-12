import { expect, scenario } from '../support/bdd';
import { QuietHall } from '../pages/hall';

scenario('hall-enter', async ({ page, bdd }) => {
  const hall = new QuietHall(page);

  await bdd.Given('the temple gate is open', async () => { await hall.openGate(); });
  await bdd.When('the visitor enters the temple', async () => { await hall.enter(); });
  await bdd.Then("the hall shows the visitor's monk with a dharma name", async () => {
    await expect(hall.myName()).toHaveText(/^[一-鿿]{2}$/);
  });
  await bdd.Then('the monk is not sitting yet and the timer shows "00:00"', async () => {
    await expect(hall.myState()).toHaveText('未入坐');
    await expect(hall.timer()).toHaveText('00:00');
  });
  await bdd.Then('the hall counts at least 1 monk present', async () => {
    await expect.poll(() => hall.number('present')).toBeGreaterThanOrEqual(1);
  });
  await bdd.Cleanup('the visitor leaves the temple', async () => { await hall.leave(); });
});
