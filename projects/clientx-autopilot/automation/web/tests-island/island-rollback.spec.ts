import { expect, scenario } from '../support/bdd';
import { Island } from '../pages/island';

scenario('island-rollback', async ({ page, bdd }) => {
  const isle = new Island(page);
  await bdd.Given('已登录的玩家在 1/9 时手动存过档，之后又完成一件到了 2/9', async () => {
    await isle.open(); await isle.click('open-account'); await isle.register('bingo_fan', 'pw-12345'); await expect(await isle.loc('whoami')).toBeVisible(); await isle.click('panel-close');
    await isle.click('restart'); await isle.readDialog();
    await isle.act(/摸摸 Bingo/); await isle.readDialog();
    await isle.click('open-saves'); await isle.click('save-now'); await expect(await isle.loc('panel-msg')).toHaveText('已保存'); await isle.click('panel-close');
    await isle.standAt(-30, -16.5); await isle.act(/叫醒苔爷爷/); await isle.readDialog();
    await expect(isle.progress()).toContainText('2/9');
  });
  await bdd.When('玩家打开存档，在「手动」那条存档上点「读档」并确认', async () => {
    await isle.click('open-saves');
    const row = page.getByTestId('save-row').filter({ hasText: '手动' }); await expect(row).toHaveCount(1);
    const btn = row.getByTestId('load-save'); await btn.click(); await expect(btn).toHaveText('确认回到这里？'); await btn.click();
  });
  await bdd.Then('进度回到「心愿 1/9」', async () => { await expect(isle.progress()).toContainText('心愿 1/9'); await expect(page.locator('#panel')).toBeHidden(); });
  await bdd.Then('苔爷爷又睡着了，可以再叫醒一次', async () => { await isle.standAt(-30, -16.5); await isle.act(/叫醒苔爷爷/); });
});
