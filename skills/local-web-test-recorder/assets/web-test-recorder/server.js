import express from 'express';
import { chromium, firefox, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const app = express();
const port = Number(process.env.PORT || 4173);
const root = process.cwd();
const dataDir = resolve(process.env.DATA_DIR || join(root, 'data'));
const recordingsDir = resolve(process.env.RECORDINGS_DIR || join(root, 'recordings'));
const artifactsDir = resolve(process.env.ARTIFACTS_DIR || join(root, 'artifacts'));
const storePath = join(dataDir, 'store.json');
const browserEngines = { chromium, chrome: chromium, firefox, webkit };

await Promise.all([mkdir(dataDir, { recursive: true }), mkdir(recordingsDir, { recursive: true }), mkdir(artifactsDir, { recursive: true })]);
if (!existsSync(storePath)) await writeFile(storePath, JSON.stringify({ plans: [], cases: [], runs: [] }, null, 2));

app.use(express.json({ limit: '2mb' }));
app.use(express.static(join(root, 'public')));
app.use('/artifacts', express.static(artifactsDir));

async function store() { return JSON.parse(await readFile(storePath, 'utf8')); }
async function save(value) { await writeFile(storePath, JSON.stringify(value, null, 2)); }
function now() { return new Date().toISOString(); }
function safeName(value) { return String(value || 'recording').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 50); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function caseSummary(testCase) { return { ...testCase, steps: testCase.steps || [] }; }

const defaultCase = (name = '新测试用例') => ({
  id: randomUUID(), name, version: 1, accountRef: '', tags: [], data: {},
  defaults: { browser: 'chromium', baseUrl: '', locale: 'zh-CN', proxy: { mode: 'direct', server: '', username: '', password: '', bypass: '' }, timeoutMs: 10000 },
  steps: [], createdAt: now(), updatedAt: now()
});

app.get('/api/state', async (_req, res) => res.json(await store()));

app.post('/api/plans', async (req, res) => {
  const db = await store();
  const plan = { id: randomUUID(), name: String(req.body.name || '新测试计划'), description: String(req.body.description || ''), caseIds: [], createdAt: now(), updatedAt: now() };
  db.plans.push(plan); await save(db); res.status(201).json(plan);
});
app.put('/api/plans/:id', async (req, res) => {
  const db = await store(); const plan = db.plans.find(x => x.id === req.params.id);
  if (!plan) throw httpError(404, '未找到测试计划');
  plan.name = String(req.body.name ?? plan.name); plan.description = String(req.body.description ?? plan.description); plan.caseIds = Array.isArray(req.body.caseIds) ? req.body.caseIds : plan.caseIds; plan.updatedAt = now();
  await save(db); res.json(plan);
});
app.delete('/api/plans/:id', async (req, res) => {
  const db = await store(); db.plans = db.plans.filter(x => x.id !== req.params.id); await save(db); res.status(204).end();
});
app.post('/api/plans/:id/cases/:caseId', async (req, res) => {
  const db = await store(); const plan = db.plans.find(x => x.id === req.params.id);
  if (!plan || !db.cases.some(x => x.id === req.params.caseId)) throw httpError(404, '未找到计划或用例');
  if (!plan.caseIds.includes(req.params.caseId)) plan.caseIds.push(req.params.caseId); plan.updatedAt = now(); await save(db); res.json(plan);
});
app.delete('/api/plans/:id/cases/:caseId', async (req, res) => {
  const db = await store(); const plan = db.plans.find(x => x.id === req.params.id);
  if (!plan) throw httpError(404, '未找到测试计划');
  plan.caseIds = plan.caseIds.filter(id => id !== req.params.caseId); plan.updatedAt = now(); await save(db); res.json(plan);
});

app.post('/api/cases', async (req, res) => {
  const db = await store(); const testCase = defaultCase(req.body.name); db.cases.push(testCase); await save(db); res.status(201).json(testCase);
});
app.put('/api/cases/:id', async (req, res) => {
  const db = await store(); const index = db.cases.findIndex(x => x.id === req.params.id);
  if (index < 0) throw httpError(404, '未找到测试用例');
  const old = db.cases[index];
  if (Number(req.body.version) !== Number(old.version)) return res.status(409).json({ error: '该用例已在其他页面或导入操作中更新。已为你加载最新版本，请重新确认后操作。', code: 'VERSION_CONFLICT', currentVersion: old.version });
  const next = { ...old, ...req.body, id: old.id, createdAt: old.createdAt, version: old.version + 1, updatedAt: now() };
  if (!Array.isArray(next.steps)) throw httpError(400, 'steps 必须是数组');
  db.cases[index] = next; await save(db); res.json(next);
});
app.delete('/api/cases/:id', async (req, res) => {
  const db = await store(); db.cases = db.cases.filter(x => x.id !== req.params.id); db.plans.forEach(p => { p.caseIds = p.caseIds.filter(id => id !== req.params.id); }); await save(db); res.status(204).end();
});

function singleLocator(page, primary) {
  const value = primary.value;
  switch (primary.strategy) {
    case 'role': return page.getByRole(value, primary.name ? { name: primary.name } : undefined);
    case 'label': return page.getByLabel(value);
    case 'placeholder': return page.getByPlaceholder(value);
    case 'text': return page.getByText(value, { exact: Boolean(primary.exact) });
    case 'testId': return page.getByTestId(value);
    case 'altText': return page.getByAltText(value);
    case 'title': return page.getByTitle(value);
    case 'xpath': return page.locator(`xpath=${value}`);
    default: return page.locator(value);
  }
}
function locator(page, source = {}) {
  const primary = source.primary || source; const candidates = [primary, ...(source.fallbacks || [])];
  if (primary.strategy === 'role' && primary.name) candidates.push({ strategy: 'role', value: primary.value });
  const locators = candidates.map(candidate => singleLocator(page, candidate));
  return locators.slice(1).reduce((combined, candidate) => combined.or(candidate), locators[0]).first();
}
function interpolate(value, data) { return typeof value === 'string' ? value.replace(/\$\{data\.([\w.-]+)\}/g, (_m, key) => String(data[key] ?? '')) : value; }
function redact(text, secrets) { let value = String(text || ''); for (const secret of secrets) if (secret) value = value.split(String(secret)).join('***'); return value; }

async function executeStep(page, step, data) {
  const timeout = step.timeoutMs || 10000; page.setDefaultTimeout(timeout);
  const target = step.locator ? locator(page, step.locator) : null; const value = interpolate(step.value, data); const expected = interpolate(step.expected, data);
  if (step.kind === 'assertion') {
    if (step.assertion === 'toBeVisible') return target.waitFor({ state: 'visible', timeout });
    if (step.assertion === 'toBeHidden') return target.waitFor({ state: 'hidden', timeout });
    if (step.assertion === 'toHaveText') { const actual = await target.textContent(); if (actual?.trim() !== expected) throw new Error(`断言失败：期望文本 ${expected}，实际 ${actual}`); return; }
    if (step.assertion === 'toContainText') { const actual = await target.textContent(); if (!actual?.includes(expected)) throw new Error(`断言失败：未包含文本 ${expected}`); return; }
    if (step.assertion === 'toHaveValue') { const actual = await target.inputValue(); if (actual !== expected) throw new Error('断言失败：输入值不一致'); return; }
    if (step.assertion === 'toBeEnabled') { if (!(await target.isEnabled())) throw new Error('断言失败：元素不可用'); return; }
    if (step.assertion === 'toBeDisabled') { if (await target.isEnabled()) throw new Error('断言失败：元素仍可用'); return; }
    if (step.assertion === 'toBeChecked') { if (!(await target.isChecked())) throw new Error('断言失败：元素未选中'); return; }
    if (step.assertion === 'toHaveCount') { const actual = await target.count(); if (actual !== Number(expected)) throw new Error(`断言失败：期望 ${expected} 个元素，实际 ${actual}`); return; }
    if (step.assertion === 'toHaveURL') { if (!(new RegExp(expected)).test(page.url())) throw new Error(`断言失败：URL ${page.url()} 未匹配 ${expected}`); return; }
    if (step.assertion === 'toHaveTitle') { if (!(new RegExp(expected)).test(await page.title())) throw new Error(`断言失败：页面标题未匹配 ${expected}`); return; }
    throw new Error(`当前 MVP 尚不支持断言：${step.assertion}`);
  }
  switch (step.action) {
    case 'goto': return page.goto(interpolate(step.url || value, data), { waitUntil: 'domcontentloaded' });
    case 'click': return target.click(); case 'dblclick': return target.dblclick(); case 'hover': return target.hover(); case 'focus': return target.focus();
    case 'fill': return target.fill(value); case 'clear': return target.clear(); case 'type': return target.pressSequentially(value); case 'check': return target.check(); case 'uncheck': return target.uncheck();
    case 'selectOption': return target.selectOption(value); case 'press': return target.press(value); case 'waitForVisible': return target.waitFor({ state: 'visible', timeout }); case 'waitForHidden': return target.waitFor({ state: 'hidden', timeout });
    case 'waitForURL': return page.waitForURL(value, { timeout }); case 'reload': return page.reload(); case 'back': return page.goBack(); case 'forward': return page.goForward();
    case 'waitForTimeout': return page.waitForTimeout(Number(value)); case 'waitForLoadState': return page.waitForLoadState(value || 'domcontentloaded', { timeout });
    default: throw new Error(`当前 MVP 尚不支持操作：${step.action}`);
  }
}

app.post('/api/cases/:id/run', async (req, res) => {
  const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id);
  if (!testCase) throw httpError(404, '未找到测试用例');
  const runId = randomUUID(); const runDir = join(artifactsDir, runId); await mkdir(runDir, { recursive: true });
  const settings = { ...testCase.defaults, ...req.body }; const engine = browserEngines[settings.browser];
  if (!engine) throw httpError(400, 'Safari 真实浏览器需要未来的 Selenium 适配器；本 MVP 支持 Chromium、Firefox、WebKit。');
  const proxy = settings.proxy?.mode === 'proxy' && settings.proxy.server ? { server: settings.proxy.server, username: settings.proxy.username || undefined, password: settings.proxy.password || undefined, bypass: settings.proxy.bypass || undefined } : undefined;
  const startedAt = now(); const result = { id: runId, caseId: testCase.id, caseName: testCase.name, startedAt, status: 'passed', steps: [], artifactPath: `/artifacts/${runId}` };
  let browser;
  try {
    browser = await engine.launch({ headless: req.body.headless !== false, proxy });
    const context = await browser.newContext({ locale: settings.locale || 'zh-CN', recordVideo: { dir: runDir } }); await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    for (const step of testCase.steps) {
      const record = { id: step.id, label: step.action || step.assertion, status: 'passed', attempts: 0, startedAt: now() };
      const attempts = Math.max(0, Number(step.retryCount || 0)) + 1;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        record.attempts = attempt;
        try { await executeStep(page, step, { ...testCase.data, ...(req.body.data || {}) }); break; }
        catch (error) {
          record.error = redact(error.message, [settings.proxy?.password]);
          if (attempt < attempts) continue;
          await page.screenshot({ path: join(runDir, 'failure.png'), fullPage: true }).catch(() => {});
          if (step.continueOnError) { record.status = 'warning'; break; }
          record.status = 'failed'; result.status = 'failed'; result.error = record.error; result.steps.push(record); throw error;
        }
      }
      result.steps.push(record);
    }
    await context.tracing.stop({ path: join(runDir, 'trace.zip') }); await context.close();
  } catch (error) { result.status = 'failed'; result.error ||= redact(error.message, [settings.proxy?.password]); }
  finally { await browser?.close(); result.finishedAt = now(); db.runs.unshift(result); db.runs = db.runs.slice(0, 50); await save(db); }
  res.status(result.status === 'passed' ? 200 : 422).json(result);
});

