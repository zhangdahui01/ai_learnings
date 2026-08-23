import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const launcher = join(appRoot, 'start-server.mjs');

test('launcher prints help without starting the server', () => {
  const result = spawnSync(process.execPath, [launcher, '--help'], {
    cwd: appRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /node start-server\.mjs/);
  assert.match(result.stdout, /--install/);
  assert.match(result.stdout, /--with-graphify/);
  assert.match(result.stdout, /--agent-target/);
});

test('launcher requires agent target and loop together', () => {
  const result = spawnSync(process.execPath, [launcher, '--agent-target', appRoot], {
    cwd: appRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /must be provided together/);
});

test('launcher rejects unsupported agent loops before bootstrap', () => {
  const result = spawnSync(process.execPath, [launcher, '--agent-target', appRoot, '--agent-loop', 'devin'], {
    cwd: appRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unsupported agent loop/);
});

test('launcher rejects an invalid port', () => {
  const result = spawnSync(process.execPath, [launcher, '--port', '70000'], {
    cwd: appRoot,
    encoding: 'utf8'
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid port: 70000/);
});
