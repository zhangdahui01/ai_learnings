import express from 'express';
import { chromium, firefox, webkit } from 'playwright';
import { expect as playwrightExpect } from 'playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseCodegen } from './lib/codegen-parser.js';

const app = express();
const port = Number(process.env.PORT || 4173);
const root = process.cwd();
const dataDir = resolve(process.env.DATA_DIR || join(root, 'data'));
const recordingsDir = resolve(process.env.RECORDINGS_DIR || join(root, 'recordings'));
const artifactsDir = resolve(process.env.ARTIFACTS_DIR || join(root, 'artifacts'));
const suitesDir = resolve(process.env.TEST_SUITES_DIR || join(root, 'test-suites'));
const profilesDir = resolve(process.env.PROFILES_DIR || join(dataDir, 'profiles'));
const authDir = resolve(process.env.AUTH_STATE_DIR || join(dataDir, 'auth'));
const storePath = join(dataDir, 'store.json');
const browserEngines = { chromium, chrome: chromium, firefox, webkit };
const recordingSessions = new Map();
let fixtureFlakyHits = 0;

await Promise.all([dataDir, recordingsDir, artifactsDir, suitesDir, profilesDir, authDir].map(dir => mkdir(dir, { recursive: true })));
if (!existsSync(storePath)) await writeFile(storePath, JSON.stringify({ schemaVersion: 2, plans: [], cases: [], runs: [] }, null, 2));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(root, 'public')));
app.use('/artifacts', express.static(artifactsDir));

function now() { return new Date().toISOString(); }
function safeSegment(value, fallback = 'untitled') {
  const cleaned = String(value || fallback).normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().replace(/\.+$/g, '').slice(0, 80);
  return cleaned || fallback;
}
function safeFile(value, fallback = 'test-case') { return safeSegment(value, fallback).replace(/\s+/g, '-').replace(/[^\p{L}\p{N}._-]/gu, '-').slice(0, 80) || fallback; }
function httpError(status, message, code = 'REQUEST_FAILED', details) { const error = new Error(message); error.status = status; error.code = code; error.details = details; return error; }
function defaultCompliance() { return { enabled: false, environmentName: '', approvedHosts: '', approvedAccountRefs: '', allowlistStatus: 'not-configured', allowlistNotes: '', humanVerification: true, policyConfirmed: false }; }
function compliancePaths(testCase) { return { profileDir: join(profilesDir, safeFile(testCase.id)), storagePath: join(authDir, `${safeFile(testCase.id)}.json`) }; }
async function store() {
  const db = JSON.parse(await readFile(storePath, 'utf8'));
  db.schemaVersion ||= 2; db.plans ||= []; db.cases ||= []; db.runs ||= [];
  db.cases.forEach(item => { item.steps ||= []; item.editorMode ||= 'visual'; item.codeLanguage ||= 'javascript'; item.sources ||= {}; item.defaults ||= {}; item.defaults.proxy = { mode: 'direct', server: '', bypass: '', mappings: [], ...(item.defaults.proxy || {}) }; item.defaults.proxy.mappings = Array.isArray(item.defaults.proxy.mappings) ? item.defaults.proxy.mappings : []; item.defaults.stability = { preset: 'standard', navigationTimeoutMs: 30000, actionTimeoutMs: 10000, assertionTimeoutMs: 10000, ...(item.defaults.stability || {}) }; item.compliance = { ...defaultCompliance(), ...(item.compliance || {}) }; });
  const normalizeRun = run => {
    if (run.status !== 'failed' || run.diagnostic) return;
    const failedIndex = Math.max(0, (run.steps || []).findIndex(step => step.status === 'failed')); const failed = run.steps?.[failedIndex]; const raw = failed?.error || run.error || '未知错误';
    const timeout = /Timeout/i.test(raw); const aborted = /ERR_ABORTED/i.test(raw);
    run.failedStepIndex = failedIndex; run.diagnostic = { title: failed ? `步骤 ${failedIndex + 1} · ${failed.label || failed.operation || '操作'} 失败` : '历史执行失败', category: timeout ? '等待元素超时' : aborted ? '页面导航被中断' : '执行失败', cause: timeout ? '在超时时间内没有找到可操作的目标元素，或元素尚未就绪。' : aborted ? '目标页面取消了导航，可能发生了登录跳转或连续导航。' : '页面状态与录制时不一致。', suggestion: timeout ? '核对页面语言、登录状态和元素定位，必要时在前一步增加等待。' : '查看失败截图和技术详情，确认页面状态后重试。', stepIndex: failedIndex, operation: failed?.label || failed?.operation, locator: failed?.locator || null, technical: raw };
  };
  db.runs.forEach(run => { normalizeRun(run); (run.caseRuns || []).forEach(normalizeRun); });
  return db;
}
async function save(value) { await writeFile(storePath, JSON.stringify(value, null, 2)); }
function caseSummary(testCase) { return { ...testCase, steps: testCase.steps || [], sources: testCase.sources || {} }; }

const defaultCase = (name = '新测试用例') => ({
  id: randomUUID(), name, version: 1, editorMode: 'visual', codeLanguage: 'javascript', accountRef: '', tags: [], data: {}, sources: {},
  compliance: defaultCompliance(),
  defaults: { browser: 'chromium', baseUrl: '', locale: 'zh-CN', proxy: { mode: 'direct', server: '', username: '', password: '', bypass: '', mappings: [] }, stability: { preset: 'standard', navigationTimeoutMs: 30000, actionTimeoutMs: 10000, assertionTimeoutMs: 10000 }, timeoutMs: 10000 },
  steps: [], createdAt: now(), updatedAt: now()
});

