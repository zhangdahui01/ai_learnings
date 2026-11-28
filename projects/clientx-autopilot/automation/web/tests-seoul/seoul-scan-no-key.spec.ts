import { expect, scenario } from '../support/bdd';
import { SeoulLife } from '../pages/seoul';

scenario('seoul-scan-no-key', async ({ page, bdd }) => {
  const app = new SeoulLife(page);
  await bdd.Given('用户已登录，识别服务还没有配置 AI 密钥', async () => {
    app.backend.addUser('dahui@example.test', 'pw-123456');
    await app.open(); await app.login('dahui@example.test', 'pw-123456'); await expect(await app.loc('shoot')).toBeVisible();
  });
  await bdd.When('用户拍一张照片', async () => { await app.takePhoto(); });
  await bdd.Then('页面提示「AI 密钥尚未配置，暂时无法识别照片」，不显示任何商品', async () => {
    await expect(await app.loc('scan-error')).toHaveText('AI 密钥尚未配置，暂时无法识别照片'); await expect(page.getByTestId('scan-item')).toHaveCount(0);
  });
  await bdd.Then('拍照按钮恢复可用，可以再试一次', async () => {
    await expect(await app.loc('shoot')).toBeEnabled(); await expect(await app.loc('shoot')).toHaveText('拍照识别');
  });
});
