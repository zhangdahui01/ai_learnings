#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseManualCaseWorkbook } from '../lib/bdd-case-factory.js';
import { buildKnowledgeIndex, createGenerationJob } from '../lib/automation-knowledge.js';

function args(argv) { const result = { _: [] }; for (let i = 0; i < argv.length; i += 1) { const item = argv[i]; if (!item.startsWith('--')) result._.push(item); else result[item.slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i] ?? true; } return result; }
function required(value, label) { if (!value) throw new Error(`缺少 ${label}`); return resolve(String(value)); }
function safe(value) { return String(value).replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 100); }

const options = args(process.argv.slice(2));
const command = options._[0];

if (command === 'import') {
  const input = required(options.input, '--input'); const output = resolve(String(options.output || join(process.cwd(), 'bdd-output')));
  const result = await parseManualCaseWorkbook(await readFile(input), { fileName: basename(input) });
  await mkdir(join(output, 'cases'), { recursive: true }); await mkdir(join(output, 'specs'), { recursive: true });
  for (const item of result.cases) {
    const name = `${safe(item.source.sheetName)}--${safe(item.source.caseId)}--r${item.source.rowNumber}`;
    await writeFile(join(output, 'cases', `${name}.json`), JSON.stringify(item, null, 2));
    await writeFile(join(output, 'specs', `${name}.md`), item.generatorMarkdown);
  }
  await writeFile(join(output, 'manifest.json'), JSON.stringify({ ...result, cases: result.cases.map(item => ({ id: item.id, sourceKey: item.sourceKey, scenarioId:item.scenarioId, functionName:item.functionName, fileName:item.source.fileName, sheetName:item.source.sheetName, sheetIndex:item.source.sheetIndex, rowNumber:item.source.rowNumber, title: item.title, score: item.automation.score, target: item.automation.target })) }, null, 2));
  console.log(JSON.stringify({ output, ...result.summary, sheets: result.sheets.length }, null, 2));
} else if (command === 'knowledge-index') {
  const repo = required(options.repo, '--repo'); const output = resolve(String(options.output || join(process.cwd(), 'knowledge-index.json')));
  const index = await buildKnowledgeIndex(repo, { name: options.name || basename(repo) }); await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(index, null, 2));
  console.log(JSON.stringify({ output, name: index.name, fileCount: index.fileCount, graphProvider:index.graph.provider, nodes:index.graph.nodeCount, edges:index.graph.edgeCount }, null, 2));
} else if (command === 'generation-job') {
  const input = required(options.case, '--case'); const output = resolve(String(options.output || join(process.cwd(), 'generation-jobs')));
  if (!options.knowledge) throw new Error('缺少 --knowledge；Repo 知识图谱是脚本生成的必需输入。');
  const testCase = JSON.parse(await readFile(input, 'utf8')); const indexes = [JSON.parse(await readFile(resolve(String(options.knowledge)), 'utf8'))];
  const recordings = String(options.recordings || '').split(',').map(item=>item.trim()).filter(Boolean);
  const job = await createGenerationJob({ testCase, knowledgeSources: indexes, recordings, useGeneratorAgent: options.generator !== 'false', outputDir: output });
  console.log(JSON.stringify({ id: job.id, jobFolder: job.jobFolder, runtime: job.runtime, outputs:job.outputs }, null, 2));
} else {
  console.log('用法:\n  node scripts/bdd-case-factory.mjs import --input manual.xlsx --output bdd-output\n  node scripts/bdd-case-factory.mjs knowledge-index --repo /repo --output knowledge-index.json\n  node scripts/bdd-case-factory.mjs generation-job --case case.json [--knowledge knowledge-index.json]');
  process.exitCode = command ? 1 : 0;
}
