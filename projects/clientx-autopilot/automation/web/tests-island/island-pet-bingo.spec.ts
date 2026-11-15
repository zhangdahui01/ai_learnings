import { expect, scenario } from '../support/bdd';
import { Island } from '../pages/island';

scenario('island-pet-bingo', async ({ page, bdd }) => {
  const isle = new Island(page);
  await bdd.Given('玩家已开始新游戏并读完开场白', async () => { await isle.open(); await isle.startNewGame(); });
  await bdd.When('玩家点「摸摸 Bingo」并读完对话', async () => { await isle.act(/摸摸 Bingo/); await isle.readDialog(); });
  await bdd.Then('进度显示「心愿 1/9」', async () => { await expect(isle.progress()).toContainText('心愿 1/9'); });
  await bdd.Then('心愿卡正中间的格子盖上了爪印', async () => { await isle.click('open-card'); await expect(page.locator('#grid .cell').nth(4)).toHaveClass(/done/); });
});
