// node --test --experimental-strip-types src/three/layout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hallPlan, nearestFreeSeat, resolvePosition, seatPosition, spreadApart } from './layout.ts';

test('walking stays inside the hall and out of pillars and other monks', () => {
  const plan = hallPlan(60);
  assert.deepEqual(resolvePosition(999, 999, 60, []), [Math.round(plan.maxX * 100) / 100, Math.round(plan.maxZ * 100) / 100]);
  const [x, z] = resolvePosition(plan.px, plan.pillarZ[1], 60, []);                 // aimed at the middle of a pillar
  assert.ok(Math.hypot(x - plan.px, z - plan.pillarZ[1]) >= 1.16);
  const [mx, mz] = resolvePosition(1, 1, 60, [[1, 1.1]]);                            // aimed at another monk
  assert.ok(Math.hypot(mx - 1, mz - 1.1) >= 0.83);
  assert.deepEqual(resolvePosition(2, 3, 60, [[8, 8]]), [2, 3]);                     // free floor is left alone
});

test('the nearest free cushion skips taken ones but allows your own', () => {
  const [x, , z] = seatPosition(10, 60);
  assert.equal(nearestFreeSeat(x, z, 60, new Set(), 3), 10);
  assert.notEqual(nearestFreeSeat(x, z, 60, new Set([10]), 3), 10);
  assert.equal(nearestFreeSeat(x, z, 60, new Set([10]), 10), 10);
});

test('monks at the same spot are spread apart; seated monks do not move', () => {
  const out = spreadApart([{ handle: 'b', x: 1, z: 1, fixed: false }, { handle: 'a', x: 1, z: 1, fixed: false }, { handle: 's', x: 1, z: 1, fixed: true }]);
  assert.deepEqual(out.get('s'), [1, 1]);
  const pts = ['a', 'b', 's'].map(h => out.get(h));
  for (let i = 0; i < 3; i += 1) for (let j = i + 1; j < 3; j += 1) assert.ok(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) >= 0.83);
});
