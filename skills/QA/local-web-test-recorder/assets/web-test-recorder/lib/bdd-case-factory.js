import ExcelJS from 'exceljs';
import { createHash, randomUUID } from 'node:crypto';

const REQUIRED_HEADERS = ['caseId', 'step', 'expected'];
const HEADER_ALIASES = {
  caseId: ['no.', 'no', 'test id', 'case id', 'scenario id', 'id'],
  priority: ['priority', '优先级'],
  depth1: ['depth1', 'depth 1', 'function', 'function name', 'feature'],
  depth2: ['depth2', 'depth 2', 'sub feature'],
  depth3: ['depth3', 'depth 3', 'component'],
  prerequisite: ['pre requisite', 'pre-requisite', 'prerequisite', 'precondition', 'preconditions', '前置条件'],
  testData: ['test data', 'data', '测试数据'],
  step: ['step', 'steps', 'test step', 'test steps', '操作步骤'],
  expected: ['expected result', 'expected results', 'expect result', '预期结果'],
  ios: ['ios'],
  android: ['android', 'aos'],
  web: ['web', 'pc web'],
  bts: ['bts no.', 'bts no', 'ticket', 'bug'],
  notes: ['notes', 'note', '备注'],
};

const APP_NATIVE = /\bapp store\b|\bplay store\b|biometric|bio auth|native app|coupang app opens?|device keyboard|camera|ocr|deep link|ios only|android only/i;
const MOBILE_WEB = /mobile web|moweb|mo web/i;
const WEB_SCOPE = /pc web|browser|web page|payment window/i;
const EXTERNAL_STATE = /ab key|feature flag|kyc|rnv|issuer.{0,20}unavailable|payment available|most recently used|registered|linked account|balance|3p service|third party|production/i;
const BACKEND_OR_NETWORK = /network|offline|timeout|http\s*5\d\d|server error|backend|database|db |api error|connection reset|latency/i;
const SECURITY_CHALLENGE = /captcha|otp|one.?time password|3ds|3-d secure|pin no|real.?name verification|identity verification|secure keypad/i;
const VISUAL_ONLY = /ellipsis|opacity|lottie|animation|color|layout|image|logo|tooltip|font|pixel/i;
const SIDE_EFFECT = /payment is processed|complete payment|pay button|register card|registration|withdraw|refund|cancel payment|sign.?up|delete|approval/i;
const BLOCKED = /unable|blocked|not available|cannot test|확인 불가|테스트 불가|막혀/i;
const MESSAGE_CHANNEL = /email|e-mail|sms|push notification|message queue|kafka/i;
const PERFORMANCE = /performance|load test|concurren|race condition|throughput|tps|stress/i;
const HARDWARE = /bluetooth|nfc|camera|fingerprint|face id|touch id|biometric|gps permission/i;

export const PRECONDITION_REGISTRY = [
  { key: 'auth.coupang.loggedIn', description: 'Coupang logged-in state' },
  { key: 'auth.coupay.enrolled', description: 'Coupay enrolled state' },
  { key: 'payMethod.card.exists', description: 'At least one card registered' },
  { key: 'payMethod.bankAccount.ensureRegistered', description: 'Bank account registered' },
  { key: 'coupayMoney.balance.sufficient', description: 'Sufficient Coupay Money balance' },
  { key: 'settings.oneTouchPay.enabled', description: 'One-touch payment enabled' },
];

const COMMON_CHECKS = [
  'Blank page or partial blank page',
  'Unexpected text or garbled content',
  'Common error popup unexpectedly shown',
  'Element overlap or layout broken',
  'Image missing',
];

const PAYMENT_CHECKS = [
  'insufficient balance alert, PIN error, session expiry',
  'if ordered and completed payment, must cancel it in real money.',
];

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\r/g, '').trim();
}

