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

test('every practice earns merit, and each change is written down', () => {
  const { h, tick } = hall();
  const a = h.auth(h.join('alice').token);
  assert.equal(h.knock(a).merit, 1);
  tick(1000);
  assert.equal(h.knock(a, 5).merit, 6);
  assert.equal(h.prostrate(a, 2).merit, 12);              // a prostration is worth 3
  assert.equal(h.beads(a, 4).merit, 16);
  assert.equal(h.knock(a, 100000).merit, 76);             // a batch counts at most 60
  for (const junk of [-3, 'x', 0]) assert.equal(h.knock(a, junk).merit, 76);
  assert.deepEqual([h.view(a).prostrations, h.view(a).beads], [2, 4]);
  const log = h.history(a);
  assert.deepEqual(log.map(e => [e.delta, e.reason, e.total]),
    [[60, '敲木鱼 ×60', 76], [4, '念珠 ×4', 16], [6, '礼拜 ×2', 12], [5, '敲木鱼 ×5', 6], [1, '敲木鱼 ×1', 1]]);
  assert.equal(log.at(-1).at + 1000, log.at(-2).at);      // each entry carries its time
});

test('a trial held adds merit; a trial lost takes it away, never below zero', () => {
  const { h } = hall();
  const a = h.auth(h.join('alice').token);
  assert.deepEqual([h.trial(a, 'held', 'dog').merit, h.view(a).trials], [10, 1]);
  assert.equal(h.trial(a, 'lost', 'fairies').merit, 0);   // 10 - 20 stops at 0
  assert.deepEqual(h.history(a).map(e => [e.delta, e.reason]), [[-10, '定力不足，被仙女扰乱'], [10, '守住考验：野狗']]);
  assert.equal(h.trial(a, 'lost', 'dog').merit, 0);
  assert.equal(h.history(a).length, 2);                   // nothing changed, nothing written
  assert.equal(h.trial(a, 'nonsense').merit, 0);
});

test('the ledger keeps the latest hundred changes', () => {
  const { h } = hall();
  const a = h.auth(h.join('alice').token);
  for (let i = 0; i < 130; i += 1) h.knock(a, 1);
  assert.equal(h.history(a).length, 100);
  assert.equal(h.history(a)[0].total, 130);
});

test('a registered ID is kept, and its return code brings the person back on another device', () => {
  const { h, tick } = hall();
  const reg = h.register('dahui');
  assert.equal(reg.status, 200);
  assert.match(reg.code, /^[0-9A-F]{5}-[0-9A-F]{5}$/);
  assert.ok(!JSON.stringify(h).includes(reg.code));       // only its hash is stored
  assert.equal(h.register('Dahui').status, 409);
  assert.equal(h.join('dahui').status, 409);              // nobody walks in as a registered monk without the token
  const me = h.auth(reg.token); h.knock(me, 7); h.leave(me);
  tick(48 * 3600_000); h.sweep();                         // two days later the monk is still on the books
  assert.equal(h.login('dahui', 'WRONG-CODE0').status, 403);
  const back = h.login('DAHUI', reg.code.toLowerCase().replace('-', ''));       // forgiving about case and the dash
  assert.deepEqual([back.status, back.me.merit, back.me.registered], [200, 7, true]);
  assert.equal(h.auth(reg.token), null);                  // the old device is signed out
  assert.equal(h.join('dahui', back.token).me.merit, 7);
  assert.equal(h.login('nobody', 'x').status, 404);
});

test('wrong return codes are cut off after five tries', () => {
  const { h, tick } = hall();
  const reg = h.register('dahui');
  for (let i = 0; i < 5; i += 1) assert.equal(h.login('dahui', 'nope').status, 403);
  assert.equal(h.login('dahui', reg.code).status, 429);   // even the right code waits
  tick(5 * 60_000 + 1);
  assert.equal(h.login('dahui', reg.code).status, 200);
});

test('guests who left long ago are forgotten; registered monks and people in the hall are not', () => {
  const { h, tick } = hall();
  const guest = h.auth(h.join('guest').token);
  const keeper = h.auth(h.register('keeper').token);
  const here = h.auth(h.join('here').token);
  h.leave(guest); h.leave(keeper);
  for (let i = 0; i < 300; i += 1) { tick(60_000); h.touch(here); }          // five hours; "here" keeps checking in
  h.sweep(); assert.ok(h.monks.has('guest'));
  for (let i = 0; i < 90; i += 1) { tick(60_000); h.touch(here); }
  h.sweep();
  assert.deepEqual([h.monks.has('guest'), h.monks.has('keeper'), h.monks.has('here')], [false, true, true]);
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
