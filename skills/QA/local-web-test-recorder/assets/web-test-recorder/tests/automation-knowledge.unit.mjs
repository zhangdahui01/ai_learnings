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
