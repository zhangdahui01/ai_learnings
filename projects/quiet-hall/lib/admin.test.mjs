import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admin, resetLocalAdmin } from './admin.mjs';
import { memory, record } from './log.mjs';

test('the first caller sets the admin account; after that only the password opens the visit log', async () => {
  resetLocalAdmin(); memory.length = 0;
  await record({ handle: 'alice', name: '安山', registered: true, event: 'knock', detail: { count: 2, merit: 2 } }, { 'user-agent': 'iPhone MicroMessenger' });

  assert.equal((await admin({ op: 'status' })).body.claimed, false);
  assert.equal((await admin({ op: 'events' }, '')).status, 401);
  assert.equal((await admin({ op: 'claim', username: 'boss', password: 'short' })).status, 400);
  const claimed = await admin({ op: 'claim', username: 'Boss', password: 'a long password' });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.username, 'boss');
  assert.equal((await admin({ op: 'status' })).body.claimed, true);
  assert.equal((await admin({ op: 'claim', username: 'thief', password: 'another password' })).status, 409);

  const seen = await admin({ op: 'events', days: 7 }, claimed.body.token);
  assert.equal(seen.status, 200);
  assert.equal(seen.body.events.length, 1);
  assert.equal(seen.body.events[0].device, 'WeChat / iOS');
  assert.equal((await admin({ op: 'events' }, 'not-a-token')).status, 401);

  assert.equal((await admin({ op: 'login', username: 'boss', password: 'wrong' })).status, 401);
  const again = await admin({ op: 'login', username: 'boss', password: 'a long password' });
  assert.equal(again.status, 200);
  await admin({ op: 'logout' }, again.body.token);
  assert.equal((await admin({ op: 'events' }, again.body.token)).status, 401);
  assert.equal((await admin({ op: 'events' }, claimed.body.token)).status, 200);      // the other session still stands
});

test('five wrong passwords pause the admin account for five minutes', async () => {
  resetLocalAdmin();
  const t0 = 1_000_000;
  await admin({ op: 'claim', username: 'boss', password: 'a long password' }, '', t0);
  for (let i = 0; i < 5; i += 1) assert.equal((await admin({ op: 'login', username: 'boss', password: 'nope' }, '', t0)).status, 401);
  assert.equal((await admin({ op: 'login', username: 'boss', password: 'a long password' }, '', t0 + 1000)).status, 429);
  assert.equal((await admin({ op: 'login', username: 'boss', password: 'a long password' }, '', t0 + 5 * 60 * 1000 + 1)).status, 200);
});
