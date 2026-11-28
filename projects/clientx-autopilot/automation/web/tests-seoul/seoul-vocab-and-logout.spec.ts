import { expect, scenario } from '../support/bdd';
import { SeoulLife } from '../pages/seoul';

scenario('seoul-vocab-and-logout', async ({ page, bdd }) => {
  const app = new SeoulLife(page);
  await bdd.Given('用户已登录，生词本里有「우유」和「도서관」两个词', async () => {
    app.backend.addUser('dahui@example.test', 'pw-123456');
    app.backend.vocab = [
      { id: 'v1', word_ko: '우유', romanization: 'uyu', meaning_zh: '牛奶', meaning_en: 'milk', hanja: '牛乳', mnemonic: '读音接近「牛乳」', scene: 'shelf' },
      { id: 'v2', word_ko: '도서관', romanization: 'doseogwan', meaning_zh: '图书馆', meaning_en: 'library', hanja: '圖書館', mnemonic: null, scene: 'subway' },
    ];
    await app.open(); await app.login('dahui@example.test', 'pw-123456'); await expect(await app.loc('shoot')).toBeVisible();
  });
  await bdd.When('用户打开生词本', async () => { await app.click('tab-vocab'); });
  await bdd.Then('两个词都显示韩文、罗马音和中文意思，汉字词「도서관」带汉字「圖書館」', async () => {
    const words = page.getByTestId('word');
    await expect(words).toHaveCount(2);
    await expect(words.nth(0)).toContainText('우유'); await expect(words.nth(0)).toContainText('uyu'); await expect(words.nth(0)).toContainText('牛奶');
    await expect(words.nth(1)).toContainText('도서관'); await expect(words.nth(1)).toContainText('圖書館'); await expect(words.nth(1)).toContainText('来自：地铁路牌');
  });
  await bdd.When('用户到「我的」保存偏好「不吃辣」，然后退出登录', async () => {
    await app.click('tab-me'); await expect(await app.loc('whoami')).toHaveText('dahui@example.test');
    await (await app.loc('prefs')).fill('不吃辣'); await app.click('save-prefs'); await expect(await app.loc('prefs-saved')).toBeVisible();
    await app.click('logout');
  });
  await bdd.Then('偏好已保存到账号，页面回到登录表单', async () => {
    expect(app.backend.preferences).toBe('不吃辣'); await expect(await app.loc('submit')).toHaveText('登录');
    await expect(page.getByTestId('tab-scan')).toHaveCount(0); expect(app.errors).toEqual([]);
  });
});