function normalizedHeader(value) {
  return clean(value).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function canonicalHeader(value) {
  const normalized = normalizedHeader(value);
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

function cellText(row, columnNumber) {
  if (!columnNumber) return '';
  const cell = row.getCell(columnNumber);
  let value = cell.value;
  if (value == null && cell.isMerged && cell.master && cell.master !== cell) value = cell.master.value;
  if (value == null) return '';
  if (typeof value === 'object' && Array.isArray(value.richText)) return clean(value.richText.map(item => item.text).join(''));
  if (typeof value === 'object' && 'result' in value) return clean(value.result);
  if (typeof value === 'object' && 'text' in value) return clean(value.text);
  return clean(value);
}

function detectHeader(worksheet) {
  const maxRows = Math.min(worksheet.rowCount, 40);
  for (let rowNumber = 1; rowNumber <= maxRows; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const columns = {};
    for (let column = 1; column <= Math.max(worksheet.columnCount, 16); column += 1) {
      const key = canonicalHeader(cellText(row, column));
      if (key && !columns[key]) columns[key] = column;
    }
    if (REQUIRED_HEADERS.every(key => columns[key])) return { rowNumber, columns };
  }
  return null;
}

function splitClauses(value) {
  const text = clean(value);
  if (!text) return [];
  return text.split(/\n+/).map(line => line.replace(/^\s*(?:[-*•✓]|\d+[.)]|ㄴ)\s*/, '').trim()).filter(Boolean);
}

function stableId(sourceKey) {
  return `bdd-${createHash('sha1').update(sourceKey).digest('hex').slice(0, 16)}`;
}

function titleFor(row) {
  const hierarchy = [row.depth1, row.depth2, row.depth3].filter(Boolean);
  const action = row.step.replace(/^ㄴ\s*/, '').split('\n')[0];
  return [...hierarchy.slice(-2), action].filter(Boolean).join(' · ') || row.caseId;
}

function groupKeyFor(row) {
  return [row.depth1, row.depth2, row.depth3, row.prerequisite || row.inheritedPrerequisite].map(clean).join('\u001f');
}

function combineScenarioIds(values) {
  const ids = [...new Set(values.map(clean).filter(Boolean))];
  if (!ids.length) return '';
  if (ids.length === 1) return ids[0];
  const parts = ids.map(id => id.split('_'));
  const prefix = parts[0].slice(0, -1).join('_');
  if (prefix && parts.every(tokens => tokens.slice(0, -1).join('_') === prefix && tokens.at(-1))) {
    return `${prefix}_${parts.map(tokens => tokens.at(-1)).join('_')}`;
  }
  return ids.join('_');
}

function functionNameFor(group) {
  const firstStep = clean(group.rows[0]?.step).split('\n')[0];
  return [group.depth1, group.depth2, group.depth3, group.prerequisite, firstStep]
    .map(clean).filter(Boolean).map(value => `[${value}]`).join('');
}

function strongestPriority(rows) {
  return rows.map(row => /^P[012]$/i.test(row.priority) ? row.priority.toUpperCase() : 'P1')
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))[0] || 'P1';
}

function aggregatePlatformStatus(rows, key) {
  const values = rows.map(row => clean(row[key]).toUpperCase()).filter(Boolean);
  if (values.includes('PASS')) return 'PASS';
  if (values.includes('FAIL')) return 'FAIL';
  if (values.includes('N/A')) return 'N/A';
  return values[0] || '';
}

function addIssue(issues, code, message, severity = 'warning') {
  if (!issues.some(item => item.code === code)) issues.push({ code, message, severity });
}

