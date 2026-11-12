import { expect, scenario } from '../support/bdd';
import { QuietHall } from '../pages/hall';

scenario('hall-trial-lose', async ({ page, bdd }) => {
  const hall = new QuietHall(page);
  let handle = '';

  await bdd.Given('a monk seated in a hall where a stray dog is about to come in', async () => {
    await hall.openGate('?trial=dog');
    await hall.enter();
    handle = (await hall.myHandle().innerText()).trim().replace(/^@/, '');
    await hall.sit();
    await expect(hall.myState()).toHaveText('静坐中');
  });
  await bdd.When('the dog arrives and the monk does nothing', async () => {
    await expect(hall.trialTitle()).toBeVisible({ timeout: 15_000 });
  });
  await bdd.Then('the game ends with "定力不足"', async () => {
    await expect(hall.gameOver()).toContainText('定力不足', { timeout: 20_000 });
  });
  await bdd.Then('the monk is no longer in the hall', async () => {
    // wait past two polling intervals: a page that kept polling would have walked the monk back in
    await page.waitForTimeout(4500);
    expect(await hall.handlesInHall()).not.toContain(handle);
  });
  await bdd.When('the visitor goes back to the gate', async () => { await hall.backToGate(); });
  await bdd.Then('the temple gate is shown again', async () => {
    await expect(hall.enterButton()).toBeVisible();
  });
  await bdd.Cleanup('no side effect: the monk has already left the hall', async () => {});
});
