import { expect, scenario } from '../support/bdd';
import { QuietHall } from '../pages/hall';

scenario('hall-trial-hold', async ({ page, bdd }) => {
  const hall = new QuietHall(page);
  let before = 0;

  await bdd.Given('a monk seated in the hall with merit 0', async () => {
    await hall.openGate();
    await hall.enter();
    await hall.sit();
    await expect(hall.myState()).toHaveText('静坐中');
    await expect(hall.merit()).toHaveText('0');
  });
  await bdd.When('the monk calls a stray dog', async () => { await hall.summon('dog'); });
  await bdd.Then('the hall announces "野狗闯进大殿，绕着你狂吠" and shows the composure meter', async () => {
    await expect(hall.trialTitle()).toHaveText('野狗闯进大殿，绕着你狂吠');
    await expect(hall.focusValue()).toHaveText(/^\d+$/);
  });
  await bdd.Then('the monk cannot stand up while the trial lasts', async () => {
    await hall.stand();
    await expect(hall.notice()).toHaveText('考验当前，不可起身');
    await expect(hall.myState()).toHaveText('静坐中');
  });
  await bdd.When('composure has dropped and the monk knocks the wooden fish and prostrates', async () => {
    await expect.poll(() => hall.focus()).toBeLessThan(80);
    before = await hall.focus();
    await hall.knock();
    await hall.prostrate();
  });
  await bdd.Then('composure is higher than before', async () => {
    expect(await hall.focus()).toBeGreaterThan(before + 15);          // +8 and +20, less what drained meanwhile
  });
  await bdd.When('the monk keeps gathering the mind until the dog leaves', async () => {
    await hall.gatherUntilTrialEnds();
  });
  await bdd.Then('the trials held count shows 1', async () => {
    await expect(hall.trials()).toHaveText('1');
  });
  await bdd.Then('merit shows 14: 1 for the knock, 3 for the prostration, 10 for holding', async () => {
    await expect(hall.merit()).toHaveText('14');
  });
  await bdd.Then('the monk is still seated in the hall', async () => {
    await expect(hall.myState()).toHaveText('静坐中');
  });
  await bdd.Cleanup('the monk leaves the temple', async () => { await hall.leave(); });
});
