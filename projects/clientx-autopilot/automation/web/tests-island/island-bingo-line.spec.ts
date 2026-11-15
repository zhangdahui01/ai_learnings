import { expect, scenario } from '../support/bdd';
import { Island } from '../pages/island';

scenario('island-bingo-line', async ({ page, bdd }) => {
  const isle = new Island(page);
  await bdd.Given('玩家已开始新游戏并读完开场白', async () => { await isle.open(); await isle.startNewGame(); });
  await bdd.Given('老树在连线之前只让玩家先去完成心愿', async () => {
    await isle.standAt(0, -48.5); await isle.act(/和老树说话/); await expect(isle.dialog()).toContainText('老树'); await isle.readDialog();
    await expect(page.locator('#end')).toBeHidden();
  });
  await bdd.When('玩家叫醒苔爷爷', async () => { await isle.standAt(-30, -16.5); await isle.act(/叫醒苔爷爷/); await isle.readDialog(); await expect(isle.progress()).toContainText('1/9'); });
  await bdd.When('玩家摸摸 Bingo', async () => { await isle.standAt(0, 30); await isle.act(/摸摸 Bingo/); await isle.readDialog(); await expect(isle.progress()).toContainText('2/9'); });
  let sawLine = false;
  await bdd.When('玩家在茶屋喝茶', async () => {
    await isle.standAt(-18, 43); await isle.act(/进茶屋坐坐/); await expect(isle.dialog()).toBeVisible();
    for (let i = 0; i < 20 && await isle.dialog().isVisible(); i++) { if ((await isle.dialog().innerText()).includes('连成了一条线')) sawLine = true; await page.touchscreen.tap(200, 250); await page.waitForTimeout(250); }
  });
  await bdd.Then('对话里出现「连成了一条线」', async () => { expect(sawLine).toBe(true); await expect(isle.progress()).toContainText('3/9'); });
  await bdd.Then('再去找老树会看到结局画面「你想起来了」', async () => {
    await isle.standAt(0, -48.5); await isle.act(/和老树说话/); await isle.readDialog();
    await expect(page.locator('#end')).toBeVisible(); await expect(page.locator('#endTxt')).toContainText('你想起来了');
  });
});
