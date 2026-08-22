import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseManualCaseWorkbook, refreshBddDerivedFields } from '../lib/bdd-case-factory.js';

async function fixture() {
  const workbook = new ExcelJS.Workbook();
  const first = workbook.addWorksheet('Login');
  first.addRow(['No.', 'Priority', 'Depth1', 'Pre-requisite', 'Step', 'Expected Result', 'Web']);
  first.addRow(['LOGIN_001', 'P0', 'Login', 'User is logged out', 'Open login page\nEnter valid account', 'Dashboard is visible', 'PASS']);
  first.addRow(['LOGIN_002', 'P1', '', '', '', 'Error is shown', 'PASS']);
  const second = workbook.addWorksheet('Failure injection');
  second.addRow(['title']); second.addRow([]); second.addRow(['No.', 'Step', 'Expected Result', 'Web']);
  second.addRow(['LOGIN_001', 'Simulate backend timeout', 'Friendly retry is visible', 'N/A']);
  return workbook.xlsx.writeBuffer();
}

test('imports multiple sheets, offset headers and preserves duplicate IDs', async () => {
  const result = await parseManualCaseWorkbook(await fixture(), { fileName: 'fixture.xlsx' });
  assert.equal(result.summary.totalCases, 3);
  assert.equal(result.summary.uniqueCaseIds, 2);
  assert.equal(result.sheets[1].headerRow, 3);
  assert.equal(result.sheets[0].sheetIndex, 0);
  assert.equal(result.cases[2].source.sheetIndex, 1);
  assert.equal(result.summary.missingActions, 1);
  const duplicates = result.cases.filter(item => item.source.caseId === 'LOGIN_001');
  assert.equal(duplicates.length, 2);
  assert.notEqual(duplicates[0].id, duplicates[1].id);
  assert.ok(duplicates.every(item => item.validationIssues.some(issue => issue.code === 'DUPLICATE_CASE_ID')));
  assert.equal(result.cases[1].hierarchy.depth1, 'Login');
  assert.ok(result.cases[2].automation.blockers.some(item => item.code === 'SERVICE_VIRTUALIZATION'));
  assert.deepEqual(['scenarioId','functionName','priority','tenant','platform','region','category','language'].filter(key => !(key in result.cases[0])), []);
  assert.match(result.cases[0].gherkin, /### BDD Steps/);
  assert.match(result.cases[0].gherkin, /### Common Check/);
  assert.match(result.cases[0].gherkin, /\*\*When:\*\*/);
});

test('editing BDD regenerates previews without changing immutable source', async () => {
  const result = await parseManualCaseWorkbook(await fixture()); const original = result.cases[0];
  const next = refreshBddDerivedFields({ ...original, bdd: { ...original.bdd, when: ['Use a stable test account'] } });
  assert.match(next.gherkin, /Use a stable test account/);
  assert.deepEqual(next.source, original.source);
  assert.equal(next.editRevision, original.editRevision + 1);
});
