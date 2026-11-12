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
  const aliceToken = h.join('alice').token; const a = h.auth(aliceToken); const bobToken = h.join('bob').token;
  h.sit(a); tick(20_000); h.touch(a);          // alice's last heartbeat: 20 s into her sitting
  const b = h.auth(h.join('bob', bobToken).token);
  tick(AWAY_AFTER_MS - 1000); h.touch(b);       // bob keeps checking in, alice has gone silent
  tick(2000); h.touch(b);
  const snap = h.snapshot();
  assert.deepEqual(snap.monks.map(m => m.handle), ['bob']);
  assert.equal(a.totalSeconds, 20);            // counted until the last heartbeat, not until the sweep
  assert.equal(h.join('carol').me.seat, 0);
  assert.equal(h.join('alice', aliceToken).me.seat, 2);
});

test('bowing is the only interaction', () => {
  const { h } = hall();
  const a = h.auth(h.join('alice').token); const b = h.auth(h.join('bob').token); h.join('carol');
  assert.equal(h.bow(a, 'bob').bowedTo, 1);
  assert.equal(h.bow(a).bowedTo, 2);
  assert.equal(h.bow(a, 'alice').bowedTo, 0);
  assert.equal(h.view(b).bows, 2);
});

test('knocking the wooden fish adds merit, in capped batches', () => {
  const { h } = hall();
  const a = h.auth(h.join('alice').token);
  assert.equal(h.knock(a).merit, 1);
  assert.equal(h.knock(a, 5).merit, 6);
  assert.equal(h.knock(a, 100000).merit, 66);
  assert.equal(h.knock(a, -3).merit, 66);
  assert.equal(h.knock(a, 'x').merit, 66);
});

test('prostrations and prayer beads are counted like knocks', () => {
  const { h } = hall();
  const a = h.auth(h.join('alice').token);
  assert.equal(h.prostrate(a).prostrations, 1);
  assert.equal(h.beads(a, 27).beads, 27);
  assert.equal(h.beads(a, 500).beads, 87);
  assert.deepEqual([h.view(a).merit, h.view(a).prostrations], [0, 1]);
});

test('a standing monk can walk; sitting returns to the cushion', () => {
  const { h } = hall();
  const a = h.auth(h.join('alice').token);
  assert.deepEqual(h.move(a, 3.456, -7.891).pos, { x: 3.46, z: -7.89 });
  assert.deepEqual(h.move(a, 9999, 'x').pos, { x: 3.46, z: -7.89 });       // nonsense is ignored
  assert.deepEqual(h.move(a, 9999, 1).pos, { x: 40, z: 1 });               // and far away is clamped
  assert.equal(h.sit(a).pos, null);
  assert.equal(h.move(a, 1, 1).pos, null);                                 // seated monks do not slide around
  assert.equal(h.stand(a).pos, null);
  h.move(a, 2, 2); h.leave(a);
  assert.equal(h.join('alice', [...h.monks.values()][0] && undefined).status, 409);
});

test('a monk can sit on another free cushion, but not on a taken one', () => {
  const { h } = hall();
  const a = h.auth(h.join('alice').token); const b = h.auth(h.join('bob').token);
  assert.deepEqual([a.seat, b.seat], [0, 1]);
  assert.equal(h.sit(a, 7).seat, 7);                  // a free cushion: taken
  assert.equal(h.sit(b, 7).seat, 1);                  // alice is on it: bob stays on his own
  h.stand(a);
  assert.equal(h.sit(a, 1).seat, 7);                  // bob's cushion, even while he is seated elsewhere in the row
  for (const bad of [-1, 2.5, '3', 99999, null]) assert.equal(h.sit(a, bad).seat, 7);
  assert.equal(h.join('carol').me.seat, 0);           // the cushion alice left is free again
  assert.equal(h.trial(a).trials, 1);
});

test('residents fill the hall and cannot be impersonated', () => {
  const { h } = hall();
  h.seedResidents(5);
  assert.equal(h.snapshot().sitting, 5);
  assert.equal(h.join('resident-1').status, 409);
  assert.equal(h.join('alice').me.seat, 5);
  assert.ok(h.snapshot().seats >= 60);
});

test('state survives a restart and holds no usable token', () => {
  const { h } = hall();
  const a = h.join('alice');
  assert.ok(!JSON.stringify(h).includes(a.token));
  const again = new Hall({ state: JSON.parse(JSON.stringify(h)) });
  assert.equal(again.join('alice', a.token).status, 200);
});
