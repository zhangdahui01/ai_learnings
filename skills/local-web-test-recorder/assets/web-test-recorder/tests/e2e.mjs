import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile, unlink, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd(); const port = 4187; const base = `http://127.0.0.1:${port}`; const sandbox = await mkdtemp(join(tmpdir(), 'web-test-recorder-e2e-'));
const recordings = join(sandbox, 'recordings');
const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), DATA_DIR: join(sandbox, 'data'), RECORDINGS_DIR: recordings, ARTIFACTS_DIR: join(sandbox, 'artifacts') }, stdio: 'pipe' });
async function waitForServer() { for (let i = 0; i < 40; i += 1) { try { if ((await fetch(`${base}/api/state`)).ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error('server did not start'); }
async function request(path, method = 'GET', body) { const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const json = response.status === 204 ? null : await response.json(); assert.ok(response.ok, json?.error); return json; }
try {
  await waitForServer();
  const source = `import { test } from '@playwright/test';\ntest('test', async ({ page }) => {\n  await page.goto('https://www.youtube.com/');\n  await page.getByRole('combobox', { name: '搜索' }).click();\n  await page.getByRole('combobox', { name: '搜索' }).fill('playright mcp');\n  await page.getByRole('combobox', { name: '搜索' }).press('Enter');\n  await page.goto('https://www.youtube.com/shorts/QXoPPNyC5WQ');\n});\n`;
  const filename = 'e2e-codegen.spec.js'; await writeFile(join(recordings, filename), source);
  const testCase = await request('/api/cases', 'POST', { name: 'E2E case' });
  const browser = await chromium.launch({ headless: true }); const ui = await browser.newPage(); await ui.goto(base); await ui.locator(`[data-case="${testCase.id}"]`).click(); assert.equal(await ui.locator('#steps .step').count(), 0);
  const imported = await request(`/api/cases/${testCase.id}/import-codegen`, 'POST', { filename, mode: 'replace' });
  assert.equal(imported.steps.length, 5); assert.deepEqual(imported.steps.map(s => s.action), ['goto', 'click', 'fill', 'press', 'goto']); assert.equal(imported.steps[2].locator.primary.strategy, 'role'); assert.equal(imported.steps[2].locator.primary.name, '搜索'); assert.equal(imported.steps[2].value, 'playright mcp');
  let conflictMessage = ''; ui.once('dialog', async dialog => { conflictMessage = dialog.message(); await dialog.accept(); }); await ui.locator('#runCase').click(); await ui.locator('#steps .step').nth(4).waitFor(); assert.match(conflictMessage, /最新版本|更新/); assert.equal(await ui.locator('#steps .step').count(), 5); assert.equal(await ui.locator('#steps .strategy').nth(1).inputValue(), 'role'); const protectedState = await request('/api/state'); assert.equal(protectedState.cases[0].steps.length, 5); assert.equal(protectedState.runs.length, 0); await browser.close();
  const localSteps = [{ id: 'goto', kind: 'action', action: 'goto', url: `${base}/fixtures/interaction.html`, timeoutMs: 5000 },{ id: 'fill', kind: 'action', action: 'fill', locator: { primary: { strategy: 'role', value: 'combobox', name: '搜索' } }, value: 'Playwright', timeoutMs: 5000 },{ id: 'press', kind: 'action', action: 'press', locator: { primary: { strategy: 'role', value: 'combobox', name: '搜索' } }, value: 'Enter', timeoutMs: 5000 },{ id: 'delay', kind: 'action', action: 'waitForTimeout', value: '10', timeoutMs: 5000 },{ id: 'assert', kind: 'assertion', assertion: 'toHaveText', locator: { primary: { strategy: 'role', value: 'status' } }, expected: 'Results for: Playwright', retryCount: 1, timeoutMs: 5000 }];
  await request(`/api/cases/${testCase.id}`, 'PUT', { ...imported, steps: localSteps, defaults: { ...imported.defaults, browser: 'chromium' } }); const run = await request(`/api/cases/${testCase.id}/run`, 'POST', { headless: true }); assert.equal(run.status, 'passed'); assert.equal(run.steps.length, 5);
  await request(`/api/cases/${testCase.id}`, 'DELETE'); await unlink(join(recordings, filename)); console.log('E2E: import, locator preservation, wait, assertion, and replay passed');
} finally { server.kill('SIGTERM'); await rm(sandbox, { recursive: true, force: true }); }
