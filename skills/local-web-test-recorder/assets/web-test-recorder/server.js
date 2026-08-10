import express from 'express';
import { chromium, firefox, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

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
  db.cases.forEach(item => { item.steps ||= []; item.editorMode ||= 'visual'; item.codeLanguage ||= 'javascript'; item.sources ||= {}; item.compliance = { ...defaultCompliance(), ...(item.compliance || {}) }; });
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
  defaults: { browser: 'chromium', baseUrl: '', locale: 'zh-CN', proxy: { mode: 'direct', server: '', username: '', password: '', bypass: '' }, timeoutMs: 10000 },
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
function generateJavascript(testCase) {
  const lines = [`import { test, expect } from 'playwright/test';`, '', `test(${jsString(testCase.name)}, async ({ page }) => {`];
  for (const step of testCase.steps || []) {
    const target = jsLocator(step); const value = step.url ?? step.value ?? step.expected ?? '';
    if (step.kind === 'assertion') {
      if (step.assertion === 'toHaveURL' || step.assertion === 'toHaveTitle') lines.push(`  await expect(page).${step.assertion}(${jsString(value)});`);
      else if (['toBeVisible', 'toBeHidden', 'toBeEnabled', 'toBeDisabled', 'toBeChecked'].includes(step.assertion)) lines.push(`  await expect(${target}).${step.assertion}();`);
      else lines.push(`  await expect(${target}).${step.assertion}(${step.assertion === 'toHaveCount' ? Number(value) : jsString(value)});`);
      continue;
    }
    if (step.action === 'goto') lines.push(`  await page.goto(${jsString(value)});`);
    else if (['reload', 'back', 'forward'].includes(step.action)) lines.push(`  await page.${step.action}();`);
    else if (step.action === 'waitForTimeout') lines.push(`  await page.waitForTimeout(${Number(value) || 0});`);
    else if (step.action === 'waitForURL') lines.push(`  await page.waitForURL(${jsString(value)});`);
    else if (step.action === 'waitForLoadState') lines.push(`  await page.waitForLoadState(${jsString(value || 'domcontentloaded')});`);
    else if (['click', 'dblclick', 'hover', 'focus', 'clear', 'check', 'uncheck'].includes(step.action)) lines.push(`  await ${target}.${step.action}();`);
    else if (step.action === 'type') lines.push(`  await ${target}.pressSequentially(${jsString(value)});`);
    else if (step.action === 'waitForVisible') lines.push(`  await ${target}.waitFor({ state: 'visible' });`);
    else if (step.action === 'waitForHidden') lines.push(`  await ${target}.waitFor({ state: 'hidden' });`);
    else lines.push(`  await ${target}.${step.action}(${jsString(value)});`);
  }
  lines.push('});', ''); return lines.join('\n');
}
function generatePython(testCase) {
  const lines = ['from playwright.sync_api import Page, expect', '', '', `def test_${safeFile(testCase.name).replace(/-/g, '_')}(page: Page):`];
  if (!(testCase.steps || []).length) lines.push('    pass');
  for (const step of testCase.steps || []) {
    const target = pyLocator(step); const value = step.url ?? step.value ?? step.expected ?? '';
    if (step.kind === 'assertion') {
      const map = { toBeVisible: 'to_be_visible', toBeHidden: 'to_be_hidden', toBeEnabled: 'to_be_enabled', toBeDisabled: 'to_be_disabled', toBeChecked: 'to_be_checked', toHaveText: 'to_have_text', toContainText: 'to_contain_text', toHaveValue: 'to_have_value', toHaveCount: 'to_have_count', toHaveURL: 'to_have_url', toHaveTitle: 'to_have_title' };
      const fn = map[step.assertion] || step.assertion; const subject = ['toHaveURL', 'toHaveTitle'].includes(step.assertion) ? 'page' : target;
      const noArg = ['toBeVisible', 'toBeHidden', 'toBeEnabled', 'toBeDisabled', 'toBeChecked'].includes(step.assertion);
      lines.push(`    expect(${subject}).${fn}(${noArg ? '' : step.assertion === 'toHaveCount' ? Number(value) : pyString(value)})`); continue;
    }
    const map = { dblclick: 'dblclick', selectOption: 'select_option', waitForVisible: 'wait_for', waitForHidden: 'wait_for', waitForURL: 'wait_for_url', waitForLoadState: 'wait_for_load_state', waitForTimeout: 'wait_for_timeout' };
    if (step.action === 'goto') lines.push(`    page.goto(${pyString(value)})`);
    else if (['reload', 'back', 'forward'].includes(step.action)) lines.push(`    page.${step.action}()`);
    else if (step.action === 'waitForTimeout') lines.push(`    page.wait_for_timeout(${Number(value) || 0})`);
    else if (step.action === 'waitForURL') lines.push(`    page.wait_for_url(${pyString(value)})`);
    else if (step.action === 'waitForLoadState') lines.push(`    page.wait_for_load_state(${pyString(value || 'domcontentloaded')})`);
    else if (step.action === 'waitForVisible') lines.push(`    ${target}.wait_for(state="visible")`);
    else if (step.action === 'waitForHidden') lines.push(`    ${target}.wait_for(state="hidden")`);
    else if (['click', 'dblclick', 'hover', 'focus', 'clear', 'check', 'uncheck'].includes(step.action)) lines.push(`    ${target}.${map[step.action] || step.action}()`);
    else if (step.action === 'type') lines.push(`    ${target}.press_sequentially(${pyString(value)})`);
    else lines.push(`    ${target}.${map[step.action] || step.action}(${pyString(value)})`);
  }
  lines.push(''); return lines.join('\n');
}
function containingPlans(db, testCase) { return db.plans.filter(plan => plan.caseIds.includes(testCase.id)); }
async function persistSources(db, testCase, regenerate = false) {
  const sources = { ...(testCase.sources || {}) };
  if (regenerate || !sources.javascript) sources.javascript = generateJavascript(testCase);
  if (regenerate || !sources.python) sources.python = generatePython(testCase);
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
  const next = { ...old, ...req.body, id: old.id, createdAt: old.createdAt, version: old.version + 1, updatedAt: now() }; if (!Array.isArray(next.steps)) throw httpError(400, '步骤数据格式错误：steps 必须是数组', 'INVALID_STEPS');
  db.cases[index] = next; await persistSources(db, next, Boolean(req.body.regenerateSources)); await save(db); res.json(next);
});
app.delete('/api/cases/:id', async (req, res) => { const db = await store(); db.cases = db.cases.filter(x => x.id !== req.params.id); db.plans.forEach(p => { p.caseIds = p.caseIds.filter(id => id !== req.params.id); }); await save(db); res.status(204).end(); });
app.get('/api/cases/:id/source', async (req, res) => { const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const language = req.query.language === 'python' ? 'python' : 'javascript'; if (!testCase.sources?.[language]) await persistSources(db, testCase, true); await save(db); res.json({ language, code: testCase.sources[language], files: testCase.sourceFiles || [] }); });
app.put('/api/cases/:id/source', async (req, res) => { const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const language = req.body.language === 'python' ? 'python' : 'javascript'; const code = String(req.body.code || ''); if (!code.trim()) throw httpError(400, '代码不能为空', 'EMPTY_SOURCE'); testCase.sources ||= {}; testCase.sources[language] = language === 'javascript' ? code.replaceAll("'@playwright/test'", "'playwright/test'").replaceAll('"@playwright/test"', '"playwright/test"') : code; testCase.codeLanguage = language; if (language === 'javascript') testCase.editorMode = 'code'; testCase.version += 1; testCase.updatedAt = now(); await persistSources(db, testCase); await save(db); res.json(testCase); });
app.post('/api/cases/:id/generate-source', async (req, res) => { const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); await persistSources(db, testCase, true); testCase.version += 1; testCase.updatedAt = now(); await save(db); res.json(testCase); });

