/** Tests of the framework itself: the guard rails must fail loudly. */
import { expect, test } from '@playwright/test';
import { loadSpec } from '../support/bdd';
import { by, LocatorAmbiguous, strict } from '../support/strict';

test('a spec without a Then is rejected', () => {
  expect(() => loadSpec('does-not-exist')).toThrow();
  const spec = loadSpec('cart-add');
  expect(spec.steps.map(s => s.phase)).toEqual(['Given', 'When', 'Then', 'Then', 'Cleanup']);
  expect(spec.tags).toContain('@gated');
});

test('an ambiguous locator fails instead of taking the first match', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Member ID').fill('member');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Log in' }).click();
  // three products -> three "Add to cart" buttons
  await expect(strict('cart.add', [by.role(page, 'button', 'Add to cart')])).rejects.toThrow(LocatorAmbiguous);
});

test('a unique fallback is used and recorded when the primary is gone', async ({ page }, info) => {
  await page.goto('/');
  const found = await strict('login.submit', [by.css(page, '#old-login-button'), by.role(page, 'button', 'Log in')], info);
  await expect(found).toBeVisible();
  expect(info.annotations.find(a => a.type === 'locator')?.description).toContain('fallback#1');
});
