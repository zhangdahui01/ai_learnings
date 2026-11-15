import { expect, scenario } from '../support/bdd';
import { Island } from '../pages/island';

scenario('island-cloud-autosave', async ({ page, bdd }) => {
  const isle = new Island(page);
  await bdd.Given('已登录的玩家开始了新游戏', async () => {
    await isle.open(); await isle.click('open-account'); await isle.register('bingo_fan', 'pw-12345'); await expect(await isle.loc('whoami')).toBeVisible(); await isle.click('panel-close');
    await isle.click('restart'); await isle.readDialog();
  });
  await bdd.When('玩家摸摸 Bingo 完成一件心愿', async () => { await isle.act(/摸摸 Bingo/); await isle.readDialog(); });
  await bdd.Then('存档列表里出现一条「心愿 1/9」的自动存档', async () => {
    await isle.click('open-saves'); const rows = page.getByTestId('save-row');
    await expect(rows).toHaveCount(1); await expect(rows.first()).toContainText('心愿 1/9'); await expect(rows.first()).toContainText('自动');
    expect(isle.backend.saves[0].state.done[4]).toBe(true);
  });
});