app.post('/api/cases/:id/record', async (req, res) => {
  const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id);
  if (!testCase) throw httpError(404, '未找到测试用例');
  const browser = req.body.browser || testCase.defaults.browser || 'chromium';
  if (!['chromium', 'chrome', 'firefox', 'webkit'].includes(browser)) throw httpError(400, '录制仅支持 Chromium、Firefox、WebKit。Safari 请使用回放适配器。');
  const out = join(recordingsDir, `${safeName(testCase.name)}-${Date.now()}.spec.js`); const args = ['playwright', 'codegen', '--target', 'playwright-test', '--output', out];
  if (browser !== 'chromium') args.push('--browser', browser); if (req.body.url) args.push(req.body.url);
  args.splice(args.length - (req.body.url ? 1 : 0), 0, '--lang', req.body.locale || testCase.defaults.locale || 'zh-CN');
  const process = spawn('npx', args, { cwd: root, detached: true, stdio: 'ignore' }); process.unref();
  res.status(202).json({ message: '录制器已在独立窗口启动。完成操作后关闭录制器，再在本工具中导入生成的代码。', outputFile: out });
});
app.get('/api/recordings', async (_req, res) => {
  const files = await Promise.all((await readdir(recordingsDir)).filter(x => x.endsWith('.spec.js')).map(async name => {
    const details = await stat(join(recordingsDir, name));
    return { name, modifiedAt: details.mtime.toISOString(), size: details.size };
  }));
  res.json(files.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt)));
});
app.post('/api/cases/:id/import-codegen', async (req, res) => {
  const db = await store(); const testCase = db.cases.find(x => x.id === req.params.id);
  if (!testCase) throw httpError(404, '未找到测试用例');
  const filename = String(req.body.filename || '');
  if (!/^[a-zA-Z0-9_.-]+\.spec\.js$/.test(filename)) throw httpError(400, '无效录制文件名');
  const code = await readFile(join(recordingsDir, filename), 'utf8');
  const steps = parseCodegen(code);
  if (!steps.length) throw httpError(400, '没有识别到可导入步骤。请在编辑器中手工新增步骤。');
  testCase.steps = req.body.mode === 'append' ? [...testCase.steps, ...steps] : steps;
  testCase.version += 1; testCase.updatedAt = now(); await save(db); res.json(caseSummary(testCase));
});

