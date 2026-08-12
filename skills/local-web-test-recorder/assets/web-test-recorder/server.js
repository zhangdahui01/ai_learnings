import express from 'express';
import { chromium, firefox, webkit } from 'playwright';
import { expect as playwrightExpect } from 'playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseCodegen, parseCodegenPhases } from './lib/codegen-parser.js';

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
if (!existsSync(storePath)) await writeFile(storePath, JSON.stringify({ schemaVersion: 3, plans: [], suites: [], cases: [], flows: [], runs: [] }, null, 2));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(root, 'public')));
app.use('/artifacts', express.static(artifactsDir));

function now() { return new Date().toISOString(); }
function processEnvForNetwork(useConfiguredProxy) { if (useConfiguredProxy) return { ...process.env }; return Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && !/^(?:HTTP|HTTPS|ALL)_PROXY$/i.test(key))); }
function safeSegment(value, fallback = 'untitled') {
  const cleaned = String(value || fallback).normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().replace(/\.+$/g, '').slice(0, 80);
  return cleaned || fallback;
}
function safeFile(value, fallback = 'test-case') { return safeSegment(value, fallback).replace(/\s+/g, '-').replace(/[^\p{L}\p{N}._-]/gu, '-').slice(0, 80) || fallback; }
function httpError(status, message, code = 'REQUEST_FAILED', details) { const error = new Error(message); error.status = status; error.code = code; error.details = details; return error; }
function defaultCompliance() { return { enabled: false, environmentName: '', approvedHosts: '', approvedAccountRefs: '', allowlistStatus: 'not-configured', allowlistNotes: '', humanVerification: true, policyConfirmed: false }; }
function defaultRuntimeSettings() { return { browser: 'chromium', baseUrl: '', locale: 'zh-CN', session: { mode: 'clean', persistRecordingState: false }, proxy: { mode: 'direct', server: '', username: '', password: '', bypass: '', mappings: [] }, stability: { preset: 'standard', navigationTimeoutMs: 30000, actionTimeoutMs: 10000, assertionTimeoutMs: 10000 }, timeoutMs: 10000 }; }
function normalizeRuntimeSettings(value = {}) { const defaults = defaultRuntimeSettings(); return { ...defaults, ...value, session: { ...defaults.session, ...(value.session || {}) }, proxy: { ...defaults.proxy, ...(value.proxy || {}), mappings: Array.isArray(value.proxy?.mappings) ? value.proxy.mappings : [] }, stability: { ...defaults.stability, ...(value.stability || {}) } }; }
function compliancePaths(testCase) { return { profileDir: join(profilesDir, safeFile(testCase.id)), storagePath: join(authDir, `${safeFile(testCase.id)}.json`) }; }
async function store() {
  const db = JSON.parse(await readFile(storePath, 'utf8'));
  let migrated = Number(db.schemaVersion || 0) < 3; db.schemaVersion = 3; db.plans ||= []; db.suites ||= []; db.cases ||= []; db.flows ||= []; db.runs ||= [];
  db.plans.forEach(plan => { plan.suiteIds ||= []; if ((plan.caseIds || []).length && !plan.suiteIds.length) { const id = `default-${plan.id}`; if (!db.suites.some(suite => suite.id === id)) db.suites.push({ id, name: '默认套件', description: '由原测试计划中的用例自动迁移', caseIds: [...plan.caseIds], setupSteps: [], teardownSteps: [], sessionPolicy: 'clean-per-case', createdAt: plan.createdAt || now(), updatedAt: now() }); plan.suiteIds = [id]; migrated = true; } });
  db.suites.forEach(item => { item.caseIds ||= []; item.setupSteps ||= []; item.teardownSteps ||= []; item.sources ||= { setupSteps: {}, teardownSteps: {} }; item.sources.setupSteps ||= {}; item.sources.teardownSteps ||= {}; item.sessionPolicy ||= 'clean-per-case'; });
  db.flows.forEach(item => { item.steps ||= []; item.parameters ||= []; item.version ||= 1; item.revisions ||= []; item.sources ||= {}; item.safety ||= 'normal'; item.defaults = normalizeRuntimeSettings(item.defaults); });
  db.cases.forEach(item => { item.steps ||= []; item.setupSteps ||= []; item.teardownSteps ||= []; item.editorMode ||= 'visual'; item.codeLanguage ||= 'javascript'; item.sources ||= {}; item.defaults = normalizeRuntimeSettings(item.defaults); item.compliance = { ...defaultCompliance(), ...(item.compliance || {}) }; });
  const normalizeRun = run => {
    if (run.status !== 'failed' || run.diagnostic) return;
    const failedIndex = Math.max(0, (run.steps || []).findIndex(step => step.status === 'failed')); const failed = run.steps?.[failedIndex]; const raw = failed?.error || run.error || '未知错误';
    const timeout = /Timeout/i.test(raw); const aborted = /ERR_ABORTED/i.test(raw);
    run.failedStepIndex = failedIndex; run.diagnostic = { title: failed ? `步骤 ${failedIndex + 1} · ${failed.label || failed.operation || '操作'} 失败` : '历史执行失败', category: timeout ? '等待元素超时' : aborted ? '页面导航被中断' : '执行失败', cause: timeout ? '在超时时间内没有找到可操作的目标元素，或元素尚未就绪。' : aborted ? '目标页面取消了导航，可能发生了登录跳转或连续导航。' : '页面状态与录制时不一致。', suggestion: timeout ? '核对页面语言、登录状态和元素定位，必要时在前一步增加等待。' : '查看失败截图和技术详情，确认页面状态后重试。', stepIndex: failedIndex, operation: failed?.label || failed?.operation, locator: failed?.locator || null, technical: raw };
  };
  db.runs.forEach(run => { normalizeRun(run); (run.caseRuns || []).forEach(normalizeRun); });
  if (migrated) await save(db); return db;
}
async function save(value) { await writeFile(storePath, JSON.stringify(value, null, 2)); }
function caseSummary(testCase) { return { ...testCase, steps: testCase.steps || [], sources: testCase.sources || {} }; }

