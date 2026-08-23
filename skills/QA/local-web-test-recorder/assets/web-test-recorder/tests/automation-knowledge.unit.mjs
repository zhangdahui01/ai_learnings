import test from 'node:test';
import assert from 'node:assert/strict';
import { selectKnowledgeEvidence } from '../lib/automation-knowledge.js';

const entry = (path, testName) => ({ path, tests: [testName], locators: [], flows: ['login', 'payment'], symbols: [], imports: [] });

test('multi-repository retrieval keeps relevant automation evidence from each selected graph', () => {
  const indexes = [
    { id: 'app', name: 'Coupay application', entries: Array.from({ length: 20 }, (_, index) => entry(`src/payment-${index}.ts`, `payment flow ${index}`)) },
    { id: 'p0', name: 'Existing P0 Playwright cases', entries: [entry('tests/coupay-login.spec.ts', 'coupay login payment happy path')] },
  ];
  const testCase = { title: 'Coupay login payment', functionName: 'Login and pay', bdd: { givenContext: 'User logged in', preconditionKeys: [], steps: [{ when: 'Pay', then: 'Payment succeeds' }], when: [], then: [] } };
  const evidence = selectKnowledgeEvidence(indexes, testCase, 6);
  assert.ok(evidence.some(item => item.knowledgeSourceId === 'app'));
  assert.ok(evidence.some(item => item.knowledgeSourceId === 'p0'));
  assert.ok(evidence.find(item => item.knowledgeSourceId === 'p0').matchedTerms.includes('coupay'));
});

test('uses custom Given, When, and Then wording to retrieve matching code snippets', () => {
  const indexes = [{ id: 'automation', name: 'P0 automation', entries: [{ path: 'tests/payment-v2.spec.ts', tests: ['payment v2 happy path'], locators: ['payment-v2-confirm'], flows: ['payment'], symbols: ['enablePaymentV2'], imports: [], snippets: ["test('payment v2', async ({ page }) => { await page.getByTestId('payment-v2-confirm').click(); });"] }] }];
  const testCase = { title: 'Payment', functionName: 'Confirm payment', bdd: { givenContext: '', preconditionKeys: [], customPreconditions: ['Feature Flag payment_v2 is enabled'], steps: [{ when: 'Click payment-v2-confirm', then: 'Payment v2 receipt is visible' }], when: [], then: [] } };
  const evidence = selectKnowledgeEvidence(indexes, testCase, 3);
  assert.equal(evidence[0].path, 'tests/payment-v2.spec.ts');
  assert.ok(evidence[0].matchedTerms.some(term => term.includes('payment-v2')));
  assert.match(evidence[0].codeSnippets.join('\n'), /payment-v2-confirm/);
});