function readString(source) {
  const match = String(source).trim().match(/^(['"])((?:\\.|(?!\1).)*)\1/s);
  return match ? match[2].replace(/\\(['"\\])/g, '$1') : '';
}
function parseLocator(method, args) {
  const value = readString(args); const names = String(args).match(/name:\s*(['"])((?:\\.|(?!\1).)*)\1/s);
  const strategy = { getByRole: 'role', getByLabel: 'label', getByText: 'text', getByTestId: 'testId', getByPlaceholder: 'placeholder', getByAltText: 'altText', getByTitle: 'title', locator: 'css' }[method];
  return { primary: { strategy, value, ...(names ? { name: names[2].replace(/\\(['"\\])/g, '$1') } : {}) } };
}
function parseCodegen(code) {
  const steps = [];
  for (const raw of code.split('\n')) {
    const line = raw.trim(); let match;
    if ((match = line.match(/page\.goto\((.+?)\);?$/))) { steps.push({ id: randomUUID(), kind: 'action', action: 'goto', url: readString(match[1]), timeoutMs: 10000 }); continue; }
    if ((match = line.match(/page\.(getByRole|getByLabel|getByText|getByTestId|getByPlaceholder|getByAltText|getByTitle|locator)\((.+)\)\.(click|dblclick|hover|fill|press|check|uncheck|selectOption|clear)\((.*)\);?$/))) {
      const action = match[3]; const step = { id: randomUUID(), kind: 'action', action, locator: parseLocator(match[1], match[2]), timeoutMs: 10000 };
      if (!['click', 'dblclick', 'hover', 'check', 'uncheck', 'clear'].includes(action)) step.value = readString(match[4]);
      steps.push(step); continue;
    }
    if ((match = line.match(/expect\(page\)\.toHaveURL\((.+?)\);?$/))) { steps.push({ id: randomUUID(), kind: 'assertion', assertion: 'toHaveURL', expected: readString(match[1]) || match[1].trim(), timeoutMs: 10000 }); }
  }
  return steps;
}

app.use((error, _req, res, _next) => { console.error(error); res.status(error.status || 500).json({ error: error.message || '服务器错误' }); });
app.listen(port, () => console.log(`Web Test Recorder: http://localhost:${port}`));
