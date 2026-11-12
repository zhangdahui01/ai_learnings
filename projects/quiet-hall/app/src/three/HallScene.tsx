import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Monk } from '../api';
import { Monk3D } from './Monk3D';
import { clamp, type Orbit } from './orbit';
import { useFrame, useThree } from './r3f';

import { H, hallPlan, hallSize, seatPosition, spreadApart } from './layout';
import { TrialVisitors, type TrialKind } from './Trials';

export { hallSize, seatPosition };

const cushionGeo = new THREE.CylinderGeometry(0.56, 0.6, 0.16, 24);
function Cushions({ seats, taken }: { seats: number; taken: Set<number> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const m = new THREE.Matrix4(), used = new THREE.Color('#8c2f25'), free = new THREE.Color('#a8563c');
    for (let i = 0; i < seats; i += 1) {
      const [x, , z] = seatPosition(i, seats);
      m.makeTranslation(x, 0.09, z); mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, taken.has(i) ? used : free);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [seats, taken]);
  return <instancedMesh ref={ref} args={[cushionGeo, undefined, seats]} key={seats}><meshStandardMaterial roughness={0.9} /></instancedMesh>;
}

/** The coffered ceiling: a grid of dark ribs under the boards. */
function Coffers({ width, depth }: { width: number; depth: number }) {
  const xs = useMemo(() => Array.from({ length: Math.floor(width / 2.4) + 1 }, (_, i) => -width / 2 + i * 2.4), [width]);
  const zs = useMemo(() => Array.from({ length: Math.floor(depth / 2.4) + 1 }, (_, i) => -depth / 2 + i * 2.4), [depth]);
  return (
    <group position={[0, H - 0.08, 0]}>
      {xs.map(x => <mesh key={`x${x}`} position={[x, 0, 0]}><boxGeometry args={[0.14, 0.14, depth]} /><meshStandardMaterial color="#6b4a30" roughness={0.8} /></mesh>)}
      {zs.map(z => <mesh key={`z${z}`} position={[0, 0, z]}><boxGeometry args={[width, 0.14, 0.14]} /><meshStandardMaterial color="#6b4a30" roughness={0.8} /></mesh>)}
    </group>
  );
}

/** One of the great timber pillars: plain wood on a stone base, bound with iron hoops, bracket arms on top. */
function Pillar({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.78, 0.88, 0.4, 20]} /><meshStandardMaterial color="#8d8478" roughness={0.9} /></mesh>
      <mesh position={[0, H / 2, 0]}><cylinderGeometry args={[0.56, 0.62, H - 0.4, 20]} /><meshStandardMaterial color="#7a5233" roughness={0.7} /></mesh>
      {[1.3, 3.6, 5.9, 8.2].map(y => (
        <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[0.64, 0.64, 0.14, 20]} /><meshStandardMaterial color="#2b2622" metalness={0.6} roughness={0.5} /></mesh>
      ))}
      {[0, Math.PI / 2].map(r => (
        <mesh key={r} position={[0, H - 1.3, 0]} rotation={[0, r, 0]}><boxGeometry args={[2.6, 0.36, 0.5]} /><meshStandardMaterial color="#5a3a25" roughness={0.8} /></mesh>
      ))}
      <mesh position={[0, H - 0.95, 0]}><boxGeometry args={[1.5, 0.34, 1.5]} /><meshStandardMaterial color="#e6dcc6" roughness={0.9} /></mesh>
    </group>
  );
}

