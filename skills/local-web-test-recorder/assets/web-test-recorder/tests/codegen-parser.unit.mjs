import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodegen, parseLocator, readString } from '../lib/codegen-parser.js';

test('readString decodes common Playwright string literals', () => {
  assert.equal(readString("'hello\\'world'"), "hello'world");
  assert.equal(readString('"search"'), 'search');
});

test('parseLocator preserves exact role and accessible name', () => {
  assert.deepEqual(parseLocator('getByRole', "'combobox', { name: '搜索' }"), { primary: { strategy: 'role', value: 'combobox', name: '搜索' } });
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
