import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from './handler.mjs';

function call(action, method, { body, token, allowed = method, headers = {} } = {}) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; },
                  end(text) { resolve({ status: this.statusCode, body: text ? JSON.parse(text) : null }); } };
    route(action, allowed)({ method, headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body }, res);
  });
}

test('stateless handlers keep one hall across calls (memory store)', async () => {
  const joined = await call('join', 'POST', { body: { handle: 'alice' } });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.me.seat, 24);                                  // after the 24 residents
  assert.equal((await call('join', 'POST', { body: { handle: 'ALICE' } })).status, 409);
  assert.equal((await call('sit', 'POST', {})).status, 401);
  assert.equal((await call('sit', 'POST', { token: joined.body.token })).body.me.sitting, true);
  const hall = await call('hall', 'GET', { token: joined.body.token });
  assert.deepEqual([hall.body.present, hall.body.sitting, hall.body.me.handle], [25, 25, 'alice']);
  assert.equal((await call('bow', 'POST', { token: joined.body.token, body: {} })).body.bowedTo, 24);
  assert.equal((await call('leave', 'POST', { token: joined.body.token })).body.me.seat, null);
  assert.equal((await call('hall', 'GET', {})).body.present, 24);
  assert.equal((await call('hall', 'POST', { allowed: 'GET' })).status, 405);
});

test('actions worth counting leave a line in the visit log; polling and walking do not', async () => {
  const { memory } = await import('./log.mjs');
  memory.length = 0;
  const headers = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) MicroMessenger/8.0', 'x-vercel-ip-country': 'KR', 'x-vercel-ip-city': 'Seoul' };
  const reg = await call('register', 'POST', { body: { handle: 'visitor1' }, headers });
  assert.match(reg.body.code, /^[0-9A-F]{5}-[0-9A-F]{5}$/);
  const token = reg.body.token;
  await call('hall', 'GET', { token, headers });
  await call('move', 'POST', { token, headers, body: { x: 1, z: 1 } });
  await call('knock', 'POST', { token, headers, body: { count: 3 } });
  await call('trial', 'POST', { token, headers, body: { result: 'lost', kind: 'dog' } });
  const history = await call('history', 'GET', { token, headers });
  assert.deepEqual(history.body.history.map(e => e.delta), [-3, 3]);
  await call('login', 'POST', { body: { handle: 'visitor1', code: 'bad' }, headers });
  assert.deepEqual(memory.map(e => e.event), ['register', 'knock', 'trial_lost', 'history', 'login_failed']);
  assert.deepEqual([memory[0].handle, memory[0].registered, memory[0].country, memory[0].city, memory[0].device], ['visitor1', true, 'KR', 'Seoul', 'WeChat / iOS']);
  assert.deepEqual(memory[1].detail, { count: 3, merit: 3 });
  assert.ok(!JSON.stringify(memory).includes(token) && !JSON.stringify(memory).includes(reg.body.code));
});

test('concurrent joins do not lose each other', async () => {
  const results = await Promise.all(['b1', 'b2', 'b3', 'b4'].map(h => call('join', 'POST', { body: { handle: h } })));
  assert.deepEqual(results.map(r => r.status), [200, 200, 200, 200]);
  assert.equal(new Set(results.map(r => r.body.me.seat)).size, 4);
});
