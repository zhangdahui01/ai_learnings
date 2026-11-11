/**
 * Strict locators. The rule: 0 matches -> wait (Playwright auto-waiting), 1 -> act, >1 -> fail.
 *
 * Fallback candidates are checked one by one for uniqueness. A fallback is never merged with
 * others and narrowed with .first(): that is how a test passes on the wrong element.
 */
import type { Locator, Page, TestInfo } from '@playwright/test';

export class LocatorAmbiguous extends Error {
  constructor(name: string, description: string, count: number) {
    super(`LOCATOR_AMBIGUOUS: '${name}' candidate ${description} matches ${count} elements`);
  }
}

export interface Candidate { description: string; locator: Locator }

export async function strict(name: string, candidates: Candidate[], info?: TestInfo, settleMs = 2_000): Promise<Locator> {
  const deadline = Date.now() + settleMs;
  for (;;) {
    for (const [index, c] of candidates.entries()) {
      const count = await c.locator.count();
      if (count > 1) throw new LocatorAmbiguous(name, c.description, count);
      if (count === 1) {
        // Record which candidate was used: a hit on a fallback is drift worth writing to the knowledge base.
        info?.annotations.push({ type: 'locator', description: `${name}: ${index === 0 ? 'primary' : `fallback#${index}`} ${c.description}` });
        return c.locator;
      }
    }
    if (Date.now() >= deadline) return candidates[0].locator;   // nothing yet: let the action's own auto-wait report it
    await new Promise(r => setTimeout(r, 100));
  }
}

export const by = {
  role: (page: Page, role: Parameters<Page['getByRole']>[0], name: string | RegExp): Candidate =>
    ({ description: `role=${role}[name=${name}]`, locator: page.getByRole(role, { name }) }),
  testId: (page: Page, id: string): Candidate => ({ description: `testid=${id}`, locator: page.getByTestId(id) }),
  label: (page: Page, text: string): Candidate => ({ description: `label=${text}`, locator: page.getByLabel(text) }),
  css: (page: Page, selector: string): Candidate => ({ description: `css=${selector}`, locator: page.locator(selector) }),
};