function jsString(value) { return JSON.stringify(String(value ?? '')); }
function pyString(value) { return JSON.stringify(String(value ?? ''), null, 0); }
function jsLocator(step) {
  const p = step.locator?.primary;
  if (!p) return 'page';
  if (p.strategy === 'role') return `page.getByRole(${jsString(p.value)}${p.name ? `, { name: ${jsString(p.name)} }` : ''})`;
  const methods = { label: 'getByLabel', placeholder: 'getByPlaceholder', text: 'getByText', testId: 'getByTestId', altText: 'getByAltText', title: 'getByTitle' };
  return methods[p.strategy] ? `page.${methods[p.strategy]}(${jsString(p.value)})` : `page.locator(${jsString(p.strategy === 'xpath' ? `xpath=${p.value}` : p.value)})`;
}
function pyLocator(step) {
  const p = step.locator?.primary;
  if (!p) return 'page';
  if (p.strategy === 'role') return `page.get_by_role(${pyString(p.value)}${p.name ? `, name=${pyString(p.name)}` : ''})`;
  const methods = { label: 'get_by_label', placeholder: 'get_by_placeholder', text: 'get_by_text', testId: 'get_by_test_id', altText: 'get_by_alt_text', title: 'get_by_title' };
  return methods[p.strategy] ? `page.${methods[p.strategy]}(${pyString(p.value)})` : `page.locator(${pyString(p.strategy === 'xpath' ? `xpath=${p.value}` : p.value)})`;
}
function encodedStep(step) { return Buffer.from(JSON.stringify(step)).toString('base64url'); }
function retryConfig(step) { const policy = step.retryPolicy || {}; const attempts = policy.idempotency === 'never' ? 1 : Math.max(1, Number(policy.maxAttempts || (Number(step.retryCount || 0) + 1))); return { attempts, baseDelayMs: Math.max(0, Number(policy.baseDelayMs || 1000)), backoff: policy.backoff || 'fixed', recovery: policy.recovery || 'none' }; }
function jsReadiness(step) {
  const ready = step.readiness; if (!ready || ready.type === 'none') return [];
  const timeout = Number(ready.timeoutMs || step.timeoutMs || 10000); const value = `resolveValue(${jsString(ready.value || '')})`; const target = jsLocator({ locator: ready.locator || step.locator });
  if (ready.type === 'elementVisible') return [`await expect(${target}).toBeVisible({ timeout: ${timeout} });`];
  if (ready.type === 'elementHidden') return [`await expect(${target}).toBeHidden({ timeout: ${timeout} });`];
  if (ready.type === 'elementEnabled') return [`await expect(${target}).toBeEnabled({ timeout: ${timeout} });`];
  if (ready.type === 'elementEditable') return [`await expect(${target}).toBeEditable({ timeout: ${timeout} });`];
  if (ready.type === 'elementText') return [`await expect(${target}).toContainText(${value}, { timeout: ${timeout} });`];
  if (ready.type === 'url') return [`await expect(page).toHaveURL(new RegExp(${value}), { timeout: ${timeout} });`];
  if (ready.type === 'loadState') return [`await page.waitForLoadState(${value}, { timeout: ${timeout} });`];
  return [];
}
function jsOperation(step) {
  const target = jsLocator(step); const value = step.url ?? step.value ?? step.expected ?? ''; const resolved = `resolveValue(${jsString(value)})`; const timeout = Number(step.timeoutMs || 10000);
  if (step.kind === 'assertion') {
    if (step.assertion === 'toHaveURL' || step.assertion === 'toHaveTitle') return `await expect(page).${step.assertion}(new RegExp(${resolved}), { timeout: ${timeout} });`;
    if (['toBeVisible', 'toBeHidden', 'toBeEnabled', 'toBeDisabled', 'toBeChecked'].includes(step.assertion)) return `await expect(${target}).${step.assertion}({ timeout: ${timeout} });`;
    return `await expect(${target}).${step.assertion}(${step.assertion === 'toHaveCount' ? `Number(${resolved})` : resolved}, { timeout: ${timeout} });`;
  }
  if (step.action === 'goto') return `await page.goto(${resolved}, { waitUntil: 'domcontentloaded', timeout: ${timeout} });`;
  if (['reload', 'back', 'forward'].includes(step.action)) return `await page.${step.action}({ timeout: ${timeout} });`;
  if (step.action === 'waitForTimeout') return `await page.waitForTimeout(Number(${resolved}));`;
  if (step.action === 'waitForURL') return `await page.waitForURL(${resolved}, { timeout: ${timeout} });`;
  if (step.action === 'waitForLoadState') return `await page.waitForLoadState(${resolved}, { timeout: ${timeout} });`;
  if (step.action === 'clickAndWaitForResponse') { const response = step.response || {}; const status = Number(response.status || 0); return `const responsePromise = page.waitForResponse(response => response.url().includes(resolveValue(${jsString(response.urlPattern || '')})) && (!${jsString(response.method || '')} || response.request().method() === ${jsString(response.method || '')}), { timeout: ${Number(response.timeoutMs || timeout)} });\nawait ${target}.click();\nconst receivedResponse = await responsePromise;\nif (${status} && receivedResponse.status() !== ${status}) throw new Error('接口状态错误：HTTP ' + receivedResponse.status() + '，期望 ${status}');`; }
  if (['click', 'dblclick', 'hover', 'focus', 'clear', 'check', 'uncheck'].includes(step.action)) return `await ${target}.${step.action}({ timeout: ${timeout} });`;
  if (step.action === 'type') return `await ${target}.pressSequentially(${resolved}, { timeout: ${timeout} });`;
  if (step.action === 'waitForVisible') return `await ${target}.waitFor({ state: 'visible', timeout: ${timeout} });`;
  if (step.action === 'waitForHidden') return `await ${target}.waitFor({ state: 'hidden', timeout: ${timeout} });`;
  return `await ${target}.${step.action}(${resolved}, { timeout: ${timeout} });`;
}
function generateJavascript(testCase) {
  const lines = [`import { test, expect } from 'playwright/test';`, '', `const data = JSON.parse(process.env.WTR_TEST_DATA || '{}');`, `const readPath = (source, path) => path.split('.').reduce((value, key) => value?.[key], source);`, `const resolveValue = value => String(value).replace(/\\\$\\{data\\.([\\w.-]+)\\}/g, (_match, path) => String(readPath(data, path) ?? '')).replace(/\\\$\\{env\\.([A-Z0-9_]+)\\}/g, (_match, key) => String(process.env[key] ?? ''));`, '', `test(${jsString(testCase.name)}, async ({ page }) => {`];
  for (const step of testCase.steps || []) {
    const target = jsLocator(step); const value = step.url ?? step.value ?? step.expected ?? ''; const resolved = `resolveValue(${jsString(value)})`;
    if (step.kind === 'assertion') {
      if (step.assertion === 'toHaveURL' || step.assertion === 'toHaveTitle') lines.push(`  await expect(page).${step.assertion}(${resolved});`);
      else if (['toBeVisible', 'toBeHidden', 'toBeEnabled', 'toBeDisabled', 'toBeChecked'].includes(step.assertion)) lines.push(`  await expect(${target}).${step.assertion}();`);
      else lines.push(`  await expect(${target}).${step.assertion}(${step.assertion === 'toHaveCount' ? `Number(${resolved})` : resolved});`);
      continue;
    }
    if (step.action === 'goto') lines.push(`  await page.goto(${resolved});`);
    else if (['reload', 'back', 'forward'].includes(step.action)) lines.push(`  await page.${step.action}();`);
    else if (step.action === 'waitForTimeout') lines.push(`  await page.waitForTimeout(Number(${resolved}));`);
    else if (step.action === 'waitForURL') lines.push(`  await page.waitForURL(${resolved});`);
    else if (step.action === 'waitForLoadState') lines.push(`  await page.waitForLoadState(${resolved});`);
    else if (['click', 'dblclick', 'hover', 'focus', 'clear', 'check', 'uncheck'].includes(step.action)) lines.push(`  await ${target}.${step.action}();`);
    else if (step.action === 'type') lines.push(`  await ${target}.pressSequentially(${resolved});`);
    else if (step.action === 'waitForVisible') lines.push(`  await ${target}.waitFor({ state: 'visible' });`);
    else if (step.action === 'waitForHidden') lines.push(`  await ${target}.waitFor({ state: 'hidden' });`);
    else lines.push(`  await ${target}.${step.action}(${resolved});`);
  }
  lines.push('});', ''); return lines.join('\n');
}
function generatePython(testCase) {
  const lines = ['import json', 'import os', 'import re', 'from playwright.sync_api import Page, expect', '', 'data = json.loads(os.getenv("WTR_TEST_DATA", "{}"))', 'def read_path(source, path):', '    value = source', '    for key in path.split("."):', '        value = value.get(key) if isinstance(value, dict) else None', '    return value', 'def resolve_value(value):', '    value = re.sub(r"\\$\\{data\\.([\\w.-]+)\\}", lambda match: str(read_path(data, match.group(1)) or ""), str(value))', '    return re.sub(r"\\$\\{env\\.([A-Z0-9_]+)\\}", lambda match: os.getenv(match.group(1), ""), value)', '', '', `def test_${safeFile(testCase.name).replace(/-/g, '_')}(page: Page):`];
  if (!(testCase.steps || []).length) lines.push('    pass');
  for (const step of testCase.steps || []) {
    const target = pyLocator(step); const value = step.url ?? step.value ?? step.expected ?? ''; const resolved = `resolve_value(${pyString(value)})`;
    if (step.kind === 'assertion') {
      const map = { toBeVisible: 'to_be_visible', toBeHidden: 'to_be_hidden', toBeEnabled: 'to_be_enabled', toBeDisabled: 'to_be_disabled', toBeChecked: 'to_be_checked', toHaveText: 'to_have_text', toContainText: 'to_contain_text', toHaveValue: 'to_have_value', toHaveCount: 'to_have_count', toHaveURL: 'to_have_url', toHaveTitle: 'to_have_title' };
      const fn = map[step.assertion] || step.assertion; const subject = ['toHaveURL', 'toHaveTitle'].includes(step.assertion) ? 'page' : target;
      const noArg = ['toBeVisible', 'toBeHidden', 'toBeEnabled', 'toBeDisabled', 'toBeChecked'].includes(step.assertion);
      lines.push(`    expect(${subject}).${fn}(${noArg ? '' : step.assertion === 'toHaveCount' ? `int(${resolved})` : resolved})`); continue;
    }
    const map = { dblclick: 'dblclick', selectOption: 'select_option', waitForVisible: 'wait_for', waitForHidden: 'wait_for', waitForURL: 'wait_for_url', waitForLoadState: 'wait_for_load_state', waitForTimeout: 'wait_for_timeout' };
    if (step.action === 'goto') lines.push(`    page.goto(${resolved})`);
    else if (['reload', 'back', 'forward'].includes(step.action)) lines.push(`    page.${step.action}()`);
    else if (step.action === 'waitForTimeout') lines.push(`    page.wait_for_timeout(int(${resolved}))`);
    else if (step.action === 'waitForURL') lines.push(`    page.wait_for_url(${resolved})`);
    else if (step.action === 'waitForLoadState') lines.push(`    page.wait_for_load_state(${resolved})`);
    else if (step.action === 'waitForVisible') lines.push(`    ${target}.wait_for(state="visible")`);
    else if (step.action === 'waitForHidden') lines.push(`    ${target}.wait_for(state="hidden")`);
    else if (['click', 'dblclick', 'hover', 'focus', 'clear', 'check', 'uncheck'].includes(step.action)) lines.push(`    ${target}.${map[step.action] || step.action}()`);
    else if (step.action === 'type') lines.push(`    ${target}.press_sequentially(${resolved})`);
    else lines.push(`    ${target}.${map[step.action] || step.action}(${resolved})`);
  }
  lines.push(''); return lines.join('\n');
}
function generateJavascriptAdvanced(testCase) {
  const lines = [`import { test, expect } from 'playwright/test';`, '', `const data = JSON.parse(process.env.WTR_TEST_DATA || '{}');`, `const readPath = (source, path) => path.split('.').reduce((value, key) => value?.[key], source);`, `const resolveValue = value => String(value).replace(/\\\$\{data\.([\w.-]+)\}/g, (_match, path) => String(readPath(data, path) ?? '')).replace(/\\\$\{env\.([A-Z0-9_]+)\}/g, (_match, key) => String(process.env[key] ?? ''));`, `const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));`, `const isTransient = error => /Timeout|ERR_(?:NETWORK_CHANGED|CONNECTION_RESET|CONNECTION_CLOSED|TIMED_OUT|NAME_NOT_RESOLVED)|HTTP\\s(?:408|429|5\\d\\d)|接口状态错误.*HTTP\\s5\\d\\d/i.test(String(error?.message || error));`, `async function runStep(page, policy, action) {`, `  let lastError;`, `  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {`, `    try { return await action(); } catch (error) {`, `      lastError = error; if (attempt >= policy.attempts || !isTransient(error)) throw error;`, `      console.warn('[WTR_RETRY]', JSON.stringify({ attempt, error: String(error?.message || error), recovery: policy.recovery }));`, `      const delay = policy.backoff === 'exponential' ? policy.baseDelayMs * (2 ** (attempt - 1)) : policy.baseDelayMs;`, `      await sleep(delay);`, `      if (policy.recovery === 'reload') await page.reload({ waitUntil: 'domcontentloaded' });`, `      if (policy.recovery === 'reopen') await page.goto(page.url(), { waitUntil: 'domcontentloaded' });`, `    }`, `  }`, `  throw lastError;`, `}`, '', `test(${jsString(testCase.name)}, async ({ page }) => {`];
  for (const step of testCase.steps || []) {
    const policy = effectiveRetry(step); lines.push(`  // wtr-step:${encodedStep(step)}`, `  await runStep(page, ${JSON.stringify(policy)}, async () => {`);
    for (const readyLine of jsReadiness(step)) lines.push(`    ${readyLine}`);
    for (const operationLine of jsOperation(step).split('\n')) lines.push(`    ${operationLine}`);
    lines.push('  });');
  }
  lines.push('});', ''); return lines.join('\n');
}
function pyReadiness(step) {
  const ready = step.readiness; if (!ready || ready.type === 'none') return [];
  const timeout = Number(ready.timeoutMs || step.timeoutMs || 10000); const value = `resolve_value(${pyString(ready.value || '')})`; const target = pyLocator({ locator: ready.locator || step.locator });
  const map = { elementVisible: `expect(${target}).to_be_visible(timeout=${timeout})`, elementHidden: `expect(${target}).to_be_hidden(timeout=${timeout})`, elementEnabled: `expect(${target}).to_be_enabled(timeout=${timeout})`, elementEditable: `expect(${target}).to_be_editable(timeout=${timeout})`, elementText: `expect(${target}).to_contain_text(${value}, timeout=${timeout})`, url: `expect(page).to_have_url(re.compile(${value}), timeout=${timeout})`, loadState: `page.wait_for_load_state(${value}, timeout=${timeout})` };
  return map[ready.type] ? [map[ready.type]] : [];
}
function pyOperation(step) {
  const target = pyLocator(step); const value = step.url ?? step.value ?? step.expected ?? ''; const resolved = `resolve_value(${pyString(value)})`; const timeout = Number(step.timeoutMs || 10000);
  if (step.kind === 'assertion') { const map = { toBeVisible: 'to_be_visible', toBeHidden: 'to_be_hidden', toBeEnabled: 'to_be_enabled', toBeDisabled: 'to_be_disabled', toBeChecked: 'to_be_checked', toHaveText: 'to_have_text', toContainText: 'to_contain_text', toHaveValue: 'to_have_value', toHaveCount: 'to_have_count', toHaveURL: 'to_have_url', toHaveTitle: 'to_have_title' }; const fn = map[step.assertion] || step.assertion; const subject = ['toHaveURL', 'toHaveTitle'].includes(step.assertion) ? 'page' : target; const noArg = ['toBeVisible', 'toBeHidden', 'toBeEnabled', 'toBeDisabled', 'toBeChecked'].includes(step.assertion); const expected = ['toHaveURL', 'toHaveTitle'].includes(step.assertion) ? `re.compile(${resolved})` : step.assertion === 'toHaveCount' ? `int(${resolved})` : resolved; return `expect(${subject}).${fn}(${noArg ? '' : expected}${noArg ? '' : ', '}timeout=${timeout})`; }
  const map = { dblclick: 'dblclick', selectOption: 'select_option' };
  if (step.action === 'goto') return `page.goto(${resolved}, wait_until="domcontentloaded", timeout=${timeout})`;
  if (['reload', 'back', 'forward'].includes(step.action)) return `page.${step.action}(timeout=${timeout})`;
  if (step.action === 'waitForTimeout') return `page.wait_for_timeout(int(${resolved}))`;
  if (step.action === 'waitForURL') return `page.wait_for_url(${resolved}, timeout=${timeout})`;
  if (step.action === 'waitForLoadState') return `page.wait_for_load_state(${resolved}, timeout=${timeout})`;
  if (step.action === 'clickAndWaitForResponse') { const response = step.response || {}; const status = Number(response.status || 0); return `with page.expect_response(lambda response: resolve_value(${pyString(response.urlPattern || '')}) in response.url and (${pyString(response.method || '')} == "" or response.request.method == ${pyString(response.method || '')}), timeout=${Number(response.timeoutMs || timeout)}) as response_info:\n    ${target}.click(timeout=${timeout})\nreceived_response = response_info.value\nif ${status} and received_response.status != ${status}:\n    raise Exception(f"接口状态错误：HTTP {received_response.status}，期望 ${status}")`; }
  if (step.action === 'waitForVisible') return `${target}.wait_for(state="visible", timeout=${timeout})`;
  if (step.action === 'waitForHidden') return `${target}.wait_for(state="hidden", timeout=${timeout})`;
  if (['click', 'dblclick', 'hover', 'focus', 'clear', 'check', 'uncheck'].includes(step.action)) return `${target}.${map[step.action] || step.action}(timeout=${timeout})`;
  if (step.action === 'type') return `${target}.press_sequentially(${resolved}, timeout=${timeout})`;
  return `${target}.${map[step.action] || step.action}(${resolved}, timeout=${timeout})`;
}
function generatePythonAdvanced(testCase) {
  const lines = ['import json', 'import os', 'import re', 'import time', 'from playwright.sync_api import Page, expect', '', 'data = json.loads(os.getenv("WTR_TEST_DATA", "{}"))', 'def read_path(source, path):', '    value = source', '    for key in path.split("."):', '        value = value.get(key) if isinstance(value, dict) else None', '    return value', 'def resolve_value(value):', '    value = re.sub(r"\\$\\{data\\.([\\w.-]+)\\}", lambda match: str(read_path(data, match.group(1)) or ""), str(value))', '    return re.sub(r"\\$\\{env\\.([A-Z0-9_]+)\\}", lambda match: os.getenv(match.group(1), ""), value)', 'def is_transient(error):', '    return re.search(r"Timeout|ERR_(?:NETWORK_CHANGED|CONNECTION_RESET|CONNECTION_CLOSED|TIMED_OUT|NAME_NOT_RESOLVED)|HTTP\\s(?:408|429|5\\d\\d)|接口状态错误.*HTTP\\s5\\d\\d", str(error), re.I) is not None', 'def run_step(page, policy, action):', '    last_error = None', '    for attempt in range(1, policy["attempts"] + 1):', '        try:', '            return action()', '        except Exception as error:', '            last_error = error', '            if attempt >= policy["attempts"] or not is_transient(error):', '                raise', '            delay = policy["baseDelayMs"] * (2 ** (attempt - 1) if policy["backoff"] == "exponential" else 1)', '            time.sleep(delay / 1000)', '            if policy["recovery"] == "reload": page.reload(wait_until="domcontentloaded")', '            if policy["recovery"] == "reopen": page.goto(page.url, wait_until="domcontentloaded")', '    raise last_error', '', '', `def test_${safeFile(testCase.name).replace(/-/g, '_')}(page: Page):`];
  if (!(testCase.steps || []).length) lines.push('    pass');
  for (const [index, step] of (testCase.steps || []).entries()) { const fn = `_step_${index + 1}`; lines.push(`    # wtr-step:${encodedStep(step)}`, `    def ${fn}():`); const operations = [...pyReadiness(step), ...pyOperation(step).split('\n')]; for (const line of operations) lines.push(`        ${line}`); lines.push(`    run_step(page, ${JSON.stringify(effectiveRetry(step)).replaceAll('true', 'True').replaceAll('false', 'False').replaceAll('null', 'None')}, ${fn})`); }
  lines.push(''); return lines.join('\n');
}
function containingPlans(db, testCase) { return db.plans.filter(plan => plan.caseIds.includes(testCase.id)); }
async function persistSources(db, testCase, regenerate = false) {
  const sources = { ...(testCase.sources || {}) };
  if (regenerate || !sources.javascript) sources.javascript = generateJavascriptAdvanced(testCase);
  if (regenerate || !sources.python) sources.python = generatePythonAdvanced(testCase);
  const plans = containingPlans(db, testCase); const targets = plans.length ? plans : [{ name: '_未归档' }]; const files = [];
  for (const plan of targets) {
    const folder = join(suitesDir, safeSegment(plan.name)); await mkdir(folder, { recursive: true }); const stem = safeFile(testCase.name);
    const jsPath = join(folder, `${stem}.spec.js`); const pyPath = join(folder, `test_${stem.replace(/-/g, '_')}.py`);
    await Promise.all([writeFile(jsPath, sources.javascript), writeFile(pyPath, sources.python)]);
    files.push({ plan: plan.name, javascript: relative(root, jsPath), python: relative(root, pyPath) });
  }
  testCase.sources = sources; testCase.sourceFiles = files; return files;
}

