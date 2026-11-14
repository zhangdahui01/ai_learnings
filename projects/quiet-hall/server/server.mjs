// Quiet Hall server. No dependencies.   node server/server.mjs [--port 8787] [--residents 24] [--data data/hall.json]
// The visit log goes to data/events.jsonl (set HALL_EVENTS_FILE to move it).
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { admin } from '../lib/admin.mjs';
import { apply, ROUTES } from '../lib/api.mjs';
import { record } from '../lib/log.mjs';
import { Hall } from './hall.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : process.env[`HALL_${name.toUpperCase()}`] ?? fallback;
}
const port = Number(arg('port', 8787));
const dataFile = arg('data', 'data/hall.json');
process.env.HALL_EVENTS_FILE ??= join(dirname(dataFile), 'events.jsonl');
process.env.HALL_ADMIN_FILE ??= join(dirname(dataFile), 'admin.json');
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
    const action = path.startsWith('/api/') ? path.slice(5) : '';
    if (action === 'admin' && req.method === 'POST') {
      const out = await admin(await body(req), (req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      return send(res, out.status, out.body);
    }
    if (!ROUTES[action]) return send(res, 404, { error: 'not found' });
    if (req.method !== ROUTES[action]) return send(res, 405, { error: 'method not allowed' });
    const out = apply(hall, action, { token: (req.headers.authorization || '').replace(/^Bearer\s+/i, ''),
                                      body: req.method === 'POST' ? await body(req) : {} });
    dirty = true;
    await record(out.log, req.headers);
    send(res, out.status, out.body);
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
