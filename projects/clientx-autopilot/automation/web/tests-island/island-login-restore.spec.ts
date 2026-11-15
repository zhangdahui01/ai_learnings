import { expect, scenario } from '../support/bdd';
import { Island } from '../pages/island';

scenario('island-login-restore', async ({ page, bdd }) => {
  const isle = new Island(page);
  let second!: Island;
  await bdd.Given('用户「bingo_fan」在第一台设备上玩到了 2/9', async () => {
    await isle.open(); await isle.click('open-account'); await isle.register('bingo_fan', 'pw-12345'); await expect(await isle.loc('whoami')).toBeVisible(); await isle.click('panel-close');
    await isle.click('restart'); await isle.readDialog();
    await isle.act(/摸摸 Bingo/); await isle.readDialog();
    await isle.standAt(-30, -16.5); await isle.act(/叫醒苔爷爷/); await isle.readDialog();
    await expect(isle.progress()).toContainText('2/9');
    await expect.poll(() => isle.backend.saves.length).toBe(2);
  });
  await bdd.When('玩家在一台全新的设备上打开游戏并登录', async () => {
    const ctx = await page.context().browser()!.newContext({ baseURL: new URL(page.url()).origin, hasTouch: true, isMobile: true, viewport: page.viewportSize()! });
    second = new Island(await ctx.newPage(), isle.backend);
    await second.open(); await expect(await second.loc('start')).toHaveText('开始旅程');
    await second.click('open-account'); await second.login('bingo_fan', 'pw-12345'); await expect(await second.loc('whoami')).toHaveText('已登录：bingo_fan'); await second.click('panel-close');
  });
  await bdd.When('玩家点「继续旅程」', async () => { await expect(await second.loc('start')).toHaveText('继续旅程'); await second.click('start'); });
  await bdd.Then('进度显示「心愿 2/9」', async () => { await expect(second.progress()).toContainText('心愿 2/9'); await second.page.context().close(); });
});
