import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodegen, parseLocator, readString, readValue } from '../lib/codegen-parser.js';

test('readString decodes common Playwright string literals', () => {
  assert.equal(readString("'hello\\'world'"), "hello'world");
  assert.equal(readString('"search"'), 'search');
});

test('parseLocator preserves exact role and accessible name', () => {
  assert.deepEqual(parseLocator('getByRole', "'combobox', { name: '搜索' }"), { primary: { strategy: 'role', value: 'combobox', name: '搜索' } });
});

test('readValue unwraps generated runtime data expressions', () => {
  assert.equal(readValue("resolveValue('${data.account.username}')"), '${data.account.username}');
  assert.equal(readValue("Number(resolveValue('3'))"), '3');
});

test('parseCodegen imports navigation, actions, values, and assertions in order', () => {
  const code = `import { test, expect } from '@playwright/test';
test('recorded', async ({ page }) => {
  await page.goto('https://example.test/');
  await page.getByRole('combobox', { name: '搜索' }).click();
  await page.getByRole('combobox', { name: '搜索' }).fill('playwright');
  await page.getByRole('combobox', { name: '搜索' }).press('Enter');
  await page.getByLabel('Remember me').check();
  await page.locator('#country').selectOption('KR');
  await expect(page.getByRole('status')).toHaveText('完成');
  await expect(page).toHaveURL('results');
});`;
  const steps = parseCodegen(code);
  assert.deepEqual(steps.map(step => step.action || step.assertion), ['goto', 'click', 'fill', 'press', 'check', 'selectOption', 'toHaveText', 'toHaveURL']);
  assert.equal(steps[2].value, 'playwright');
  assert.equal(steps[2].locator.primary.name, '搜索');
  assert.equal(steps[6].expected, '完成');
});

test('parseCodegen ignores unsupported custom code without corrupting supported steps', () => {
  const steps = parseCodegen("await helper(page);\nawait page.goto('https://example.test');");
  assert.equal(steps.length, 1);
  assert.equal(steps[0].action, 'goto');
});

test('parseCodegen round-trips generated waits, navigation, typing, and runtime references', () => {
  const steps = parseCodegen(`await page.reload();
await page.waitForTimeout(Number(resolveValue('250')));
await page.getByLabel('Search').pressSequentially(resolveValue('\${data.query}'));
await page.getByRole('status').waitFor({ state: 'visible' });`);
  assert.deepEqual(steps.map(step => step.action), ['reload', 'waitForTimeout', 'type', 'waitForVisible']);
  assert.equal(steps[2].value, '${data.query}');
});

test('parseCodegen imports frameLocator actions and returns to the main page', () => {
  const steps = parseCodegen(`await page.frameLocator('#payment-frame').getByRole('button', { name: '信用卡' }).click();
await page.frameLocator('#payment-frame').getByLabel('卡号').fill('4111');
await expect(page.frameLocator('#payment-frame').getByRole('status')).toHaveText('完成');
await page.getByRole('button', { name: '关闭' }).click();`);
  assert.deepEqual(steps.map(step => step.action || step.assertion), ['switchFrame', 'click', 'fill', 'toHaveText', 'switchMainFrame', 'click']);
  assert.equal(steps[0].value, '#payment-frame');
  assert.equal(steps[1].locator.primary.name, '信用卡');
  assert.equal(steps[3].locator.primary.value, 'status');
});

test('parseCodegen imports contentFrame and nested iframe paths', () => {
  const steps = parseCodegen(`await page.locator('#outer-frame').contentFrame().locator('iframe[name="checkout"]').contentFrame().getByTestId('pay-now').click();
await page.locator('#outer-frame').contentFrame().locator('iframe[name="checkout"]').contentFrame().getByText('Success').waitFor({ state: 'visible' });`);
  assert.deepEqual(steps.map(step => step.action), ['switchFrame', 'click', 'waitForVisible']);
  assert.equal(steps[0].value, JSON.stringify(['#outer-frame', 'iframe[name="checkout"]']));
  assert.equal(steps[1].locator.primary.strategy, 'testId');
  assert.equal(steps[2].locator.primary.value, 'Success');
});

test('parseCodegen imports common controls and richer assertions', () => {
  const steps = parseCodegen(`await page.getByLabel('Upload').setInputFiles('/tmp/sample.txt');
await page.getByRole('button', { name: 'Menu', exact: true }).click({ button: 'right' });
await page.getByText('Mobile').tap();
await page.getByLabel('Notes').selectText();
await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
await expect(page.getByTestId('result')).not.toContainText('Failed');
await expect(page.getByTestId('result')).toHaveAttribute('data-state', 'ready');
await expect(page.getByLabel('Countries')).toHaveValues(['KR', 'US']);`);
  assert.deepEqual(steps.map(step => step.action || step.assertion), ['setInputFiles', 'rightClick', 'tap', 'selectText', 'toBeEnabled', 'toContainText', 'toHaveAttribute', 'toHaveValues']);
  assert.equal(steps[0].value, '/tmp/sample.txt');
  assert.equal(steps[1].locator.primary.operator, 'equals');
  assert.equal(steps[5].negated, true);
  assert.equal(steps[6].argumentName, 'data-state');
  assert.equal(steps[6].expected, 'ready');
  assert.equal(steps[7].expected, '["KR","US"]');
});

test('parseCodegen restores advanced structured steps from generated markers', () => {
  const original = { id:'advanced', kind:'action', action:'clickAndWaitForResponse', locator:{primary:{strategy:'role',value:'button',name:'搜索'}}, response:{urlPattern:'/api/search',method:'POST',status:200,timeoutMs:30000}, readiness:{type:'elementHidden',locator:{primary:{strategy:'testId',value:'loading'}},timeoutMs:15000}, retryPolicy:{maxAttempts:3,baseDelayMs:1000,backoff:'exponential',recovery:'reload',idempotency:'safe'} };
  const marker = Buffer.from(JSON.stringify(original)).toString('base64url');
  assert.deepEqual(parseCodegen(`// wtr-step:${marker}\nawait helper();`), [original]);
});
