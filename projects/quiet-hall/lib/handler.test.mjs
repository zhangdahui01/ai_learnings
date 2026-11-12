import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from './handler.mjs';

function call(action, method, { body, token, allowed = method } = {}) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; },
                  end(text) { resolve({ status: this.statusCode, body: text ? JSON.parse(text) : null }); } };
    route(action, allowed)({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
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

test('concurrent joins do not lose each other', async () => {
  const results = await Promise.all(['b1', 'b2', 'b3', 'b4'].map(h => call('join', 'POST', { body: { handle: h } })));
  assert.deepEqual(results.map(r => r.status), [200, 200, 200, 200]);
  assert.equal(new Set(results.map(r => r.body.me.seat)).size, 4);
});
