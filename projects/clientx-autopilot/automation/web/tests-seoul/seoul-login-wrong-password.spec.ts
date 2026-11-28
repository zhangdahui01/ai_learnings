import { expect, scenario } from '../support/bdd';
import { SeoulLife } from '../pages/seoul';

scenario('seoul-login-wrong-password', async ({ page, bdd }) => {
  const app = new SeoulLife(page);
  await bdd.Given('用户「dahui@example.test」已经注册', async () => {
    app.backend.addUser('dahui@example.test', 'pw-123456'); await app.open(); await expect(await app.loc('submit')).toBeVisible();
  });
  await bdd.When('用户用错误的密码登录', async () => { await app.login('dahui@example.test', 'not-the-password'); });
  await bdd.Then('页面提示「邮箱或密码不正确」，仍然停在登录页', async () => {
    await expect(await app.loc('login-msg')).toHaveText('邮箱或密码不正确'); await expect(page.getByTestId('tab-scan')).toHaveCount(0);
    expect(app.errors).toEqual([]);
  });
});
