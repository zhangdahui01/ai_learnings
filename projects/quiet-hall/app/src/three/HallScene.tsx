import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Monk } from '../api';
import { Monk3D } from './Monk3D';
import { clamp, type Orbit } from './orbit';
import { useFrame, useThree } from './r3f';

export const COLS = 8;
const SX = 1.7, SZ = 1.8, H = 9.5;

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

const cushionGeo = new THREE.CylinderGeometry(0.56, 0.6, 0.16, 24);
const lanternGeo = new THREE.SphereGeometry(0.2, 12, 10);
const LANTERN = ['#f08a8a', '#f6c453', '#8fd08a', '#7fb7ea', '#f2a6d0', '#ffffff'];

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

/** Rows of paper lanterns under the ceiling. */
function Lanterns({ width, depth }: { width: number; depth: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let z = -depth / 2 + 9; z < depth / 2 - 2; z += 2.2) for (let x = -width / 2 + 3.4; x <= width / 2 - 3.4; x += 2.05) out.push([x, H - 1.9, z]);
    return out;
  }, [width, depth]);
  useLayoutEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const m = new THREE.Matrix4(), c = new THREE.Color();
    spots.forEach(([x, y, z], i) => {
      m.makeScale(1, 1.15, 1).setPosition(x, y + ((i * 7) % 3) * 0.12, z); mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(LANTERN[(i * 5 + Math.floor(i / 7)) % LANTERN.length]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[lanternGeo, undefined, spots.length]} key={spots.length}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Pillar({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.62, 0.7, 0.4, 20]} /><meshStandardMaterial color="#8d8478" roughness={0.9} /></mesh>
      <mesh position={[0, H / 2, 0]}><cylinderGeometry args={[0.42, 0.46, H - 0.4, 20]} /><meshStandardMaterial color="#9c2f24" roughness={0.55} /></mesh>
      <mesh position={[0, H - 0.75, 0]}><cylinderGeometry args={[0.6, 0.44, 0.5, 20]} /><meshStandardMaterial color="#1f6b62" roughness={0.6} /></mesh>
      <mesh position={[0, H - 1.15, 0]}><cylinderGeometry args={[0.47, 0.47, 0.12, 20]} /><meshStandardMaterial color="#d9a441" roughness={0.4} metalness={0.4} /></mesh>
    </group>
  );
}

function Altar({ z }: { z: number }) {
  const flames = useRef<THREE.Group>(null);
  const smoke = useRef<THREE.Group>(null);
  const glow = useRef<THREE.PointLight>(null);
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
  const figure = (x: number, s: number) => (
    <group position={[x, 2.1, 0.2]} scale={s} key={x}>
      {Array.from({ length: 12 }, (_, i) => (                       // lotus seat
        <mesh key={i} position={[Math.cos(i * Math.PI / 6) * 1.25, 0.05, Math.sin(i * Math.PI / 6) * 1.25]}
          rotation={[0, -i * Math.PI / 6, Math.PI / 2.6]}>
          <coneGeometry args={[0.38, 0.9, 6]} /><meshStandardMaterial color="#e8a7a0" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[1.25, 1.1, 0.4, 24]} /><meshStandardMaterial color="#c9796f" roughness={0.7} /></mesh>
      <mesh position={[0, 0.72, 0.1]} scale={[1.5, 0.5, 1.25]}><sphereGeometry args={[0.8, 24, 16]} />{gold}</mesh>
      <mesh position={[0, 1.55, 0]} scale={[1, 1.15, 0.8]}><sphereGeometry args={[0.8, 24, 18]} />{gold}</mesh>
      <mesh position={[0, 2.78, 0]}><sphereGeometry args={[0.52, 24, 18]} />{gold}</mesh>
      <mesh position={[0, 3.3, 0]}><sphereGeometry args={[0.22, 16, 12]} />{gold}</mesh>
      <mesh position={[0, 1.05, 0.72]} scale={[1.3, 0.5, 0.7]}><sphereGeometry args={[0.3, 16, 12]} />{gold}</mesh>
      <mesh position={[0, 2.5, -0.55]}><circleGeometry args={[1.75, 40]} /><meshBasicMaterial color="#f6d27a" toneMapped={false} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 2.5, -0.6]}><ringGeometry args={[1.75, 2.05, 40]} /><meshBasicMaterial color="#c0392b" toneMapped={false} side={THREE.DoubleSide} /></mesh>
    </group>
  );
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 0.5, 0.6]}><boxGeometry args={[15, 1, 5.2]} /><meshStandardMaterial color="#8d8478" roughness={0.95} /></mesh>
      <mesh position={[0, 1.45, 0.2]}><boxGeometry args={[13.5, 0.9, 3.6]} /><meshStandardMaterial color="#6e241c" roughness={0.6} /></mesh>
      <mesh position={[0, 1.93, 0.2]}><boxGeometry args={[13.8, 0.1, 3.8]} /><meshStandardMaterial color="#d9a441" metalness={0.5} roughness={0.4} /></mesh>
      {figure(0, 1)}{figure(-4.4, 0.72)}{figure(4.4, 0.72)}
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

