// Faces. Every person gets their own, drawn from their ID: the shape of the eyes, brows, nose and mouth,
// their age, and how well the features go together. Some come out handsome, some plain, some homely.
// The face is painted on a small canvas and wrapped onto the front of the head. Where there is no canvas
// (native builds), `faceTexture` returns null and the caller draws the simple face instead.
import * as THREE from 'three';

function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export interface Features {
  looks: number;        // 0 homely .. 1 beautiful
  age: number;          // 0 young .. 1 old
  eyeSize: number; eyeTilt: number; eyeGap: number; lidDrop: number;
  browThick: number; browTilt: number; browArch: number;
  noseWidth: number; noseLength: number;
  mouthWidth: number; lipFull: number; smile: number;
  skew: number;         // left/right mismatch
  iris: string; lip: string; brow: string;
  mole: [number, number] | null; freckles: boolean; stubble: boolean; teeth: boolean; scar: boolean;
  headWide: number; headTall: number; build: number; height: number;
}

export function featuresFor(id: string, gender: 'm' | 'f', kind: 'monk' | 'fairy' = 'monk'): Features {
  const r = rng(`${kind}:${id}`);
  const span = (lo: number, hi: number) => lo + r() * (hi - lo);
  const looks = r();                                   // anyone can be anything
  const rough = 1 - looks;                             // how far features stray from harmony
  const age = kind === 'fairy' ? span(0, 0.25) : Math.pow(r(), 1.4);
  return {
    looks, age,
    eyeSize: 0.78 + looks * 0.42 + span(-0.1, 0.1), eyeTilt: span(-0.12, 0.2) * (gender === 'f' ? 1.2 : 1), eyeGap: 1 + span(-0.16, 0.16) * rough,
    lidDrop: span(0, 0.5) * (0.3 + rough + age * 0.6),
    browThick: (gender === 'm' ? 1.15 : 0.75) + span(-0.2, 0.45) * (0.4 + rough), browTilt: span(-0.25, 0.25), browArch: span(0, 1),
    noseWidth: 0.85 + span(0, 0.75) * rough + span(-0.05, 0.1), noseLength: 0.9 + span(-0.12, 0.25),
    mouthWidth: 0.9 + span(-0.15, 0.3), lipFull: (gender === 'f' ? 1.1 : 0.8) + looks * 0.3 + span(-0.2, 0.2), smile: span(-0.25, 0.7) * (0.5 + looks * 0.5),
    skew: span(-1, 1) * rough * rough,
    iris: ['#3b2616', '#4a2f1a', '#2b1c12', '#5a3a1e', '#33323a'][Math.floor(r() * 5)],
    lip: gender === 'f' ? ['#c2504f', '#b9585c', '#cf6a63', '#a8474c'][Math.floor(r() * 4)] : ['#a8665a', '#96594f', '#b07263'][Math.floor(r() * 3)],
    brow: ['#2a1c14', '#3a2a1e', '#1e1612'][Math.floor(r() * 3)],
    mole: r() < 0.22 + rough * 0.2 ? [span(-58, 58), span(18, 78)] : null,
    freckles: r() < 0.12, stubble: gender === 'm' && r() < 0.18 + rough * 0.3, teeth: r() < rough * 0.45, scar: r() < rough * 0.12,
    headWide: 1 + span(-0.07, 0.1) + rough * 0.04, headTall: 1 + span(-0.06, 0.09), build: 1 + span(-0.12, 0.2), height: 1 + span(-0.07, 0.08),
  };
}

