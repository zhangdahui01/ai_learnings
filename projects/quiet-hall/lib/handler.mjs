// The hall API as stateless functions: load the hall, apply one action, save if it changed, log the visit.
import { Hall } from '../server/hall.mjs';
import { apply, ROUTES } from './api.mjs';
import { record } from './log.mjs';
import { load, save } from './store.mjs';

const RESIDENTS = Number(process.env.HALL_RESIDENTS ?? 24);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization',
               'access-control-allow-methods': 'GET, POST, OPTIONS' };

export function route(action, method = ROUTES[action]) {
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
        await record(out.log, req.headers);
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