function singleLocator(page, primary) { const value = primary.value; switch (primary.strategy) { case 'role': return page.getByRole(value, primary.name ? { name: primary.name } : undefined); case 'label': return page.getByLabel(value); case 'placeholder': return page.getByPlaceholder(value); case 'text': return page.getByText(value, { exact: Boolean(primary.exact) }); case 'testId': return page.getByTestId(value); case 'altText': return page.getByAltText(value); case 'title': return page.getByTitle(value); case 'xpath': return page.locator(`xpath=${value}`); default: return page.locator(value); } }
function locator(page, source = {}) { const primary = source.primary || source; const candidates = [primary, ...(source.fallbacks || [])]; const locators = candidates.map(candidate => singleLocator(page, candidate)); return locators.slice(1).reduce((combined, candidate) => combined.or(candidate), locators[0]).first(); }
function interpolate(value, data) { return typeof value === 'string' ? value.replace(/\$\{data\.([\w.-]+)\}/g, (_m, key) => String(data[key] ?? '')) : value; }
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

async function executeStep(page, step, data) {
  const timeout = step.timeoutMs || 10000; page.setDefaultTimeout(timeout); const target = step.locator ? locator(page, step.locator) : null; const value = interpolate(step.value, data); const expected = interpolate(step.expected, data);
  if (step.kind === 'assertion') { if (step.assertion === 'toBeVisible') return target.waitFor({ state: 'visible', timeout }); if (step.assertion === 'toBeHidden') return target.waitFor({ state: 'hidden', timeout }); if (step.assertion === 'toHaveText') { const actual = await target.textContent(); if (actual?.trim() !== expected) throw new Error(`断言失败：期望文本“${expected}”，实际“${actual}”`); return; } if (step.assertion === 'toContainText') { const actual = await target.textContent(); if (!actual?.includes(expected)) throw new Error(`断言失败：实际文本未包含“${expected}”`); return; } if (step.assertion === 'toHaveValue') { const actual = await target.inputValue(); if (actual !== expected) throw new Error(`断言失败：期望值“${expected}”，实际“${actual}”`); return; } if (step.assertion === 'toBeEnabled') { if (!(await target.isEnabled())) throw new Error('断言失败：元素不可用'); return; } if (step.assertion === 'toBeDisabled') { if (await target.isEnabled()) throw new Error('断言失败：元素仍可用'); return; } if (step.assertion === 'toBeChecked') { if (!(await target.isChecked())) throw new Error('断言失败：元素未选中'); return; } if (step.assertion === 'toHaveCount') { const actual = await target.count(); if (actual !== Number(expected)) throw new Error(`断言失败：期望 ${expected} 个元素，实际 ${actual}`); return; } if (step.assertion === 'toHaveURL') { if (!(new RegExp(expected)).test(page.url())) throw new Error(`断言失败：URL ${page.url()} 未匹配 ${expected}`); return; } if (step.assertion === 'toHaveTitle') { if (!(new RegExp(expected)).test(await page.title())) throw new Error(`断言失败：页面标题“${await page.title()}”未匹配 ${expected}`); return; } throw new Error(`暂不支持断言：${step.assertion}`); }
  switch (step.action) { case 'goto': return page.goto(interpolate(step.url || value, data), { waitUntil: 'domcontentloaded' }); case 'click': return target.click(); case 'dblclick': return target.dblclick(); case 'hover': return target.hover(); case 'focus': return target.focus(); case 'fill': return target.fill(value); case 'clear': return target.clear(); case 'type': return target.pressSequentially(value); case 'check': return target.check(); case 'uncheck': return target.uncheck(); case 'selectOption': return target.selectOption(value); case 'press': return target.press(value); case 'waitForVisible': return target.waitFor({ state: 'visible', timeout }); case 'waitForHidden': return target.waitFor({ state: 'hidden', timeout }); case 'waitForURL': return page.waitForURL(value, { timeout }); case 'reload': return page.reload(); case 'back': return page.goBack(); case 'forward': return page.goForward(); case 'waitForTimeout': return page.waitForTimeout(Number(value)); case 'waitForLoadState': return page.waitForLoadState(value || 'domcontentloaded', { timeout }); default: throw new Error(`暂不支持操作：${step.action}`); }
}