const defaultCase = (name = '新测试用例') => ({
  id: randomUUID(), name, version: 1, editorMode: 'visual', codeLanguage: 'javascript', accountRef: '', tags: [], data: {}, sources: {},
  compliance: defaultCompliance(),
  defaults: defaultRuntimeSettings(),
  setupSteps: [], steps: [], teardownSteps: [], createdAt: now(), updatedAt: now()
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
  if (ready.type === 'elementAuto' || ready.type === 'elementVisible') return [`await expect(${target}).toBeVisible({ timeout: ${timeout} });`];
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
  const defaults = testCase.defaults || defaultCase().defaults; const proxy = defaults.proxy?.mode === 'proxy' && defaults.proxy.server ? defaults.proxy : null; const stability = defaults.stability || {}; const proxyUse = proxy ? `, proxy: { server: ${jsString(proxy.server)}, bypass: ${jsString(proxy.bypass || '')}, username: process.env.WTR_PROXY_USERNAME || undefined, password: process.env.WTR_PROXY_PASSWORD || undefined }` : '';
  lines.splice(lines.length - 1, 0, `test.use({ browserName: ${jsString(defaults.browser || 'chromium')}, locale: ${jsString(defaults.locale || 'zh-CN')}, actionTimeout: ${Number(stability.actionTimeoutMs || 10000)}, navigationTimeout: ${Number(stability.navigationTimeoutMs || 30000)}${proxyUse} });`, '');
  const emit = (steps, phase, indent) => { for (const step of steps || []) {
    const policy = effectiveRetry(step); lines.push(`${indent}// wtr-phase:${phase} wtr-step:${encodedStep(step)}`, `${indent}await runStep(page, ${JSON.stringify(policy)}, async () => {`);
    for (const readyLine of jsReadiness(step)) lines.push(`    ${readyLine}`);
    for (const operationLine of jsOperation(step).split('\n')) lines.push(`${indent}  ${operationLine}`);
    lines.push(`${indent}});`);
  } };
  lines.push('  try {'); emit(testCase.setupSteps, 'setup', '    '); emit(testCase.steps, 'steps', '    '); lines.push('  } finally {'); emit(testCase.teardownSteps, 'teardown', '    '); lines.push('  }', '});', ''); return lines.join('\n').replace('CONNECTION_CLOSED|TIMED_OUT', 'CONNECTION_CLOSED|PROXY_CONNECTION_FAILED|TIMED_OUT');
}
function pyReadiness(step) {
  const ready = step.readiness; if (!ready || ready.type === 'none') return [];
  const timeout = Number(ready.timeoutMs || step.timeoutMs || 10000); const value = `resolve_value(${pyString(ready.value || '')})`; const target = pyLocator({ locator: ready.locator || step.locator });
  const map = { elementAuto: `expect(${target}).to_be_visible(timeout=${timeout})`, elementVisible: `expect(${target}).to_be_visible(timeout=${timeout})`, elementHidden: `expect(${target}).to_be_hidden(timeout=${timeout})`, elementEnabled: `expect(${target}).to_be_enabled(timeout=${timeout})`, elementEditable: `expect(${target}).to_be_editable(timeout=${timeout})`, elementText: `expect(${target}).to_contain_text(${value}, timeout=${timeout})`, url: `expect(page).to_have_url(re.compile(${value}), timeout=${timeout})`, loadState: `page.wait_for_load_state(${value}, timeout=${timeout})` };
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
  let stepNumber = 0; const emit = (steps, phase, indent) => { for (const step of steps || []) { stepNumber += 1; const fn = `_step_${stepNumber}`; lines.push(`${indent}# wtr-phase:${phase} wtr-step:${encodedStep(step)}`, `${indent}def ${fn}():`); const operations = [...pyReadiness(step), ...pyOperation(step).split('\n')]; for (const line of operations) lines.push(`${indent}    ${line}`); lines.push(`${indent}run_step(page, ${JSON.stringify(effectiveRetry(step)).replaceAll('true', 'True').replaceAll('false', 'False').replaceAll('null', 'None')}, ${fn})`); } };
  lines.push('    try:'); if (!(testCase.setupSteps || []).length && !(testCase.steps || []).length) lines.push('        pass'); emit(testCase.setupSteps, 'setup', '        '); emit(testCase.steps, 'steps', '        '); lines.push('    finally:'); if (!(testCase.teardownSteps || []).length) lines.push('        pass'); emit(testCase.teardownSteps, 'teardown', '        ');
  lines.push(''); return lines.join('\n').replace('CONNECTION_CLOSED|TIMED_OUT', 'CONNECTION_CLOSED|PROXY_CONNECTION_FAILED|TIMED_OUT');
}
function suitesContainingCase(db, testCase) { return db.suites.filter(suite => suite.caseIds.includes(testCase.id)); }
function containingPlans(db, testCase) { const suiteIds = new Set(suitesContainingCase(db, testCase).map(suite => suite.id)); return db.plans.filter(plan => (plan.caseIds || []).includes(testCase.id) || (plan.suiteIds || []).some(id => suiteIds.has(id))); }
async function persistSources(db, testCase, regenerate = false) {
  const sources = { ...(testCase.sources || {}) };
  const sourceCase = { ...testCase, setupSteps: expandSteps(db, testCase.setupSteps || [], testCase.data || {}, [], 'setup').map(item => item.step), steps: expandSteps(db, testCase.steps || [], testCase.data || {}, [], 'steps').map(item => item.step), teardownSteps: expandSteps(db, testCase.teardownSteps || [], testCase.data || {}, [], 'teardown').map(item => item.step) };
  if (regenerate || !sources.javascript) sources.javascript = generateJavascriptAdvanced(sourceCase);
  if (regenerate || !sources.python) sources.python = generatePythonAdvanced(sourceCase);
  const memberships = suitesContainingCase(db, testCase).flatMap(suite => db.plans.filter(plan => (plan.suiteIds || []).includes(suite.id)).map(plan => ({ plan, suite }))); const targets = memberships.length ? memberships : [{ plan: { name: '_未归档' }, suite: null }]; const files = [];
  for (const { plan, suite } of targets) {
    const folder = suite ? join(suitesDir, safeSegment(plan.name), safeSegment(suite.name)) : join(suitesDir, safeSegment(plan.name)); await mkdir(folder, { recursive: true }); const stem = safeFile(testCase.name);
    const jsPath = join(folder, `${stem}.spec.js`); const pyPath = join(folder, `test_${stem.replace(/-/g, '_')}.py`);
    const executableCase = suite ? { ...sourceCase, setupSteps: [...expandSteps(db, suite.setupSteps || [], testCase.data || {}, [], 'suite-setup').map(item => item.step), ...sourceCase.setupSteps], teardownSteps: [...sourceCase.teardownSteps, ...expandSteps(db, suite.teardownSteps || [], testCase.data || {}, [], 'suite-teardown').map(item => item.step)] } : sourceCase;
    const javascript = suite ? generateJavascriptAdvanced(executableCase) : sources.javascript; const python = suite ? generatePythonAdvanced(executableCase) : sources.python;
    await Promise.all([writeFile(jsPath, javascript), writeFile(pyPath, python)]);
    files.push({ plan: plan.name, suite: suite?.name || null, javascript: relative(root, jsPath), python: relative(root, pyPath) });
  }
  testCase.sources = sources; testCase.sourceFiles = files; return files;
}
function structuredSources(db, name, steps, data = {}, defaults) {
  const expanded = expandSteps(db, steps || [], data, [], 'steps').map(item => item.step); const virtual = { ...defaultCase(name), data, steps: expanded, ...(defaults ? { defaults: normalizeRuntimeSettings(defaults) } : {}) };
  return { javascript: generateJavascriptAdvanced(virtual), python: generatePythonAdvanced(virtual) };
}
async function persistSuiteArtifacts(db, suite, regeneratePhases = []) {
  suite.sources ||= { setupSteps: {}, teardownSteps: {} };
  for (const phase of ['setupSteps', 'teardownSteps']) if (regeneratePhases.includes(phase) || !suite.sources[phase]?.javascript || !suite.sources[phase]?.python) suite.sources[phase] = structuredSources(db, `${suite.name} · ${phase === 'setupSteps' ? 'Suite Setup' : 'Suite Teardown'}`, suite[phase]);
  const plans = db.plans.filter(plan => (plan.suiteIds || []).includes(suite.id)); const targets = plans.length ? plans : [{ name: '_未归档' }]; const files = [];
  for (const plan of targets) {
    const folder = join(suitesDir, safeSegment(plan.name), safeSegment(suite.name)); await mkdir(folder, { recursive: true }); const setupJs = join(folder, 'suite.setup.js'); const setupPy = join(folder, 'suite_setup.py'); const teardownJs = join(folder, 'suite.teardown.js'); const teardownPy = join(folder, 'suite_teardown.py');
    await Promise.all([writeFile(setupJs, suite.sources.setupSteps.javascript), writeFile(setupPy, suite.sources.setupSteps.python), writeFile(teardownJs, suite.sources.teardownSteps.javascript), writeFile(teardownPy, suite.sources.teardownSteps.python)]);
    files.push({ plan: plan.name, suite: suite.name, setup: { javascript: relative(root, setupJs), python: relative(root, setupPy) }, teardown: { javascript: relative(root, teardownJs), python: relative(root, teardownPy) } });
  }
  suite.sourceFiles = files;
  for (const caseId of suite.caseIds || []) { const testCase = db.cases.find(item => item.id === caseId); if (testCase) await persistSources(db, testCase, true); }
  return files;
}
async function persistFlowArtifacts(db, flow, regenerate = false) {
  if (regenerate || !flow.sources?.javascript || !flow.sources?.python) flow.sources = structuredSources(db, flow.name, flow.steps, {}, flow.defaults);
  const folder = join(suitesDir, '_公共流程'); await mkdir(folder, { recursive: true }); const stem = safeFile(flow.name); const jsPath = join(folder, `${stem}.spec.js`); const pyPath = join(folder, `test_${stem.replace(/-/g, '_')}.py`);
  await Promise.all([writeFile(jsPath, flow.sources.javascript), writeFile(pyPath, flow.sources.python)]); flow.sourceFiles = [{ javascript: relative(root, jsPath), python: relative(root, pyPath) }]; return flow.sourceFiles;
}

app.get('/api/state', async (_req, res) => res.json(await store()));
app.get('/api/test-fixtures/flaky', async (_req, res) => { if (process.env.RECORD_DRY_RUN !== '1') throw httpError(404, '未找到接口', 'NOT_FOUND'); fixtureFlakyHits += 1; if (fixtureFlakyHits % 2 === 1) return res.status(503).json({ status: 'warming-up' }); await new Promise(resolveDelay => setTimeout(resolveDelay, 120)); res.json({ status: 'ready' }); });
app.get('/api/dashboard', async (_req, res) => {
  const db = await store(); const completed = db.runs.filter(run => ['passed', 'failed'].includes(run.status)); const passed = completed.filter(run => run.status === 'passed').length;
  res.json({ plans: db.plans.length, suites: db.suites.length, cases: db.cases.length, flows: db.flows.length, runs: db.runs.length, passRate: completed.length ? Math.round(passed / completed.length * 100) : 0, recentRuns: db.runs.slice(0, 8) });
});

app.post('/api/plans', async (req, res) => { const db = await store(); const plan = { id: randomUUID(), name: String(req.body.name || '新测试计划'), description: String(req.body.description || ''), suiteIds: [], caseIds: [], createdAt: now(), updatedAt: now() }; db.plans.push(plan); await save(db); res.status(201).json(plan); });
app.put('/api/plans/:id', async (req, res) => { const db = await store(); const plan = db.plans.find(x => x.id === req.params.id); if (!plan) throw httpError(404, '未找到测试计划', 'PLAN_NOT_FOUND'); plan.name = String(req.body.name ?? plan.name); plan.description = String(req.body.description ?? plan.description); plan.suiteIds = Array.isArray(req.body.suiteIds) ? req.body.suiteIds : plan.suiteIds; plan.updatedAt = now(); for (const suite of db.suites.filter(item => plan.suiteIds.includes(item.id))) await persistSuiteArtifacts(db, suite); await save(db); res.json(plan); });
app.delete('/api/plans/:id', async (req, res) => { const db = await store(); db.plans = db.plans.filter(x => x.id !== req.params.id); await save(db); res.status(204).end(); });
app.post('/api/plans/:id/cases/:caseId', async (req, res) => { const db = await store(); const plan = db.plans.find(x => x.id === req.params.id); const testCase = db.cases.find(x => x.id === req.params.caseId); if (!plan || !testCase) throw httpError(404, '未找到计划或用例', 'PLAN_OR_CASE_NOT_FOUND'); let suite = db.suites.find(item => item.id === plan.suiteIds?.[0]); if (!suite) { suite = { id: randomUUID(), name: '默认套件', description: '', caseIds: [], setupSteps: [], teardownSteps: [], sources: { setupSteps: {}, teardownSteps: {} }, sessionPolicy: 'clean-per-case', createdAt: now(), updatedAt: now() }; db.suites.push(suite); plan.suiteIds = [suite.id]; } if (!suite.caseIds.includes(testCase.id)) suite.caseIds.push(testCase.id); plan.caseIds = [...new Set([...(plan.caseIds || []), testCase.id])]; plan.updatedAt = suite.updatedAt = now(); await persistSuiteArtifacts(db, suite); await save(db); res.json(plan); });
app.delete('/api/plans/:id/cases/:caseId', async (req, res) => { const db = await store(); const plan = db.plans.find(x => x.id === req.params.id); if (!plan) throw httpError(404, '未找到测试计划', 'PLAN_NOT_FOUND'); for (const suite of db.suites.filter(item => plan.suiteIds.includes(item.id))) suite.caseIds = suite.caseIds.filter(id => id !== req.params.caseId); plan.caseIds = (plan.caseIds || []).filter(id => id !== req.params.caseId); plan.updatedAt = now(); await save(db); res.json(plan); });

app.post('/api/suites', async (req, res) => { const db = await store(); const suite = { id: randomUUID(), name: String(req.body.name || '新测试套件'), description: String(req.body.description || ''), caseIds: [], setupSteps: [], teardownSteps: [], sources: { setupSteps: {}, teardownSteps: {} }, sessionPolicy: req.body.sessionPolicy || 'clean-per-case', createdAt: now(), updatedAt: now() }; db.suites.push(suite); if (req.body.planId) { const plan = db.plans.find(item => item.id === req.body.planId); if (plan && !plan.suiteIds.includes(suite.id)) plan.suiteIds.push(suite.id); } await persistSuiteArtifacts(db, suite, ['setupSteps', 'teardownSteps']); await save(db); res.status(201).json(suite); });
app.put('/api/suites/:id', async (req, res) => { const db = await store(); const index = db.suites.findIndex(item => item.id === req.params.id); if (index < 0) throw httpError(404, '未找到测试套件', 'SUITE_NOT_FOUND'); const old = db.suites[index]; const suite = { ...old, ...req.body, id: req.params.id, updatedAt: now() }; for (const key of ['caseIds','setupSteps','teardownSteps']) if (!Array.isArray(suite[key])) throw httpError(400, `${key} 必须是数组`, 'INVALID_SUITE'); const changedPhases = ['setupSteps', 'teardownSteps'].filter(phase => JSON.stringify(old[phase]) !== JSON.stringify(suite[phase])); db.suites[index] = suite; await persistSuiteArtifacts(db, suite, changedPhases); await save(db); res.json(suite); });
app.delete('/api/suites/:id', async (req, res) => { const db = await store(); db.suites = db.suites.filter(item => item.id !== req.params.id); db.plans.forEach(plan => { plan.suiteIds = (plan.suiteIds || []).filter(id => id !== req.params.id); }); await save(db); res.status(204).end(); });
app.post('/api/plans/:id/suites/:suiteId', async (req, res) => { const db = await store(); const plan = db.plans.find(item => item.id === req.params.id); const suite = db.suites.find(item => item.id === req.params.suiteId); if (!plan || !suite) throw httpError(404, '未找到计划或套件', 'PLAN_OR_SUITE_NOT_FOUND'); if (!plan.suiteIds.includes(suite.id)) plan.suiteIds.push(suite.id); plan.updatedAt = now(); await persistSuiteArtifacts(db, suite); await save(db); res.json(plan); });
app.delete('/api/plans/:id/suites/:suiteId', async (req, res) => { const db = await store(); const plan = db.plans.find(item => item.id === req.params.id); if (!plan) throw httpError(404, '未找到测试计划', 'PLAN_NOT_FOUND'); plan.suiteIds = plan.suiteIds.filter(id => id !== req.params.suiteId); await save(db); res.json(plan); });
app.post('/api/suites/:id/cases/:caseId', async (req, res) => { const db = await store(); const suite = db.suites.find(item => item.id === req.params.id); const testCase = db.cases.find(item => item.id === req.params.caseId); if (!suite || !testCase) throw httpError(404, '未找到套件或用例', 'SUITE_OR_CASE_NOT_FOUND'); if (!suite.caseIds.includes(testCase.id)) suite.caseIds.push(testCase.id); suite.updatedAt = now(); await persistSuiteArtifacts(db, suite); await save(db); res.json(suite); });
app.delete('/api/suites/:id/cases/:caseId', async (req, res) => { const db = await store(); const suite = db.suites.find(item => item.id === req.params.id); if (!suite) throw httpError(404, '未找到测试套件', 'SUITE_NOT_FOUND'); suite.caseIds = suite.caseIds.filter(id => id !== req.params.caseId); await save(db); res.json(suite); });

app.post('/api/flows', async (req, res) => { const db = await store(); const flow = { id: randomUUID(), name: String(req.body.name || '新公共流程'), description: String(req.body.description || ''), parameters: Array.isArray(req.body.parameters) ? req.body.parameters : [], safety: req.body.safety || 'normal', defaults: normalizeRuntimeSettings(req.body.defaults), steps: Array.isArray(req.body.steps) ? req.body.steps : [], version: 1, revisions: [], sources: {}, createdAt: now(), updatedAt: now() }; validateMappings(flow.defaults.proxy); db.flows.push(flow); await persistFlowArtifacts(db, flow, true); await save(db); res.status(201).json(flow); });
app.put('/api/flows/:id', async (req, res) => { const db = await store(); const index = db.flows.findIndex(item => item.id === req.params.id); if (index < 0) throw httpError(404, '未找到公共流程', 'FLOW_NOT_FOUND'); const old = db.flows[index]; const nextDefaults = normalizeRuntimeSettings(req.body.defaults ?? old.defaults); validateMappings(nextDefaults.proxy); const changed = JSON.stringify({ steps: old.steps, parameters: old.parameters, safety: old.safety, defaults: old.defaults }) !== JSON.stringify({ steps: req.body.steps ?? old.steps, parameters: req.body.parameters ?? old.parameters, safety: req.body.safety ?? old.safety, defaults: nextDefaults }); const revisions = [...(old.revisions || [])]; if (changed) revisions.push({ version: old.version, steps: old.steps, parameters: old.parameters, safety: old.safety, defaults: old.defaults, sources: old.sources, savedAt: old.updatedAt }); const flow = { ...old, ...req.body, defaults: nextDefaults, id: old.id, createdAt: old.createdAt, version: changed ? old.version + 1 : old.version, revisions, updatedAt: now() }; if (!Array.isArray(flow.steps) || !Array.isArray(flow.parameters)) throw httpError(400, '公共流程步骤和参数必须是数组', 'INVALID_FLOW'); db.flows[index] = flow; await persistFlowArtifacts(db, flow, changed); await save(db); res.json(flow); });
app.delete('/api/flows/:id', async (req, res) => { const db = await store(); const used = [...db.cases.flatMap(item => [...item.setupSteps, ...item.steps, ...item.teardownSteps]), ...db.suites.flatMap(item => [...item.setupSteps, ...item.teardownSteps])].some(step => step.kind === 'flowCall' && step.flowId === req.params.id); if (used) throw httpError(409, '公共流程仍被套件或用例引用，不能删除', 'FLOW_IN_USE'); db.flows = db.flows.filter(item => item.id !== req.params.id); await save(db); res.status(204).end(); });

app.post('/api/cases', async (req, res) => { const db = await store(); const testCase = { ...defaultCase(req.body.name), editorMode: req.body.editorMode || 'visual' }; db.cases.push(testCase); await persistSources(db, testCase, true); await save(db); res.status(201).json(testCase); });
app.put('/api/cases/:id', async (req, res) => {
  const db = await store(); const index = db.cases.findIndex(x => x.id === req.params.id); if (index < 0) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const old = db.cases[index];
  if (Number(req.body.version) !== Number(old.version)) return res.status(409).json({ error: '该用例已被更新。已加载最新版本，请确认后重新保存。', code: 'VERSION_CONFLICT', currentVersion: old.version });
  const next = { ...old, ...req.body, id: old.id, createdAt: old.createdAt, version: old.version + 1, updatedAt: now() }; if (!Array.isArray(next.steps)) throw httpError(400, '步骤数据格式错误：steps 必须是数组', 'INVALID_STEPS'); validateMappings(next.defaults?.proxy);
  db.cases[index] = next; await persistSources(db, next, Boolean(req.body.regenerateSources)); await save(db); res.json(next);
});
app.delete('/api/cases/:id', async (req, res) => { const db = await store(); db.cases = db.cases.filter(x => x.id !== req.params.id); db.plans.forEach(p => { p.caseIds = (p.caseIds || []).filter(id => id !== req.params.id); }); db.suites.forEach(suite => { suite.caseIds = suite.caseIds.filter(id => id !== req.params.id); }); await save(db); res.status(204).end(); });
app.get('/api/cases/:id/source', async (req, res) => { const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const language = req.query.language === 'python' ? 'python' : 'javascript'; if (!testCase.sources?.[language]) await persistSources(db, testCase, true); await save(db); res.json({ language, code: testCase.sources[language], files: testCase.sourceFiles || [] }); });
app.put('/api/cases/:id/source', async (req, res) => {
  const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const language = req.body.language === 'python' ? 'python' : 'javascript'; const code = String(req.body.code || ''); if (!code.trim()) throw httpError(400, '代码不能为空', 'EMPTY_SOURCE'); testCase.sources ||= {}; let sync;
  if (language === 'javascript') {
    const javascript = code.replaceAll("'@playwright/test'", "'playwright/test'").replaceAll('"@playwright/test"', '"playwright/test"'); const parsed = parseCodegenPhases(javascript); const steps = parsed.steps; const candidates = javascript.split('\n').filter(line => /await\s+(page\.|expect\()/.test(line)).length;
    testCase.sources.javascript = javascript; testCase.editorMode = 'code';
    if (steps.length || parsed.setup.length || parsed.teardown.length) { testCase.steps = steps; if (parsed.embedded) { testCase.setupSteps = parsed.setup; testCase.teardownSteps = parsed.teardown; } testCase.sources.python = generatePythonAdvanced(testCase); const total = parsed.setup.length + steps.length + parsed.teardown.length; sync = { direction: 'javascript-to-visual-and-python', stepCount: total, warning: candidates > total ? `有 ${candidates - total} 行复杂 JavaScript 无法转换为无代码步骤；完整 JavaScript 已保留。` : null }; }
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
  else if (/ERR_ABORTED/i.test(text) && /(?:about:blank|chrome-error:\/\/chromewebdata)/i.test(`${text} ${url}`)) { category = '网络出口或代理未建立'; cause = '首个页面还没有打开导航就被取消，当前页仍是空白页或 Chrome 错误页。这通常是目标站无法直连，或流程没有使用正确的代理。'; suggestion = '在“编辑信息 → 独立录制/回放配置”选择代理并填写服务器；先确认代理可用，再重试。加长元素等待无法解决这类建连失败。'; }
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
  if (ready.type === 'elementAuto' || ready.type === 'elementVisible') return playwrightExpect(target).toBeVisible({ timeout });
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
  switch (step.action) { case 'goto': { const destination = interpolate(step.url || value, data); const navigationTimeout = Number(step.timeoutMs || settings.navigationTimeoutMs || 30000); try { return await page.goto(destination, { waitUntil: step.waitUntil || 'domcontentloaded', timeout: navigationTimeout }); } catch (error) { if (!/ERR_ABORTED/i.test(error.message)) throw error; const expected = interpolate(step.expectedUrl || '', data); await page.waitForTimeout(500).catch(() => {}); const actual = page.url(); const sameTarget = (() => { try { return new URL(actual).origin === new URL(destination).origin; } catch { return false; } })(); const expectedReached = expected && new RegExp(expected).test(actual); if (sameTarget || expectedReached) return { navigationRecovered: true, actualUrl: actual }; error.message = `登录或连续跳转替换了原导航。目标：${destination}；实际到达：${actual}。请配置“期望 URL”或在下一步等待登录页元素。\n${error.message}`; throw error; } } case 'click': return target.click({ timeout }); case 'dblclick': return target.dblclick({ timeout }); case 'hover': return target.hover({ timeout }); case 'focus': return target.focus({ timeout }); case 'fill': return target.fill(value, { timeout }); case 'clear': return target.clear({ timeout }); case 'type': return target.pressSequentially(value, { timeout }); case 'check': return target.check({ timeout }); case 'uncheck': return target.uncheck({ timeout }); case 'selectOption': return target.selectOption(value, { timeout }); case 'press': return target.press(value, { timeout }); case 'waitForVisible': return target.waitFor({ state: 'visible', timeout }); case 'waitForHidden': return target.waitFor({ state: 'hidden', timeout }); case 'waitForURL': return page.waitForURL(value, { timeout }); case 'reload': return page.reload({ waitUntil: 'domcontentloaded', timeout: Number(step.timeoutMs || settings.navigationTimeoutMs || 30000) }); case 'back': return page.goBack({ waitUntil: 'domcontentloaded', timeout: Number(step.timeoutMs || settings.navigationTimeoutMs || 30000) }); case 'forward': return page.goForward({ waitUntil: 'domcontentloaded', timeout: Number(step.timeoutMs || settings.navigationTimeoutMs || 30000) }); case 'waitForTimeout': return page.waitForTimeout(Number(value)); case 'waitForLoadState': return page.waitForLoadState(value || 'domcontentloaded', { timeout }); default: throw new Error(`暂不支持操作：${step.action}`); }
}
function isTransientFailure(error) { return /Timeout|ERR_(?:NETWORK_CHANGED|CONNECTION_RESET|CONNECTION_CLOSED|PROXY_CONNECTION_FAILED|TIMED_OUT|NAME_NOT_RESOLVED)|HTTP\s(?:408|429|5\d\d)|接口状态错误.*HTTP\s5\d\d/i.test(String(error?.message || error)); }
function effectiveRetry(step) { const config = retryConfig(step); const sideEffect = ['click', 'dblclick', 'clickAndWaitForResponse', 'check', 'uncheck', 'press'].includes(step.action); if (step.retryPolicy?.idempotency === 'never' || (step.retryPolicy?.idempotency === 'auto' && sideEffect)) config.attempts = 1; return config; }
async function recoverPage(page, recovery) { if (recovery === 'reload') await page.reload({ waitUntil: 'domcontentloaded' }); else if (recovery === 'reopen') await page.goto(page.url(), { waitUntil: 'domcontentloaded' }); }

function flowSnapshot(flow, version) { if (!version || Number(version) === Number(flow.version)) return flow; const revision = (flow.revisions || []).find(item => Number(item.version) === Number(version)); if (!revision) throw httpError(409, `公共流程“${flow.name}”的固定版本 v${version} 不存在`, 'FLOW_VERSION_NOT_FOUND'); return { ...flow, ...revision }; }
function expandSteps(db, steps, data, stack = [], phase = 'steps') {
  const expanded = [];
  for (const step of steps || []) {
    if (step.kind !== 'flowCall') { expanded.push({ step, data, phase, source: null }); continue; }
    const flow = db.flows.find(item => item.id === step.flowId); if (!flow) throw httpError(404, `公共流程不存在或已删除：${step.flowId}`, 'FLOW_NOT_FOUND'); if (stack.includes(flow.id)) throw httpError(400, `公共流程存在循环调用：${[...stack, flow.id].join(' → ')}`, 'FLOW_CYCLE');
    const snapshot = flowSnapshot(flow, step.flowVersion); const parameters = Object.fromEntries(Object.entries(step.params || {}).map(([key, value]) => [key, interpolate(value, data)])); const flowData = { ...data, ...parameters }; const children = expandSteps(db, snapshot.steps, flowData, [...stack, flow.id], phase);
    for (const child of children) { const operation = child.step.action; const destructive = snapshot.safety === 'destructive' || ['clickAndWaitForResponse'].includes(operation); const protectedStep = destructive ? { ...child.step, retryPolicy: { ...(child.step.retryPolicy || {}), idempotency: 'never', maxAttempts: 1 } } : child.step; expanded.push({ ...child, step: protectedStep, source: { flowId: flow.id, flowName: flow.name, flowVersion: snapshot.version } }); }
  }
  return expanded;
}

async function executeVisualCase(db, testCase, input = {}) {
  const runId = randomUUID(); const runDir = join(artifactsDir, runId); await mkdir(runDir, { recursive: true }); const settings = { ...testCase.defaults, ...input }; const complianceEnabled = Boolean(testCase.compliance?.enabled); const engine = complianceEnabled ? chromium : browserEngines[settings.browser];
  if (!engine) throw httpError(400, '真实 Safari 需要 Selenium SafariDriver；当前支持 Chromium、Firefox 和 WebKit。', 'UNSUPPORTED_BROWSER');
  const proxy = settings.proxy?.mode === 'proxy' && settings.proxy.server ? { server: settings.proxy.server, username: settings.proxy.username || undefined, password: settings.proxy.password || undefined, bypass: settings.proxy.bypass || undefined } : undefined;
  const started = Date.now(); const result = { id: runId, scope: input.scope || 'case', caseId: testCase.id, caseName: testCase.name, suiteId: input.suiteId || null, suiteName: input.suiteName || null, planId: input.planId || null, startedAt: now(), status: 'running', flaky: false, sessionIsolation: input.storageState ? 'suite-setup-snapshot' : 'clean-new-context', steps: [], phases: { setup: [], steps: [], teardown: [] }, networkIssues: [], artifactPath: `/artifacts/${runId}` };
  let browser; let context; let page;
  try {
    const mappings = activeMappings(settings.proxy); const launchOptions = { headless: input.headless !== false, proxy, env: processEnvForNetwork(Boolean(proxy)), ...(!proxy && engine === chromium ? { args: ['--no-proxy-server'] } : {}), ...(complianceEnabled ? { channel: 'chrome' } : {}) }; const allowPersistent = settings.session?.mode === 'persistent'; const auth = compliancePaths(testCase); const contextOptions = { locale: settings.locale || 'zh-CN', recordVideo: { dir: runDir }, ...(mappings.length ? { serviceWorkers: 'block' } : {}), ...(input.storageState ? { storageState: input.storageState } : allowPersistent && existsSync(auth.storagePath) ? { storageState: auth.storagePath } : {}) };
    browser = await engine.launch(launchOptions); context = await browser.newContext(contextOptions); await installMappings(context, settings.proxy); await context.tracing.start({ screenshots: true, snapshots: true }); page = await context.newPage(); page.on('response', response => { if (response.status() >= 400) result.networkIssues.push({ type: 'http', method: response.request().method(), url: response.url(), status: response.status(), at: now() }); }); page.on('requestfailed', request => result.networkIssues.push({ type: 'requestfailed', method: request.method(), url: request.url(), error: request.failure()?.errorText || 'request failed', at: now() }));
    const baseData = { ...testCase.data, ...(input.data || {}) }; let primaryFailed = false;
    const runPhase = async (phase, sourceSteps) => { let phaseFailed = false; const expanded = expandSteps(db, sourceSteps, baseData, [], phase); for (const entry of expanded) { const step = entry.step; const index = result.steps.length; const policy = effectiveRetry(step); const record = { id: step.id, index, phase, source: entry.source, title: stepTitle(step, index), operation: step.action || step.assertion, locator: step.locator?.primary || null, readiness: step.readiness || null, retryPolicy: policy, status: 'passed', attempts: 0, attemptLog: [], startedAt: now() };
        for (let attempt = 1; attempt <= policy.attempts; attempt += 1) { record.attempts = attempt; const attemptStarted = Date.now(); try { const outcome = await executeStep(page, step, entry.data, settings.stability || {}); if (outcome?.navigationRecovered) { record.navigationRecovered = true; record.actualUrl = outcome.actualUrl; result.flaky = true; } record.attemptLog.push({ attempt, status: 'passed', durationMs: Date.now() - attemptStarted }); if (attempt > 1) { record.recovered = true; result.flaky = true; } break; } catch (error) { record.error = redact(error.message, [settings.proxy?.password]); const siteBlocked = await detectSiteBlock(page); const canRetry = attempt < policy.attempts && !siteBlocked && isTransientFailure(error); record.attemptLog.push({ attempt, status: 'failed', durationMs: Date.now() - attemptStarted, error: record.error, recovery: canRetry ? policy.recovery : 'none' }); if (canRetry) { const delay = policy.backoff === 'exponential' ? policy.baseDelayMs * (2 ** (attempt - 1)) : policy.baseDelayMs; if (delay) await page.waitForTimeout(delay); await recoverPage(page, policy.recovery).catch(recoveryError => { record.attemptLog.at(-1).recoveryError = recoveryError.message; }); continue; } const shot = `failure-${phase}-${index + 1}.png`; await page.screenshot({ path: join(runDir, shot), fullPage: true }).catch(() => {}); record.diagnostic = siteBlocked ? blockedDiagnostic(step, index, page.url(), record.error) : diagnose(record.error, step, index, page.url()); record.diagnostic.phase = phase; record.diagnostic.networkIssues = result.networkIssues.slice(-10); record.artifacts = { screenshot: `${result.artifactPath}/${shot}`, trace: `${result.artifactPath}/trace.zip` }; if (step.continueOnError) { record.status = 'warning'; break; } record.status = 'failed'; phaseFailed = true; if (!primaryFailed) { primaryFailed = true; result.error = record.error; result.diagnostic = record.diagnostic; result.failedStepIndex = index; } break; } }
        record.finishedAt = now(); result.steps.push(record); result.phases[phase].push(record); if (phaseFailed) break; }
      return !phaseFailed; };
    const setupPassed = await runPhase('setup', testCase.setupSteps); if (setupPassed) await runPhase('steps', testCase.steps); await runPhase('teardown', testCase.teardownSteps); result.status = primaryFailed ? 'failed' : 'passed'; result.networkIssues = result.networkIssues.slice(-25); if (input.captureStorageState) result.finalStorageState = await context.storageState();
  } catch (error) { result.status = 'failed'; result.error ||= redact(error.message, [settings.proxy?.password]); if (!result.diagnostic) result.diagnostic = diagnose(result.error, { action: 'launch', value: settings.browser }, -1, page?.url?.() || settings.baseUrl || ''); }
  finally {
    if (context) { await context.tracing.stop({ path: join(runDir, 'trace.zip') }).catch(() => {}); const video = page?.video(); await context.close().catch(() => {}); if (video) { const path = await video.path().catch(() => null); if (path) result.video = `${result.artifactPath}/${basename(path)}`; } }
    await browser?.close().catch(() => {}); result.finishedAt = now(); result.durationMs = Date.now() - started; const failure = (await readdir(runDir).catch(() => [])).find(name => name.startsWith('failure-')); result.artifacts = { screenshot: failure ? `${result.artifactPath}/${failure}` : null, trace: existsSync(join(runDir, 'trace.zip')) ? `${result.artifactPath}/trace.zip` : null, video: result.video || null };
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
  const proxySettings = input.proxy || testCase.defaults.proxy; const proxy = proxySettings?.mode === 'proxy' && proxySettings.server ? { server: proxySettings.server, username: proxySettings.username || undefined, password: proxySettings.password || undefined, bypass: proxySettings.bypass || undefined } : undefined;
  const playwrightTestUrl = pathToFileURL(join(root, 'node_modules', 'playwright', 'test.mjs')).href; const runnablePath = join(runDir, 'runnable.spec.mjs'); let runnableSource = testCase.sources.javascript.replace(/(['"])playwright\/test\1/g, JSON.stringify(playwrightTestUrl)).replace(/(['"])@playwright\/test\1/g, JSON.stringify(playwrightTestUrl)); const mappingBootstrap = codeMappingBootstrap(testCase.defaults.proxy); if (mappingBootstrap) { const firstBreak = runnableSource.indexOf('\n'); runnableSource = `${runnableSource.slice(0, firstBreak + 1)}\n${mappingBootstrap}\n${runnableSource.slice(firstBreak + 1)}`; } await writeFile(runnablePath, runnableSource);
  const auth = compliancePaths(testCase); const mappings = activeMappings(testCase.defaults.proxy); const stability = testCase.defaults.stability || {}; const estimatedTimeout = (testCase.steps || []).reduce((sum, step) => { const policy = retryConfig(step); return sum + Number(step.timeoutMs || stability.actionTimeoutMs || 10000) * policy.attempts + policy.baseDelayMs * Math.max(0, policy.attempts - 1); }, 0); const testTimeout = Math.max(30000, Number(testCase.defaults.timeoutMs || 0), estimatedTimeout); const storageState = input.storageState || (testCase.defaults.session?.mode === 'persistent' && existsSync(auth.storagePath) ? auth.storagePath : null); const configPath = join(runDir, 'playwright.config.mjs'); const config = `import { defineConfig } from ${JSON.stringify(playwrightTestUrl)};\nexport default defineConfig({ testDir: ${JSON.stringify(runDir)}, testMatch: ${JSON.stringify(basename(runnablePath))}, timeout: ${testTimeout}, expect: { timeout: ${Number(stability.assertionTimeoutMs || 10000)} }, outputDir: ${JSON.stringify(join(runDir, 'results'))}, reporter: 'line', use: { browserName: ${JSON.stringify(browserName)}, headless: ${input.headless !== false}, locale: ${JSON.stringify(testCase.defaults.locale || 'zh-CN')}, actionTimeout: ${Number(stability.actionTimeoutMs || 10000)}, navigationTimeout: ${Number(stability.navigationTimeoutMs || 30000)}, trace: 'on', video: 'on', screenshot: 'only-on-failure'${mappings.length ? `, serviceWorkers: 'block'` : ''}${complianceEnabled ? `, channel: 'chrome'` : ''}${storageState ? `, storageState: ${JSON.stringify(storageState)}` : ''}${proxy ? `, proxy: ${JSON.stringify(proxy)}` : ''} } });\n`;
  await writeFile(configPath, config); const started = Date.now(); const result = { id: runId, scope: 'case', mode: 'code', caseId: testCase.id, caseName: testCase.name, planId: input.planId || null, startedAt: now(), status: 'running', steps: [], artifactPath: `/artifacts/${runId}` };
  const processResult = await runProcess('npx', ['playwright', 'test', '--config', configPath], { cwd: root, env: { ...processEnvForNetwork(Boolean(proxy)), CI: '1', WTR_TEST_DATA: JSON.stringify({ ...testCase.data, ...(input.data || {}) }) } }); const output = redact(`${processResult.stdout}\n${processResult.stderr}`.trim(), [proxy?.password]); const files = await findArtifacts(runDir); const screenshot = files.find(x => /test-failed.*\.png$|failure\.png$/i.test(x)); const video = files.find(x => /video\.(webm|mp4)$/i.test(x)); const trace = files.find(x => /trace\.zip$/i.test(x));
  result.status = processResult.code === 0 ? 'passed' : 'failed'; result.finishedAt = now(); result.durationMs = Date.now() - started; result.artifacts = { screenshot: screenshot ? `${result.artifactPath}/${screenshot}` : null, video: video ? `${result.artifactPath}/${video}` : null, trace: trace ? `${result.artifactPath}/${trace}` : null };
  if (result.status === 'passed') { const retries = (output.match(/\[WTR_RETRY\]/g) || []).length; result.flaky = retries > 0; result.steps = [{ id: 'code', index: 0, title: 'Playwright JavaScript 测试', operation: 'code', status: 'passed', attempts: retries + 1, recovered: retries > 0, attemptLog: retries ? [{ status: 'recovered', retries }] : [] }]; }
  else {
    const location = output.match(/runnable\.spec\.mjs:(\d+):(\d+)/); const line = Number(location?.[1] || 0); const sourceLines = testCase.sources.javascript.split('\n'); const failedSource = line ? sourceLines[line - 1]?.trim() : ''; const pseudoStep = { action: 'code', value: line ? `第 ${line} 行` : 'Playwright 测试' }; const diag = diagnose(output, pseudoStep, 0, testCase.defaults.baseUrl || ''); diag.title = line ? `代码第 ${line} 行执行失败` : 'JavaScript 测试执行失败'; diag.cause = failedSource ? `失败代码：${failedSource}` : diag.cause; diag.suggestion = `${diag.suggestion} 可在“代码编辑”中修改后重新保存。`; diag.technical = output; result.error = output.split('\n').find(x => /Error:|Timeout|ERR_/i.test(x))?.trim() || 'Playwright 代码执行失败'; result.failedStepIndex = 0; result.diagnostic = diag; result.steps = [{ id: 'code', index: 0, title: diag.title, operation: 'code', status: 'failed', attempts: 1, diagnostic: diag, artifacts: result.artifacts }];
  }
  return result;
}
async function executeCase(db, testCase, input) { return testCase.editorMode === 'code' ? executeCodeCase(db, testCase, input) : executeVisualCase(db, testCase, input); }

async function executeSuite(db, suite, input = {}) {
  const started = Date.now(); const cases = suite.caseIds.map(id => db.cases.find(item => item.id === id)).filter(Boolean); const defaults = cases[0]?.defaults || defaultCase('套件生命周期').defaults; const base = { ...defaultCase(`${suite.name} 生命周期`), id: `suite-${suite.id}`, defaults, editorMode: 'visual', data: input.data || {} }; const result = { id: randomUUID(), scope: 'suite', suiteId: suite.id, suiteName: suite.name, planId: input.planId || null, startedAt: now(), status: 'running', setupRun: null, caseRuns: [], teardownRun: null, summary: { total: cases.length, passed: 0, failed: 0, skipped: 0 } };
  let storageState;
  if (suite.setupSteps.length) { result.setupRun = await executeVisualCase(db, { ...base, name: `${suite.name} · Setup`, steps: suite.setupSteps }, { ...input, scope: 'suite-setup', suiteId: suite.id, suiteName: suite.name, captureStorageState: true }); storageState = result.setupRun.finalStorageState; }
  const setupPassed = !result.setupRun || result.setupRun.status === 'passed';
  if (setupPassed) { for (const testCase of cases) { const child = await executeCase(db, testCase, { ...input, planId: input.planId || null, suiteId: suite.id, suiteName: suite.name, storageState }); result.caseRuns.push(child); result.summary[child.status === 'passed' ? 'passed' : 'failed'] += 1; } } else result.summary.skipped = cases.length;
  if (suite.teardownSteps.length) result.teardownRun = await executeVisualCase(db, { ...base, name: `${suite.name} · Teardown`, steps: suite.teardownSteps }, { ...input, scope: 'suite-teardown', suiteId: suite.id, suiteName: suite.name, storageState });
  const lifecycleFailed = result.setupRun?.status === 'failed' || result.teardownRun?.status === 'failed'; result.status = lifecycleFailed || result.summary.failed ? 'failed' : 'passed'; result.finishedAt = now(); result.durationMs = Date.now() - started; result.diagnostic = result.setupRun?.diagnostic || result.caseRuns.find(item => item.status === 'failed')?.diagnostic || result.teardownRun?.diagnostic; return result;
}

app.post('/api/cases/:id/run', async (req, res) => { const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const result = await executeCase(db, testCase, req.body || {}); await recordRun(result); res.status(result.status === 'passed' ? 200 : 422).json(result); });
app.post('/api/suites/:id/phases/:phase/run', async (req, res) => { const db = await store(); const suite = db.suites.find(item => item.id === req.params.id); if (!suite) throw httpError(404, '未找到测试套件', 'SUITE_NOT_FOUND'); const key = req.params.phase === 'setup' ? 'setupSteps' : req.params.phase === 'teardown' ? 'teardownSteps' : null; if (!key) throw httpError(400, 'Suite 阶段必须是 setup 或 teardown', 'INVALID_SUITE_PHASE'); const firstCase = suite.caseIds.map(id => db.cases.find(item => item.id === id)).find(Boolean); const virtual = { ...defaultCase(`${suite.name} · Suite ${req.params.phase === 'setup' ? 'Setup' : 'Teardown'}`), defaults: firstCase?.defaults || defaultCase().defaults, steps: suite[key] }; const result = await executeVisualCase(db, virtual, { ...(req.body || {}), scope: 'suite-phase', suiteId: suite.id, suiteName: suite.name }); result.phaseName = req.params.phase; await recordRun(result); res.status(result.status === 'passed' ? 200 : 422).json(result); });
app.post('/api/flows/:id/run', async (req, res) => { const db = await store(); const flow = db.flows.find(item => item.id === req.params.id); if (!flow) throw httpError(404, '未找到公共流程', 'FLOW_NOT_FOUND'); const virtual = { ...defaultCase(`${flow.name} · 公共流程`), defaults: flow.defaults, steps: flow.steps, data: req.body?.data || {} }; const result = await executeVisualCase(db, virtual, { ...(req.body || {}), scope: 'flow' }); result.flowId = flow.id; result.flowName = flow.name; await recordRun(result); res.status(result.status === 'passed' ? 200 : 422).json(result); });
app.post('/api/suites/:id/run', async (req, res) => { const db = await store(); const suite = db.suites.find(item => item.id === req.params.id); if (!suite) throw httpError(404, '未找到测试套件', 'SUITE_NOT_FOUND'); const result = await executeSuite(db, suite, req.body || {}); await recordRun(result); res.status(result.status === 'passed' ? 200 : 422).json(result); });
app.post('/api/plans/:id/run', async (req, res) => {
  const db = await store(); const plan = db.plans.find(x => x.id === req.params.id); if (!plan) throw httpError(404, '未找到测试计划', 'PLAN_NOT_FOUND'); const started = Date.now(); const suites = plan.suiteIds.map(id => db.suites.find(item => item.id === id)).filter(Boolean); const total = suites.reduce((sum, suite) => sum + suite.caseIds.length, 0); const planRun = { id: randomUUID(), scope: 'plan', planId: plan.id, planName: plan.name, startedAt: now(), status: 'running', suiteRuns: [], caseRuns: [], summary: { total, passed: 0, failed: 0, skipped: 0 } };
  for (const suite of suites) { const suiteRun = await executeSuite(db, suite, { ...(req.body || {}), planId: plan.id }); planRun.suiteRuns.push(suiteRun); planRun.caseRuns.push(...suiteRun.caseRuns); planRun.summary.passed += suiteRun.summary.passed; planRun.summary.failed += suiteRun.summary.failed; planRun.summary.skipped += suiteRun.summary.skipped; }
  planRun.summary.lifecycleFailed = planRun.suiteRuns.filter(item => item.setupRun?.status === 'failed' || item.teardownRun?.status === 'failed').length; planRun.status = planRun.suiteRuns.some(item => item.status === 'failed') ? 'failed' : 'passed'; planRun.finishedAt = now(); planRun.durationMs = Date.now() - started; await recordRun(planRun); res.status(planRun.status === 'passed' ? 200 : 422).json(planRun);
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
function recordingTarget(db, session) {
  if (session.targetType === 'suite') { const owner = db.suites.find(item => item.id === session.targetId); return owner ? { owner, steps: owner[session.phase] || [], label: `${owner.name} · ${session.phase === 'setupSteps' ? 'Suite Setup' : 'Suite Teardown'}` } : null; }
  if (session.targetType === 'flow') { const owner = db.flows.find(item => item.id === session.targetId); return owner ? { owner, steps: owner.steps || [], label: owner.name } : null; }
  const owner = db.cases.find(item => item.id === session.targetId || item.id === session.caseId); return owner ? { owner, steps: owner.steps || [], label: owner.name } : null;
}
async function autoImportRecording(session, overwrite = false) {
  const code = await readFile(session.outputPath, 'utf8');
  if (!code.trim()) throw new Error('录制脚本为空。请确认关闭 Inspector 前至少完成一个页面操作。');
  const db = await store(); const target = recordingTarget(db, session);
  if (!target) throw new Error('录制完成，但对应目标已被删除，无法自动导入。');
  const steps = parseCodegen(code); const javascript = code.replaceAll("'@playwright/test'", "'playwright/test'").replaceAll('"@playwright/test"', '"playwright/test"');
  if (!steps.length) throw new Error('没有识别到可导入的无代码步骤；完整脚本未覆盖原数据。');
  if (target.steps.length && !overwrite) { const error = new Error(`“${target.label}”已有 ${target.steps.length} 个步骤，确认后才会覆盖。`); error.code = 'OVERWRITE_CONFIRMATION_REQUIRED'; error.stepCount = steps.length; error.existingStepCount = target.steps.length; throw error; }
  const virtualCase = { ...defaultCase(target.label), defaults: target.owner.defaults || defaultCase().defaults, steps }; const python = generatePythonAdvanced(virtualCase);
  if (session.targetType === 'suite') { target.owner[session.phase] = steps; target.owner.sources ||= { setupSteps: {}, teardownSteps: {} }; target.owner.sources[session.phase] = { javascript, python }; target.owner.updatedAt = now(); await persistSuiteArtifacts(db, target.owner); }
  else if (session.targetType === 'flow') { target.owner.revisions.push({ version: target.owner.version, steps: target.owner.steps, parameters: target.owner.parameters, safety: target.owner.safety, defaults: target.owner.defaults, sources: target.owner.sources, savedAt: target.owner.updatedAt }); target.owner.version += 1; target.owner.steps = steps; target.owner.sources = { javascript, python }; target.owner.updatedAt = now(); await persistFlowArtifacts(db, target.owner); }
  else { const testCase = target.owner; testCase.steps = steps; testCase.sources = { ...(testCase.sources || {}), javascript, python: generatePythonAdvanced({ ...testCase, steps }) };
  testCase.editorMode = 'code'; testCase.codeLanguage = 'javascript'; testCase.compliance = { ...defaultCompliance(), ...testCase.compliance, enabled: session.complianceMode, policyConfirmed: session.complianceMode ? true : testCase.compliance?.policyConfirmed, lastRecordedAt: now(), storageStateSaved: Boolean(session.persistSession && existsSync(session.authPaths.storagePath)) };
  testCase.version += 1; testCase.updatedAt = now(); await persistSources(db, testCase); }
  await save(db); return { autoImported: true, stepCount: steps.length, targetType: session.targetType, targetId: session.targetId, phase: session.phase, sourceFiles: target.owner.sourceFiles || [] };
}
async function completeRecordingSession(session, exitCode, launchError) {
  if (['completed', 'failed'].includes(session.status)) return;
  session.finishedAt = now(); session.loginStateSaved = Boolean(session.persistSession && existsSync(session.authPaths.storagePath));
  if (launchError || exitCode !== 0) { session.status = 'failed'; session.message = launchError ? `录制浏览器启动失败：${launchError.message}` : `录制窗口异常关闭（退出码 ${exitCode}），没有修改测试用例。`; session.error = launchError?.message || `codegen exited with ${exitCode}`; if (session.temporaryProfile) await rm(session.temporaryProfile, { recursive: true, force: true }).catch(() => {}); return; }
  try { Object.assign(session, await autoImportRecording(session)); session.status = 'completed'; session.message = `录制脚本、Python 和 ${session.stepCount} 个无代码步骤已自动导入。`; }
  catch (error) { if (error.code === 'OVERWRITE_CONFIRMATION_REQUIRED') { session.status = 'awaiting-overwrite-confirmation'; session.message = error.message; session.pendingStepCount = error.stepCount; session.existingStepCount = error.existingStepCount; } else { session.status = 'failed'; session.message = `录制已结束，但自动导入失败：${error.message}`; session.error = error.message; } }
  finally { if (session.temporaryProfile) await rm(session.temporaryProfile, { recursive: true, force: true }).catch(() => {}); }
}
app.get('/api/recording-sessions/:id', (req, res) => { const session = recordingSessions.get(req.params.id); if (!session) throw httpError(404, '未找到录制会话', 'RECORDING_SESSION_NOT_FOUND'); res.json(publicRecordingSession(session)); });
app.post('/api/recording-sessions/:id/confirm-import', async (req, res) => { const session = recordingSessions.get(req.params.id); if (!session) throw httpError(404, '未找到录制会话', 'RECORDING_SESSION_NOT_FOUND'); if (session.status !== 'awaiting-overwrite-confirmation') throw httpError(409, '当前录制不需要覆盖确认', 'RECORDING_CONFIRMATION_NOT_REQUIRED'); if (req.body.overwrite !== true) { session.status = 'canceled'; session.message = '用户取消覆盖，原步骤和代码保持不变。'; return res.json(publicRecordingSession(session)); } try { Object.assign(session, await autoImportRecording(session, true)); session.status = 'completed'; session.message = `已确认覆盖，并导入代码、Python 和 ${session.stepCount} 个无代码步骤。`; } catch (error) { session.status = 'failed'; session.error = error.message; session.message = `覆盖导入失败：${error.message}`; } res.json(publicRecordingSession(session)); });
async function startStructuredRecording({ targetType, targetId, phase = null, name, defaults }, body = {}) {
  const browser = body.browser || defaults.browser || 'chromium'; if (!['chromium', 'chrome', 'firefox', 'webkit'].includes(browser)) throw httpError(400, '录制支持 Chromium、Firefox、WebKit。', 'UNSUPPORTED_BROWSER');
  const sessionId = randomUUID(); const out = join(recordingsDir, `${safeFile(name)}-${Date.now()}.spec.js`); const args = ['playwright', 'codegen', '--target', 'playwright-test', '--output', out, '--lang', body.locale || defaults.locale || 'zh-CN']; if (browser !== 'chromium') args.push('--browser', browser); const proxy = body.proxy || defaults.proxy; if (proxy?.mode === 'proxy' && proxy.server) { args.push('--proxy-server', proxy.server); if (proxy.bypass) args.push('--proxy-bypass', proxy.bypass); } if (body.url || defaults.baseUrl) args.push(body.url || defaults.baseUrl);
  const session = { id: sessionId, targetType, targetId, phase, status: 'waiting-for-user', dryRun: process.env.RECORD_DRY_RUN === '1', complianceMode: false, persistSession: false, useConfiguredProxy: Boolean(proxy?.mode === 'proxy' && proxy.server), startedAt: now(), outputPath: out, authPaths: null, debugArgs: args, outputFile: relative(root, out), message: `${name} 录制窗口已打开。完成后关闭 Inspector，代码和无代码步骤将自动导入。` }; recordingSessions.set(sessionId, session);
  if (process.env.RECORD_DRY_RUN !== '1') { const child = spawn('npx', args, { cwd: root, detached: true, stdio: 'ignore', env: processEnvForNetwork(session.useConfiguredProxy) }); session.pid = child.pid; child.once('error', error => completeRecordingSession(session, null, error)); child.once('exit', code => completeRecordingSession(session, code)); child.unref(); }
  return publicRecordingSession(session);
}
app.post('/api/suites/:id/phases/:phase/record', async (req, res) => { const db = await store(); const suite = db.suites.find(item => item.id === req.params.id); if (!suite) throw httpError(404, '未找到测试套件', 'SUITE_NOT_FOUND'); const phase = req.params.phase === 'setup' ? 'setupSteps' : req.params.phase === 'teardown' ? 'teardownSteps' : null; if (!phase) throw httpError(400, 'Suite 阶段必须是 setup 或 teardown', 'INVALID_SUITE_PHASE'); const firstCase = suite.caseIds.map(id => db.cases.find(item => item.id === id)).find(Boolean); const defaults = firstCase?.defaults || defaultCase().defaults; res.status(202).json(await startStructuredRecording({ targetType: 'suite', targetId: suite.id, phase, name: `${suite.name}-${req.params.phase}`, defaults }, req.body || {})); });
app.post('/api/flows/:id/record', async (req, res) => { const db = await store(); const flow = db.flows.find(item => item.id === req.params.id); if (!flow) throw httpError(404, '未找到公共流程', 'FLOW_NOT_FOUND'); res.status(202).json(await startStructuredRecording({ targetType: 'flow', targetId: flow.id, name: flow.name, defaults: flow.defaults }, req.body || {})); });
app.post('/api/cases/:id/record', async (req, res) => {
  const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const complianceMode = Boolean(req.body.complianceMode); const browser = complianceMode ? 'chromium' : (req.body.browser || testCase.defaults.browser || 'chromium');
  if (!['chromium', 'chrome', 'firefox', 'webkit'].includes(browser)) throw httpError(400, '录制支持 Chromium、Firefox、WebKit；真实 Safari 请使用 Selenium 适配器。', 'UNSUPPORTED_BROWSER');
  if (complianceMode && !(req.body.policyConfirmed || testCase.compliance?.policyConfirmed)) throw httpError(400, '请先确认该目标环境已授权自动化测试。', 'COMPLIANCE_CONFIRMATION_REQUIRED');
  const sessionId = randomUUID(); const out = join(recordingsDir, `${safeFile(testCase.name)}-${Date.now()}.spec.js`); const args = ['playwright', 'codegen', '--target', 'playwright-test', '--output', out, '--lang', req.body.locale || testCase.defaults.locale || 'zh-CN']; const paths = compliancePaths(testCase); const persistSession = Boolean(req.body.persistSession || testCase.defaults.session?.mode === 'persistent'); let temporaryProfile;
  if (complianceMode) { const profile = persistSession ? paths.profileDir : join(profilesDir, '_sessions', sessionId); await mkdir(profile, { recursive: true }); args.push('--channel', 'chrome', '--user-data-dir', profile); if (persistSession) { args.push('--save-storage', paths.storagePath); if (existsSync(paths.storagePath)) args.push('--load-storage', paths.storagePath); } else temporaryProfile = profile; }
  else if (browser !== 'chromium') args.push('--browser', browser);
  const proxy = req.body.proxy || testCase.defaults.proxy; if (proxy?.mode === 'proxy' && proxy.server) { args.push('--proxy-server', proxy.server); if (proxy.bypass) args.push('--proxy-bypass', proxy.bypass); }
  if (req.body.url) args.push(req.body.url); const session = { id: sessionId, targetType: 'case', targetId: testCase.id, caseId: testCase.id, status: 'waiting-for-user', dryRun: process.env.RECORD_DRY_RUN === '1', complianceMode, persistSession, temporaryProfile, useConfiguredProxy: Boolean(proxy?.mode === 'proxy' && proxy.server), startedAt: now(), manualVerification: complianceMode, outputPath: out, authPaths: paths, debugArgs: args, outputFile: relative(root, out), profile: complianceMode ? (persistSession ? `data/profiles/${safeFile(testCase.id)}` : '临时隔离 Profile（结束后删除）') : null, loginState: complianceMode && persistSession ? `data/auth/${safeFile(testCase.id)}.json` : null, message: complianceMode ? `正式 Chrome 已打开，使用${persistSession ? '显式持久化' : '全新临时'}会话。手工完成登录或 CAPTCHA 后继续；完成后关闭 Inspector（无需 Save）。` : '录制窗口已打开，使用全新临时会话。完成后关闭 Inspector（无需 Save），脚本会自动导入代码编辑器。' };
  recordingSessions.set(sessionId, session);
  if (process.env.RECORD_DRY_RUN !== '1') {
    const child = spawn('npx', args, { cwd: root, detached: true, stdio: 'ignore', env: processEnvForNetwork(session.useConfiguredProxy) }); session.pid = child.pid; child.once('error', error => { completeRecordingSession(session, null, error); }); child.once('exit', code => { completeRecordingSession(session, code); }); child.unref();
  }
  res.status(202).json(publicRecordingSession(session));
});
app.post('/api/recording-sessions/:id/test-complete', async (req, res) => {
  if (process.env.RECORD_DRY_RUN !== '1') throw httpError(404, '未找到接口', 'NOT_FOUND'); const session = recordingSessions.get(req.params.id); if (!session) throw httpError(404, '未找到录制会话', 'RECORDING_SESSION_NOT_FOUND'); await writeFile(session.outputPath, String(req.body.code || '')); await completeRecordingSession(session, Number(req.body.exitCode || 0)); res.json(publicRecordingSession(session));
});
app.delete('/api/cases/:id/session-state', async (req, res) => { const db = await store(); const testCase = db.cases.find(item => item.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const paths = compliancePaths(testCase); await Promise.all([rm(paths.profileDir, { recursive: true, force: true }), rm(paths.storagePath, { force: true })]); testCase.compliance.storageStateSaved = false; testCase.updatedAt = now(); await save(db); res.status(204).end(); });
app.get('/api/recordings', async (_req, res) => { const files = await Promise.all((await readdir(recordingsDir)).filter(x => x.endsWith('.spec.js')).map(async name => { const details = await stat(join(recordingsDir, name)); return { name, modifiedAt: details.mtime.toISOString(), size: details.size }; })); res.json(files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))); });
app.post('/api/cases/:id/import-codegen', async (req, res) => { const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const filename = String(req.body.filename || ''); if (!/^[a-zA-Z0-9_.-]+\.spec\.js$/.test(filename)) throw httpError(400, '无效录制文件名', 'INVALID_RECORDING'); const code = await readFile(join(recordingsDir, filename), 'utf8'); const steps = parseCodegen(code); if (!steps.length) throw httpError(400, '没有识别到可导入步骤。请确认 Inspector 已保存完整脚本。', 'NO_STEPS_PARSED'); testCase.steps = req.body.mode === 'append' ? [...testCase.steps, ...steps] : steps; testCase.sources = { javascript: code.replaceAll("'@playwright/test'", "'playwright/test'").replaceAll('"@playwright/test"', '"playwright/test"'), python: generatePythonAdvanced({ ...testCase, steps }) }; testCase.editorMode = 'code'; testCase.codeLanguage = 'javascript'; testCase.version += 1; testCase.updatedAt = now(); await persistSources(db, testCase); await save(db); res.json(caseSummary(testCase)); });

app.use((error, _req, res, _next) => { console.error(error); res.status(error.status || 500).json({ error: error.message || '服务器错误', code: error.code || 'SERVER_ERROR', details: error.details }); });
app.listen(port, () => console.log(`Web Test Recorder: http://localhost:${port}`));