export function HallScene({ monks, seats, meHandle, orbit, onBow, knockTick, onKnock }: {
  monks: Monk[]; seats: number; meHandle: string; orbit: React.RefObject<Orbit>; onBow: (m: Monk) => void;
  knockTick: number; onKnock: () => void;
}) {
  const { width: W, depth: D, front } = hallSize(seats);
  const taken = useMemo(() => new Set(monks.map(m => m.seat ?? -1)), [monks]);
  const me = monks.find(m => m.handle === meHandle);
  const mine = me && me.seat !== null ? seatPosition(me.seat, seats) : ([0, 0, 0] as [number, number, number]);
  const pillarZ = useMemo(() => { const out: number[] = []; for (let z = front + 7.5; z < D / 2 - 1; z += 5.4) out.push(z); return out; }, [front, D]);
  const px = W / 2 - 2.3;
  return (
    <>
      <color attach="background" args={['#1c120c']} />
      <fog attach="fog" args={['#1c120c', 26, 95]} />
      <ambientLight intensity={0.85} color="#ffe6c4" />
      <hemisphereLight args={['#ffe9c9', '#4a2f1d', 1.1]} />
      <directionalLight position={[-W, 9, 6]} intensity={1.5} color="#fff1d8" />
      <directionalLight position={[W, 7, -4]} intensity={0.6} color="#ffd9a8" />
      <pointLight position={[0, H - 3, 2]} intensity={70} distance={40} decay={1.6} color="#ffd9a0" />
      <pointLight position={[0, H - 3, D / 2 - 8]} intensity={50} distance={36} decay={1.6} color="#ffd9a0" />

      {/* floor: wooden boards running toward the altar */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[W, D]} /><meshStandardMaterial color="#9a6a3e" roughness={0.55} /></mesh>
      {Array.from({ length: Math.floor(W / 1.3) }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-W / 2 + (i + 0.5) * 1.3, 0.004, 0]}>
          <planeGeometry args={[0.035, D]} /><meshBasicMaterial color="#5e3d22" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 2]}><planeGeometry args={[1.25, D - 13]} /><meshStandardMaterial color="#7a2a22" roughness={0.9} /></mesh>

      {/* walls, ceiling, beams */}
      <mesh position={[0, H / 2, front]}><planeGeometry args={[W, H]} /><meshStandardMaterial color="#6a2019" roughness={0.8} /></mesh>
      <mesh position={[0, H / 2 + 0.6, front + 0.05]}><planeGeometry args={[W - 4, H - 3.4]} /><meshStandardMaterial color="#8a5a1e" roughness={0.6} metalness={0.25} /></mesh>
      <mesh position={[0, H / 2, D / 2]} rotation={[0, Math.PI, 0]}><planeGeometry args={[W, H]} /><meshStandardMaterial color="#5c1d17" roughness={0.85} /></mesh>
      {[-1, 1].map(s => (
        <group key={s}>
          <mesh position={[s * W / 2, H / 2, 0]} rotation={[0, -s * Math.PI / 2, 0]}><planeGeometry args={[D, H]} /><meshStandardMaterial color="#6a2019" roughness={0.85} /></mesh>
          {pillarZ.map(z => (                                         // paper lattice windows between the pillars
            <group key={z} position={[s * (W / 2 - 0.04), 3.6, z + 2.7]} rotation={[0, -s * Math.PI / 2, 0]}>
              <mesh><planeGeometry args={[3.3, 3.6]} /><meshBasicMaterial color="#fbe9c6" toneMapped={false} /></mesh>
              {[-1.1, 0, 1.1].map(x => <mesh key={x} position={[x, 0, 0.01]}><planeGeometry args={[0.07, 3.6]} /><meshBasicMaterial color="#5a2a1c" /></mesh>)}
              {[-1.2, 0, 1.2].map(y => <mesh key={y} position={[0, y, 0.01]}><planeGeometry args={[3.3, 0.07]} /><meshBasicMaterial color="#5a2a1c" /></mesh>)}
            </group>
          ))}
          {pillarZ.map(z => <Pillar key={z} x={s * px} z={z} />)}
          <mesh position={[s * px, H - 0.45, 0]}><boxGeometry args={[0.7, 0.6, D]} /><meshStandardMaterial color="#1f6b62" roughness={0.6} /></mesh>
        </group>
      ))}
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[W, D]} /><meshStandardMaterial color="#3a2317" roughness={0.9} /></mesh>
      {pillarZ.map(z => (
        <mesh key={z} position={[0, H - 0.5, z]}><boxGeometry args={[W, 0.55, 0.5]} /><meshStandardMaterial color="#a33a2a" roughness={0.6} /></mesh>
      ))}

      <Altar z={front + 2.6} />
      <Lanterns width={W} depth={D} />
      <Cushions seats={seats} taken={taken} />
      {monks.filter(m => m.seat !== null).map(m => (
        <Monk3D key={m.handle} monk={m} position={seatPosition(m.seat as number, seats)} me={m.handle === meHandle}
          onPress={m.handle === meHandle ? undefined : onBow} />
      ))}
      {me && me.seat !== null && <WoodenFish position={[mine[0] + 0.86, 0, mine[2] - 0.5]} tick={knockTick} onKnock={onKnock} />}
      <CameraRig orbit={orbit} target={[mine[0] * 0.55, 1.5, mine[2] - 2.5]} bounds={{ x: px - 1.3, z0: front + 8.6, z1: D / 2 - 0.9 }} />
    </>
  );
}
