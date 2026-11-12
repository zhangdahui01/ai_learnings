import { expect, scenario } from '../support/bdd';
import { QuietHall } from '../pages/hall';

scenario('hall-sit', async ({ page, bdd }) => {
  const hall = new QuietHall(page);
  let sittingBefore = 0;

  await bdd.Given('a monk who has entered the hall', async () => {
    await hall.openGate();
    await hall.enterAs(QuietHall.newId());
    await expect(hall.myState()).toHaveText('未入坐');
    sittingBefore = await hall.number('sitting');
  });
  await bdd.When('the monk sits down', async () => { await hall.sit(); });
  await bdd.Then('the state says "静坐中" and the sitting count goes up by 1', async () => {
    await expect(hall.myState()).toHaveText('静坐中');
    // other tests sit and stand in the same hall, so the count is checked as "at least one more than nobody"
    await expect.poll(() => hall.number('sitting')).toBeGreaterThanOrEqual(Math.min(sittingBefore, 12) + 1);
  });
  await bdd.Then('the timer moves past "00:00"', async () => {
    await expect(hall.timer()).not.toHaveText('00:00');
  });
  await bdd.When('the monk stands up', async () => { await hall.stand(); });
  await bdd.Then('the state says "未入坐" and the timer shows "00:00"', async () => {
    await expect(hall.myState()).toHaveText('未入坐');
    await expect(hall.timer()).toHaveText('00:00');
  });
  await bdd.Then('the accumulated time is more than "00:00"', async () => {
    await expect(hall.total()).not.toHaveText('00:00');
  });
  await bdd.Cleanup('the monk leaves the temple', async () => { await hall.leave(); });
});
