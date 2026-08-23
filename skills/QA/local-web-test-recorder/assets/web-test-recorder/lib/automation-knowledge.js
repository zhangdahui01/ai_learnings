import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.md']);
const IGNORED = new Set(['.git', 'node_modules', 'data', 'artifacts', 'recordings', 'test-results', 'playwright-report', 'dist', 'build']);
const SECRET_PATTERN = /(password|passwd|secret|token|authorization|api[_-]?key)\s*[:=]\s*([^\s,;}]+)/gi;

function redact(value) { return String(value || '').replace(SECRET_PATTERN, '$1=[REDACTED]'); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function matches(text, regex) { return unique([...text.matchAll(regex)].map(match => match[1] || match[0])).slice(0, 100); }

async function walk(folder, root, output) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await walk(path, root, output);
    else if (SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase()) && (await stat(path)).size <= 512 * 1024) output.push({ path, relativePath: relative(root, path) });
  }
}

function edgeId(from, type, to) { return createHash('sha1').update(`${from}:${type}:${to}`).digest('hex').slice(0, 16); }

function buildLocalGraph(entries) {
  const nodes = []; const edges = []; const pathIds = new Map();
  for (const entry of entries) {
    const fileId = `file:${entry.path}`; pathIds.set(entry.path.replaceAll('\\', '/'), fileId);
    nodes.push({ id: fileId, type: 'file', name: entry.path, path: entry.path });
    for (const [type, values] of [['test', entry.tests], ['locator', entry.locators], ['flow', entry.flows], ['symbol', entry.symbols]]) {
      values.forEach((value, index) => {
        const id = `${type}:${entry.path}:${index}`;
        nodes.push({ id, type, name: value, path: entry.path });
        edges.push({ id: edgeId(fileId, 'contains', id), from: fileId, to: id, type: 'contains', confidence: 'extracted' });
      });
    }
  }
  for (const entry of entries) {
    const from = `file:${entry.path}`;
    for (const imported of entry.imports || []) {
      const normalized = imported.replace(/^\.\//, '');
      const target = [...pathIds.entries()].find(([path]) => path === normalized || path.startsWith(`${normalized}.`) || path.endsWith(`/${normalized}`));
      if (target) edges.push({ id: edgeId(from, 'imports', target[1]), from, to: target[1], type: 'imports', confidence: 'extracted' });
    }
  }
  return { provider: 'builtin-local-code-graph', schemaVersion: 1, status: 'ready', nodes, edges, nodeCount: nodes.length, edgeCount: edges.length };
}

async function loadGraphifyGraph(root) {
  const graphPath = join(root, 'graphify-out', 'graph.json');
  if (!existsSync(graphPath)) return null;
  const graph = JSON.parse(await readFile(graphPath, 'utf8'));
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : Array.isArray(graph.elements?.nodes) ? graph.elements.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : Array.isArray(graph.elements?.edges) ? graph.elements.edges : [];
  return { provider: 'graphify', schemaVersion: graph.schemaVersion || 1, status: 'ready', graphPath, nodeCount: nodes.length, edgeCount: edges.length, nodes, edges };
}

export async function buildKnowledgeIndex(repoPath, { name = basename(repoPath), id = randomUUID(), provider = 'auto' } = {}) {
  const root = resolve(repoPath);
  const details = await stat(root).catch(() => null);
  if (!details?.isDirectory()) throw Object.assign(new Error(`知识库目录不存在：${root}`), { status: 400, code: 'KNOWLEDGE_PATH_INVALID' });
  const files = [];
  await walk(root, root, files);
  const entries = [];
  for (const file of files) {
    const source = redact(await readFile(file.path, 'utf8'));
    entries.push({
      path: file.relativePath,
      hash: createHash('sha256').update(source).digest('hex'),
      tests: matches(source, /\btest(?:\.\w+)?\s*\(\s*['"`]([^'"`]+)/g),
      locators: unique([
        ...matches(source, /getBy(?:Role|Label|Text|TestId|Placeholder|Title|AltText)\s*\(\s*['"`]([^'"`]+)/g),
        ...matches(source, /(?:locator|frameLocator)\s*\(\s*['"`]([^'"`]+)/g),
      ]),
      flows: matches(source, /(?:login|payment|pay|checkout|card|cash|refund|logout|sign.?in|결제|로그인)/gi),
      symbols: matches(source, /(?:function|class|const)\s+([A-Za-z_$][\w$]*)/g),
      imports: matches(source, /(?:import[^'"`]*from\s*|require\s*\()\s*['"`]([^'"`]+)/g),
    });
  }
  const graphify = provider !== 'builtin' ? await loadGraphifyGraph(root) : null;
  if (provider === 'graphify' && !graphify) throw Object.assign(new Error(`没有找到 ${join(root, 'graphify-out', 'graph.json')}。请先在目标 Repo 运行 graphify .`), { status: 409, code: 'GRAPHIFY_GRAPH_MISSING' });
  const graph = graphify || buildLocalGraph(entries);
  return { id, name, repoPath: root, indexedAt: new Date().toISOString(), fileCount: entries.length, entries, graph, graphReady: graph.status === 'ready' && graph.nodeCount > 0 };
}

export function selectKnowledgeEvidence(indexes, testCase, limit = 12) {
  const pairedSteps = (testCase.bdd.steps || []).flatMap(step => [step.when, step.then]);
  const query = [testCase.title, testCase.functionName || testCase.featureName, testCase.bdd.givenContext, ...(testCase.bdd.preconditionKeys || []), ...pairedSteps, ...(testCase.bdd.when || []), ...(testCase.bdd.then || [])].join(' ').toLowerCase();
  const terms = unique(query.split(/[^\p{L}\p{N}_-]+/u).filter(term => term.length >= 3));
  const rankedBySource = indexes.map(index => (index.entries || []).map(entry => {
    const haystack = `${entry.path} ${(entry.tests || []).join(' ')} ${(entry.locators || []).join(' ')} ${(entry.flows || []).join(' ')} ${(entry.symbols || []).join(' ')}`.toLowerCase();
    const matchedTerms = terms.filter(term => haystack.includes(term));
    const pathBoost = matchedTerms.filter(term => entry.path.toLowerCase().includes(term)).length * 2;
    const testBoost = matchedTerms.filter(term => (entry.tests || []).some(name => name.toLowerCase().includes(term))).length * 2;
    const score = matchedTerms.length + pathBoost + testBoost;
    return { knowledgeSourceId: index.id, knowledgeSourceName: index.name, ...entry, score, matchedTerms };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)));
  const selected = [];
  // Keep every selected repository represented so an existing P0 automation
  // suite cannot be hidden by a larger application repository.
  for (const ranked of rankedBySource) selected.push(...ranked.slice(0, 1));
  const selectedKeys = new Set(selected.map(item => `${item.knowledgeSourceId}:${item.path}`));
  const remaining = rankedBySource.flat().filter(item => !selectedKeys.has(`${item.knowledgeSourceId}:${item.path}`)).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  selected.push(...remaining.slice(0, Math.max(0, limit - selected.length)));
  return selected.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
}

export function detectAgentRuntime(env = process.env) {
  if (env.CODEX_HOME || /codex/i.test(env.TERM_PROGRAM || '')) return { id: 'codex', label: 'Codex', initCommand: 'npx playwright init-agents --loop=codex' };
  if (env.CLAUDE_CODE || env.CLAUDECODE) return { id: 'claude-code', label: 'Claude Code', initCommand: 'npx playwright init-agents --loop=claude' };
  if (env.DEVIN || env.DEVIN_SESSION_ID) return { id: 'devin', label: 'Devin', initCommand: null };
  return { id: 'local-agent', label: '当前本地 Agent', initCommand: null };
}

function agentInstruction(runtime, jobId) {
  const task = `处理 Playwright 生成任务 ${jobId}：读取已批准 BDD、多 Repo 知识图谱证据和可选 Codegen；生成脚本后调用 result API，真实回放失败则读取 fixPrompt 和附件做最小修复，循环到 awaiting-qa 或达到上限，不替 QA 签署。`;
  if (runtime.id === 'codex') return `使用 $local-web-test-recorder，${task}`;
  if (runtime.id === 'claude-code') return `/local-web-test-recorder ${task}`;
  if (runtime.id === 'devin') return `@skills:local-web-test-recorder ${task}`;
  return `使用 local-web-test-recorder Skill，${task}`;
}

export async function createGenerationJob({ testCase, knowledgeSources = [], targetKnowledgeSource = null, recordings = [], useGeneratorAgent = true, outputDir, targetRepoPath, replayMode = 'auto', autoFix = true, maxAttempts = 5 }) {
  const id = randomUUID();
  const evidence = selectKnowledgeEvidence(knowledgeSources, testCase);
  const runtime = detectAgentRuntime();
  const safeId = String(testCase.scenarioId || testCase.source.caseId).replace(/[^\p{L}\p{N}._-]/gu, '-');
  const specRelativePath = join('specs', String(testCase.tenant || 'coupay').toLowerCase(), String(testCase.region || 'KR').toLowerCase(), `${safeId}.md`);
  const testRelativePath = join('tests', String(testCase.tenant || 'coupay').toLowerCase(), String(testCase.region || 'KR').toLowerCase(), `${safeId}.spec.ts`);
  const job = {
    id, bddCaseId: testCase.id, status: 'queued', runtime,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    sources: {
      bdd: testCase.sourceKey,
      knowledgeSourceIds: knowledgeSources.map(source => source.id),
      knowledgeSources: knowledgeSources.map(source => ({ id: source.id, name: source.name, repoPath: source.repoPath, provider: source.graph?.provider || 'legacy-index' })),
      targetKnowledgeSourceId: targetKnowledgeSource?.id || knowledgeSources[0]?.id || null,
      knowledge: evidence.map(item => ({ sourceId: item.knowledgeSourceId, sourceName: item.knowledgeSourceName, path: item.path, score: item.score, matchedTerms: item.matchedTerms })),
      retrievalSummary: knowledgeSources.map(source => ({ sourceId: source.id, sourceName: source.name, matchedFiles: evidence.filter(item => item.knowledgeSourceId === source.id).length })),
      recordings,
    },
    generator: { useGeneratorAgent, engine: useGeneratorAgent ? 'playwright-test-generator-agent' : 'codegen-assisted', verificationRequired: true },
    outputs: { specRelativePath, testRelativePath },
    prompt: `Generate ${testRelativePath} from the approved specification at ${specRelativePath}. The approved BDD and all selected repository code graphs are mandatory evidence. Selected graphs: ${knowledgeSources.map(source => `${source.name} (${source.repoPath})`).join('; ')}. Retrieved graph-backed files: ${evidence.map(item => `${item.knowledgeSourceName}:${item.path} [score=${item.score}]`).join('; ') || 'no lexical match; inspect the selected graphs manually'}. The output repository is ${targetKnowledgeSource?.name || knowledgeSources[0]?.name || 'the configured target'} at ${targetRepoPath || targetKnowledgeSource?.repoPath || ''}. Reuse relevant repository flows and locators only after opening and checking those source files; do not copy a case only because its name is similar. ${recordings.length ? `Optional native Codegen references: ${recordings.join(', ')}.` : ''} Inspect the live UI, prefer role/test-id locators, execute the test, and save the verified TypeScript file at the requested output path.\n\n${testCase.generatorMarkdown}`,
    validation: {
      replayMode: replayMode === 'manual' ? 'manual' : 'auto',
      autoFix: autoFix !== false,
      maxAttempts: Math.min(10, Math.max(1, Number(maxAttempts) || 5)),
      attemptCount: 0,
      latestStatus: 'not-run',
      attempts: [],
    },
    progress: [{ stage: 'generation', status: 'queued', message: '等待当前 AI Agent 生成 Playwright 脚本', at: new Date().toISOString() }],
    qaSignOff: { status: 'pending', reviewer: '', comments: '', at: null },
    result: null,
  };
  job.agentInstruction = agentInstruction(runtime, id);
  if (outputDir) {
    const folder = join(outputDir, id);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'spec.md'), testCase.generatorMarkdown);
    await writeFile(join(folder, 'job.json'), JSON.stringify(job, null, 2));
    job.jobFolder = folder;
    const targetRoot = resolve(targetRepoPath || outputDir);
    const specPath = join(targetRoot, specRelativePath);
    await mkdir(join(specPath, '..'), { recursive: true });
    await writeFile(specPath, testCase.generatorMarkdown);
    job.outputs.specPath = specPath;
    job.outputs.testPath = join(targetRoot, testRelativePath);
    job.outputs.targetRepoPath = targetRoot;
  }
  return job;
}