export function assessUiAutomation(row) {
  const text = [row.sheetName, row.depth1, row.depth2, row.depth3, row.prerequisite, row.step, row.expected, row.notes].join(' ');
  let score = 58;
  const blockers = [];
  const capabilities = new Set();
  const addBlocker = (code, label, evidence, mitigation, penalty) => {
    blockers.push({ code, label, evidence, mitigation, penalty });
    score -= penalty;
  };

  if (row.web.toUpperCase() === 'PASS') { score += 18; capabilities.add('playwright-web'); }
  else if (MOBILE_WEB.test(text)) { score += 8; capabilities.add('mobile-web-emulation'); }
  else if (row.web.toUpperCase() === 'N/A') score -= 15;
  if (WEB_SCOPE.test(text)) score += 5;
  if (!row.step) addBlocker('MISSING_ACTION', '缺少操作步骤', row.caseId, '由 QA 补充 When，不允许自动猜测。', 24);
  if (!row.expected) addBlocker('MISSING_EXPECTED', '缺少预期结果', row.caseId, '补充可观察断言后再生成脚本。', 30);
  if (APP_NATIVE.test(text)) addBlocker('NATIVE_APP', '依赖原生 App/应用商店', text.match(APP_NATIVE)?.[0] || '', '改用 Appium/WebdriverIO，或把 Mobile Web 部分拆出。', 38);
  if (HARDWARE.test(text)) addBlocker('DEVICE_CAPABILITY', '依赖设备硬件或系统权限', text.match(HARDWARE)?.[0] || '', '使用真机/App 自动化或保留人工测试。', 30);
  if (SECURITY_CHALLENGE.test(text)) addBlocker('SECURITY_CHALLENGE', '存在 OTP/CAPTCHA/3DS/安全键盘等验证', text.match(SECURITY_CHALLENGE)?.[0] || '', '使用授权测试 Stub、人工边界或专用测试账号。', 24);
  if (EXTERNAL_STATE.test(text)) { addBlocker('TEST_FIXTURE', '依赖外部状态或测试数据夹具', text.match(EXTERNAL_STATE)?.[0] || '', '提供 Fixture/API/Feature Flag 或前置条件注册表。', 12); capabilities.add('fixture-or-api'); }
  if (BACKEND_OR_NETWORK.test(text)) { addBlocker('SERVICE_VIRTUALIZATION', '需要网络或后端故障注入', text.match(BACKEND_OR_NETWORK)?.[0] || '', '前端表现可用 route/proxy；真实服务故障应使用 API/Mock/故障注入。', 22); capabilities.add('route-or-proxy'); }
  if (MESSAGE_CHANNEL.test(text)) { addBlocker('EXTERNAL_MESSAGE', '依赖邮件、短信、Push 或消息系统', text.match(MESSAGE_CHANNEL)?.[0] || '', '接入消息读取测试接口并采用 Hybrid 测试。', 18); capabilities.add('message-test-api'); }
  if (PERFORMANCE.test(text)) addBlocker('NON_FUNCTIONAL', '属于性能、并发或压力场景', text.match(PERFORMANCE)?.[0] || '', '使用性能/API 测试工具，BDD 继续保留。', 35);
  if (VISUAL_ONLY.test(text)) { score -= 8; capabilities.add('visual-regression'); }
  if (SIDE_EFFECT.test(text)) { score -= 8; capabilities.add('sandbox-and-cleanup'); blockers.push({ code: 'SIDE_EFFECT', label: '有支付/注册/删除等副作用', evidence: text.match(SIDE_EFFECT)?.[0] || '', mitigation: '仅在沙箱/授权环境执行，并配置幂等、测试数据和 Cleanup。', penalty: 8 }); }
  if (BLOCKED.test(text)) addBlocker('ENVIRONMENT_BLOCKED', '源用例标记为无法验证或环境阻塞', text.match(BLOCKED)?.[0] || '', '先提供可访问测试环境，再进入 Generator。', 24);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const appOnly = blockers.some(item => ['NATIVE_APP', 'DEVICE_CAPABILITY'].includes(item.code)) && row.web.toUpperCase() !== 'PASS';
  const hybrid = blockers.some(item => ['TEST_FIXTURE', 'SERVICE_VIRTUALIZATION', 'EXTERNAL_MESSAGE'].includes(item.code));
  const manual = blockers.some(item => ['SECURITY_CHALLENGE', 'ENVIRONMENT_BLOCKED'].includes(item.code)) && score < 45;
  const apiPreferred = blockers.some(item => ['NON_FUNCTIONAL', 'SERVICE_VIRTUALIZATION'].includes(item.code)) && row.web.toUpperCase() !== 'PASS' && score < 45;
  const target = appOnly ? 'app' : apiPreferred ? 'api' : manual ? 'manual' : hybrid ? 'hybrid' : score >= 55 ? 'web-ui' : 'manual';
  const band = score >= 80 ? 'ui-ready' : score >= 60 ? 'fixture-needed' : score >= 40 ? 'hybrid-review' : 'not-ui-suited';
  const confidencePoints = [row.step, row.expected, row.prerequisite, row.web].filter(Boolean).length;
  const confidence = confidencePoints >= 4 ? 'high' : confidencePoints >= 2 ? 'medium' : 'low';
  return { score, band, target, confidence, blockers, requiredCapabilities: [...capabilities] };
}

