import { expect, scenario } from '../support/bdd';
import { SeoulLife } from '../pages/seoul';

scenario('seoul-register-confirm-mail', async ({ page, bdd }) => {
  const app = new SeoulLife(page);
  await bdd.Given('新用户打开应用并切换到注册', async () => {
    await app.open(); await app.click('switch-mode'); await expect(await app.loc('submit')).toHaveText('注册');
  });
  await bdd.When('用户填写邮箱和密码并提交注册', async () => { await app.login('new@example.test', 'pw-123456'); });
  await bdd.Then('页面提示确认邮件已发出，并回到登录表单', async () => {
    await expect(await app.loc('login-msg')).toContainText('确认邮件已发出'); await expect(await app.loc('submit')).toHaveText('登录');
    await expect(page.getByTestId('tab-scan')).toHaveCount(0);
  });
});
