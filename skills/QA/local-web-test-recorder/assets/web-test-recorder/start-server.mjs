#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, appendFile, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let appPort = Number(process.env.PORT || 4173);
let bootstrap = process.env.WTR_SKIP_BOOTSTRAP !== '1';
let installGraphify = process.env.WTR_INSTALL_GRAPHIFY !== '0';
let offline = process.env.WTR_OFFLINE === '1';
let installSystemDeps = process.env.WTR_INSTALL_SYSTEM_DEPS === '1';
let bootstrapOnly = false;
let agentTarget = process.env.PLAYWRIGHT_AGENT_TARGET || '';
let agentLoop = process.env.PLAYWRIGHT_AGENT_LOOP || '';

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--install') bootstrap = true; // Kept for backward compatibility.
  else if (argument === '--skip-bootstrap') bootstrap = false;
  else if (argument === '--without-graphify') installGraphify = false;
  else if (argument === '--with-graphify') installGraphify = true;
  else if (argument === '--offline') offline = true;
  else if (argument === '--install-system-deps') installSystemDeps = true;
  else if (argument === '--bootstrap-only') bootstrapOnly = true;
  else if (argument === '--agent-target') agentTarget = args[++index] || '';
  else if (argument === '--agent-loop') agentLoop = args[++index] || '';
  else if (argument === '--port') appPort = Number(args[++index]);
  else if (argument === '--help' || argument === '-h') {
    console.log(`coupayWeb testing server launcher

Usage:
  node start-server.mjs [options]

Options:
  --port <number>          Server port. Defaults to PORT or 4173.
  --install                Compatibility alias; dependency bootstrap is automatic.
  --skip-bootstrap         Do not install or repair missing dependencies.
  --offline                Never download; fail if required local dependencies are missing.
  --with-graphify          Install Graphify in data/tools when missing (default).
  --without-graphify       Skip optional Graphify; the built-in local code graph remains available.
  --install-system-deps    On Linux, let Playwright install OS browser libraries (may require sudo).
  --bootstrap-only         Install/check dependencies, write the report, and do not start the server.
  --agent-target <path>    Initialize Playwright Test Agents in this explicit repository.
  --agent-loop <name>      codex, claude, copilot, vscode, vscode-legacy, or opencode.
  --help                   Show this help.

Environment equivalents:
  WTR_SKIP_BOOTSTRAP=1, WTR_OFFLINE=1, WTR_INSTALL_GRAPHIFY=0,
  WTR_INSTALL_SYSTEM_DEPS=1, PLAYWRIGHT_AGENT_TARGET, PLAYWRIGHT_AGENT_LOOP.`);
    process.exit(0);
  } else {
    console.error(`Unknown option: ${argument}\nRun "node start-server.mjs --help" for usage.`);
    process.exit(2);
  }
}