function listLine(label, values) {
  const content = Array.isArray(values) ? values.filter(Boolean).join(', ') : clean(values);
  return content ? `- ${label}: ${content}` : '';
}

export function renderGherkin(input) {
  const testCase = upgradeBddCaseSchema(input);
  const bdd = testCase.bdd;
  const lines = [
    `- **scenarioId**: ${testCase.scenarioId}`,
    `- **functionName**: ${testCase.functionName}`,
    `- **priority**: ${testCase.priority}`,
    `- **tenant**: ${testCase.tenant}`,
    `- **platform**: ${testCase.platform}`,
  ];
  if (testCase.platform === 'app' && testCase.device) lines.push(`- **device**: ${testCase.device}`);
  lines.push(
    `- **region**: ${testCase.region}`,
    `- **category**: ${testCase.category}`,
    `- **language**: ${testCase.language}`,
    '',
    '### BDD Steps',
    '',
    '**Given:**',
  );
  if (bdd.givenContext) lines.push(`Given ${bdd.givenContext}.`);
  bdd.preconditionKeys.forEach(key => {
    const entry = PRECONDITION_REGISTRY.find(item => item.key === key);
    lines.push(`- [${key}] ${entry?.description || key}`);
  });
  (bdd.customPreconditions || []).filter(Boolean).forEach(condition => lines.push(`- [custom] ${condition}`));
  [listLine('AB', bdd.abGroups), listLine('Account', bdd.accounts), listLine('Product', bdd.product), listLine('Payment', bdd.payment)].filter(Boolean).forEach(line => lines.push(line));
  lines.push('', '**When / Then:**');
  if (bdd.steps.length) bdd.steps.forEach((pair, index) => {
    lines.push(`${index + 1}. **When:** ${pair.when || ''}`);
    lines.push(`   **Then:** ${pair.then || ''}`);
  });
  else lines.push('');
  lines.push('', '### Common Check');
  bdd.commonChecks.forEach(item => lines.push(`- ${item}`));
  if (testCase.category === 'payment') {
    lines.push('### Specific-Payment Check:');
    bdd.specificPaymentChecks.forEach(item => lines.push(item));
  }
  return lines.join('\n');
}

export function renderGeneratorMarkdown(testCase) {
  return renderGherkin(testCase);
}

function inferPreconditions(text) {
  const value = clean(text).toLowerCase();
  const keys = [];
  if (/logged.?in|login state|로그인/.test(value)) keys.push('auth.coupang.loggedIn');
  if (/coupay.{0,20}(enroll|가입)/.test(value)) keys.push('auth.coupay.enrolled');
  if (/card.{0,20}(exist|register)|registered card/.test(value)) keys.push('payMethod.card.exists');
  if (/bank account.{0,20}(exist|register)/.test(value)) keys.push('payMethod.bankAccount.ensureRegistered');
  if (/sufficient balance|enough balance/.test(value)) keys.push('coupayMoney.balance.sufficient');
  if (/one.?touch/.test(value)) keys.push('settings.oneTouchPay.enabled');
  return [...new Set(keys)];
}

function inferAbGroups(text) {
  const values = [];
  for (const rawLine of String(text || '').split(/[\n;]+/)) {
    const line = clean(rawLine);
    if (!/(?:\bA\/?B\b|\bAB\b)/i.test(line)) continue;
    const match = line.match(/(?:A\/?B|AB)\s*(?:Key|ID)?\s*\[([^\]]+)\]\s*(?:is|=|:)\s*([^,;]+)/i)
      || line.match(/\[([^\]]+)\]\s*(?:is|=|:)\s*([^,;]+)/i)
      || line.match(/(?:A\/?B|AB)\s*(?:Key|ID)\s+([A-Za-z0-9_.-]+)\s*(?:is|=|:)\s*([^,;]+)/i);
    values.push(match ? `[${clean(match[1])}] = ${clean(match[2])}` : line);
  }
  return [...new Set(values.filter(Boolean))];
}

function autoCategory(row) {
  return /pay|payment|card|cash|coupay|결제/i.test([row.sheetName, row.depth1, row.depth2, row.step, row.expected].join(' ')) ? 'payment' : 'non-payment';
}

function autoPlatform(row) {
  if (clean(row.web).toUpperCase() === 'PASS' || WEB_SCOPE.test([row.depth1, row.step].join(' '))) return 'browser';
  return clean(row.ios).toUpperCase() === 'PASS' || clean(row.android).toUpperCase() === 'PASS' ? 'app' : 'browser';
}

