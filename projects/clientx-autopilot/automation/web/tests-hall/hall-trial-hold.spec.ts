import { expect, scenario } from '../support/bdd';
import { QuietHall } from '../pages/hall';

scenario('hall-trial-hold', async ({ page, bdd }) => {
  const hall = new QuietHall(page);

  await bdd.Given('a monk seated in a hall where a stray dog is about to come in', async () => {
    await hall.openGate('?trial=dog');
    await hall.enter();
    await hall.sit();
    await expect(hall.myState()).toHaveText('静坐中');
  });
  await bdd.When('the dog arrives', async () => {
    await expect(hall.trialTitle()).toBeVisible({ timeout: 15_000 });
  });
  await bdd.Then('the hall announces "野狗闯进大殿，绕着你狂吠" and shows the composure meter', async () => {
    await expect(hall.trialTitle()).toHaveText('野狗闯进大殿，绕着你狂吠');
    await expect(hall.focusValue()).toHaveText(/^\d+$/);
  });
  await bdd.Then('the monk cannot stand up while the trial lasts', async () => {
    await hall.stand();
    await expect(hall.notice()).toHaveText('考验当前，不可起身');
    await expect(hall.myState()).toHaveText('静坐中');
  });
  await bdd.When('the monk keeps gathering the mind until the dog leaves', async () => {
    await hall.gatherUntilTrialEnds();
  });
  await bdd.Then('the composure count shows 1', async () => {
    await expect(hall.trials()).toHaveText('1');
  });
  await bdd.Then('the monk is still seated in the hall', async () => {
    await expect(hall.myState()).toHaveText('静坐中');
  });
  await bdd.Cleanup('the monk leaves the temple', async () => { await hall.leave(); });
});
