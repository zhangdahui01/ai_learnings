// Quiet Hall server. No dependencies.   node server/server.mjs [--port 8787] [--residents 24] [--data data/hall.json]
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { networkInterfaces } from 'node:os';
import { Hall } from './hall.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : process.env[`HALL_${name.toUpperCase()}`] ?? fallback;
}
const port = Number(arg('port', 8787));
const dataFile = arg('data', 'data/hall.json');
const hall = new Hall({ state: existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : undefined });
hall.seedResidents(Number(arg('residents', 0)));

let dirty = false;
function save() {
  if (!dirty) return;
  dirty = false;
  mkdirSync(dirname(dataFile), { recursive: true });
  writeFileSync(`${dataFile}.tmp`, JSON.stringify(hall));
  renameSync(`${dataFile}.tmp`, dataFile);
}
setInterval(save, 5000).unref();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { dirty = true; save(); process.exit(0); });

const ACTIONS = ['sit', 'stand', 'bow', 'leave', 'knock', 'prostrate', 'beads', 'move'];
function run(hall, me, action, data) {
  switch (action) {
    case 'bow': return hall.bow(me, data.to);
    case 'knock': case 'prostrate': case 'beads': return hall[action](me, data.count);
    case 'move': return hall.move(me, data.x, data.z);
    default: return hall[action](me);                       // sit, stand, leave
  }
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization',
               'access-control-allow-methods': 'GET, POST, OPTIONS' };
function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS });
  res.end(JSON.stringify(body));
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 4096) throw new Error('too large'); }
  return raw ? JSON.parse(raw) : {};
}

export const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    const path = new URL(req.url, 'http://x').pathname;
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (req.method === 'GET' && path === '/api/health') return send(res, 200, { ok: true });
    if (req.method === 'POST' && path === '/api/join') {
      const { handle, token: known } = await body(req);
      const out = hall.join(handle, known);
      dirty = true;
      return send(res, out.status, out.status === 200 ? { token: out.token, me: out.me } : { error: out.error });
    }
    if (req.method === 'GET' && path === '/api/hall') {
      const me = hall.auth(token);
      if (me) hall.touch(me);                       // reading the hall is the heartbeat
      return send(res, 200, { ...hall.snapshot(), me: me ? hall.view(me) : null });
    }
    if (req.method === 'POST' && ACTIONS.includes(path.slice(5)) && path.startsWith('/api/')) {
      const me = hall.auth(token);
      if (!me) return send(res, 401, { error: '请先入寺' });
      const data = await body(req);
      const action = path.slice(5);
      const result = run(hall, me, action, data);
      dirty = true;
      return send(res, 200, { ...(action === 'bow' ? result : {}), me: hall.view(me) });
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 400, { error: 'bad request' });
  }
});

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  server.listen(port, '0.0.0.0', () => {
    const lan = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log(`Quiet Hall server on http://localhost:${port}`);
    for (const ip of lan) console.log(`  phones on the same Wi-Fi: http://${ip}:${port}`);
  });
}
