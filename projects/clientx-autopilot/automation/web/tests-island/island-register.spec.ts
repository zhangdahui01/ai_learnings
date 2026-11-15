import { expect, scenario } from '../support/bdd';
import { Island } from '../pages/island';

scenario('island-register', async ({ page, bdd }) => {
  const isle = new Island(page);
  await bdd.Given('游戏页面已打开，玩家打开「登录 / 注册」', async () => { await isle.open(); await isle.click('open-account'); });
  const msgs: string[] = [];
  await bdd.When('玩家用 1 位的用户名注册', async () => { await isle.register('a', 'pw-12345'); await expect(await isle.loc('panel-msg')).toContainText('用户名'); msgs.push(await (await isle.loc('panel-msg')).innerText()); });
  await bdd.When('玩家用 3 位的密码注册', async () => { await isle.register('bingo_fan', '123'); await expect(await isle.loc('panel-msg')).toContainText('密码'); msgs.push(await (await isle.loc('panel-msg')).innerText()); });
  await bdd.When('玩家用用户名「bingo_fan」和 8 位密码注册', async () => { await isle.register('bingo_fan', 'pw-12345'); });
  await bdd.Then('第一次提示用户名不合规，第二次提示密码至少 6 位', async () => { expect(msgs[0]).toContain('2–20'); expect(msgs[1]).toContain('至少 6 位'); });
  await bdd.Then('第三次注册成功，面板显示「已登录：bingo_fan」', async () => { await expect(await isle.loc('whoami')).toHaveText('已登录：bingo_fan'); });
  await bdd.Then('开始页显示「已登录：bingo_fan」', async () => { await isle.click('panel-close'); await expect(await isle.loc('start-user')).toContainText('已登录：bingo_fan'); });
});
