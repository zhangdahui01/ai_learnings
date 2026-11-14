// The admin side of the visit log: one account, sessions, and the raw events for the dashboard at /admin.
// Deployed, every check happens inside Supabase (sql/admin.sql), because the key these functions are called
// with is public. Locally the same rules run here, with the account in a file or in memory.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { memory as loggedInMemory } from './log.mjs';

const WEEK_MS = 7 * 24 * 3600 * 1000, LOCK_MS = 5 * 60 * 1000, MAX_EVENTS = 10000;
const sha = text => createHash('sha256').update(String(text ?? '')).digest('hex');

async function rpc(name, args) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: process.env.SUPABASE_KEY, authorization: `Bearer ${process.env.SUPABASE_KEY}` },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`admin ${name} failed: ${res.status}`);
  return res.json();
}

// ---- local backend -------------------------------------------------------------------------------------------
let local = null;
function book() {
  if (!local) {
    const file = process.env.HALL_ADMIN_FILE;
    local = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { account: null, sessions: {} };
  }
  return local;
}
function keep() {
  const file = process.env.HALL_ADMIN_FILE;
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(local));
}
export function resetLocalAdmin() { local = { account: null, sessions: {} }; }

const hash = (password, salt) => scryptSync(password, salt, 32).toString('hex');
function issue(username, now) {
  const token = randomBytes(24).toString('hex');
  for (const [k, s] of Object.entries(book().sessions)) if (s.expires < now) delete book().sessions[k];
  book().sessions[sha(token)] = { username, expires: now + WEEK_MS };
  keep();
  return { status: 200, token, username };
}
const valid = (username, password) => typeof username === 'string' && /^[a-z0-9_]{3,20}$/.test(username)
  && typeof password === 'string' && password.length >= 8 && password.length <= 200;

function localEvents(since) {
  const file = process.env.HALL_EVENTS_FILE;
  const all = file ? (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : []) : loggedInMemory;
  const rows = all.filter(e => e.at >= since).sort((a, b) => (a.at < b.at ? 1 : -1));
  return { total: rows.length, limit: MAX_EVENTS, events: rows.slice(0, MAX_EVENTS) };
}

const backend = {
  async status() { return process.env.SUPABASE_URL ? rpc('quiet_hall_admin_status', {}) : !!book().account; },
  async claim(username, password, now) {
    if (process.env.SUPABASE_URL) return rpc('quiet_hall_admin_claim', { p_username: username, p_password: password });
    if (book().account) return { status: 409 };
    if (!valid(username, password)) return { status: 400 };
    const salt = randomBytes(16).toString('hex');
    book().account = { username, salt, hash: hash(password, salt), failures: 0, lockedUntil: 0 };
    return issue(username, now);
  },
  async login(username, password, now) {
    if (process.env.SUPABASE_URL) return rpc('quiet_hall_admin_login', { p_username: username, p_password: password });
    const a = book().account;
    if (!a || a.username !== username) return { status: 401 };
    if (a.lockedUntil > now) return { status: 429 };
    if (typeof password !== 'string' || !timingSafeEqual(Buffer.from(hash(password, a.salt)), Buffer.from(a.hash))) {
      a.failures += 1;
      if (a.failures >= 5) { a.failures = 0; a.lockedUntil = now + LOCK_MS; }
      keep();
      return { status: 401 };
    }
    a.failures = 0; a.lockedUntil = 0;
    return issue(username, now);
  },
  async events(token, since, now) {
    if (process.env.SUPABASE_URL) return rpc('quiet_hall_admin_events', { p_token: token, p_since: since });
    const s = book().sessions[sha(token)];
    return s && s.expires > now ? { username: s.username, ...localEvents(since) } : null;
  },
  async logout(token) {
    if (process.env.SUPABASE_URL) return rpc('quiet_hall_admin_logout', { p_token: token });
    const had = delete book().sessions[sha(token)]; keep(); return had;
  },
};

const ERRORS = { 400: '账号需 3–20 位小写字母、数字或下划线，密码至少 8 位', 401: '账号或密码不对', 409: '管理员账号已经设置过了',
                 429: '输错次数太多，请 5 分钟后再试' };

/** One call of the admin API: { op, ... } in, { status, body } out. */
export async function admin(body = {}, token = '', now = Date.now()) {
  const op = body.op;
  if (op === 'status') return { status: 200, body: { claimed: !!(await backend.status()) } };
  if (op === 'claim' || op === 'login') {
    const username = String(body.username ?? '').trim().toLowerCase();
    const out = await backend[op](username, body.password, now);
    return out.status === 200 ? { status: 200, body: { token: out.token, username: out.username } }
                              : { status: out.status, body: { error: ERRORS[out.status] ?? '失败' } };
  }
  if (op === 'events') {
    const days = Math.min(Math.max(Number(body.days) || 30, 1), 366);
    const out = token ? await backend.events(token, new Date(now - days * 86400000).toISOString(), now) : null;
    return out ? { status: 200, body: { ...out, days } } : { status: 401, body: { error: '请先登录' } };
  }
  if (op === 'logout') { await backend.logout(token); return { status: 200, body: { ok: true } }; }
  return { status: 400, body: { error: 'unknown op' } };
}
