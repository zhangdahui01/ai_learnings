import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hall, monkFor, AWAY_AFTER_MS } from './hall.mjs';

function hall() { let t = 1_000_000; const h = new Hall({ now: () => t }); return { h, tick: ms => { t += ms; } }; }

test('the same ID is always the same monk; different IDs differ', () => {
  assert.deepEqual(monkFor('Dahui'), monkFor('dahui'));
  const looks = new Set(Array.from({ length: 200 }, (_, i) => JSON.stringify(monkFor(`user${i}`))));
  assert.ok(looks.size > 150);
  const genders = Array.from({ length: 200 }, (_, i) => monkFor(`user${i}`).gender);
  assert.ok(genders.includes('m') && genders.includes('f'));
});

test('joining gives a cushion; an ID belongs to whoever holds its token', () => {
  const { h } = hall();
  const a = h.join('alice');
  assert.equal(a.status, 200); assert.equal(a.me.seat, 0);
  assert.equal(h.join('bob').me.seat, 1);
  assert.equal(h.join('Alice').status, 409);
  assert.equal(h.join('alice', a.token).me.seat, 0);
  for (const bad of ['', 'a', 'x'.repeat(17), 'a b', '<script>']) assert.equal(h.join(bad).status, 400);
});

test('sitting accumulates time; standing banks it', () => {
  const { h, tick } = hall();
  const me = h.auth(h.join('alice').token);
  h.sit(me); tick(60_000);
  assert.equal(h.view(me).sittingSeconds, 60);
  h.sit(me);                                   // sitting again does not restart the timer
  tick(30_000);
  assert.deepEqual([h.stand(me).totalSeconds, h.view(me).sitting], [90, false]);
  tick(10_000);
  assert.equal(h.view(me).totalSeconds, 90);
});

test('a monk who stops sending heartbeats leaves, keeps their time and frees the cushion', () => {
  const { h, tick } = hall();
  const a = h.auth(h.join('alice').token); h.join('bob');
  h.sit(a); tick(20_000); h.touch(a);          // alice's last heartbeat: 20 s into her sitting
  const b = h.auth(h.join('bob', [...h.monks.values()][1].token).token);
  tick(AWAY_AFTER_MS - 1000); h.touch(b);       // bob keeps checking in, alice has gone silent
  tick(2000); h.touch(b);
  const snap = h.snapshot();
  assert.deepEqual(snap.monks.map(m => m.handle), ['bob']);
  assert.equal(a.totalSeconds, 20);            // counted until the last heartbeat, not until the sweep
  assert.equal(h.join('carol').me.seat, 0);
  assert.equal(h.join('alice', a.token).me.seat, 2);
});

test('bowing is the only interaction', () => {
  const { h } = hall();
  const a = h.auth(h.join('alice').token); const b = h.auth(h.join('bob').token); h.join('carol');
  assert.equal(h.bow(a, 'bob').bowedTo, 1);
  assert.equal(h.bow(a).bowedTo, 2);
  assert.equal(h.bow(a, 'alice').bowedTo, 0);
  assert.equal(h.view(b).bows, 2);
});

test('residents fill the hall and cannot be impersonated', () => {
  const { h } = hall();
  h.seedResidents(5);
  assert.equal(h.snapshot().sitting, 5);
  assert.equal(h.join('resident-1').status, 409);
  assert.equal(h.join('alice').me.seat, 5);
  assert.ok(h.snapshot().seats >= 60);
});

test('state survives a restart', () => {
  const { h } = hall();
  const a = h.join('alice');
  const again = new Hall({ state: JSON.parse(JSON.stringify(h)) });
  assert.equal(again.join('alice', a.token).status, 200);
});
