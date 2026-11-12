import { expect, scenario } from '../support/bdd';
import { QuietHall } from '../pages/hall';

scenario('hall-practice', async ({ page, bdd }) => {
  const hall = new QuietHall(page);

  await bdd.Given('a monk who has entered the hall with 0 prostrations and 0 beads', async () => {
    await hall.openGate();
    await hall.enter();
    await expect(hall.prostrations()).toHaveText('0');
    await expect(hall.beads()).toHaveText('0');
  });
  await bdd.When('the monk prostrates 2 times', async () => {
    await hall.prostrate();
    await hall.prostrate();
  });
  await bdd.Then('the prostration count shows 2', async () => {
    await expect(hall.prostrations()).toHaveText('2');
  });
  await bdd.When('the monk picks up the prayer beads and turns 4 beads', async () => {
    await hall.openBeads();
    for (let i = 0; i < 4; i += 1) await hall.turnBead();
  });
  await bdd.Then('the beads panel shows 4 of 108', async () => {
    await expect(hall.beadsInRound()).toHaveText('4');
  });
  await bdd.Then('the bead count shows 4 after the panel is put away', async () => {
    await hall.closeBeads();
    await expect(hall.beads()).toHaveText('4');
  });
  await bdd.Then('both counts are still there after the hall has been reloaded', async () => {
    await page.reload();
    await expect(hall.prostrations()).toHaveText('2');
    await expect(hall.beads()).toHaveText('4');
  });
  await bdd.Cleanup('the monk leaves the temple', async () => { await hall.leave(); });
});