function Altar({ z }: { z: number }) {
  const flames = useRef<THREE.Group>(null);
  const smoke = useRef<THREE.Group>(null);
  const glow = useRef<THREE.PointLight>(null);
  const halo = useMemo(() => {
    const shape = new THREE.Shape();                                  // boat-shaped: round below, pointed above
    shape.moveTo(0, 0.35); shape.bezierCurveTo(2.6, 0.35, 2.9, 2.6, 1.5, 3.9); shape.quadraticCurveTo(0.6, 4.6, 0, 5.05);
    shape.quadraticCurveTo(-0.6, 4.6, -1.5, 3.9); shape.bezierCurveTo(-2.9, 2.6, -2.6, 0.35, 0, 0.35);
    const spots: [number, number][] = [[0, 4.45], [-0.85, 3.95], [0.85, 3.95], [-1.55, 3.2], [1.55, 3.2], [-1.9, 2.3], [1.9, 2.3], [-1.85, 1.4], [1.85, 1.4]];
    return { back: new THREE.ShapeGeometry(shape, 24), spots };
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    flames.current?.children.forEach((f, i) => { f.scale.setScalar(1 + Math.sin(t * 9 + i * 2.1) * 0.12); });
    if (glow.current) glow.current.intensity = 55 + Math.sin(t * 7.3) * 4 + Math.sin(t * 13.1) * 2;
    smoke.current?.children.forEach((p, i) => {
      const k = (t * 0.22 + i / 6) % 1;
      p.position.set(Math.sin(k * 6 + i) * 0.18 * k, 1.75 + k * 2.6, 3.55);
      p.scale.setScalar(0.5 + k * 1.6);
      ((p as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.2 * (1 - k);
    });
  });
  const gold = <meshStandardMaterial color="#e2b24a" metalness={0.75} roughness={0.28} emissive="#6b4a12" emissiveIntensity={0.35} />;
  const bronze = <meshStandardMaterial color="#5d6553" metalness={0.7} roughness={0.42} emissive="#161a12" emissiveIntensity={0.6} />;
  const lotus = (color: string, r: number) => (
    <>
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={i} position={[Math.cos(i * Math.PI / 8) * r, 0.05, Math.sin(i * Math.PI / 8) * r]} rotation={[0, -i * Math.PI / 8, Math.PI / 2.6]}>
          <coneGeometry args={[0.36, 0.9, 6]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[r, r - 0.15, 0.4, 28]} /><meshStandardMaterial color={color} metalness={0.5} roughness={0.5} /></mesh>
    </>
  );
  // The great bronze Buddha: seated, right hand raised with the palm outward, left hand open on the knee,
  // before a gilded boat-shaped halo set with small seated Buddhas.
  const great = (
    <group position={[0, 2.0, -0.1]} scale={2.05}>
      <group position={[0, 0, -0.62]}>
        <mesh geometry={halo.back}><meshStandardMaterial color="#c9983a" metalness={0.7} roughness={0.35} emissive="#5a3c0e" emissiveIntensity={0.5} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, 2.85, 0.03]}><ringGeometry args={[0.7, 0.98, 40]} /><meshBasicMaterial color="#f6d27a" toneMapped={false} /></mesh>
        <mesh position={[0, 1.6, 0.03]}><ringGeometry args={[1.25, 1.42, 48]} /><meshBasicMaterial color="#e9bf5e" toneMapped={false} /></mesh>
        {halo.spots.map(([x, y], i) => (
          <group key={i} position={[x, y, 0.06]} scale={0.2}>
            <mesh position={[0, 0, 0]} scale={[1.2, 0.6, 0.5]}><sphereGeometry args={[0.7, 10, 8]} />{gold}</mesh>
            <mesh position={[0, 0.6, 0]} scale={[0.8, 1, 0.5]}><sphereGeometry args={[0.6, 10, 8]} />{gold}</mesh>
            <mesh position={[0, 1.4, 0]}><sphereGeometry args={[0.4, 10, 8]} />{gold}</mesh>
            <mesh position={[0, 0.7, -0.2]}><circleGeometry args={[1.25, 16]} /><meshBasicMaterial color="#f6d27a" toneMapped={false} /></mesh>
          </group>
        ))}
      </group>
      {lotus('#6b705b', 1.5)}
      <mesh position={[0, 0.72, 0.1]} scale={[1.75, 0.5, 1.3]}><sphereGeometry args={[0.8, 28, 18]} />{bronze}</mesh>
      <mesh position={[0, 1.55, 0]} scale={[1.08, 1.2, 0.82]}><sphereGeometry args={[0.8, 28, 20]} />{bronze}</mesh>
      <mesh position={[0, 2.1, 0]} scale={[1.5, 0.48, 0.78]}><sphereGeometry args={[0.8, 24, 16]} />{bronze}</mesh>
      <mesh position={[0, 2.5, 0.02]}><cylinderGeometry args={[0.26, 0.32, 0.3, 16]} />{bronze}</mesh>
      {/* head: tight curls, the mound on the crown, long ears, the bright dot between the brows */}
      <mesh position={[0, 2.92, 0]} scale={[1, 1.1, 0.98]}><sphereGeometry args={[0.52, 28, 20]} />{bronze}</mesh>
      <mesh position={[0, 3.0, -0.03]} scale={[1.06, 1.05, 1.06]}><sphereGeometry args={[0.52, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.42]} /><meshStandardMaterial color="#20262a" roughness={0.9} flatShading /></mesh>
      <mesh position={[0, 3.52, -0.03]}><sphereGeometry args={[0.24, 16, 12]} /><meshStandardMaterial color="#20262a" roughness={0.9} flatShading /></mesh>
      {[-1, 1].map(e => <mesh key={e} position={[e * 0.53, 2.84, 0]} scale={[0.35, 1.5, 0.6]}><sphereGeometry args={[0.16, 10, 8]} />{bronze}</mesh>)}
      <mesh position={[0, 3.06, 0.5]}><sphereGeometry args={[0.045, 10, 8]} /><meshBasicMaterial color="#f6d27a" toneMapped={false} /></mesh>
      {[-1, 1].map(e => (
        <group key={e}>
          <mesh position={[e * 0.2, 2.95, 0.47]} rotation={[0, e * 0.35, e * -0.08]} scale={[1, 0.22, 0.3]}><sphereGeometry args={[0.11, 12, 8]} /><meshStandardMaterial color="#14181a" roughness={0.6} /></mesh>
          <mesh position={[e * 0.2, 3.07, 0.46]} rotation={[0, e * 0.35, e * -0.2]} scale={[1, 0.12, 0.25]}><sphereGeometry args={[0.13, 12, 8]} /><meshStandardMaterial color="#2a2f2a" roughness={0.6} /></mesh>
        </group>
      ))}
      <mesh position={[0, 2.82, 0.53]} scale={[0.5, 1, 0.6]}><sphereGeometry args={[0.07, 10, 8]} />{bronze}</mesh>
      <mesh position={[0, 2.66, 0.49]} scale={[1, 0.3, 0.4]}><sphereGeometry args={[0.1, 12, 8]} /><meshStandardMaterial color="#3b3f33" roughness={0.6} /></mesh>
      {/* right arm raised, palm outward */}
      <mesh position={[-1.22, 1.72, 0.12]} rotation={[0.25, 0, 0.12]}><cylinderGeometry args={[0.24, 0.22, 0.95, 12]} />{bronze}</mesh>
      <mesh position={[-1.18, 1.66, 0.62]} rotation={[-0.75, 0, -0.1]}><cylinderGeometry args={[0.18, 0.21, 0.95, 12]} />{bronze}</mesh>
      <mesh position={[-1.12, 2.2, 0.95]} scale={[0.5, 0.68, 0.17]}><sphereGeometry args={[0.5, 16, 12]} />{bronze}</mesh>
      {/* left arm resting, palm up on the knee */}
      <mesh position={[1.2, 1.55, 0.2]} rotation={[0.5, 0, -0.15]}><cylinderGeometry args={[0.24, 0.2, 1.1, 12]} />{bronze}</mesh>
      <mesh position={[1.0, 1.05, 0.95]} scale={[0.62, 0.15, 0.45]}><sphereGeometry args={[0.5, 16, 12]} />{bronze}</mesh>
    </group>
  );
  // The gilded attendants either side.
  const attendant = (x: number) => (
    <group position={[x, 2.0, 0.4]} scale={1.05} key={x}>
      {lotus('#b8892f', 1.2)}
      <mesh position={[0, 0.72, 0.1]} scale={[1.45, 0.5, 1.2]}><sphereGeometry args={[0.8, 24, 16]} />{gold}</mesh>
      <mesh position={[0, 1.55, 0]} scale={[0.95, 1.15, 0.78]}><sphereGeometry args={[0.8, 24, 18]} />{gold}</mesh>
      <mesh position={[0, 2.75, 0]}><sphereGeometry args={[0.48, 24, 18]} />{gold}</mesh>
      <mesh position={[0, 3.3, 0]}><coneGeometry args={[0.36, 0.7, 8]} />{gold}</mesh>
      <mesh position={[0, 1.05, 0.72]} scale={[1.3, 0.5, 0.7]}><sphereGeometry args={[0.3, 16, 12]} />{gold}</mesh>
      <mesh position={[0, 2.6, -0.55]}><circleGeometry args={[1.5, 40]} /><meshStandardMaterial color="#c9983a" metalness={0.7} roughness={0.35} emissive="#5a3c0e" emissiveIntensity={0.5} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 2.6, -0.52]}><ringGeometry args={[1.2, 1.5, 40]} /><meshBasicMaterial color="#f6d27a" toneMapped={false} /></mesh>
    </group>
  );
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 0.5, 0.6]}><boxGeometry args={[19, 1, 5.6]} /><meshStandardMaterial color="#8d8478" roughness={0.95} /></mesh>
      <mesh position={[0, 1.45, 0.2]}><cylinderGeometry args={[4.4, 4.7, 0.9, 8]} /><meshStandardMaterial color="#4d5346" metalness={0.5} roughness={0.6} /></mesh>
      <mesh position={[0, 1.93, 0.2]}><cylinderGeometry args={[4.5, 4.5, 0.1, 8]} /><meshStandardMaterial color="#d9a441" metalness={0.5} roughness={0.4} /></mesh>
      {[-6.9, 6.9].map(x => <mesh key={x} position={[x, 1.5, 0.4]}><cylinderGeometry args={[1.6, 1.8, 1, 8]} /><meshStandardMaterial color="#6e241c" roughness={0.6} /></mesh>)}
      {great}{attendant(-6.9)}{attendant(6.9)}
      <pointLight position={[0, 9, 6]} color="#ffe2b0" intensity={90} distance={30} decay={1.6} />
      {/* offering table: candles and an incense burner */}
      <mesh position={[0, 1.25, 3.55]}><boxGeometry args={[6, 0.5, 1.1]} /><meshStandardMaterial color="#4a2418" roughness={0.6} /></mesh>
      <mesh position={[0, 1.62, 3.55]}><cylinderGeometry args={[0.32, 0.22, 0.26, 16]} /><meshStandardMaterial color="#b8892f" metalness={0.6} roughness={0.4} /></mesh>
      <group ref={smoke}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i}><sphereGeometry args={[0.14, 10, 8]} /><meshBasicMaterial color="#f3ead9" transparent opacity={0.15} depthWrite={false} /></mesh>
        ))}
      </group>
      {[-2.4, -1.4, 1.4, 2.4].map(x => (
        <mesh key={x} position={[x, 1.75, 3.55]}><cylinderGeometry args={[0.06, 0.06, 0.5, 10]} /><meshStandardMaterial color="#f4ecd8" /></mesh>
      ))}
      <group ref={flames}>
        {[-2.4, -1.4, 1.4, 2.4].map(x => (
          <mesh key={x} position={[x, 2.1, 3.55]} scale={[1, 1.7, 1]}><sphereGeometry args={[0.07, 10, 8]} /><meshBasicMaterial color="#ffd27a" toneMapped={false} /></mesh>
        ))}
      </group>
      <pointLight ref={glow} position={[0, 3.2, 4.6]} color="#ffc37a" intensity={55} distance={34} decay={1.7} />
    </group>
  );
}