app.get('/api/state', async (_req, res) => res.json(await store()));
app.get('/api/test-fixtures/flaky', async (_req, res) => { if (process.env.RECORD_DRY_RUN !== '1') throw httpError(404, '未找到接口', 'NOT_FOUND'); fixtureFlakyHits += 1; if (fixtureFlakyHits % 2 === 1) return res.status(503).json({ status: 'warming-up' }); await new Promise(resolveDelay => setTimeout(resolveDelay, 120)); res.json({ status: 'ready' }); });
app.get('/api/dashboard', async (_req, res) => {
  const db = await store(); const completed = db.runs.filter(run => ['passed', 'failed'].includes(run.status)); const passed = completed.filter(run => run.status === 'passed').length;
  res.json({ plans: db.plans.length, cases: db.cases.length, runs: db.runs.length, passRate: completed.length ? Math.round(passed / completed.length * 100) : 0, recentRuns: db.runs.slice(0, 8) });
});

app.post('/api/plans', async (req, res) => { const db = await store(); const plan = { id: randomUUID(), name: String(req.body.name || '新测试计划'), description: String(req.body.description || ''), caseIds: [], createdAt: now(), updatedAt: now() }; db.plans.push(plan); await save(db); res.status(201).json(plan); });
app.put('/api/plans/:id', async (req, res) => { const db = await store(); const plan = db.plans.find(x => x.id === req.params.id); if (!plan) throw httpError(404, '未找到测试计划', 'PLAN_NOT_FOUND'); plan.name = String(req.body.name ?? plan.name); plan.description = String(req.body.description ?? plan.description); plan.caseIds = Array.isArray(req.body.caseIds) ? req.body.caseIds : plan.caseIds; plan.updatedAt = now(); for (const id of plan.caseIds) { const item = db.cases.find(c => c.id === id); if (item) await persistSources(db, item); } await save(db); res.json(plan); });
app.delete('/api/plans/:id', async (req, res) => { const db = await store(); db.plans = db.plans.filter(x => x.id !== req.params.id); await save(db); res.status(204).end(); });
app.post('/api/plans/:id/cases/:caseId', async (req, res) => { const db = await store(); const plan = db.plans.find(x => x.id === req.params.id); const testCase = db.cases.find(x => x.id === req.params.caseId); if (!plan || !testCase) throw httpError(404, '未找到计划或用例', 'PLAN_OR_CASE_NOT_FOUND'); if (!plan.caseIds.includes(testCase.id)) plan.caseIds.push(testCase.id); plan.updatedAt = now(); await persistSources(db, testCase); await save(db); res.json(plan); });
app.delete('/api/plans/:id/cases/:caseId', async (req, res) => { const db = await store(); const plan = db.plans.find(x => x.id === req.params.id); if (!plan) throw httpError(404, '未找到测试计划', 'PLAN_NOT_FOUND'); plan.caseIds = plan.caseIds.filter(id => id !== req.params.caseId); plan.updatedAt = now(); await save(db); res.json(plan); });

