// The hall's floor plan: where cushions, pillars and walls are, shared by the 3D scene and the walking rules.
export const COLS = 8;
export const SX = 1.7, SZ = 1.8, H = 13.5;
const MONK_R = 0.42;            // how much room a monk takes
const PILLAR_R = 0.75;

/** Hall dimensions grow with the number of cushions, so there is always room. */
export function hallSize(seats: number) {
  const rows = Math.max(6, Math.ceil(seats / COLS));
  const width = COLS * SX + 9;
  const depth = 15 + rows * SZ + 5;
  return { rows, width, depth, front: -depth / 2, firstRow: -depth / 2 + 12.5 };
}

export function seatPosition(seat: number, seats: number): [number, number, number] {
  const { firstRow } = hallSize(seats);
  const col = seat % COLS, row = Math.floor(seat / COLS);
  const aisle = col >= COLS / 2 ? 0.7 : -0.7;                // a central aisle from the door to the altar
  return [(col - (COLS - 1) / 2) * SX + aisle, 0, firstRow + row * SZ];
}

export function hallPlan(seats: number) {
  const { width: W, depth: D, front } = hallSize(seats);
  const px = W / 2 - 2.3;
  const pillarZ: number[] = [];
  for (let z = front + 7.5; z < D / 2 - 1; z += 5.4) pillarZ.push(z);
  // walkable floor: inside the walls, in front of the offering table
  return { W, D, front, px, pillarZ, minX: -(W / 2 - 0.9), maxX: W / 2 - 0.9, minZ: front + 7.6, maxZ: D / 2 - 1.2 };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Where a walking monk actually ends up when aiming for (x, z): inside the walls, not inside a pillar,
 * and not standing in another monk. `others` are the positions of everyone else.
 */
export function resolvePosition(x: number, z: number, seats: number, others: [number, number][]): [number, number] {
  const plan = hallPlan(seats);
  let px = clamp(x, plan.minX, plan.maxX), pz = clamp(z, plan.minZ, plan.maxZ);
  const circles: [number, number, number][] = [
    ...others.map(([ox, oz]) => [ox, oz, MONK_R * 2] as [number, number, number]),
    ...plan.pillarZ.flatMap(zz => [[-plan.px, zz, PILLAR_R + MONK_R], [plan.px, zz, PILLAR_R + MONK_R]] as [number, number, number][]),
  ];
  for (let pass = 0; pass < 4; pass += 1) {
    for (const [cx, cz, r] of circles) {
      const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz);
      if (d < r) {
        const k = d > 0.001 ? r / d : 0;
        px = d > 0.001 ? cx + dx * k : cx + r; pz = d > 0.001 ? cz + dz * k : cz;      // slide out to the edge
      }
    }
    px = clamp(px, plan.minX, plan.maxX); pz = clamp(pz, plan.minZ, plan.maxZ);
  }
  return [Math.round(px * 100) / 100, Math.round(pz * 100) / 100];
}

/** The free cushion closest to (x, z). Your own cushion counts as free. */
export function nearestFreeSeat(x: number, z: number, seats: number, taken: Set<number>, own: number | null): number | null {
  let best: number | null = null, bestD = Infinity;
  for (let i = 0; i < seats; i += 1) {
    if (taken.has(i) && i !== own) continue;
    const [sx, , sz] = seatPosition(i, seats);
    const d = Math.hypot(sx - x, sz - z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Two standing monks never share a spot: the later one (by ID) is nudged aside. Returns positions by handle. */
export function spreadApart(spots: { handle: string; x: number; z: number; fixed: boolean }[]): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const placed: [number, number][] = [];
  for (const s of [...spots].sort((a, b) => Number(b.fixed) - Number(a.fixed) || a.handle.localeCompare(b.handle))) {
    let x = s.x, z = s.z;
    if (!s.fixed) {
      for (let pass = 0; pass < 6; pass += 1) {
        const hit = placed.find(([ox, oz]) => Math.hypot(x - ox, z - oz) < MONK_R * 2);
        if (!hit) break;
        const dx = x - hit[0], dz = z - hit[1], d = Math.hypot(dx, dz);
        const angle = d > 0.01 ? Math.atan2(dz, dx) : (s.handle.charCodeAt(s.handle.length - 1) % 8) * (Math.PI / 4);
        x = hit[0] + Math.cos(angle) * MONK_R * 2.05; z = hit[1] + Math.sin(angle) * MONK_R * 2.05;
      }
    }
    placed.push([x, z]); out.set(s.handle, [x, z]);
  }
  return out;
}