function autoDevice(row, platform) {
  if (platform !== 'app') return '';
  const devices = [];
  if (clean(row.ios).toUpperCase() === 'PASS') devices.push('ios');
  if (clean(row.android).toUpperCase() === 'PASS') devices.push('aos');
  return devices.join(' | ');
}

function buildBddCase(group, importId, duplicateCount, defaults = {}) {
  const rows = group.rows;
  const first = rows[0];
  const scenarioId = combineScenarioIds(rows.map(row => row.caseId));
  const sourceKey = `${first.fileName}::${first.sheetName}::group::${createHash('sha1').update(group.key).digest('hex').slice(0, 16)}`;
  const issues = [];
  if (rows.some(row => !row.step)) addIssue(issues, 'MISSING_ACTION', '合并来源中至少一行没有 Step，QA 必须补充对应 When。', 'error');
  if (rows.some(row => !row.expected)) addIssue(issues, 'MISSING_EXPECTED', '合并来源中至少一行没有 Expected Result。', 'error');
  if (rows.some(row => Object.values(row.inherited).some(Boolean))) addIssue(issues, 'INHERITED_CONTEXT', '部分层级或前置条件从上方记录继承，需要 QA 确认。');
  if (duplicateCount > 1) addIssue(issues, 'DUPLICATE_CASE_ID', `合并后的 Scenario ID ${scenarioId} 在工作簿中出现 ${duplicateCount} 次。`, 'error');
  const givenContext = clean(group.prerequisite);
  const aggregateRow = {
    ...first, caseId: scenarioId, depth1: group.depth1, depth2: group.depth2, depth3: group.depth3,
    prerequisite: givenContext, step: rows.map(row => row.step).join('\n'), expected: rows.map(row => row.expected).join('\n'),
    notes: rows.map(row => row.notes).filter(Boolean).join('\n'),
    ios: aggregatePlatformStatus(rows, 'ios'), android: aggregatePlatformStatus(rows, 'android'), web: aggregatePlatformStatus(rows, 'web'),
  };
  const platform = defaults.platform && defaults.platform !== 'auto' ? defaults.platform : autoPlatform(aggregateRow);
  const category = defaults.category && defaults.category !== 'auto' ? defaults.category : autoCategory(aggregateRow);
  const rawRows = rows.map(row => ({ rowNumber: row.rowNumber, caseId: row.caseId, raw: row.raw }));
  const sourceHash = createHash('sha256').update(JSON.stringify(rawRows)).digest('hex');
  const testCase = {
    id: stableId(sourceKey),
    sourceKey,
    source: { importId, fileName: first.fileName, sheetName: first.sheetName, sheetIndex: first.sheetIndex, rowNumber: first.rowNumber, rowNumbers: rows.map(row => row.rowNumber), caseId: scenarioId, caseIds: rows.map(row => row.caseId), raw: first.raw, rawRows, inherited: rows.map(row => row.inherited), sourceHash, groupingVersion: 2, abExtractionVersion: 2, groupingFields: ['depth1', 'depth2', 'depth3', 'prerequisite'] },
    scenarioId,
    functionName: functionNameFor(group) || group.depth1 || first.sheetName,
    featureName: group.depth1 || first.sheetName,
    hierarchy: { depth1: group.depth1, depth2: group.depth2, depth3: group.depth3 },
    title: titleFor(aggregateRow),
    priority: strongestPriority(rows),
    tenant: defaults.tenant || 'coupay',
    platform,
    device: defaults.device || autoDevice(aggregateRow, platform),
    region: defaults.region || 'KR',
    category,
    language: defaults.language || 'Korean',
    platforms: { ios: aggregateRow.ios, android: aggregateRow.android, web: aggregateRow.web },
    testData: rows.map(row => row.testData).filter(Boolean).join('\n'),
    bdd: {
      givenContext,
      preconditionKeys: inferPreconditions(givenContext),
      abGroups: inferAbGroups(givenContext), accounts: [], product: '', payment: '',
      steps: rows.map(row => ({ id: `row-${row.rowNumber}`, sourceRowNumber: row.rowNumber, sourceCaseId: row.caseId, when: clean(row.step), then: clean(row.expected) })),
      when: rows.map(row => clean(row.step)).filter(Boolean), then: rows.map(row => clean(row.expected)).filter(Boolean),
      commonChecks: [...COMMON_CHECKS],
      specificPaymentChecks: category === 'payment' ? [...PAYMENT_CHECKS] : [],
    },
    automation: assessUiAutomation(aggregateRow),
    validationIssues: issues,
    review: { status: issues.some(item => item.severity === 'error') ? 'needs-review' : 'draft', reviewer: '', comments: '', reviewedAt: null },
    generation: { status: 'not-generated', jobIds: [], publishedCaseId: null },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editRevision: 1,
  };
  testCase.gherkin = renderGherkin(testCase);
  testCase.generatorMarkdown = renderGeneratorMarkdown(testCase);
  return testCase;
}