if (!Number.isInteger(appPort) || appPort < 1 || appPort > 65535) {
  console.error(`Invalid port: ${appPort}`);
  process.exit(2);
}
if (Boolean(agentTarget) !== Boolean(agentLoop)) {
  console.error('--agent-target and --agent-loop must be provided together.');
  process.exit(2);
}
if (agentLoop && !['codex', 'claude', 'copilot', 'vscode', 'vscode-legacy', 'opencode'].includes(agentLoop)) {
  console.error(`Unsupported agent loop: ${agentLoop}. Use codex, claude, copilot, vscode, vscode-legacy, or opencode.`);
  process.exit(2);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20) {
  console.error(`Node.js 20 or newer is required. Current version: ${process.version}`);
  process.exit(1);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const logDir = join(appRoot, 'data', 'logs');
const toolsDir = join(appRoot, 'data', 'tools');
const bootstrapReportFile = join(logDir, 'dependency-bootstrap.json');
const logFile = join(logDir, 'server.log');
await mkdir(logDir, { recursive: true });
await mkdir(toolsDir, { recursive: true });

async function exists(path) {
  try { await access(path, constants.F_OK); return true; }
  catch { return false; }
}

async function run(command, commandArgs, options = {}) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, { cwd: appRoot, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function capture(command, commandArgs, options = {}) {
  return await new Promise(resolvePromise => {
    const child = spawn(command, commandArgs, { cwd: appRoot, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.once('error', error => resolvePromise({ ok: false, stdout, stderr: error.message }));
    child.once('exit', code => resolvePromise({ ok: code === 0, stdout, stderr, code }));
  });
}

const report = {
  checkedAt: new Date().toISOString(),
  node: { status: 'ready', version: process.version },
  npm: { status: 'pending' },
  browsers: { status: 'pending', missing: [] },
  graphify: { status: installGraphify ? 'pending' : 'skipped' },
  testAgents: { status: agentTarget ? 'pending' : 'available-on-demand' }
};

async function saveReport() {
  await writeFile(bootstrapReportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function ensureNodeDependencies() {
  const playwrightPackage = join(appRoot, 'node_modules', 'playwright', 'package.json');
  if (await exists(playwrightPackage)) {
    report.npm = { status: 'ready', action: 'reused' };
    return;
  }
  if (!bootstrap || offline) throw new Error('npm dependencies are missing and downloads are disabled. Run once without --offline/--skip-bootstrap.');
  console.log('[bootstrap] Installing locked npm dependencies...');
  await run(npmCommand, ['ci']);
  report.npm = { status: 'ready', action: 'installed-with-npm-ci' };
}

async function ensureBrowsers() {
  const playwright = await import('playwright');
  const browsers = ['chromium', 'firefox', 'webkit'];
  const missing = [];
  for (const name of browsers) {
    const executable = playwright[name].executablePath();
    if (!(await exists(executable))) missing.push(name);
  }
  if (!missing.length) {
    report.browsers = { status: 'ready', action: 'reused', missing: [] };
    return;
  }
  report.browsers.missing = missing;
  if (!bootstrap || offline) throw new Error(`Playwright browsers are missing (${missing.join(', ')}) and downloads are disabled.`);
  console.log(`[bootstrap] Installing Playwright browsers: ${missing.join(', ')}...`);
  const cli = join(appRoot, 'node_modules', 'playwright', 'cli.js');
  const installArgs = [cli, 'install'];
  if (installSystemDeps && process.platform === 'linux') installArgs.push('--with-deps');
  installArgs.push(...missing);
  await run(process.execPath, installArgs);
  report.browsers = { status: 'ready', action: 'installed', missing: [] };
}

function graphifyPaths() {
  const root = join(toolsDir, 'graphify');
  const scripts = process.platform === 'win32' ? join(root, 'Scripts') : join(root, 'bin');
  return {
    root,
    python: join(scripts, process.platform === 'win32' ? 'python.exe' : 'python'),
    graphify: join(scripts, process.platform === 'win32' ? 'graphify.exe' : 'graphify')
  };
}

async function locatePython() {
  for (const command of process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']) {
    const commandArgs = command === 'py' ? ['-3', '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'] : ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])'];
    const result = await capture(command, commandArgs);
    if (!result.ok) continue;
    const [major, minor] = result.stdout.trim().split('.').map(Number);
    if (major > 3 || (major === 3 && minor >= 10)) return { command, prefix: command === 'py' ? ['-3'] : [], version: `${major}.${minor}` };
  }
  return null;
}

async function ensureGraphify() {
  if (!installGraphify) return '';
  const paths = graphifyPaths();
  if (await exists(paths.graphify)) {
    const version = await capture(paths.graphify, ['--version']);
    report.graphify = { status: 'ready', action: 'reused', executable: paths.graphify, version: (version.stdout || version.stderr).trim() };
    return paths.graphify;
  }
  if (!bootstrap || offline) {
    report.graphify = { status: 'degraded', reason: 'not installed and downloads are disabled', fallback: 'built-in-local-code-graph' };
    return '';
  }
  const python = await locatePython();
  if (!python) {
    report.graphify = { status: 'degraded', reason: 'Python 3.10+ was not found', fallback: 'built-in-local-code-graph' };
    console.warn('[bootstrap] Graphify skipped: Python 3.10+ is not installed. Built-in local code graph remains available.');
    return '';
  }
  console.log(`[bootstrap] Installing Graphify (graphifyy) in isolated local environment with Python ${python.version}...`);
  await run(python.command, [...python.prefix, '-m', 'venv', paths.root]);
  await run(paths.python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', 'pip']);
  await run(paths.python, ['-m', 'pip', 'install', '--disable-pip-version-check', process.env.WTR_GRAPHIFY_PACKAGE || 'graphifyy']);
  report.graphify = { status: 'ready', action: 'installed-in-local-venv', executable: paths.graphify };
  return paths.graphify;
}

async function initializeTestAgents() {
  if (!agentTarget) return;
  if (!isAbsolute(agentTarget)) throw new Error(`Agent target must be an absolute path: ${agentTarget}`);
  const target = resolve(agentTarget);
  if (!(await exists(target))) throw new Error(`Agent target does not exist: ${target}`);
  const cli = join(appRoot, 'node_modules', 'playwright', 'cli.js');
  console.log(`[bootstrap] Initializing Playwright Planner/Generator/Healer definitions for ${agentLoop} in ${target}...`);
  await run(process.execPath, [cli, 'init-agents', `--loop=${agentLoop}`], { cwd: target });
  report.testAgents = { status: 'ready', loop: agentLoop, target };
}

let graphifyExecutable = '';
try {
  await ensureNodeDependencies();
  if (bootstrap) {
    await ensureBrowsers();
    try { graphifyExecutable = await ensureGraphify(); }
    catch (error) {
      report.graphify = { status: 'degraded', reason: error.message, fallback: 'built-in-local-code-graph' };
      console.warn(`[bootstrap] Graphify installation failed: ${error.message}. Built-in local code graph remains available.`);
    }
    await initializeTestAgents();
  } else {
    report.browsers = { status: 'not-checked' };
    report.graphify = { status: 'not-checked' };
    report.testAgents = { status: 'not-checked' };
  }
  await saveReport();
} catch (error) {
  report.failure = error.message;
  await saveReport();
  console.error(`Dependency bootstrap failed: ${error.message}`);
  console.error(`Report: ${bootstrapReportFile}`);
  process.exit(1);
}

console.log(`[bootstrap] Dependency report: ${bootstrapReportFile}`);
if (bootstrapOnly) {
  console.log('[bootstrap] Dependency bootstrap completed; server was not started.');
  process.exit(0);
}

try {
  const response = await fetch(`http://127.0.0.1:${appPort}/api/state`, { signal: AbortSignal.timeout(1200) });
  if (response.ok) {
    console.log(`coupayWeb testing is already running at http://localhost:${appPort}/`);
    process.exit(0);
  }
} catch {
  // No healthy recorder is listening on this port; continue with startup.
}

const startedAt = new Date().toISOString();
await appendFile(logFile, `\n[${startedAt}] starting server on port ${appPort}\n`);
console.log(`Starting coupayWeb testing at http://localhost:${appPort}/`);
console.log(`Server log: ${logFile}`);
console.log('Press Ctrl+C to stop.');

const server = spawn(process.execPath, ['server.js'], {
  cwd: appRoot,
  env: { ...process.env, PORT: String(appPort), ...(graphifyExecutable ? { GRAPHIFY_BIN: graphifyExecutable } : {}) },
  stdio: ['inherit', 'pipe', 'pipe']
});

const write = (target, chunk) => {
  target.write(chunk);
  appendFile(logFile, chunk).catch(error => console.error(`Unable to write server log: ${error.message}`));
};
server.stdout.on('data', chunk => write(process.stdout, chunk));
server.stderr.on('data', chunk => write(process.stderr, chunk));
server.once('error', error => {
  console.error(`Server failed to start: ${error.message}`);
  process.exitCode = 1;
});
server.once('exit', code => {
  appendFile(logFile, `[${new Date().toISOString()}] server exited with code ${code ?? 'signal'}\n`).catch(() => {});
  process.exitCode = code ?? 0;
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (!server.killed) server.kill(signal);
});