function paint(f: Features, gender: 'm' | 'f', closed: boolean): HTMLCanvasElement {
  const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d')!;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.translate(128, 136); g.scale(1.24, 1.24); g.translate(-128, -136);       // features fill the face
  const cx = 128, eyeY = 112, gap = 44 * f.eyeGap, ink = '#2a1c14';
  const side = (s: number) => 1 + s * f.skew * 0.14;                     // s = -1 left, +1 right

  // soft modelling of the face: eye sockets, cheeks, under the nose and lip
  const shade = (x: number, y: number, rx: number, ry: number, color: string) => {
    const grad = g.createRadialGradient(x, y, 1, x, y, Math.max(rx, ry));
    grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y);
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2); g.fill(); g.restore();
  };
  for (const s of [-1, 1]) {
    shade(cx + s * gap, eyeY - 4, 34, 22, `rgba(90,50,30,${0.16 + f.age * 0.12})`);
    shade(cx + s * (gap + 14), 158, 30, 24, gender === 'f' ? `rgba(226,120,110,${0.2 + f.looks * 0.14})` : `rgba(200,120,95,${0.1 + f.looks * 0.06})`);
  }
  shade(cx, 172, 26, 10, 'rgba(90,50,30,0.2)');

  // brows
  for (const s of [-1, 1]) {
    const x0 = cx + s * (gap - 26), x1 = cx + s * (gap + 28), y = eyeY - 30 * side(s) - f.eyeSize * 6;
    g.strokeStyle = f.brow; g.lineWidth = 6.5 * f.browThick * side(-s);
    g.beginPath(); g.moveTo(x0, y + 5 - f.browTilt * 10);
    g.quadraticCurveTo(cx + s * gap, y - 6 - f.browArch * 9, x1, y + 3 + f.browTilt * 12); g.stroke();
  }

  // eyes
  for (const s of [-1, 1]) {
    const x = cx + s * gap, w = 21 * f.eyeSize * side(s), h = 10.5 * f.eyeSize * side(s) * (1 - f.lidDrop * 0.45);
    const tilt = -s * f.eyeTilt;
    g.save(); g.translate(x, eyeY + (s > 0 ? f.skew * 4 : 0)); g.rotate(tilt);
    if (closed) {
      g.strokeStyle = ink; g.lineWidth = 3.4;
      g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(0, h * 0.95, w, 0); g.stroke();
      if (gender === 'f') { g.lineWidth = 2; for (const k of [-0.6, 0, 0.6]) { g.beginPath(); g.moveTo(k * w, h * 0.5); g.lineTo(k * w * 1.15, h * 0.5 + 6); g.stroke(); } }
    } else {
      g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(0, -h * 1.9, w, 0); g.quadraticCurveTo(0, h * 1.5, -w, 0); g.closePath();
      g.fillStyle = '#fbf6ee'; g.fill();
      g.save(); g.clip();
      const ir = Math.min(h * 1.25, w * 0.62);
      g.fillStyle = f.iris; g.beginPath(); g.arc(0, -h * 0.1, ir, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#120c08'; g.beginPath(); g.arc(0, -h * 0.1, ir * 0.48, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(-ir * 0.35, -h * 0.45, ir * 0.24, 0, Math.PI * 2); g.fill();
      g.restore();
      g.strokeStyle = ink; g.lineWidth = gender === 'f' ? 3.6 : 3;
      g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(0, -h * 1.9, w, 0); g.stroke();
      if (gender === 'f') { g.lineWidth = 2.2; g.beginPath(); g.moveTo(w, 0); g.lineTo(w + 7, -5); g.stroke(); }
      g.strokeStyle = 'rgba(42,28,20,0.35)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-w * 0.8, h * 0.5); g.quadraticCurveTo(0, h * 1.5, w * 0.8, h * 0.5); g.stroke();
      g.beginPath(); g.moveTo(-w * 0.9, -h * 1.5); g.quadraticCurveTo(0, -h * 2.7, w * 0.9, -h * 1.5); g.stroke();     // lid crease
    }
    g.restore();
    if (f.age > 0.45) {                                          // bags and crow's feet
      g.strokeStyle = `rgba(90,50,30,${(f.age - 0.3) * 0.7})`; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(x - 16, eyeY + 16); g.quadraticCurveTo(x, eyeY + 23, x + 16, eyeY + 16); g.stroke();
      for (const k of [-6, 0, 6]) { g.beginPath(); g.moveTo(x + s * 27, eyeY + k * 0.4); g.lineTo(x + s * 36, eyeY + k); g.stroke(); }
    }
  }

  // nose
  const nw = 13 * f.noseWidth, ny = 132 + 26 * f.noseLength;
  g.strokeStyle = 'rgba(90,50,30,0.55)'; g.lineWidth = 2.6;
  g.beginPath(); g.moveTo(cx - 6 + f.skew * 4, eyeY + 8); g.quadraticCurveTo(cx - 9 + f.skew * 6, ny - 16, cx - nw, ny - 2); g.stroke();
  g.beginPath(); g.moveTo(cx - nw, ny - 2); g.quadraticCurveTo(cx, ny + 9, cx + nw, ny - 2); g.stroke();
  g.fillStyle = 'rgba(60,30,20,0.6)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * nw * 0.52, ny + 1, nw * 0.27, 2.6, 0, 0, Math.PI * 2); g.fill(); }
  shade(cx + f.skew * 3, ny - 10, nw * 0.7, 9, 'rgba(255,255,255,0.22)');

  // mouth
  const mw = 25 * f.mouthWidth, my = 196, lf = 7.5 * f.lipFull, curve = f.smile * 9, crook = f.skew * 5;
  g.fillStyle = f.lip;
  g.beginPath(); g.moveTo(cx - mw, my - curve + crook);
  g.quadraticCurveTo(cx - mw * 0.45, my - lf * 0.95, cx, my - lf * 0.45); g.quadraticCurveTo(cx + mw * 0.45, my - lf * 0.95, cx + mw, my - curve - crook);
  g.quadraticCurveTo(cx, my + lf * 1.5 + curve * 0.4, cx - mw, my - curve + crook); g.closePath(); g.fill();
  if (f.teeth) {                                                  // a couple of front teeth showing
    g.fillStyle = '#f4ecd8'; g.fillRect(cx - 9, my - 1, 8, 7); g.fillRect(cx + 1, my - 1, 9, 8);
    g.strokeStyle = 'rgba(90,50,30,0.5)'; g.lineWidth = 1; g.strokeRect(cx - 9, my - 1, 8, 7); g.strokeRect(cx + 1, my - 1, 9, 8);
  }
  g.strokeStyle = 'rgba(70,25,20,0.75)'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(cx - mw, my - curve + crook); g.quadraticCurveTo(cx, my + curve * 0.9 + (f.teeth ? 2 : 0), cx + mw, my - curve - crook); g.stroke();
  shade(cx, my + lf * 0.5, mw * 0.4, lf * 0.5, 'rgba(255,255,255,0.25)');

  // what years and weather leave behind
  if (f.age > 0.35) {
    g.strokeStyle = `rgba(90,50,30,${f.age * 0.5})`; g.lineWidth = 2;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * (nw + 5), ny); g.quadraticCurveTo(cx + s * (mw + 12), my - 14, cx + s * (mw + 8), my + 6); g.stroke(); }
    if (f.age > 0.6) for (const y of [52, 62, 72]) { g.beginPath(); g.moveTo(cx - 40, y); g.quadraticCurveTo(cx, y - 4, cx + 40, y); g.stroke(); }
  }
  if (f.stubble) { g.fillStyle = 'rgba(40,30,25,0.28)'; const r = rng(`st${f.looks}`); for (let i = 0; i < 260; i += 1) { const a = r() * Math.PI, d = 30 + r() * 42; g.fillRect(cx + Math.cos(a) * d * 1.25, my - 6 + Math.sin(a) * d * 0.62, 1.6, 1.6); } }
  if (f.freckles) { g.fillStyle = 'rgba(150,90,60,0.45)'; const r = rng(`fr${f.age}`); for (let i = 0; i < 46; i += 1) g.fillRect(cx - 62 + r() * 124, 136 + r() * 26, 2, 2); }
  if (f.mole) { g.fillStyle = '#3a241a'; g.beginPath(); g.arc(cx + f.mole[0], 120 + f.mole[1], 3.6, 0, Math.PI * 2); g.fill(); }
  if (f.scar) { g.strokeStyle = 'rgba(160,90,80,0.7)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(cx + 46, 84); g.lineTo(cx + 62, 122); g.stroke(); }
  return c;
}

const cache = new Map<string, THREE.Texture>();

/** The face texture for one person, or null where a canvas is not available. */
export function faceTexture(id: string, gender: 'm' | 'f', closed: boolean, kind: 'monk' | 'fairy' = 'monk'): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const key = `${kind}:${id}:${gender}:${closed}`;
  let tex = cache.get(key);
  if (!tex) {
    tex = new THREE.CanvasTexture(paint(featuresFor(id, gender, kind), gender, closed));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    cache.set(key, tex);
  }
  return tex;
}

/** The front of a head sphere, facing -z, that a face texture is wrapped onto. */
export const FACE_PATCH = new THREE.SphereGeometry(0.2745, 28, 20, Math.PI * 1.5 - 1.02, 2.04, 0.5, 1.9);
