import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, summarize } from './report.mjs';

const at = (daysAgo, hour) => new Date(2026, 10, 12 - daysAgo, hour).toISOString();
const now = new Date(2026, 10, 12, 20);
const E = (daysAgo, hour, handle, event, detail = {}, extra = {}) => ({ at: at(daysAgo, hour), handle, name: '安山', registered: handle === 'alice', event, detail, country: 'KR', city: 'Seoul', device: 'WeChat / iOS', ...extra });

test('summarize counts visits, visitors, feature use and one row per visitor', () => {
  const events = [
    E(0, 12, 'alice', 'trial_lost', { kind: 'dog', merit: -5 }),
    E(0, 11, 'alice', 'knock', { count: 5, merit: 5 }),
    E(0, 10, 'alice', 'login', { visits: 2, merit: 0 }),
    E(0, 9, 'alice', 'login_failed', { status: 401 }),
    E(1, 15, 'bob', 'prostrate', { count: 2, merit: 6 }, { country: 'CN', city: 'Shanghai' }),
    E(1, 14, 'bob', 'visit', { visits: 1, merit: 0 }, { country: 'CN', city: 'Shanghai' }),
    E(1, 9, 'alice', 'register', { visits: 1, merit: 0 }),
    E(40, 9, 'old', 'visit'),                                              // outside the 7 days shown per day, still in the totals
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  const r = summarize(events, { days: 7, now });
  assert.deepEqual(r.totals, { visits: 4, visitors: 3, registered: 1, registrations: 1, actions: 8 });
  assert.equal(r.daily.length, 7);
  assert.deepEqual(r.daily.at(-1), { day: '2026-11-12', visits: 1, visitors: 1, actions: 4 });
  assert.deepEqual(r.daily.at(-2), { day: '2026-11-11', visits: 2, visitors: 2, actions: 3 });
  assert.equal(r.features.find(f => f.key === 'knock').value, 5);           // five knocks in one batch
  assert.equal(r.features.find(f => f.key === 'prostrate').value, 2);
  assert.equal(r.features[0].key, 'knock');                                 // most used first
  const alice = r.visitors[0];
  assert.deepEqual([alice.handle, alice.registered, alice.visits, alice.actions], ['alice', true, 2, 4]);   // the wrong code is not her action
  assert.deepEqual(r.places[0], { label: 'KR · Seoul', value: 3 });
});

test('describe says what happened in one line', () => {
  assert.equal(describe({ event: 'knock', detail: { count: 3, merit: 3 } }), '3 次，功德 +3');
  assert.equal(describe({ event: 'trial_lost', detail: { kind: 'fairies', merit: -20 } }), '仙女，功德 -20');
  assert.equal(describe({ event: 'leave', detail: { seconds: 600, merit: 7 } }), '共坐 10 分钟，功德 7');
});