export async function parseManualCaseWorkbook(buffer, { fileName = 'manual-cases.xlsx', importId = randomUUID(), defaults = {} } = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const rows = [];
  const sheets = [];
  for (const [sheetIndex, worksheet] of workbook.worksheets.entries()) {
    const detected = detectHeader(worksheet);
    if (!detected) {
      sheets.push({ name: worksheet.name, sheetIndex, status: 'skipped', reason: '没有找到 No./Step/Expected Result 表头', rowCount: 0 });
      continue;
    }
    const context = { depth1: '', depth2: '', depth3: '', prerequisite: '' };
    let count = 0;
    for (let rowNumber = detected.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const excelRow = worksheet.getRow(rowNumber);
      const own = Object.fromEntries(Object.entries(detected.columns).map(([key, column]) => [key, cellText(excelRow, column)]));
      if (!own.caseId) continue;
      const inherited = {};
      if (own.depth1) { context.depth1 = own.depth1; context.depth2 = ''; context.depth3 = ''; } else inherited.depth1 = Boolean(context.depth1);
      if (own.depth2) { context.depth2 = own.depth2; context.depth3 = ''; } else inherited.depth2 = Boolean(context.depth2);
      if (own.depth3) context.depth3 = own.depth3; else inherited.depth3 = Boolean(context.depth3);
      if (own.prerequisite) context.prerequisite = own.prerequisite; else inherited.prerequisite = Boolean(context.prerequisite);
      const row = {
        fileName, sheetName: worksheet.name, sheetIndex, rowNumber, caseId: own.caseId, priority: own.priority,
        depth1: own.depth1 || context.depth1, depth2: own.depth2 || context.depth2, depth3: own.depth3 || context.depth3,
        prerequisite: own.prerequisite, inheritedPrerequisite: own.prerequisite ? '' : context.prerequisite,
        testData: own.testData, step: own.step, expected: own.expected, ios: own.ios, android: own.android, web: own.web, bts: own.bts, notes: own.notes,
        inherited, raw: own,
      };
      rows.push(row); count += 1;
    }
    sheets.push({ name: worksheet.name, sheetIndex, status: 'parsed', headerRow: detected.rowNumber, rowCount: count, columns: Object.keys(detected.columns) });
  }
  const grouped = [];
  const groupedBySheetAndKey = new Map();
  for (const row of rows) {
    const key = groupKeyFor(row);
    const lookupKey = `${row.sheetIndex}\u001e${key}`;
    let group = groupedBySheetAndKey.get(lookupKey);
    if (!group) {
      group = { key, depth1: row.depth1, depth2: row.depth2, depth3: row.depth3, prerequisite: row.prerequisite || row.inheritedPrerequisite, rows: [] };
      groupedBySheetAndKey.set(lookupKey, group); grouped.push(group);
    }
    group.rows.push(row);
  }
  const scenarioCounts = grouped.reduce((map, group) => {
    const scenarioId = combineScenarioIds(group.rows.map(row => row.caseId));
    return map.set(scenarioId, (map.get(scenarioId) || 0) + 1);
  }, new Map());
  const cases = grouped.map(group => buildBddCase(group, importId, scenarioCounts.get(combineScenarioIds(group.rows.map(row => row.caseId))), defaults));
  const summary = {
    totalCases: cases.length,
    sourceRows: rows.length,
    mergedRows: rows.length - cases.length,
    uniqueCaseIds: new Set(rows.map(row => row.caseId)).size,
    duplicateCaseIds: [...scenarioCounts.entries()].filter(([, count]) => count > 1).map(([caseId, count]) => ({ caseId, count })),
    missingActions: cases.filter(item => item.validationIssues.some(issue => issue.code === 'MISSING_ACTION')).length,
    webPass: cases.filter(item => item.platforms.web.toUpperCase() === 'PASS').length,
    bands: Object.fromEntries(['ui-ready', 'fixture-needed', 'hybrid-review', 'not-ui-suited'].map(band => [band, cases.filter(item => item.automation.band === band).length])),
    targets: Object.fromEntries(['web-ui', 'hybrid', 'api', 'app', 'manual'].map(target => [target, cases.filter(item => item.automation.target === target).length])),
  };
  return { importId, fileName, sheets, summary, cases };
}

