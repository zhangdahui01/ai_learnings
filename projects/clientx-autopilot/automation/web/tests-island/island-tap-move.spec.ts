import { expect, scenario } from '../support/bdd';
import { Island } from '../pages/island';

scenario('island-tap-move', async ({ page, bdd }) => {
  const isle = new Island(page);
  let start = { x: 0, z: 0 };
  await bdd.Given('玩家已开始新游戏并读完开场白', async () => { await isle.open(); await isle.startNewGame(); start = await isle.pos(); });
  await bdd.When('玩家点一下前方的草地', async () => { await page.touchscreen.tap(210, 330); });
  await bdd.Then('主角朝被点的位置走过去并停在附近', async () => {
    const target = await page.evaluate(() => (window as any).__game.S.moveTo);
    expect(target).not.toBeNull();
    await expect.poll(async () => { const p = await isle.pos(); return Math.hypot(p.x - target.x, p.z - target.z); }, { timeout: 60_000 }).toBeLessThan(1);
    const p = await isle.pos(); expect(Math.hypot(p.x - start.x, p.z - start.z)).toBeGreaterThan(1);
  });
});
