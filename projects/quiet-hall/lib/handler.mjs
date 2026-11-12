// The hall API as stateless functions: load the hall, apply one action, save if it changed.
import { Hall } from '../server/hall.mjs';
import { load, save } from './store.mjs';

const RESIDENTS = Number(process.env.HALL_RESIDENTS ?? 24);
const HEARTBEAT_WRITE_MS = 15_000;       // polling reads the hall every 2 s; only write a heartbeat this often
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization',
               'access-control-allow-methods': 'GET, POST, OPTIONS' };

function apply(hall, action, { token, body }) {
  if (action === 'health') return { status: 200, body: { ok: true } };
  if (action === 'join') {
    const out = hall.join(body.handle, body.token);
    return { status: out.status, body: out.status === 200 ? { token: out.token, me: out.me } : { error: out.error } };
  }
  const me = hall.auth(token);
  if (action === 'hall') {
    if (me && (!me.inHall || hall.now() - me.lastSeen > HEARTBEAT_WRITE_MS)) hall.touch(me);
    return { status: 200, body: { ...hall.snapshot(), me: me ? hall.view(me) : null } };
  }
  if (!me) return { status: 401, body: { error: '请先入寺' } };
  const result = action === 'bow' ? hall.bow(me, body.to) : hall[action](me);
  return { status: 200, body: { ...(action === 'bow' ? result : {}), me: hall.view(me) } };
}

export function route(action, method) {
  return async function handler(req, res) {
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
    res.setHeader('cache-control', 'no-store');
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (req.method !== method) { res.statusCode = 405; return res.end(JSON.stringify({ error: 'method not allowed' })); }
    res.setHeader('content-type', 'application/json; charset=utf-8');
    try {
      const input = { token: (req.headers.authorization || '').replace(/^Bearer\s+/i, ''),
                      body: req.body && typeof req.body === 'object' ? req.body : {} };
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { state, version } = await load();
        const hall = new Hall({ state: state ?? undefined });
        if (version === 0) hall.seedResidents(RESIDENTS);
        const before = version === 0 ? '' : JSON.stringify(hall);
        const out = apply(hall, action, input);
        const after = JSON.stringify(hall);
        if (after !== before && !(await save(JSON.parse(after), version))) continue;     // lost the race: try again
        res.statusCode = out.status;
        return res.end(JSON.stringify(out.body));
      }
      res.statusCode = 503;
      res.end(JSON.stringify({ error: '大殿人多，请稍后再试' }));
    } catch (err) {
      console.error(err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: '大殿暂时进不去，请稍后再试' }));
    }
  };
}
