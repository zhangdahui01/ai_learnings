import { expect, scenario } from '../support/bdd';
import { Island } from '../pages/island';

scenario('island-login-wrong-password', async ({ page, bdd }) => {
  const isle = new Island(page);
  await bdd.Given('用户「bingo_fan」已经注册并退出登录', async () => {
    await isle.open(); await isle.click('open-account'); await isle.register('bingo_fan', 'pw-12345'); await expect(await isle.loc('whoami')).toBeVisible(); await isle.click('logout');
    await expect(await isle.loc('login')).toBeVisible();
  });
  await bdd.When('玩家用错误的密码登录', async () => { await isle.login('bingo_fan', 'not-the-password'); });
  await bdd.Then('面板提示「用户名或密码不对」，仍然是未登录状态', async () => {
    await expect(await isle.loc('panel-msg')).toHaveText('用户名或密码不对'); await expect(page.getByTestId('whoami')).toHaveCount(0);
  });
});