/** The wooden fish beside your cushion. Each knock swings the mallet down and makes the fish jump. */
function WoodenFish({ position, tick, onKnock }: { position: [number, number, number]; tick: number; onKnock: () => void }) {
  const mallet = useRef<THREE.Group>(null);
  const fish = useRef<THREE.Group>(null);
  const struck = useRef(-10);
  const seen = useRef(tick);
  useFrame(({ clock }) => {
    if (tick !== seen.current) { seen.current = tick; struck.current = clock.elapsedTime; }
    const dt = clock.elapsedTime - struck.current;
    // 0-0.09 s: the mallet comes down; then it lifts back over 0.3 s
    const down = dt < 0.09 ? dt / 0.09 : Math.max(0, 1 - (dt - 0.09) / 0.3);
    if (mallet.current) mallet.current.rotation.z = -0.95 + down * 0.8;
    const hop = dt > 0.07 && dt < 0.4 ? Math.sin(((dt - 0.07) / 0.33) * Math.PI) : 0;
    if (fish.current) { fish.current.position.y = 0.3 + hop * 0.07; fish.current.scale.setScalar(1 + hop * 0.06); }
  });
  return (
    <group position={position} scale={1.45} onClick={e => { e.stopPropagation(); onKnock(); }}>
      <mesh position={[0, 0.07, 0]}><cylinderGeometry args={[0.36, 0.4, 0.14, 20]} /><meshStandardMaterial color="#c9a24a" roughness={0.8} /></mesh>
      <group ref={fish} position={[0, 0.3, 0]}>
        <mesh scale={[1.15, 0.85, 0.95]}><sphereGeometry args={[0.27, 20, 16]} /><meshStandardMaterial color="#8a3b22" roughness={0.35} metalness={0.1} /></mesh>
        <mesh position={[0, -0.04, -0.245]} scale={[1, 0.22, 0.3]}><sphereGeometry args={[0.16, 12, 8]} /><meshStandardMaterial color="#2a120a" roughness={0.8} /></mesh>
        <mesh position={[0, 0.2, 0.06]} rotation={[0.3, 0, 0]}><torusGeometry args={[0.09, 0.03, 8, 16, Math.PI]} /><meshStandardMaterial color="#d9a441" metalness={0.5} roughness={0.4} /></mesh>
      </group>
      <group ref={mallet} position={[0.62, 0.42, 0]} rotation={[0, 0, -0.95]}>
        <mesh position={[-0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.022, 0.026, 0.6, 8]} /><meshStandardMaterial color="#5b3d28" roughness={0.7} /></mesh>
        <mesh position={[-0.6, 0, 0]}><sphereGeometry args={[0.075, 12, 10]} /><meshStandardMaterial color="#e9dcc0" roughness={0.9} /></mesh>
      </group>
    </group>
  );
}

