// Build for Vercel with the Build Output API (v3): the exported web app as static files and one
// function for the API. Run from projects/quiet-hall after `npm install` in app/.
//   node scripts/vercel-build.mjs
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.vercel', 'output');
const { ROUTES: ACTIONS } = await import('../lib/api.mjs');

rmSync(out, { recursive: true, force: true });
if (!process.env.SKIP_WEB_EXPORT) {
  execSync('npx expo export -p web --output-dir dist', { cwd: join(root, 'app'), stdio: 'inherit' });
}
cpSync(join(root, 'app', 'dist'), join(out, 'static'), { recursive: true });

// The page is empty until the app's script has loaded and started. Show that it is loading, and if the
// script fails (an old browser, a blocked request) say so on the page instead of leaving it blank.
const indexFile = join(out, 'static', 'index.html');
const boot = `<div id="boot" style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#f1d9b0;color:#3b2a20;font:16px system-ui,sans-serif;text-align:center;padding:24px">
<div style="font-size:34px;font-weight:700;letter-spacing:8px">静堂</div><div id="boot-msg">正在打开山门…</div></div>
<script>
(function(){var box=document.getElementById('boot'),msg=document.getElementById('boot-msg'),root=document.getElementById('root');
function fail(t){if(!box.parentNode)return;msg.innerHTML='打不开：'+t+'<br><span style="font-size:13px;opacity:.75">请把这句话截图发给站长，或换一个浏览器试试</span>';}
window.addEventListener('error',function(e){var s=e.target&&e.target.src;fail(s?'脚本加载失败':(e.message||'脚本出错'));},true);
window.addEventListener('unhandledrejection',function(e){fail(String(e.reason&&e.reason.message||e.reason));});
var seen=new MutationObserver(function(){if(root.childNodes.length){seen.disconnect();box.parentNode&&box.parentNode.removeChild(box);}});
seen.observe(root,{childList:true});
setTimeout(function(){if(box.parentNode)msg.textContent='网络较慢，还在加载…';},8000);
setTimeout(function(){fail('加载超时，可能是网络拦截了本站');},40000);})();
</script>`;
writeFileSync(indexFile, readFileSync(indexFile, 'utf8').replace('<div id="root"></div>', `<div id="root"></div>${boot}`));

// One function serves every action: the free plan allows 12 functions per deployment and the API has more.
const fn = join(out, 'functions', 'api.func');
mkdirSync(fn, { recursive: true });
cpSync(join(root, 'lib'), join(fn, 'lib'), { recursive: true, filter: src => !src.endsWith('.test.mjs') });
cpSync(join(root, 'server', 'hall.mjs'), join(fn, 'server', 'hall.mjs'));
writeFileSync(join(fn, 'index.mjs'), `export { dispatch as default } from './lib/handler.mjs';\n`);
writeFileSync(join(fn, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: true, maxDuration: 15,
}, null, 2));

writeFileSync(join(out, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    { src: `/api/(${Object.keys(ACTIONS).join('|')})/?`, dest: '/api?action=$1' },
    { handle: 'filesystem' },                               // static files next
    { src: '/(?!api/).*', dest: '/index.html' },            // everything else is the single-page app
  ],
}, null, 2));
console.log(`Build Output written to ${out}`);