app.post('/api/cases', async (req, res) => { const db = await store(); const testCase = { ...defaultCase(req.body.name), editorMode: req.body.editorMode || 'visual' }; db.cases.push(testCase); await persistSources(db, testCase, true); await save(db); res.status(201).json(testCase); });
app.put('/api/cases/:id', async (req, res) => {
  const db = await store(); const index = db.cases.findIndex(x => x.id === req.params.id); if (index < 0) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const old = db.cases[index];
  if (Number(req.body.version) !== Number(old.version)) return res.status(409).json({ error: '该用例已被更新。已加载最新版本，请确认后重新保存。', code: 'VERSION_CONFLICT', currentVersion: old.version });
  const next = { ...old, ...req.body, id: old.id, createdAt: old.createdAt, version: old.version + 1, updatedAt: now() }; if (!Array.isArray(next.steps)) throw httpError(400, '步骤数据格式错误：steps 必须是数组', 'INVALID_STEPS'); validateMappings(next.defaults?.proxy);
  db.cases[index] = next; await persistSources(db, next, Boolean(req.body.regenerateSources)); await save(db); res.json(next);
});
app.delete('/api/cases/:id', async (req, res) => { const db = await store(); db.cases = db.cases.filter(x => x.id !== req.params.id); db.plans.forEach(p => { p.caseIds = p.caseIds.filter(id => id !== req.params.id); }); await save(db); res.status(204).end(); });
app.get('/api/cases/:id/source', async (req, res) => { const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const language = req.query.language === 'python' ? 'python' : 'javascript'; if (!testCase.sources?.[language]) await persistSources(db, testCase, true); await save(db); res.json({ language, code: testCase.sources[language], files: testCase.sourceFiles || [] }); });
app.put('/api/cases/:id/source', async (req, res) => {
  const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const language = req.body.language === 'python' ? 'python' : 'javascript'; const code = String(req.body.code || ''); if (!code.trim()) throw httpError(400, '代码不能为空', 'EMPTY_SOURCE'); testCase.sources ||= {}; let sync;
  if (language === 'javascript') {
    const javascript = code.replaceAll("'@playwright/test'", "'playwright/test'").replaceAll('"@playwright/test"', '"playwright/test"'); const steps = parseCodegen(javascript); const candidates = javascript.split('\n').filter(line => /await\s+(page\.|expect\()/.test(line)).length;
    testCase.sources.javascript = javascript; testCase.editorMode = 'code';
    if (steps.length) { testCase.steps = steps; testCase.sources.python = generatePythonAdvanced(testCase); sync = { direction: 'javascript-to-visual-and-python', stepCount: steps.length, warning: candidates > steps.length ? `有 ${candidates - steps.length} 行复杂 JavaScript 无法转换为无代码步骤；完整 JavaScript 已保留。` : null }; }
    else sync = { direction: 'javascript-only', stepCount: 0, warning: '没有识别到可转换的 Playwright 步骤；已保存完整 JavaScript，但未覆盖无代码步骤和 Python。' };
  } else { testCase.sources.python = code; sync = { direction: 'python-only', stepCount: 0, warning: 'Python 作为独立导出源码保存，不会反向覆盖 JavaScript 或无代码步骤。请修改无代码步骤或 JavaScript 作为同步源。' }; }
  testCase.codeLanguage = language; testCase.version += 1; testCase.updatedAt = now(); await persistSources(db, testCase); await save(db); res.json({ ...testCase, sync });
});
app.post('/api/cases/:id/generate-source', async (req, res) => { const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); await persistSources(db, testCase, true); testCase.version += 1; testCase.updatedAt = now(); await save(db); res.json(testCase); });

