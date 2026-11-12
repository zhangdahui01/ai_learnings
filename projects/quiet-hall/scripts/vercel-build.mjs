// Build for Vercel with the Build Output API (v3): the exported web app as static files and one
// function per API action. Run from projects/quiet-hall after `npm install` in app/.
//   node scripts/vercel-build.mjs
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.vercel', 'output');
const ACTIONS = { health: 'GET', join: 'POST', hall: 'GET', sit: 'POST', stand: 'POST', bow: 'POST', leave: 'POST' };

rmSync(out, { recursive: true, force: true });
if (!process.env.SKIP_WEB_EXPORT) {
  execSync('npx expo export -p web --output-dir dist', { cwd: join(root, 'app'), stdio: 'inherit' });
}
cpSync(join(root, 'app', 'dist'), join(out, 'static'), { recursive: true });

for (const [action, method] of Object.entries(ACTIONS)) {
  const fn = join(out, 'functions', 'api', `${action}.func`);
  mkdirSync(fn, { recursive: true });
  cpSync(join(root, 'lib'), join(fn, 'lib'), { recursive: true, filter: src => !src.endsWith('.test.mjs') });
  cpSync(join(root, 'server', 'hall.mjs'), join(fn, 'server', 'hall.mjs'));
  writeFileSync(join(fn, 'index.mjs'), `import { route } from './lib/handler.mjs';\n\nexport default route('${action}', '${method}');\n`);
  writeFileSync(join(fn, '.vc-config.json'), JSON.stringify({
    runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: true, maxDuration: 15,
  }, null, 2));
}

writeFileSync(join(out, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    { handle: 'filesystem' },                               // static files and /api/* functions first
    { src: '/(?!api/).*', dest: '/index.html' },            // everything else is the single-page app
  ],
}, null, 2));
console.log(`Build Output written to ${out}`);
