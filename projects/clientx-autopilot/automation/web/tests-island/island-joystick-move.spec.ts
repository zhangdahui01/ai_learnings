import { expect, scenario } from '../support/bdd';
import { Island } from '../pages/island';

scenario('island-joystick-move', async ({ page, bdd }) => {
  const isle = new Island(page);
  let start = { x: 0, z: 0 };
  await bdd.Given('玩家已开始新游戏并读完开场白', async () => { await isle.open(); await isle.startNewGame(); start = await isle.pos(); });
  await bdd.When('玩家用手指按住摇杆向上推 2 秒', async () => { await isle.pushJoystick(0, -45, 2000); });
  await bdd.Then('主角离开了出发点至少 2 米', async () => { const p = await isle.pos(); expect(Math.hypot(p.x - start.x, p.z - start.z)).toBeGreaterThan(2); });
  await bdd.Then('松手后主角停下', async () => { const a = await isle.pos(); await page.waitForTimeout(600); const b = await isle.pos(); expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.05); });
});
