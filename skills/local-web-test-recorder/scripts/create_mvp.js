#!/usr/bin/env node
/** Create a clean, independent copy of the bundled Web Test Recorder MVP. */
import { cp, lstat, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node create_mvp.js /absolute/path/to/new-web-test-recorder');
  process.exit(2);
}

const output = resolve(target);
const ownDir = dirname(fileURLToPath(import.meta.url));
const source = resolve(ownDir, '../assets/web-test-recorder');
try {
  const stat = await lstat(output);
  if (!stat.isDirectory() || (await readdir(output)).length) throw new Error('target must be a new or empty directory');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await mkdir(output, { recursive: true });
}
for (const entry of await readdir(source)) {
  await cp(join(source, entry), join(output, entry), { recursive: true, errorOnExist: true, force: false });
}
console.log(`Created Web Test Recorder MVP at: ${output}`);
console.log('Next: npm install && npx playwright install && npm start');
