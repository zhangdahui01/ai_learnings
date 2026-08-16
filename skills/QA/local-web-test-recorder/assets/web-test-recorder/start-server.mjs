#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, appendFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let appPort = Number(process.env.PORT || 4173);
let installDependencies = false;

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--install') installDependencies = true;
  else if (argument === '--port') appPort = Number(args[++index]);
  else if (argument === '--help' || argument === '-h') {
    console.log(`coupayWeb testing server launcher

Usage:
  node start-server.mjs [--port 4173] [--install]

Options:
  --port <number>  Server port. Defaults to PORT or 4173.
  --install        Run npm ci when node_modules is missing.
  --help           Show this help.`);
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

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20) {
  console.error(`Node.js 20 or newer is required. Current version: ${process.version}`);
  process.exit(1);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const logDir = join(appRoot, 'data', 'logs');
const logFile = join(logDir, 'server.log');
await mkdir(logDir, { recursive: true });

async function exists(path) {
  try { await access(path, constants.F_OK); return true; }
  catch { return false; }
}

async function run(command, commandArgs, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: appRoot, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

const playwrightPackage = join(appRoot, 'node_modules', 'playwright', 'package.json');
if (!(await exists(playwrightPackage))) {
  if (!installDependencies) {
    console.error('Dependencies are not installed. Run "node start-server.mjs --install" or "npm ci" first.');
    process.exit(1);
  }
  console.log('Installing locked npm dependencies...');
  try { await run(npmCommand, ['ci']); }
  catch (error) { console.error(`Dependency installation failed: ${error.message}`); process.exit(1); }
}

try {
  const { chromium } = await import('playwright');
  const executable = chromium.executablePath();
  if (!(await exists(executable))) console.warn('Warning: Playwright Chromium is not installed. The server can start, but recording/replay will fail. Run: npx playwright install chromium firefox webkit');
} catch (error) {
  console.warn(`Warning: unable to verify Playwright browsers: ${error.message}`);
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
  env: { ...process.env, PORT: String(appPort) },
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
