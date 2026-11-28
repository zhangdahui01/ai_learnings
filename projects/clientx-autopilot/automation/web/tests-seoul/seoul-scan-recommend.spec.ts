import { expect, scenario } from '../support/bdd';
import { SeoulLife, SHELF_RESULT } from '../pages/seoul';

scenario('seoul-scan-recommend', async ({ page, bdd }) => {
  const app = new SeoulLife(page);
  await bdd.Given('用户已登录，停在扫一扫页', async () => {
    app.backend.addUser('dahui@example.test', 'pw-123456'); app.backend.scanReply = { status: 200, body: SHELF_RESULT };
    await app.open(); await app.login('dahui@example.test', 'pw-123456'); await expect(await app.loc('shoot')).toBeVisible();
  });
  await bdd.When('用户选择「超市货架」，写下需求「不辣的拌饭酱」并拍一张照片', async () => {
    await app.click('scene-shelf'); await (await app.loc('need')).fill('不辣的拌饭酱'); await app.takePhoto();
  });
  await bdd.Then('识别请求带着登录凭证、场景、需求和压缩后的照片', async () => {
    await expect.poll(() => app.backend.scanCalls.length).toBe(1);
    const call = app.backend.scanCalls[0];
    expect(call.authorized).toBe(true); expect(call.scene).toBe('shelf'); expect(call.need).toBe('不辣的拌饭酱'); expect(call.imageBytes).toBeGreaterThan(100);
  });
  await bdd.Then('结果里推荐的「酱油拌饭酱」排在第一个并带「推荐」标记和推荐理由', async () => {
    const items = page.getByTestId('scan-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('酱油拌饭酱'); await expect(items.nth(0).getByTestId('rec-tag')).toHaveText('推荐');
    await expect(items.nth(0)).toContainText('推荐理由：不辣，而且 1+1 更划算。'); await expect(items.nth(1).getByTestId('rec-tag')).toHaveCount(0);
    await expect(await app.loc('scan-summary')).toContainText('选 2 号');
  });
  await bdd.Then('每个商品显示价格和按规格折算的单价', async () => {
    const lines = page.getByTestId('price-line');
    await expect(lines.nth(0)).toHaveText('3,000韩元 · 300g · 1+1 · 每 100g 500韩元（按 1+1 折算）');
    await expect(lines.nth(1)).toHaveText('4,980韩元 · 500g · 每 100g 996韩元');
  });
  await bdd.Then('页面提示生词已存进生词本', async () => {
    await expect(await app.loc('vocab-saved')).toBeVisible(); expect(app.errors).toEqual([]);
  });
});