function singleLocator(page, primary) { const value = primary.value; switch (primary.strategy) { case 'role': return page.getByRole(value, primary.name ? { name: primary.name } : undefined); case 'label': return page.getByLabel(value); case 'placeholder': return page.getByPlaceholder(value); case 'text': return page.getByText(value, { exact: Boolean(primary.exact) }); case 'testId': return page.getByTestId(value); case 'altText': return page.getByAltText(value); case 'title': return page.getByTitle(value); case 'xpath': return page.locator(`xpath=${value}`); default: return page.locator(value); } }
function locator(page, source = {}) { const primary = source.primary || source; const candidates = [primary, ...(source.fallbacks || [])]; const locators = candidates.map(candidate => singleLocator(page, candidate)); return locators.slice(1).reduce((combined, candidate) => combined.or(candidate), locators[0]).first(); }
function readPath(source, path) { return String(path).split('.').reduce((value, key) => value?.[key], source); }
function interpolate(value, data) { return typeof value === 'string' ? value.replace(/\$\{data\.([\w.-]+)\}/g, (_m, path) => String(readPath(data, path) ?? '')).replace(/\$\{env\.([A-Z0-9_]+)\}/g, (_m, key) => String(process.env[key] ?? '')) : value; }
function activeMappings(proxy = {}) { return (proxy.mappings || []).filter(rule => rule?.enabled !== false && rule?.from && rule?.to); }
function mappedUrl(original, mappings) { for (const rule of mappings) { if (!original.startsWith(rule.from)) continue; const suffix = rule.preservePath === false ? '' : original.slice(rule.from.length); return `${String(rule.to).replace(/\/$/, '')}${suffix ? `/${suffix.replace(/^\//, '')}` : ''}`; } return original; }
async function installMappings(context, proxy = {}) { const mappings = activeMappings(proxy); if (!mappings.length) return; await context.route('**/*', async route => { const original = route.request().url(); const mapped = mappedUrl(original, mappings); if (mapped === original) return route.continue(); const fromProtocol = new URL(original).protocol; const toProtocol = new URL(mapped).protocol; if (fromProtocol !== toProtocol) return route.abort('blockedbyclient'); await route.continue({ url: mapped }); }); }
function validateMappings(proxy = {}) { for (const [index, rule] of (proxy.mappings || []).entries()) { if (!rule?.from && !rule?.to) continue; let from; let to; try { from = new URL(rule.from); to = new URL(rule.to); } catch { throw httpError(400, `远程映射第 ${index + 1} 条必须填写完整 URL，例如 https://www.coupang.com/`, 'INVALID_PROXY_MAPPING'); } if (!['http:', 'https:'].includes(from.protocol) || !['http:', 'https:'].includes(to.protocol)) throw httpError(400, `远程映射第 ${index + 1} 条只支持 HTTP/HTTPS`, 'INVALID_PROXY_MAPPING'); if (from.protocol !== to.protocol) throw httpError(400, `远程映射第 ${index + 1} 条协议不同。Playwright 原生映射要求协议一致；HTTP↔HTTPS 请使用 Charles Map Remote。`, 'MAPPING_PROTOCOL_MISMATCH'); } }
function codeMappingBootstrap(proxy = {}) { const mappings = activeMappings(proxy); if (!mappings.length) return ''; return `const __wtrMappings = ${JSON.stringify(mappings)};\ntest.beforeEach(async ({ context }) => {\n  await context.route('**/*', async route => {\n    const original = route.request().url();\n    const rule = __wtrMappings.find(item => original.startsWith(item.from));\n    if (!rule) return route.continue();\n    const suffix = rule.preservePath === false ? '' : original.slice(rule.from.length);\n    const mapped = String(rule.to).replace(/\\/$/, '') + (suffix ? '/' + suffix.replace(/^\\//, '') : '');\n    await route.continue({ url: mapped });\n  });\n});\n`;
}
function redact(text, secrets) { let value = String(text || ''); for (const secret of secrets) if (secret) value = value.split(String(secret)).join('***'); return value; }
function stepTitle(step, index) { const label = step.action || step.assertion || '未知操作'; const p = step.locator?.primary; const target = p ? `${p.strategy}=${p.value}${p.name ? ` (${p.name})` : ''}` : (step.url || step.value || '当前页面'); return `步骤 ${index + 1} · ${label} · ${target}`; }
function diagnose(raw, step, index, url) {
  const text = String(raw || '未知错误'); let category = '执行失败'; let cause = '页面状态或元素与录制时不一致。'; let suggestion = '先打开失败截图确认页面状态，再检查该步骤的定位和值。';
  if (/Access Denied|\b403\b|CAPTCHA|unusual traffic|异常流量|sorry\/index|拒绝自动化/i.test(text)) { category = '目标网站拒绝自动化'; cause = '目标网站的风控、CDN 或 CAPTCHA 拒绝了当前自动化会话或网络出口。'; suggestion = '不要绕过安全控制。使用已授权测试环境、白名单 IP/账号，或在合规录制模式中手工完成验证后继续。'; }
  else if (/ERR_ABORTED/i.test(text)) { category = '页面导航被中断'; cause = '目标页面取消了导航，常见于登录跳转、站点安全策略或连续 goto 互相打断。'; suggestion = '删除重复导航步骤；登录跳转后改用 waitForURL；确认代理、Cookie 和站点权限。'; }
  else if (/Timeout/i.test(text)) { category = '等待元素超时'; cause = '在超时时间内没有找到可操作的目标元素，或元素尚不可见。'; suggestion = '核对失败截图中的页面语言和登录状态；优先使用 role+名称、label 或 testId，并在前一步增加 waitForVisible。'; }
  else if (/net::ERR_(NAME_NOT_RESOLVED|CONNECTION_REFUSED|PROXY_CONNECTION_FAILED)/i.test(text)) { category = '网络或代理连接失败'; cause = '浏览器无法解析域名、连接服务器或连接代理。'; suggestion = '检查 URL、网络和代理地址；先关闭代理重试，再确认代理用户名和密码。'; }
  else if (/strict mode violation/i.test(text)) { category = '元素定位不唯一'; cause = '该定位匹配了多个元素，Playwright 无法确定要操作哪一个。'; suggestion = '增加 role 名称、label 或 testId，让定位只匹配一个元素。'; }
  else if (/断言失败/i.test(text)) { category = '断言未满足'; cause = '页面实际结果与期望值不同。'; suggestion = '对照实际值和失败截图，确认期望值、测试数据以及异步加载是否完成。'; }
  return { title: `${stepTitle(step, index)} 失败`, category, cause, suggestion, pageUrl: url, stepIndex: index, operation: step.action || step.assertion, locator: step.locator?.primary || null, technical: text };
}

async function detectSiteBlock(page) {
  const text = await page.locator('body').innerText({ timeout: 1000 }).catch(() => '');
  if (/Access Denied|CAPTCHA|unusual traffic|异常流量|检测到.*自动|拒绝.*访问|sorry\/index/i.test(`${page.url()} ${text.slice(0, 6000)}`)) return true;
  return false;
}
function blockedDiagnostic(step, index, url, technical) {
  return { title: `${stepTitle(step, index)} 失败`, category: '目标网站拒绝自动化', cause: '页面已进入 Access Denied、CAPTCHA 或异常流量拦截页；这不是普通元素定位失败。', suggestion: '停止自动重试。确认系统已授权测试，配置企业白名单，或在合规录制模式中由用户手工完成验证。应用不会破解验证码或伪造浏览器指纹。', pageUrl: url, stepIndex: index, operation: step.action || step.assertion, locator: step.locator?.primary || null, technical };
}

async function executeReadiness(page, step, data) {
  const ready = step.readiness; if (!ready || ready.type === 'none') return; const timeout = Number(ready.timeoutMs || step.timeoutMs || 10000); const target = ready.locator || step.locator ? locator(page, ready.locator || step.locator) : null; const value = interpolate(ready.value, data);
  if (ready.type === 'elementVisible') return playwrightExpect(target).toBeVisible({ timeout });
  if (ready.type === 'elementHidden') return playwrightExpect(target).toBeHidden({ timeout });
  if (ready.type === 'elementEnabled') return playwrightExpect(target).toBeEnabled({ timeout });
  if (ready.type === 'elementEditable') return playwrightExpect(target).toBeEditable({ timeout });
  if (ready.type === 'elementText') return playwrightExpect(target).toContainText(value, { timeout });
  if (ready.type === 'url') return playwrightExpect(page).toHaveURL(new RegExp(value), { timeout });
  if (ready.type === 'loadState') return page.waitForLoadState(value || 'domcontentloaded', { timeout });
  throw new Error(`暂不支持页面就绪条件：${ready.type}`);
}
async function executeStep(page, step, data, settings = {}) {
  const timeout = Number(step.timeoutMs || (step.kind === 'assertion' ? settings.assertionTimeoutMs : settings.actionTimeoutMs) || 10000); page.setDefaultTimeout(timeout); const target = step.locator ? locator(page, step.locator) : null; const value = interpolate(step.value, data); const expected = interpolate(step.expected, data); await executeReadiness(page, step, data);
  if (step.kind === 'assertion') { if (step.assertion === 'toBeVisible') return playwrightExpect(target).toBeVisible({ timeout }); if (step.assertion === 'toBeHidden') return playwrightExpect(target).toBeHidden({ timeout }); if (step.assertion === 'toHaveText') return playwrightExpect(target).toHaveText(expected, { timeout }); if (step.assertion === 'toContainText') return playwrightExpect(target).toContainText(expected, { timeout }); if (step.assertion === 'toHaveValue') return playwrightExpect(target).toHaveValue(expected, { timeout }); if (step.assertion === 'toBeEnabled') return playwrightExpect(target).toBeEnabled({ timeout }); if (step.assertion === 'toBeDisabled') return playwrightExpect(target).toBeDisabled({ timeout }); if (step.assertion === 'toBeChecked') return playwrightExpect(target).toBeChecked({ timeout }); if (step.assertion === 'toHaveCount') return playwrightExpect(target).toHaveCount(Number(expected), { timeout }); if (step.assertion === 'toHaveURL') return playwrightExpect(page).toHaveURL(new RegExp(expected), { timeout }); if (step.assertion === 'toHaveTitle') return playwrightExpect(page).toHaveTitle(new RegExp(expected), { timeout }); throw new Error(`暂不支持断言：${step.assertion}`); }
  if (step.action === 'clickAndWaitForResponse') { const response = step.response || {}; const pattern = interpolate(response.urlPattern, data); const responsePromise = page.waitForResponse(item => item.url().includes(pattern) && (!response.method || item.request().method() === response.method), { timeout: Number(response.timeoutMs || timeout) }); await target.click({ timeout }); const received = await responsePromise; if (response.status && received.status() !== Number(response.status)) throw new Error(`接口状态错误：${received.request().method()} ${received.url()} 返回 HTTP ${received.status()}，期望 ${response.status}`); return; }
  switch (step.action) { case 'goto': return page.goto(interpolate(step.url || value, data), { waitUntil: 'domcontentloaded', timeout: Number(step.timeoutMs || settings.navigationTimeoutMs || 30000) }); case 'click': return target.click({ timeout }); case 'dblclick': return target.dblclick({ timeout }); case 'hover': return target.hover({ timeout }); case 'focus': return target.focus({ timeout }); case 'fill': return target.fill(value, { timeout }); case 'clear': return target.clear({ timeout }); case 'type': return target.pressSequentially(value, { timeout }); case 'check': return target.check({ timeout }); case 'uncheck': return target.uncheck({ timeout }); case 'selectOption': return target.selectOption(value, { timeout }); case 'press': return target.press(value, { timeout }); case 'waitForVisible': return target.waitFor({ state: 'visible', timeout }); case 'waitForHidden': return target.waitFor({ state: 'hidden', timeout }); case 'waitForURL': return page.waitForURL(value, { timeout }); case 'reload': return page.reload({ waitUntil: 'domcontentloaded', timeout: Number(step.timeoutMs || settings.navigationTimeoutMs || 30000) }); case 'back': return page.goBack({ waitUntil: 'domcontentloaded', timeout: Number(step.timeoutMs || settings.navigationTimeoutMs || 30000) }); case 'forward': return page.goForward({ waitUntil: 'domcontentloaded', timeout: Number(step.timeoutMs || settings.navigationTimeoutMs || 30000) }); case 'waitForTimeout': return page.waitForTimeout(Number(value)); case 'waitForLoadState': return page.waitForLoadState(value || 'domcontentloaded', { timeout }); default: throw new Error(`暂不支持操作：${step.action}`); }
}
function isTransientFailure(error) { return /Timeout|ERR_(?:NETWORK_CHANGED|CONNECTION_RESET|CONNECTION_CLOSED|TIMED_OUT|NAME_NOT_RESOLVED)|HTTP\s(?:408|429|5\d\d)|接口状态错误.*HTTP\s5\d\d/i.test(String(error?.message || error)); }
function effectiveRetry(step) { const config = retryConfig(step); const sideEffect = ['click', 'dblclick', 'clickAndWaitForResponse', 'check', 'uncheck', 'press'].includes(step.action); if (step.retryPolicy?.idempotency === 'never' || (step.retryPolicy?.idempotency === 'auto' && sideEffect)) config.attempts = 1; return config; }
async function recoverPage(page, recovery) { if (recovery === 'reload') await page.reload({ waitUntil: 'domcontentloaded' }); else if (recovery === 'reopen') await page.goto(page.url(), { waitUntil: 'domcontentloaded' }); }

async function executeVisualCase(db, testCase, input = {}) {
  const runId = randomUUID(); const runDir = join(artifactsDir, runId); await mkdir(runDir, { recursive: true }); const settings = { ...testCase.defaults, ...input }; const complianceEnabled = Boolean(testCase.compliance?.enabled); const engine = complianceEnabled ? chromium : browserEngines[settings.browser];
  if (!engine) throw httpError(400, '真实 Safari 需要 Selenium SafariDriver；当前支持 Chromium、Firefox 和 WebKit。', 'UNSUPPORTED_BROWSER');
  const proxy = settings.proxy?.mode === 'proxy' && settings.proxy.server ? { server: settings.proxy.server, username: settings.proxy.username || undefined, password: settings.proxy.password || undefined, bypass: settings.proxy.bypass || undefined } : undefined;
  const started = Date.now(); const result = { id: runId, scope: 'case', caseId: testCase.id, caseName: testCase.name, planId: input.planId || null, startedAt: now(), status: 'running', flaky: false, steps: [], networkIssues: [], artifactPath: `/artifacts/${runId}` };
  let browser; let context; let page;
  try {
    const auth = compliancePaths(testCase); const mappings = activeMappings(settings.proxy); const launchOptions = { headless: input.headless !== false, proxy, ...(complianceEnabled ? { channel: 'chrome' } : {}) }; const contextOptions = { locale: settings.locale || 'zh-CN', recordVideo: { dir: runDir }, ...(mappings.length ? { serviceWorkers: 'block' } : {}), ...(complianceEnabled && existsSync(auth.storagePath) ? { storageState: auth.storagePath } : {}) };
    browser = await engine.launch(launchOptions); context = await browser.newContext(contextOptions); await installMappings(context, settings.proxy); await context.tracing.start({ screenshots: true, snapshots: true }); page = await context.newPage(); page.on('response', response => { if (response.status() >= 400) result.networkIssues.push({ type: 'http', method: response.request().method(), url: response.url(), status: response.status(), at: now() }); }); page.on('requestfailed', request => result.networkIssues.push({ type: 'requestfailed', method: request.method(), url: request.url(), error: request.failure()?.errorText || 'request failed', at: now() }));
    for (let index = 0; index < testCase.steps.length; index += 1) {
      const step = testCase.steps[index]; const policy = effectiveRetry(step); const record = { id: step.id, index, title: stepTitle(step, index), operation: step.action || step.assertion, locator: step.locator?.primary || null, readiness: step.readiness || null, retryPolicy: policy, status: 'passed', attempts: 0, attemptLog: [], startedAt: now() };
      for (let attempt = 1; attempt <= policy.attempts; attempt += 1) { record.attempts = attempt; const attemptStarted = Date.now(); try { await executeStep(page, step, { ...testCase.data, ...(input.data || {}) }, settings.stability || {}); record.attemptLog.push({ attempt, status: 'passed', durationMs: Date.now() - attemptStarted }); if (attempt > 1) { record.recovered = true; result.flaky = true; } break; } catch (error) { record.error = redact(error.message, [settings.proxy?.password]); const siteBlocked = await detectSiteBlock(page); const canRetry = attempt < policy.attempts && !siteBlocked && isTransientFailure(error); record.attemptLog.push({ attempt, status: 'failed', durationMs: Date.now() - attemptStarted, error: record.error, recovery: canRetry ? policy.recovery : 'none' }); if (canRetry) { const delay = policy.backoff === 'exponential' ? policy.baseDelayMs * (2 ** (attempt - 1)) : policy.baseDelayMs; if (delay) await page.waitForTimeout(delay); await recoverPage(page, policy.recovery).catch(recoveryError => { record.attemptLog.at(-1).recoveryError = recoveryError.message; }); continue; } const shot = 'failure.png'; await page.screenshot({ path: join(runDir, shot), fullPage: true }).catch(() => {}); record.diagnostic = siteBlocked ? blockedDiagnostic(step, index, page.url(), record.error) : diagnose(record.error, step, index, page.url()); record.diagnostic.networkIssues = result.networkIssues.slice(-10); record.artifacts = { screenshot: `${result.artifactPath}/${shot}`, trace: `${result.artifactPath}/trace.zip` }; if (step.continueOnError) { record.status = 'warning'; break; } record.status = 'failed'; result.status = 'failed'; result.error = record.error; result.diagnostic = record.diagnostic; result.failedStepIndex = index; result.steps.push(record); throw error; } }
      record.finishedAt = now(); result.steps.push(record);
    }
    result.status = 'passed'; result.networkIssues = result.networkIssues.slice(-25);
  } catch (error) { result.status = 'failed'; result.error ||= redact(error.message, [settings.proxy?.password]); if (!result.diagnostic) result.diagnostic = diagnose(result.error, { action: 'launch', value: settings.browser }, -1, page?.url?.() || settings.baseUrl || ''); }
  finally {
    if (context) { await context.tracing.stop({ path: join(runDir, 'trace.zip') }).catch(() => {}); const video = page?.video(); await context.close().catch(() => {}); if (video) { const path = await video.path().catch(() => null); if (path) result.video = `${result.artifactPath}/${basename(path)}`; } }
    await browser?.close().catch(() => {}); result.finishedAt = now(); result.durationMs = Date.now() - started; result.artifacts = { screenshot: existsSync(join(runDir, 'failure.png')) ? `${result.artifactPath}/failure.png` : null, trace: existsSync(join(runDir, 'trace.zip')) ? `${result.artifactPath}/trace.zip` : null, video: result.video || null };
  }
  return result;
}
async function recordRun(result) { const db = await store(); db.runs.unshift(result); await save(db); return result; }

function runProcess(command, args, options = {}) {
  return new Promise(resolveProcess => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => resolveProcess({ code: -1, stdout, stderr: `${stderr}\n${error.message}` }));
    child.on('close', code => resolveProcess({ code, stdout, stderr }));
  });
}
async function findArtifacts(dir, prefix = '') {
  const found = []; for (const name of await readdir(dir).catch(() => [])) { const full = join(dir, name); const item = await stat(full); const rel = prefix ? `${prefix}/${name}` : name; if (item.isDirectory()) found.push(...await findArtifacts(full, rel)); else found.push(rel); } return found;
}
async function executeCodeCase(db, testCase, input = {}) {
  await persistSources(db, testCase); const runId = randomUUID(); const runDir = join(artifactsDir, runId); await mkdir(runDir, { recursive: true });
  const sourceEntry = testCase.sourceFiles?.[0]; if (!sourceEntry?.javascript) throw httpError(400, '尚未生成 JavaScript 测试文件，请先保存代码。', 'SOURCE_NOT_SAVED');
  const complianceEnabled = Boolean(testCase.compliance?.enabled); const sourcePath = resolve(root, sourceEntry.javascript); const browserName = complianceEnabled ? 'chromium' : (input.browser || testCase.defaults.browser || 'chromium'); if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw httpError(400, '代码回放支持 Chromium、Firefox 和 WebKit。', 'UNSUPPORTED_BROWSER');
  const proxy = input.proxy?.mode === 'proxy' && input.proxy.server ? { server: input.proxy.server, username: input.proxy.username || undefined, password: input.proxy.password || undefined, bypass: input.proxy.bypass || undefined } : undefined;
  const playwrightTestUrl = pathToFileURL(join(root, 'node_modules', 'playwright', 'test.mjs')).href; const runnablePath = join(runDir, 'runnable.spec.mjs'); let runnableSource = testCase.sources.javascript.replace(/(['"])playwright\/test\1/g, JSON.stringify(playwrightTestUrl)).replace(/(['"])@playwright\/test\1/g, JSON.stringify(playwrightTestUrl)); const mappingBootstrap = codeMappingBootstrap(testCase.defaults.proxy); if (mappingBootstrap) { const firstBreak = runnableSource.indexOf('\n'); runnableSource = `${runnableSource.slice(0, firstBreak + 1)}\n${mappingBootstrap}\n${runnableSource.slice(firstBreak + 1)}`; } await writeFile(runnablePath, runnableSource);
  const auth = compliancePaths(testCase); const mappings = activeMappings(testCase.defaults.proxy); const stability = testCase.defaults.stability || {}; const estimatedTimeout = (testCase.steps || []).reduce((sum, step) => { const policy = retryConfig(step); return sum + Number(step.timeoutMs || stability.actionTimeoutMs || 10000) * policy.attempts + policy.baseDelayMs * Math.max(0, policy.attempts - 1); }, 0); const testTimeout = Math.max(30000, Number(testCase.defaults.timeoutMs || 0), estimatedTimeout); const configPath = join(runDir, 'playwright.config.mjs'); const config = `import { defineConfig } from ${JSON.stringify(playwrightTestUrl)};\nexport default defineConfig({ testDir: ${JSON.stringify(runDir)}, testMatch: ${JSON.stringify(basename(runnablePath))}, timeout: ${testTimeout}, expect: { timeout: ${Number(stability.assertionTimeoutMs || 10000)} }, outputDir: ${JSON.stringify(join(runDir, 'results'))}, reporter: 'line', use: { browserName: ${JSON.stringify(browserName)}, headless: ${input.headless !== false}, locale: ${JSON.stringify(testCase.defaults.locale || 'zh-CN')}, actionTimeout: ${Number(stability.actionTimeoutMs || 10000)}, navigationTimeout: ${Number(stability.navigationTimeoutMs || 30000)}, trace: 'on', video: 'on', screenshot: 'only-on-failure'${mappings.length ? `, serviceWorkers: 'block'` : ''}${complianceEnabled ? `, channel: 'chrome'` : ''}${complianceEnabled && existsSync(auth.storagePath) ? `, storageState: ${JSON.stringify(auth.storagePath)}` : ''}${proxy ? `, proxy: ${JSON.stringify(proxy)}` : ''} } });\n`;
  await writeFile(configPath, config); const started = Date.now(); const result = { id: runId, scope: 'case', mode: 'code', caseId: testCase.id, caseName: testCase.name, planId: input.planId || null, startedAt: now(), status: 'running', steps: [], artifactPath: `/artifacts/${runId}` };
  const processResult = await runProcess('npx', ['playwright', 'test', '--config', configPath], { cwd: root, env: { ...process.env, CI: '1', WTR_TEST_DATA: JSON.stringify({ ...testCase.data, ...(input.data || {}) }) } }); const output = redact(`${processResult.stdout}\n${processResult.stderr}`.trim(), [proxy?.password]); const files = await findArtifacts(runDir); const screenshot = files.find(x => /test-failed.*\.png$|failure\.png$/i.test(x)); const video = files.find(x => /video\.(webm|mp4)$/i.test(x)); const trace = files.find(x => /trace\.zip$/i.test(x));
  result.status = processResult.code === 0 ? 'passed' : 'failed'; result.finishedAt = now(); result.durationMs = Date.now() - started; result.artifacts = { screenshot: screenshot ? `${result.artifactPath}/${screenshot}` : null, video: video ? `${result.artifactPath}/${video}` : null, trace: trace ? `${result.artifactPath}/${trace}` : null };
  if (result.status === 'passed') { const retries = (output.match(/\[WTR_RETRY\]/g) || []).length; result.flaky = retries > 0; result.steps = [{ id: 'code', index: 0, title: 'Playwright JavaScript 测试', operation: 'code', status: 'passed', attempts: retries + 1, recovered: retries > 0, attemptLog: retries ? [{ status: 'recovered', retries }] : [] }]; }
  else {
    const location = output.match(/runnable\.spec\.mjs:(\d+):(\d+)/); const line = Number(location?.[1] || 0); const sourceLines = testCase.sources.javascript.split('\n'); const failedSource = line ? sourceLines[line - 1]?.trim() : ''; const pseudoStep = { action: 'code', value: line ? `第 ${line} 行` : 'Playwright 测试' }; const diag = diagnose(output, pseudoStep, 0, testCase.defaults.baseUrl || ''); diag.title = line ? `代码第 ${line} 行执行失败` : 'JavaScript 测试执行失败'; diag.cause = failedSource ? `失败代码：${failedSource}` : diag.cause; diag.suggestion = `${diag.suggestion} 可在“代码编辑”中修改后重新保存。`; diag.technical = output; result.error = output.split('\n').find(x => /Error:|Timeout|ERR_/i.test(x))?.trim() || 'Playwright 代码执行失败'; result.failedStepIndex = 0; result.diagnostic = diag; result.steps = [{ id: 'code', index: 0, title: diag.title, operation: 'code', status: 'failed', attempts: 1, diagnostic: diag, artifacts: result.artifacts }];
  }
  return result;
}
async function executeCase(db, testCase, input) { return testCase.editorMode === 'code' ? executeCodeCase(db, testCase, input) : executeVisualCase(db, testCase, input); }

app.post('/api/cases/:id/run', async (req, res) => { const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const result = await executeCase(db, testCase, req.body || {}); await recordRun(result); res.status(result.status === 'passed' ? 200 : 422).json(result); });
app.post('/api/plans/:id/run', async (req, res) => {
  const db = await store(); const plan = db.plans.find(x => x.id === req.params.id); if (!plan) throw httpError(404, '未找到测试计划', 'PLAN_NOT_FOUND'); const started = Date.now(); const planRun = { id: randomUUID(), scope: 'plan', planId: plan.id, planName: plan.name, startedAt: now(), status: 'running', caseRuns: [], summary: { total: plan.caseIds.length, passed: 0, failed: 0 } };
  for (const id of plan.caseIds) { const testCase = db.cases.find(x => x.id === id); if (!testCase) continue; const child = await executeCase(db, testCase, { ...(req.body || {}), planId: plan.id }); planRun.caseRuns.push(child); planRun.summary[child.status === 'passed' ? 'passed' : 'failed'] += 1; }
  planRun.status = planRun.summary.failed ? 'failed' : 'passed'; planRun.finishedAt = now(); planRun.durationMs = Date.now() - started; await recordRun(planRun); res.status(planRun.status === 'passed' ? 200 : 422).json(planRun);
});
app.get('/api/runs', async (req, res) => { const db = await store(); let runs = db.runs; if (req.query.status) runs = runs.filter(x => x.status === req.query.status); if (req.query.scope) runs = runs.filter(x => x.scope === req.query.scope); if (req.query.planId) runs = runs.filter(x => x.planId === req.query.planId); if (req.query.caseId) runs = runs.filter(x => x.caseId === req.query.caseId); res.json(runs); });
app.get('/api/runs/:id', async (req, res) => { const db = await store(); const run = db.runs.find(x => x.id === req.params.id); if (!run) throw httpError(404, '未找到执行记录', 'RUN_NOT_FOUND'); res.json(run); });
app.delete('/api/runs/:id', async (req, res) => { const db = await store(); db.runs = db.runs.filter(x => x.id !== req.params.id); await save(db); res.status(204).end(); });
app.delete('/api/runs', async (_req, res) => { const db = await store(); db.runs = []; await save(db); res.status(204).end(); });

app.get('/api/cases/:id/compliance-status', async (req, res) => {
  const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const paths = compliancePaths(testCase); const saved = existsSync(paths.storagePath); const details = saved ? await stat(paths.storagePath) : null;
  res.json({ enabled: Boolean(testCase.compliance?.enabled), browserChannel: 'chrome', profileKey: safeFile(testCase.id), hasSavedLoginState: saved, loginStateUpdatedAt: details?.mtime?.toISOString() || null, profileCreated: existsSync(paths.profileDir), allowlistStatus: testCase.compliance?.allowlistStatus || 'not-configured' });
});
function publicRecordingSession(session) {
  const { outputPath: _outputPath, authPaths: _authPaths, debugArgs, ...safe } = session;
  return { ...safe, ...(process.env.RECORD_DRY_RUN === '1' ? { debugArgs } : {}) };
}
async function autoImportRecording(session) {
  const code = await readFile(session.outputPath, 'utf8');
  if (!code.trim()) throw new Error('录制脚本为空。请确认关闭 Inspector 前至少完成一个页面操作。');
  const db = await store(); const testCase = db.cases.find(x => x.id === session.caseId);
  if (!testCase) throw new Error('录制完成，但对应测试用例已被删除，无法自动导入。');
  const steps = parseCodegen(code); const javascript = code.replaceAll("'@playwright/test'", "'playwright/test'").replaceAll('"@playwright/test"', '"playwright/test"');
  if (steps.length) testCase.steps = steps;
  testCase.sources = { ...(testCase.sources || {}), javascript, python: generatePythonAdvanced({ ...testCase, steps }) };
  testCase.editorMode = 'code'; testCase.codeLanguage = 'javascript'; testCase.compliance = { ...defaultCompliance(), ...testCase.compliance, enabled: session.complianceMode, policyConfirmed: session.complianceMode ? true : testCase.compliance?.policyConfirmed, lastRecordedAt: now(), storageStateSaved: existsSync(session.authPaths.storagePath) };
  testCase.version += 1; testCase.updatedAt = now(); await persistSources(db, testCase); await save(db);
  return { autoImported: true, stepCount: steps.length, caseVersion: testCase.version, sourceFiles: testCase.sourceFiles || [] };
}
async function completeRecordingSession(session, exitCode, launchError) {
  if (['completed', 'failed'].includes(session.status)) return;
  session.finishedAt = now(); session.loginStateSaved = existsSync(session.authPaths.storagePath);
  if (launchError || exitCode !== 0) { session.status = 'failed'; session.message = launchError ? `录制浏览器启动失败：${launchError.message}` : `录制窗口异常关闭（退出码 ${exitCode}），没有修改测试用例。`; session.error = launchError?.message || `codegen exited with ${exitCode}`; return; }
  try { Object.assign(session, await autoImportRecording(session)); session.status = 'completed'; session.message = `录制脚本已自动导入代码编辑器，并同步生成 Python；识别到 ${session.stepCount} 个可视化步骤。`; }
  catch (error) { session.status = 'failed'; session.message = `录制已结束，但自动导入失败：${error.message}`; session.error = error.message; }
}
app.get('/api/recording-sessions/:id', (req, res) => { const session = recordingSessions.get(req.params.id); if (!session) throw httpError(404, '未找到录制会话', 'RECORDING_SESSION_NOT_FOUND'); res.json(publicRecordingSession(session)); });
app.post('/api/cases/:id/record', async (req, res) => {
  const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const complianceMode = Boolean(req.body.complianceMode); const browser = complianceMode ? 'chromium' : (req.body.browser || testCase.defaults.browser || 'chromium');
  if (!['chromium', 'chrome', 'firefox', 'webkit'].includes(browser)) throw httpError(400, '录制支持 Chromium、Firefox、WebKit；真实 Safari 请使用 Selenium 适配器。', 'UNSUPPORTED_BROWSER');
  if (complianceMode && !(req.body.policyConfirmed || testCase.compliance?.policyConfirmed)) throw httpError(400, '请先确认该目标环境已授权自动化测试。', 'COMPLIANCE_CONFIRMATION_REQUIRED');
  const out = join(recordingsDir, `${safeFile(testCase.name)}-${Date.now()}.spec.js`); const args = ['playwright', 'codegen', '--target', 'playwright-test', '--output', out, '--lang', req.body.locale || testCase.defaults.locale || 'zh-CN']; const paths = compliancePaths(testCase);
  if (complianceMode) { await mkdir(paths.profileDir, { recursive: true }); args.push('--channel', 'chrome', '--user-data-dir', paths.profileDir, '--save-storage', paths.storagePath); if (existsSync(paths.storagePath)) args.push('--load-storage', paths.storagePath); }
  else if (browser !== 'chromium') args.push('--browser', browser);
  const proxy = req.body.proxy || testCase.defaults.proxy; if (proxy?.mode === 'proxy' && proxy.server) { args.push('--proxy-server', proxy.server); if (proxy.bypass) args.push('--proxy-bypass', proxy.bypass); }
  if (req.body.url) args.push(req.body.url); const sessionId = randomUUID(); const session = { id: sessionId, caseId: testCase.id, status: 'waiting-for-user', dryRun: process.env.RECORD_DRY_RUN === '1', complianceMode, startedAt: now(), manualVerification: complianceMode, outputPath: out, authPaths: paths, debugArgs: args, outputFile: relative(root, out), profile: complianceMode ? `data/profiles/${safeFile(testCase.id)}` : null, loginState: complianceMode ? `data/auth/${safeFile(testCase.id)}.json` : null, message: complianceMode ? '正式 Chrome 已打开。手工完成登录或 CAPTCHA 后继续；完成后关闭 Inspector（无需 Save），脚本会自动导入代码编辑器。' : '录制窗口已打开。完成后关闭 Inspector（无需 Save），脚本会自动导入代码编辑器。' };
  recordingSessions.set(sessionId, session);
  if (process.env.RECORD_DRY_RUN !== '1') {
    const child = spawn('npx', args, { cwd: root, detached: true, stdio: 'ignore' }); session.pid = child.pid; child.once('error', error => { completeRecordingSession(session, null, error); }); child.once('exit', code => { completeRecordingSession(session, code); }); child.unref();
  }
  res.status(202).json(publicRecordingSession(session));
});
app.post('/api/recording-sessions/:id/test-complete', async (req, res) => {
  if (process.env.RECORD_DRY_RUN !== '1') throw httpError(404, '未找到接口', 'NOT_FOUND'); const session = recordingSessions.get(req.params.id); if (!session) throw httpError(404, '未找到录制会话', 'RECORDING_SESSION_NOT_FOUND'); await writeFile(session.outputPath, String(req.body.code || '')); await completeRecordingSession(session, Number(req.body.exitCode || 0)); res.json(publicRecordingSession(session));
});
app.get('/api/recordings', async (_req, res) => { const files = await Promise.all((await readdir(recordingsDir)).filter(x => x.endsWith('.spec.js')).map(async name => { const details = await stat(join(recordingsDir, name)); return { name, modifiedAt: details.mtime.toISOString(), size: details.size }; })); res.json(files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))); });
app.post('/api/cases/:id/import-codegen', async (req, res) => { const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const filename = String(req.body.filename || ''); if (!/^[a-zA-Z0-9_.-]+\.spec\.js$/.test(filename)) throw httpError(400, '无效录制文件名', 'INVALID_RECORDING'); const code = await readFile(join(recordingsDir, filename), 'utf8'); const steps = parseCodegen(code); if (!steps.length) throw httpError(400, '没有识别到可导入步骤。请确认 Inspector 已保存完整脚本。', 'NO_STEPS_PARSED'); testCase.steps = req.body.mode === 'append' ? [...testCase.steps, ...steps] : steps; testCase.sources = { javascript: code.replaceAll("'@playwright/test'", "'playwright/test'").replaceAll('"@playwright/test"', '"playwright/test"'), python: generatePythonAdvanced({ ...testCase, steps }) }; testCase.editorMode = 'code'; testCase.codeLanguage = 'javascript'; testCase.version += 1; testCase.updatedAt = now(); await persistSources(db, testCase); await save(db); res.json(caseSummary(testCase)); });

app.use((error, _req, res, _next) => { console.error(error); res.status(error.status || 500).json({ error: error.message || '服务器错误', code: error.code || 'SERVER_ERROR', details: error.details }); });
app.listen(port, () => console.log(`Web Test Recorder: http://localhost:${port}`));
