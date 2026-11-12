import { expect, scenario } from '../support/bdd';
import { QuietHall } from '../pages/hall';

scenario('hall-register', async ({ page, bdd }) => {
  const hall = new QuietHall(page);
  const id = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`.slice(0, 16);
  const other = await page.context().browser()!.newContext();            // another device: its own storage
  const stranger = new QuietHall(await other.newPage());

  await bdd.Given('the temple gate is open', async () => { await hall.openGate(); });
  await bdd.When('the visitor registers a new ID', async () => { await hall.enterWithId(id); });
  await bdd.Then('a return code is shown once', async () => {
    await expect(hall.returnCode()).toHaveText(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
    await hall.acceptReturnCode();
  });
  await bdd.Then('the hall shows the visitor as registered with merit 0', async () => {
    await expect(hall.registeredBadge()).toBeVisible();
    await expect(hall.merit()).toHaveText('0');
  });
  await bdd.When('the monk knocks the wooden fish 2 times, prostrates once and leaves the temple', async () => {
    await hall.knock(); await hall.knock();
    await expect(hall.merit()).toHaveText('2');
    await page.waitForResponse(r => r.url().endsWith('/api/knock') && r.ok());     // the knocks are one entry before the prostration
    await hall.prostrate();
    await expect(hall.merit()).toHaveText('5');
    await hall.leave();
  });
  await bdd.When('the visitor comes back with the same ID on the same device', async () => {
    await hall.enterWithId(id.toUpperCase());
    await expect(hall.myName()).toBeVisible();
  });
  await bdd.Then('merit shows 5', async () => { await expect(hall.merit()).toHaveText('5'); });
  await bdd.Then('the merit record lists "礼拜 ×1" as +3 and "敲木鱼 ×2" as +2, newest first, each with its time', async () => {
    await hall.openLedger();
    await expect(hall.ledgerReason(0)).toHaveText('礼拜 ×1');
    await expect(hall.ledgerDelta(0)).toHaveText('+3');
    await expect(hall.ledgerReason(1)).toHaveText('敲木鱼 ×2');
    await expect(hall.ledgerDelta(1)).toHaveText('+2');
    await expect(hall.ledgerRow(0)).toContainText(/\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    await hall.closeLedger();
  });
  await bdd.When('someone on another device tries the same ID with a wrong return code', async () => {
    await stranger.openGate();
    await stranger.enterWithId(id);
    await expect(stranger.gateError()).toContainText('已注册');
    await stranger.enterReturnCode('00000-00000');
  });
  await bdd.Then('the gate says "回寺口令不对"', async () => {
    await expect(stranger.gateError()).toHaveText('回寺口令不对');
  });
  await bdd.Cleanup('the monk leaves the temple', async () => { await hall.leave(); await other.close(); });
});
