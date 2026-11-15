import { expect, scenario } from '../support/bdd';
import { Island } from '../pages/island';

scenario('island-guest-local-save', async ({ page, bdd }) => {
  const isle = new Island(page);
  await bdd.Given('一位没登录的玩家已经摸过 Bingo，进度是 1/9', async () => {
    await isle.open(); await isle.startNewGame(); await isle.act(/摸摸 Bingo/); await isle.readDialog(); await expect(isle.progress()).toContainText('1/9');
  });
  await bdd.When('玩家刷新页面', async () => { await page.reload(); await expect(await isle.loc('start')).toHaveText('继续旅程'); });
  await bdd.When('玩家点「继续旅程」', async () => { await isle.click('start'); });
  await bdd.Then('进度仍然是「心愿 1/9」，没有再出现开场白', async () => { await expect(isle.progress()).toContainText('心愿 1/9'); await expect(isle.dialog()).toBeHidden(); });
});