export function refreshBddDerivedFields(testCase) {
  const next = upgradeBddCaseSchema(testCase);
  next.gherkin = renderGherkin(next);
  next.generatorMarkdown = renderGeneratorMarkdown(next);
  next.updatedAt = new Date().toISOString();
  next.editRevision = Number(next.editRevision || 0) + 1;
  return next;
}

export function upgradeBddCaseSchema(input) {
  const next = structuredClone(input);
  next.scenarioId ||= next.source?.caseId || next.id;
  next.functionName ||= next.featureName || next.source?.sheetName || '';
  next.featureName ||= next.functionName;
  next.tenant ||= 'coupay'; next.platform ||= 'browser'; next.device ||= '';
  next.region ||= 'KR'; next.category ||= 'non-payment'; next.language ||= 'Korean';
  next.bdd ||= {};
  const legacyGiven = Array.isArray(next.bdd.given) ? next.bdd.given : [];
  next.bdd.givenContext ??= legacyGiven.join('; ');
  next.bdd.preconditionKeys ||= inferPreconditions(next.bdd.givenContext);
  next.source ||= {};
  if (Number(next.source.abExtractionVersion || 0) < 2) {
    const preserved = (Array.isArray(next.bdd.abGroups) ? next.bdd.abGroups : []).filter(value => !/(?:A\/?B|AB)\s*(?:Key|ID)/i.test(value));
    next.bdd.abGroups = [...new Set([...preserved, ...inferAbGroups(next.bdd.givenContext)])];
    next.source.abExtractionVersion = 2;
  } else if (!Array.isArray(next.bdd.abGroups)) next.bdd.abGroups = inferAbGroups(next.bdd.givenContext);
  next.bdd.customPreconditions = Array.isArray(next.bdd.customPreconditions) ? next.bdd.customPreconditions.map(clean).filter(Boolean) : [];
  next.bdd.accounts ||= []; next.bdd.product ||= ''; next.bdd.payment ||= '';
  next.bdd.when ||= []; next.bdd.then ||= [];
  if (!Array.isArray(next.bdd.steps)) {
    const count = Math.max(next.bdd.when.length, next.bdd.then.length);
    next.bdd.steps = Array.from({ length: count }, (_, index) => ({ id: `legacy-${index + 1}`, sourceRowNumber: next.source?.rowNumbers?.[index] || next.source?.rowNumber || null, sourceCaseId: next.source?.caseIds?.[index] || next.source?.caseId || '', when: clean(next.bdd.when[index]), then: clean(next.bdd.then[index]) }));
  }
  next.bdd.steps = next.bdd.steps.map((step, index) => ({ id: step.id || `step-${index + 1}`, sourceRowNumber: step.sourceRowNumber ?? null, sourceCaseId: clean(step.sourceCaseId), when: clean(step.when), then: clean(step.then) }));
  next.bdd.when = next.bdd.steps.map(step => step.when).filter(Boolean);
  next.bdd.then = next.bdd.steps.map(step => step.then).filter(Boolean);
  next.source.rowNumbers ||= next.source.rowNumber != null ? [next.source.rowNumber] : [];
  next.source.caseIds ||= next.source.caseId ? [next.source.caseId] : [];
  next.bdd.commonChecks ||= [...COMMON_CHECKS];
  next.bdd.specificPaymentChecks ||= next.category === 'payment' ? [...PAYMENT_CHECKS] : [];
  delete next.bdd.given;
  return next;
}