function CameraRig({ orbit, target, bounds }: { orbit: React.RefObject<Orbit>; target: [number, number, number]; bounds: { x: number; z0: number; z1: number } }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(...target));
  const want = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const o = orbit.current; if (!o) return;
    const k = 1 - Math.exp(-dt * 6);
    look.current.lerp(want.set(target[0], target[1], target[2]), k);
    const cp = Math.cos(o.pitch);
    want.set(look.current.x + Math.sin(o.yaw) * cp * o.dist, look.current.y + Math.sin(o.pitch) * o.dist, look.current.z + Math.cos(o.yaw) * cp * o.dist);
    want.x = clamp(want.x, -bounds.x, bounds.x); want.z = clamp(want.z, bounds.z0, bounds.z1); want.y = clamp(want.y, 0.9, H - 2.6);   // stay inside the hall
    camera.position.lerp(want, k);
    camera.lookAt(look.current);
  });
  return null;
}

export function HallScene({ monks, seats, meHandle, orbit, onBow, knockTick, onKnock, bowTick, onFloor, trial }: {
  monks: Monk[]; seats: number; meHandle: string; orbit: React.RefObject<Orbit>; onBow: (m: Monk) => void;
  knockTick: number; onKnock: () => void; bowTick: number; onFloor: (x: number, z: number) => void; trial: TrialKind | null;
}) {
  const { width: W, depth: D, front } = hallSize(seats);
  const taken = useMemo(() => new Set(monks.map(m => m.seat ?? -1)), [monks]);
  const me = monks.find(m => m.handle === meHandle);
  const mySeat = me && me.seat !== null ? seatPosition(me.seat, seats) : ([0, 0, 0] as [number, number, number]);
  // Everyone's place on the floor: seated monks on their cushions, walkers where they walked, and no two
  // standing monks on the same spot.
  const plan = hallPlan(seats);
  const places = useMemo(() => spreadApart(monks.filter(m => m.seat !== null).map(m => {
    const [sx, , sz] = seatPosition(m.seat as number, seats);
    const walked = !m.sitting && !!m.pos;
    return { handle: m.handle, fixed: m.sitting || m.handle === meHandle,
             x: walked ? clamp(m.pos!.x, plan.minX, plan.maxX) : sx, z: walked ? clamp(m.pos!.z, plan.minZ, plan.maxZ) : sz };
  })), [monks, seats, meHandle, plan.minX, plan.maxX, plan.minZ, plan.maxZ]);
  const stand = (m: Monk): [number, number, number] => { const p = places.get(m.handle); return p ? [p[0], 0, p[1]] : seatPosition(m.seat ?? 0, seats); };
  const mine = me ? stand(me) : mySeat;
  const { pillarZ, px } = plan;
  return (
    <>
      <color attach="background" args={['#1a130e']} />
      <fog attach="fog" args={['#1a130e', 30, 100]} />
      <ambientLight intensity={0.85} color="#ffe6c4" />
      <hemisphereLight args={['#ffe9c9', '#4a2f1d', 1.1]} />
      <directionalLight position={[-W, 9, 6]} intensity={1.5} color="#fff1d8" />
      <directionalLight position={[W, 7, -4]} intensity={0.6} color="#ffd9a8" />
      <pointLight position={[0, H - 3, 2]} intensity={70} distance={40} decay={1.6} color="#ffd9a0" />
      <pointLight position={[0, H - 3, D / 2 - 8]} intensity={50} distance={36} decay={1.6} color="#ffd9a0" />

      {/* floor: stone slabs, with a worn path from the door to the Buddha */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={e => { e.stopPropagation(); onFloor(e.point.x, e.point.z); }}>
        <planeGeometry args={[W, D]} /><meshStandardMaterial color="#a39a88" roughness={0.8} />
      </mesh>
      {Array.from({ length: Math.floor(W / 1.7) }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-W / 2 + (i + 0.5) * 1.7, 0.004, 0]}><planeGeometry args={[0.04, D]} /><meshBasicMaterial color="#7d7566" /></mesh>
      ))}
      {Array.from({ length: Math.floor(D / 1.7) }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, -D / 2 + (i + 0.5) * 1.7]}><planeGeometry args={[W, 0.04]} /><meshBasicMaterial color="#7d7566" /></mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 2]}><planeGeometry args={[1.25, D - 13]} /><meshStandardMaterial color="#8c8370" roughness={0.9} /></mesh>

      {/* walls: dark timber below, white plaster above, slatted windows between the pillars */}
      <mesh position={[0, H / 2, front]}><planeGeometry args={[W, H]} /><meshStandardMaterial color="#33221a" roughness={0.85} /></mesh>
      <mesh position={[0, H / 2, D / 2]} rotation={[0, Math.PI, 0]}><planeGeometry args={[W, H]} /><meshStandardMaterial color="#4a3122" roughness={0.85} /></mesh>
      {[-1, 1].map(s => (
        <group key={s}>
          <mesh position={[s * W / 2, H / 2, 0]} rotation={[0, -s * Math.PI / 2, 0]}><planeGeometry args={[D, H]} /><meshStandardMaterial color="#d8cdb4" roughness={0.95} /></mesh>
          <mesh position={[s * (W / 2 - 0.02), 0.9, 0]} rotation={[0, -s * Math.PI / 2, 0]}><planeGeometry args={[D, 1.8]} /><meshStandardMaterial color="#4a3122" roughness={0.85} /></mesh>
          {[1.8, 5.7, 9.2].map(y => <mesh key={y} position={[s * (W / 2 - 0.1), y, 0]}><boxGeometry args={[0.2, 0.3, D]} /><meshStandardMaterial color="#4a3122" roughness={0.8} /></mesh>)}
          {pillarZ.map(z => (
            <group key={z}>
              <mesh position={[s * (W / 2 - 0.12), H / 2, z]}><boxGeometry args={[0.24, H, 0.5]} /><meshStandardMaterial color="#4a3122" roughness={0.8} /></mesh>
              <group position={[s * (W / 2 - 0.05), 3.75, z + 2.7]} rotation={[0, -s * Math.PI / 2, 0]}>
                <mesh><planeGeometry args={[3.5, 3.6]} /><meshBasicMaterial color="#fbeed0" toneMapped={false} /></mesh>
                {Array.from({ length: 11 }, (_, i) => <mesh key={i} position={[-1.6 + i * 0.32, 0, 0.01]}><planeGeometry args={[0.13, 3.6]} /><meshBasicMaterial color="#3d281c" /></mesh>)}
              </group>
              <Pillar x={s * px} z={z} />
            </group>
          ))}
          <mesh position={[s * px, H - 0.5, 0]}><boxGeometry args={[0.6, 0.7, D]} /><meshStandardMaterial color="#5a3a25" roughness={0.8} /></mesh>
        </group>
      ))}
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[W, D]} /><meshStandardMaterial color="#3b291c" roughness={0.9} /></mesh>
      {pillarZ.map(z => (
        <mesh key={z} position={[0, H - 0.5, z]}><boxGeometry args={[W, 0.6, 0.55]} /><meshStandardMaterial color="#5a3a25" roughness={0.8} /></mesh>
      ))}
      <Coffers width={W} depth={D} />

      <Altar z={front + 2.6} />
      <Cushions seats={seats} taken={taken} />
      {monks.filter(m => m.seat !== null).map(m => (
        <Monk3D key={m.handle} monk={m} position={stand(m)} me={m.handle === meHandle}
          bowTick={m.handle === meHandle ? bowTick : undefined} onPress={m.handle === meHandle ? undefined : onBow} />
      ))}
      {me && me.seat !== null && <WoodenFish position={[mySeat[0] + 0.86, 0, mySeat[2] - 0.5]} tick={knockTick} onKnock={onKnock} />}
      {trial && <TrialVisitors kind={trial} center={mine} />}
      <CameraRig orbit={orbit} target={[mine[0] * 0.8, 2.8, mine[2] - 3.6]} bounds={{ x: px - 1.3, z0: front + 8.6, z1: D / 2 - 0.9 }} />
    </>
  );
}
