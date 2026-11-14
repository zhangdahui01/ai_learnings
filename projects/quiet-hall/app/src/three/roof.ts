import * as THREE from 'three';

/**
 * A tiled roof slope that sags like a Japanese temple roof: nearly flat at the eaves, steep toward the top,
 * with the four corners lifted. It runs from an outer rectangle (the eaves) up to an inner one; an inner
 * depth of 0 closes it into a hipped roof with a ridge.
 */
export function roofGeometry(outer: [number, number], inner: [number, number], height: number, { steps = 7, sag = 1.9, lift = 0.5 } = {}) {
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const w = outer[0] + (inner[0] - outer[0]) * t, d = outer[1] + (inner[1] - outer[1]) * t;
    const y = height * Math.pow(t, sag) + lift * Math.pow(1 - t, 4);          // the corner lift fades out quickly
    const yMid = height * Math.pow(t, sag);
    // eight points per ring: four corners (lifted) and four edge midpoints (not lifted)
    rings.push([
      new THREE.Vector3(-w / 2, y, d / 2), new THREE.Vector3(0, yMid, d / 2), new THREE.Vector3(w / 2, y, d / 2), new THREE.Vector3(w / 2, yMid, 0),
      new THREE.Vector3(w / 2, y, -d / 2), new THREE.Vector3(0, yMid, -d / 2), new THREE.Vector3(-w / 2, y, -d / 2), new THREE.Vector3(-w / 2, yMid, 0),
    ]);
  }
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < steps; i += 1) {
    for (let k = 0; k < 8; k += 1) {
      const a = rings[i][k], b = rings[i][(k + 1) % 8], c = rings[i + 1][(k + 1) % 8], d = rings[i + 1][k];
      tri(a, b, c); tri(a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** The cusped gable over the entrance (karahafu): a hump in the middle that flattens out to both sides. */
export function cuspedGableShape(half: number, rise: number, thick: number) {
  const outline = (s: THREE.Shape | THREE.Path, y0: number, k: number, reverse: boolean) => {
    const pts: [number, number, number, number][] = [            // quadratic segments: control x, y, end x, y
      [-half * 0.62, y0 + rise * 0.02, -half * 0.4, y0 + rise * 0.5 * k],
      [-half * 0.2, y0 + rise * k, 0, y0 + rise * k],
      [half * 0.2, y0 + rise * k, half * 0.4, y0 + rise * 0.5 * k],
      [half * 0.62, y0 + rise * 0.02, half, y0],
    ];
    if (!reverse) { s.moveTo(-half, y0); for (const [cx, cy, x, y] of pts) s.quadraticCurveTo(cx, cy, x, y); return; }
    s.lineTo(half, y0);
    for (let i = pts.length - 1; i >= 0; i -= 1) { const [cx, cy] = pts[i]; const [, , x, y] = i > 0 ? pts[i - 1] : [0, 0, -half, y0]; s.quadraticCurveTo(cx, cy, x, y); }
  };
  const band = new THREE.Shape();
  outline(band, thick, 1, false); outline(band, 0, 1, true); band.closePath();
  const fill = new THREE.Shape();
  outline(fill, 0, 1, false); fill.lineTo(-half, 0); fill.closePath();
  return { band, fill };
}

/** The golden horn at each end of the ridge (shibi). */
export function ridgeHornShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(1.25, 0); s.quadraticCurveTo(1.5, 1.2, 0.95, 2.0); s.quadraticCurveTo(0.6, 2.5, 0.05, 2.35);
  s.quadraticCurveTo(0.55, 2.0, 0.6, 1.4); s.quadraticCurveTo(0.55, 0.9, 0, 0.75); s.closePath();
  return s;
}
