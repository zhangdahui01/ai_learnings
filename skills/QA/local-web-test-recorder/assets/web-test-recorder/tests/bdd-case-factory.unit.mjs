import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseManualCaseWorkbook, refreshBddDerivedFields, upgradeBddCaseSchema } from '../lib/bdd-case-factory.js';

async function fixture() {
  const workbook = new ExcelJS.Workbook();
  const first = workbook.addWorksheet('Login');
  first.addRow(['No.', 'Priority', 'Depth1', 'Depth2', 'Depth3', 'Pre-requisite', 'Step', 'Expected Result', 'Web']);
  first.addRow(['LOGIN_001', 'P0', 'Login', 'Password', 'Happy path', 'User is logged out', 'Open login page', 'Login form is visible', 'PASS']);
  first.addRow(['LOGIN_002', 'P1', '', '', '', '', 'Enter valid account', 'Dashboard is visible', 'PASS']);
  first.addRow(['LOGIN_003', 'P1', '', '', '', 'User is locked', 'Enter locked account', 'Locked warning is visible', 'PASS']);
  const second = workbook.addWorksheet('Failure injection');
  second.addRow(['title']); second.addRow([]); second.addRow(['No.', 'Step', 'Expected Result', 'Web']);
  second.addRow(['LOGIN_001', 'Simulate backend timeout', 'Friendly retry is visible', 'N/A']);
  return workbook.xlsx.writeBuffer();
}

test('groups rows by sheet + Depth1/2/3/Pre-requisite and preserves When/Then pairs', async () => {
  const result = await parseManualCaseWorkbook(await fixture(), { fileName: 'fixture.xlsx' });
  assert.equal(result.summary.sourceRows, 4);
  assert.equal(result.summary.totalCases, 3);
  assert.equal(result.summary.mergedRows, 1);
  assert.equal(result.sheets[1].headerRow, 3);
  const grouped = result.cases[0];
  assert.equal(grouped.scenarioId, 'LOGIN_001_002');
  assert.equal(grouped.bdd.givenContext, 'User is logged out');
  assert.equal(grouped.functionName, '[Login][Password][Happy path][User is logged out][Open login page]');
  assert.deepEqual(grouped.source.rowNumbers, [2, 3]);
  assert.deepEqual(grouped.source.caseIds, ['LOGIN_001', 'LOGIN_002']);
  assert.deepEqual(grouped.bdd.steps.map(step => [step.when, step.then]), [
    ['Open login page', 'Login form is visible'],
    ['Enter valid account', 'Dashboard is visible'],
  ]);
  assert.match(grouped.gherkin, /1\. \*\*When:\*\* Open login page\n   \*\*Then:\*\* Login form is visible/);
  assert.match(grouped.gherkin, /2\. \*\*When:\*\* Enter valid account\n   \*\*Then:\*\* Dashboard is visible/);
  assert.equal(result.cases[1].scenarioId, 'LOGIN_003');
  assert.equal(result.cases[2].source.sheetIndex, 1);
  assert.ok(result.cases[2].automation.blockers.some(item => item.code === 'SERVICE_VIRTUALIZATION'));
});

test('editing paired BDD steps regenerates preview without changing immutable source', async () => {
  const result = await parseManualCaseWorkbook(await fixture()); const original = result.cases[0];
  const steps = original.bdd.steps.map((step, index) => index === 0 ? { ...step, when: 'Use a stable test account' } : step);
  const next = refreshBddDerivedFields({ ...original, bdd: { ...original.bdd, steps } });
  assert.match(next.gherkin, /Use a stable test account/);
  assert.deepEqual(next.source, original.source);
  assert.equal(next.editRevision, original.editRevision + 1);
});

test('legacy one-row BDD cases remain executable and gain paired steps', () => {
  const legacy = upgradeBddCaseSchema({ id: 'old', source: { rowNumber: 7, caseId: 'OLD_001' }, bdd: { when: ['Click pay'], then: ['Receipt is visible'] } });
  assert.deepEqual(legacy.bdd.steps.map(step => [step.when, step.then]), [['Click pay', 'Receipt is visible']]);
  assert.deepEqual(legacy.source.rowNumbers, [7]);
});

test('extracts AB Key from Pre-requisite into the Given AB section and migrates historical cases', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('AB payment');
  sheet.addRow(['No.', 'Depth1', 'Pre-requisite', 'Step', 'Expected Result', 'Web']);
  sheet.addRow(['AB_001', 'Payment', 'Entered payment window; AB Key [AB ID] is A/B', 'Open payment methods', 'Methods are visible', 'PASS']);
  const imported = await parseManualCaseWorkbook(await workbook.xlsx.writeBuffer(), { fileName: 'ab.xlsx' });
  assert.deepEqual(imported.cases[0].bdd.abGroups, ['[AB ID] = A/B']);
  assert.match(imported.cases[0].gherkin, /- AB: \[AB ID\] = A\/B/);

  const migrated = upgradeBddCaseSchema({
    id: 'historical-ab', source: { caseId: 'AB_OLD' },
    bdd: { givenContext: 'AB Key [experiment.payment] is control/test', when: [], then: [] },
  });
  assert.deepEqual(migrated.bdd.abGroups, ['[experiment.payment] = control/test']);
  assert.equal(migrated.source.abExtractionVersion, 2);

  const numbered = upgradeBddCaseSchema({ id: 'numbered-ab', source: { caseId: 'AB_NUMBERED', abExtractionVersion: 1 }, bdd: { givenContext: '3. AB Key 103680 is B', abGroups: ['3. AB Key 103680 is B'], when: [], then: [] } });
  assert.deepEqual(numbered.bdd.abGroups, ['[103680] = B']);
});

test('keeps QA-added Given conditions in the executable BDD preview', async () => {
  const result = await parseManualCaseWorkbook(await fixture());
  const next = refreshBddDerivedFields({ ...result.cases[0], bdd: { ...result.cases[0].bdd, preconditionKeys: ['auth.coupang.loggedIn'], customPreconditions: ['Feature Flag payment_v2 is enabled for the QA account'] } });
  assert.deepEqual(next.bdd.customPreconditions, ['Feature Flag payment_v2 is enabled for the QA account']);
  assert.match(next.gherkin, /\[auth\.coupang\.loggedIn\] Coupang logged-in state/);
  assert.match(next.gherkin, /\[custom\] Feature Flag payment_v2 is enabled for the QA account/);
});
