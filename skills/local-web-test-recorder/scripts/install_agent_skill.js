#!/usr/bin/env node
/** Install this canonical Agent Skill into a Codex, Claude Code, or Devin discovery directory. */
import { cp, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillName = 'local-web-test-recorder';
const ownDir = dirname(fileURLToPath(import.meta.url));
const source = resolve(ownDir, '..');
const args = process.argv.slice(2);
const platform = args.shift();

function usage(message) {
  if (message) console.error(message);
  console.error(`Usage:
  node scripts/install_agent_skill.js codex [--scope user|project] [--project /absolute/repo] [--force] [--dry-run]
  node scripts/install_agent_skill.js claude [--scope user|project] [--project /absolute/repo] [--force] [--dry-run]
  node scripts/install_agent_skill.js devin --scope project --project /absolute/repo [--force] [--dry-run]`);
  process.exit(2);
}

if (!['codex', 'claude', 'devin'].includes(platform)) usage('Platform must be codex, claude, or devin.');

const options = { scope: platform === 'devin' ? 'project' : 'user', project: '', force: false, dryRun: false };
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--scope') options.scope = args[++index] || usage('--scope requires a value.');
  else if (argument === '--project') options.project = args[++index] || usage('--project requires a path.');
  else if (argument === '--force') options.force = true;
  else if (argument === '--dry-run') options.dryRun = true;
  else usage(`Unknown argument: ${argument}`);
}

if (!['user', 'project'].includes(options.scope)) usage('--scope must be user or project.');
if (platform === 'devin' && options.scope !== 'project') usage('Devin skills are repository-scoped; use --scope project.');
if (options.scope === 'project' && !options.project) usage('Project scope requires --project /absolute/repo.');
if (options.project && !isAbsolute(options.project)) usage('--project must be an absolute path.');

const root = options.scope === 'user'
  ? homedir()
  : resolve(options.project);
const discoveryDir = platform === 'claude' ? '.claude/skills' : '.agents/skills';
const target = join(root, discoveryDir, skillName);
const sourceToTarget = relative(source, target);
if (!sourceToTarget || (!sourceToTarget.startsWith(`..${sep}`) && sourceToTarget !== '..')) {
  usage('Refusing to install the skill inside its own source directory.');
}
if (basename(target) !== skillName) usage('Resolved target is unsafe.');

try {
  const projectStat = await lstat(root);
  if (!projectStat.isDirectory()) usage('Target root is not a directory.');
} catch (error) {
  usage(`Target root does not exist: ${root}`);
}

const ignoredNames = new Set(['.DS_Store', '__pycache__', 'node_modules', 'artifacts', 'recordings']);
const filter = sourcePath => {
  const name = basename(sourcePath);
  if (ignoredNames.has(name) || name.endsWith('.pyc')) return false;
  return !sourcePath.endsWith(join('data', 'store.json'));
};

if (options.dryRun) {
  console.log(`Would install ${platform}/${options.scope}: ${source} -> ${target}`);
  process.exit(0);
}

try {
  const existing = await lstat(target);
  if (existing && !options.force) usage(`Target already exists: ${target}\nRe-run with --force only after reviewing that directory.`);
  await rm(target, { recursive: true, force: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true, filter, errorOnExist: true, force: false });
if (!(await readdir(target)).includes('SKILL.md')) throw new Error('Installation failed: SKILL.md was not copied.');

console.log(`Installed ${skillName} for ${platform} (${options.scope}) at: ${target}`);
if (platform === 'codex') console.log('Invoke with: $local-web-test-recorder');
if (platform === 'claude') console.log('Invoke with: /local-web-test-recorder');
if (platform === 'devin') console.log('Commit the installed .agents/skills directory, push it, then invoke with: @skills:local-web-test-recorder');
