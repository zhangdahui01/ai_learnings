import { expect, scenario } from '../support/bdd';
import { QuietHall } from '../pages/hall';

scenario('hall-knock', async ({ page, bdd }) => {
  const hall = new QuietHall(page);

  await bdd.Given('a monk who has entered the hall with merit 0', async () => {
    await hall.openGate();
    await hall.enter();
    await expect(hall.merit()).toHaveText('0');
  });
  await bdd.When('the monk knocks the wooden fish 3 times', async () => {
    for (let i = 0; i < 3; i += 1) await hall.knock();
  });
  await bdd.Then('the merit shows 3 at once', async () => {
    await expect(hall.merit()).toHaveText('3');
  });
  await bdd.Then('the merit still shows 3 after the hall has been reloaded', async () => {
    // reload straight away: knocks not sent yet must be delivered as the page closes, none may be lost
    await page.reload();
    await expect(hall.merit()).toHaveText('3');
  });
  await bdd.Cleanup('the monk leaves the temple', async () => { await hall.leave(); });
});
