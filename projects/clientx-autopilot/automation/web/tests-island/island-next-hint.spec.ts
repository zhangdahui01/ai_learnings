import { expect, scenario } from '../support/bdd';
import { Island } from '../pages/island';

scenario('island-next-hint', async ({ page, bdd }) => {
  const isle = new Island(page);
  let before = '';
  await bdd.Given('玩家已开始新游戏并读完开场白', async () => { await isle.open(); await isle.startNewGame(); });
  await bdd.When('玩家看左上角的提示', async () => { await expect(await isle.loc('goal')).toBeVisible(); before = await (await isle.loc('goal')).innerText(); });
  await bdd.When('玩家摸摸 Bingo 并读完对话', async () => { await isle.act(/摸摸 Bingo/); await isle.readDialog(); });
  await bdd.Then('摸之前提示写着「摸摸身边的 Bingo」', async () => { expect(before).toContain('摸摸身边的 Bingo'); });
  await bdd.Then('摸之后提示换成另一件心愿，并带着距离「米」', async () => {
    const goal = await isle.loc('goal');
    await expect(goal).not.toContainText('摸摸'); await expect(goal).toContainText(/\d+ 米/);
  });
  await bdd.Then('右下角不再出现「摸摸 Bingo」按钮', async () => { await page.waitForTimeout(1500); await expect(page.getByTestId('act')).toBeHidden(); });
  await bdd.Then('金色光柱立在下一件心愿的位置，Bingo 开始带路', async () => {
    const st = await page.evaluate(() => { const g = (window as any).__game; const goal = g.curGoal(); return { key: goal.k, pet: !!goal.pet, guide: g.S.guide, p: goal.p }; });
    expect(st.pet).toBe(false); expect(st.guide).toEqual([st.p[0], st.p[1]]);
  });
  await bdd.Then('右上角有小地图，点一下放大，上面标着池塘、茶屋和五只萤灵的位置', async () => {
    const map = await isle.loc('map'); await expect(map).toBeVisible(); await map.click(); await expect(map).toHaveClass(/big/);
    const names = await page.evaluate(() => (window as any).__game.mapPoints().map((q: any) => q[1]));
    expect(names).toEqual(expect.arrayContaining(['池塘', '茶屋', '风车', '苔爷爷', '蒲公英', '老树', '稻草人']));
    expect(names.filter((n: string) => n === '萤灵')).toHaveLength(5);
    await map.click(); await expect(map).not.toHaveClass(/big/);
  });
});
