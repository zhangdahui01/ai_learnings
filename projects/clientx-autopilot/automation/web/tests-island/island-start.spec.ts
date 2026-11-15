import { expect, scenario } from '../support/bdd';
import { Island } from '../pages/island';

scenario('island-start', async ({ page, bdd }) => {
  const isle = new Island(page);
  await bdd.Given('游戏页面已打开，还没有任何存档', async () => { await isle.open(); await expect(await isle.loc('start')).toHaveText('开始旅程'); });
  await bdd.When('玩家点「开始旅程」', async () => { await isle.click('start'); });
  await bdd.When('玩家点屏幕任意位置读完开场白', async () => { await isle.readDialog(); });
  await bdd.Then('开场白消失，左下角出现摇杆', async () => { await expect(isle.dialog()).toBeHidden(); await expect(page.locator('#joy')).toBeVisible(); });
  await bdd.Then('进度显示「心愿 0/9」', async () => { await expect(isle.progress()).toContainText('心愿 0/9'); });
  await bdd.Then('页面没有脚本报错', async () => { expect(isle.errors).toEqual([]); });
});