async function executeVisualCase(db, testCase, input = {}) {
  const runId = randomUUID(); const runDir = join(artifactsDir, runId); await mkdir(runDir, { recursive: true }); const settings = { ...testCase.defaults, ...input }; const complianceEnabled = Boolean(testCase.compliance?.enabled); const engine = complianceEnabled ? chromium : browserEngines[settings.browser];
  if (!engine) throw httpError(400, '真实 Safari 需要 Selenium SafariDriver；当前支持 Chromium、Firefox 和 WebKit。', 'UNSUPPORTED_BROWSER');
  const proxy = settings.proxy?.mode === 'proxy' && settings.proxy.server ? { server: settings.proxy.server, username: settings.proxy.username || undefined, password: settings.proxy.password || undefined, bypass: settings.proxy.bypass || undefined } : undefined;
  const started = Date.now(); const result = { id: runId, scope: 'case', caseId: testCase.id, caseName: testCase.name, planId: input.planId || null, startedAt: now(), status: 'running', steps: [], artifactPath: `/artifacts/${runId}` };
  let browser; let context; let page;
  try {
    const auth = compliancePaths(testCase); const launchOptions = { headless: input.headless !== false, proxy, ...(complianceEnabled ? { channel: 'chrome' } : {}) }; const contextOptions = { locale: settings.locale || 'zh-CN', recordVideo: { dir: runDir }, ...(complianceEnabled && existsSync(auth.storagePath) ? { storageState: auth.storagePath } : {}) };
    browser = await engine.launch(launchOptions); context = await browser.newContext(contextOptions); await context.tracing.start({ screenshots: true, snapshots: true }); page = await context.newPage();
    for (let index = 0; index < testCase.steps.length; index += 1) {
      const step = testCase.steps[index]; const record = { id: step.id, index, title: stepTitle(step, index), operation: step.action || step.assertion, locator: step.locator?.primary || null, status: 'passed', attempts: 0, startedAt: now() }; const attempts = Math.max(0, Number(step.retryCount || 0)) + 1;
      for (let attempt = 1; attempt <= attempts; attempt += 1) { record.attempts = attempt; try { await executeStep(page, step, { ...testCase.data, ...(input.data || {}) }); break; } catch (error) { record.error = redact(error.message, [settings.proxy?.password]); const siteBlocked = await detectSiteBlock(page); if (attempt < attempts && !siteBlocked) continue; const shot = 'failure.png'; await page.screenshot({ path: join(runDir, shot), fullPage: true }).catch(() => {}); record.diagnostic = siteBlocked ? blockedDiagnostic(step, index, page.url(), record.error) : diagnose(record.error, step, index, page.url()); record.artifacts = { screenshot: `${result.artifactPath}/${shot}`, trace: `${result.artifactPath}/trace.zip` }; if (step.continueOnError) { record.status = 'warning'; break; } record.status = 'failed'; result.status = 'failed'; result.error = record.error; result.diagnostic = record.diagnostic; result.failedStepIndex = index; result.steps.push(record); throw error; } }
      record.finishedAt = now(); result.steps.push(record);
    }
    result.status = 'passed';
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
  const playwrightTestUrl = pathToFileURL(join(root, 'node_modules', 'playwright', 'test.mjs')).href; const runnablePath = join(runDir, 'runnable.spec.mjs'); const runnableSource = testCase.sources.javascript.replace(/(['"])playwright\/test\1/g, JSON.stringify(playwrightTestUrl)).replace(/(['"])@playwright\/test\1/g, JSON.stringify(playwrightTestUrl)); await writeFile(runnablePath, runnableSource);
  const auth = compliancePaths(testCase); const configPath = join(runDir, 'playwright.config.mjs'); const config = `import { defineConfig } from ${JSON.stringify(playwrightTestUrl)};\nexport default defineConfig({ testDir: ${JSON.stringify(runDir)}, testMatch: ${JSON.stringify(basename(runnablePath))}, timeout: ${Number(testCase.defaults.timeoutMs || 30000)}, outputDir: ${JSON.stringify(join(runDir, 'results'))}, reporter: 'line', use: { browserName: ${JSON.stringify(browserName)}, headless: ${input.headless !== false}, locale: ${JSON.stringify(testCase.defaults.locale || 'zh-CN')}, trace: 'on', video: 'on', screenshot: 'only-on-failure'${complianceEnabled ? `, channel: 'chrome'` : ''}${complianceEnabled && existsSync(auth.storagePath) ? `, storageState: ${JSON.stringify(auth.storagePath)}` : ''}${proxy ? `, proxy: ${JSON.stringify(proxy)}` : ''} } });\n`;
  await writeFile(configPath, config); const started = Date.now(); const result = { id: runId, scope: 'case', mode: 'code', caseId: testCase.id, caseName: testCase.name, planId: input.planId || null, startedAt: now(), status: 'running', steps: [], artifactPath: `/artifacts/${runId}` };
  const processResult = await runProcess('npx', ['playwright', 'test', '--config', configPath], { cwd: root, env: { ...process.env, CI: '1' } }); const output = redact(`${processResult.stdout}\n${processResult.stderr}`.trim(), [proxy?.password]); const files = await findArtifacts(runDir); const screenshot = files.find(x => /test-failed.*\.png$|failure\.png$/i.test(x)); const video = files.find(x => /video\.(webm|mp4)$/i.test(x)); const trace = files.find(x => /trace\.zip$/i.test(x));
  result.status = processResult.code === 0 ? 'passed' : 'failed'; result.finishedAt = now(); result.durationMs = Date.now() - started; result.artifacts = { screenshot: screenshot ? `${result.artifactPath}/${screenshot}` : null, video: video ? `${result.artifactPath}/${video}` : null, trace: trace ? `${result.artifactPath}/${trace}` : null };
  if (result.status === 'passed') result.steps = [{ id: 'code', index: 0, title: 'Playwright JavaScript 测试', operation: 'code', status: 'passed', attempts: 1 }];
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
app.get('/api/recording-sessions/:id', (req, res) => { const session = recordingSessions.get(req.params.id); if (!session) throw httpError(404, '未找到录制会话', 'RECORDING_SESSION_NOT_FOUND'); res.json(session); });
app.post('/api/cases/:id/record', async (req, res) => {
  const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const complianceMode = Boolean(req.body.complianceMode); const browser = complianceMode ? 'chromium' : (req.body.browser || testCase.defaults.browser || 'chromium');
  if (!['chromium', 'chrome', 'firefox', 'webkit'].includes(browser)) throw httpError(400, '录制支持 Chromium、Firefox、WebKit；真实 Safari 请使用 Selenium 适配器。', 'UNSUPPORTED_BROWSER');
  if (complianceMode && !(req.body.policyConfirmed || testCase.compliance?.policyConfirmed)) throw httpError(400, '请先确认该目标环境已授权自动化测试。', 'COMPLIANCE_CONFIRMATION_REQUIRED');
  const out = join(recordingsDir, `${safeFile(testCase.name)}-${Date.now()}.spec.js`); const args = ['playwright', 'codegen', '--target', 'playwright-test', '--output', out, '--lang', req.body.locale || testCase.defaults.locale || 'zh-CN']; const paths = compliancePaths(testCase);
  if (complianceMode) { await mkdir(paths.profileDir, { recursive: true }); args.push('--channel', 'chrome', '--user-data-dir', paths.profileDir, '--save-storage', paths.storagePath); if (existsSync(paths.storagePath)) args.push('--load-storage', paths.storagePath); }
  else if (browser !== 'chromium') args.push('--browser', browser);
  const proxy = req.body.proxy || testCase.defaults.proxy; if (proxy?.mode === 'proxy' && proxy.server) { args.push('--proxy-server', proxy.server); if (proxy.bypass) args.push('--proxy-bypass', proxy.bypass); }
  if (req.body.url) args.push(req.body.url); const sessionId = randomUUID(); const publicSession = { id: sessionId, caseId: testCase.id, status: process.env.RECORD_DRY_RUN === '1' ? 'dry-run' : 'waiting-for-user', complianceMode, startedAt: now(), manualVerification: complianceMode, message: complianceMode ? '正式 Chrome 已打开。遇到登录或 CAPTCHA 时请手工完成，录制器会等待，不会尝试绕过验证。' : '录制窗口已打开。' };
  recordingSessions.set(sessionId, publicSession);
  if (process.env.RECORD_DRY_RUN !== '1') {
    const child = spawn('npx', args, { cwd: root, detached: true, stdio: 'ignore' }); publicSession.pid = child.pid; child.on('exit', async code => { publicSession.status = code === 0 ? 'completed' : 'closed'; publicSession.finishedAt = now(); publicSession.loginStateSaved = existsSync(paths.storagePath); const latest = await store().catch(() => null); const item = latest?.cases.find(x => x.id === testCase.id); if (item && complianceMode) { item.compliance = { ...defaultCompliance(), ...item.compliance, lastRecordedAt: publicSession.finishedAt, storageStateSaved: publicSession.loginStateSaved }; item.updatedAt = now(); await save(latest).catch(() => {}); } }); child.unref();
  }
  res.status(202).json({ ...publicSession, outputFile: relative(root, out), profile: complianceMode ? `data/profiles/${safeFile(testCase.id)}` : null, loginState: complianceMode ? `data/auth/${safeFile(testCase.id)}.json` : null, ...(process.env.RECORD_DRY_RUN === '1' ? { debugArgs: args } : {}) });
});
app.get('/api/recordings', async (_req, res) => { const files = await Promise.all((await readdir(recordingsDir)).filter(x => x.endsWith('.spec.js')).map(async name => { const details = await stat(join(recordingsDir, name)); return { name, modifiedAt: details.mtime.toISOString(), size: details.size }; })); res.json(files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))); });
app.post('/api/cases/:id/import-codegen', async (req, res) => { const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id); if (!testCase) throw httpError(404, '未找到测试用例', 'CASE_NOT_FOUND'); const filename = String(req.body.filename || ''); if (!/^[a-zA-Z0-9_.-]+\.spec\.js$/.test(filename)) throw httpError(400, '无效录制文件名', 'INVALID_RECORDING'); const code = await readFile(join(recordingsDir, filename), 'utf8'); const steps = parseCodegen(code); if (!steps.length) throw httpError(400, '没有识别到可导入步骤。请确认 Inspector 已保存完整脚本。', 'NO_STEPS_PARSED'); testCase.steps = req.body.mode === 'append' ? [...testCase.steps, ...steps] : steps; testCase.sources = { javascript: code.replaceAll("'@playwright/test'", "'playwright/test'"), python: generatePython({ ...testCase, steps }) }; testCase.version += 1; testCase.updatedAt = now(); await persistSources(db, testCase); await save(db); res.json(caseSummary(testCase)); });

function readString(source) { const match = String(source).trim().match(/^(['"])((?:\\.|(?!\1).)*)\1/s); return match ? match[2].replace(/\\(['"\\])/g, '$1') : ''; }
function parseLocator(method, args) { const value = readString(args); const names = String(args).match(/name:\s*(['"])((?:\\.|(?!\1).)*)\1/s); const strategy = { getByRole: 'role', getByLabel: 'label', getByText: 'text', getByTestId: 'testId', getByPlaceholder: 'placeholder', getByAltText: 'altText', getByTitle: 'title', locator: 'css' }[method]; return { primary: { strategy, value, ...(names ? { name: names[2].replace(/\\(['"\\])/g, '$1') } : {}) } }; }
function parseCodegen(code) { const steps = []; for (const raw of code.split('\n')) { const line = raw.trim(); let match; if ((match = line.match(/page\.goto\((.+?)\);?$/))) { steps.push({ id: randomUUID(), kind: 'action', action: 'goto', url: readString(match[1]), timeoutMs: 10000 }); continue; } if ((match = line.match(/page\.(getByRole|getByLabel|getByText|getByTestId|getByPlaceholder|getByAltText|getByTitle|locator)\((.+)\)\.(click|dblclick|hover|fill|press|check|uncheck|selectOption|clear)\((.*)\);?$/))) { const action = match[3]; const step = { id: randomUUID(), kind: 'action', action, locator: parseLocator(match[1], match[2]), timeoutMs: 10000 }; if (!['click', 'dblclick', 'hover', 'check', 'uncheck', 'clear'].includes(action)) step.value = readString(match[4]); steps.push(step); continue; } if ((match = line.match(/expect\(page\)\.toHave(URL|Title)\((.+?)\);?$/))) { steps.push({ id: randomUUID(), kind: 'assertion', assertion: `toHave${match[1]}`, expected: readString(match[2]) || match[2].trim(), timeoutMs: 10000 }); continue; } if ((match = line.match(/expect\(page\.(getByRole|getByLabel|getByText|getByTestId|getByPlaceholder|getByAltText|getByTitle|locator)\((.+)\)\)\.(toBeVisible|toBeHidden|toBeEnabled|toBeDisabled|toBeChecked|toHaveText|toContainText|toHaveValue|toHaveCount)\((.*)\);?$/))) { steps.push({ id: randomUUID(), kind: 'assertion', assertion: match[3], locator: parseLocator(match[1], match[2]), expected: readString(match[4]) || match[4].trim(), timeoutMs: 10000 }); } } return steps; }

app.use((error, _req, res, _next) => { console.error(error); res.status(error.status || 500).json({ error: error.message || '服务器错误', code: error.code || 'SERVER_ERROR', details: error.details }); });
app.listen(port, () => console.log(`Web Test Recorder: http://localhost:${port}`));
