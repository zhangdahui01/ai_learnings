import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from './r3f';
import { cuspedGableShape, ridgeHornShape, roofGeometry } from './roof';

// The temple is modelled on a great Buddha hall of the Nara period: two stacked roofs of grey tile, golden
// horns on the ridge, a cusped gable over the door, white plaster between dark timbers, a bronze lantern
// in front, lawns and deer.
const TILE = '#4d5861', TILE_EDGE = '#31373b', TIMBER = '#4a3122', PLASTER = '#efe6d2', VERMILION = '#a23a28', GOLD = '#e0b24c';
const tile = <meshStandardMaterial color={TILE} roughness={0.8} flatShading side={THREE.DoubleSide} />;
const timber = <meshStandardMaterial color={TIMBER} roughness={0.8} />;
const gold = <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.3} emissive="#6b4a12" emissiveIntensity={0.4} />;

function Pine({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.16, 0.24, 2.4, 8]} /><meshStandardMaterial color="#5b3d28" roughness={0.9} /></mesh>
      {[0, 1, 2].map(i => (
        <mesh key={i} position={[0, 2.5 + i * 1.05, 0]}><coneGeometry args={[1.5 - i * 0.36, 1.7, 9]} /><meshStandardMaterial color={['#2f5d43', '#356b4c', '#3d7a55'][i]} roughness={0.9} /></mesh>
      ))}
    </group>
  );
}

/** The eight-sided bronze lantern that stands before the hall. */
function BronzeLantern({ z }: { z: number }) {
  const bronze = <meshStandardMaterial color="#5f6b5a" metalness={0.6} roughness={0.5} />;
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[1.2, 1.35, 0.4, 8]} /><meshStandardMaterial color="#a39c90" roughness={0.95} /></mesh>
      <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.28, 0.4, 1.6, 8]} />{bronze}</mesh>
      <mesh position={[0, 2.1, 0]}><cylinderGeometry args={[0.95, 0.5, 0.3, 8]} />{bronze}</mesh>
      <mesh position={[0, 2.95, 0]}><cylinderGeometry args={[0.72, 0.72, 1.4, 8]} />{bronze}</mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[Math.sin((i + 0.5) * Math.PI / 4) * 0.68, 2.95, Math.cos((i + 0.5) * Math.PI / 4) * 0.68]} rotation={[0, (i + 0.5) * Math.PI / 4, 0]}>
          <planeGeometry args={[0.36, 0.9]} /><meshBasicMaterial color="#ffd98a" toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 4.0, 0]}><coneGeometry args={[1.25, 0.8, 8]} />{bronze}</mesh>
      <mesh position={[0, 4.6, 0]}><sphereGeometry args={[0.22, 12, 10]} />{gold}</mesh>
    </group>
  );
}

function Deer({ x, z, turn = 0, grazing = false, s = 1 }: { x: number; z: number; turn?: number; grazing?: boolean; s?: number }) {
  const coat = <meshStandardMaterial color="#b07a4a" roughness={0.9} />;
  return (
    <group position={[x, 0, z]} rotation={[0, turn, 0]} scale={s}>
      <mesh position={[0, 0.95, 0]} scale={[1.5, 0.75, 0.62]}><sphereGeometry args={[0.5, 14, 10]} />{coat}</mesh>
      {[[-0.45, 0.16], [-0.45, -0.16], [0.45, 0.16], [0.45, -0.16]].map(([lx, lz]) => (
        <mesh key={`${lx}${lz}`} position={[lx, 0.34, lz]}><cylinderGeometry args={[0.055, 0.045, 0.68, 6]} />{coat}</mesh>
      ))}
      <group position={[0.62, 1.1, 0]} rotation={[0, 0, grazing ? -1.9 : -0.5]}>
        <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.1, 0.15, 0.6, 8]} />{coat}</mesh>
        <mesh position={[0.07, 0.66, 0]} scale={[1.4, 0.85, 0.8]}><sphereGeometry args={[0.17, 12, 10]} />{coat}</mesh>
        {[-0.1, 0.1].map(e => <mesh key={e} position={[-0.08, 0.84, e]} rotation={[e * 4, 0, 0.4]}><coneGeometry args={[0.05, 0.2, 5]} />{coat}</mesh>)}
      </group>
      <mesh position={[-0.74, 1.08, 0]}><sphereGeometry args={[0.09, 8, 6]} /><meshStandardMaterial color="#f3ead9" roughness={0.9} /></mesh>
    </group>
  );
}

function Drift() {
  const { camera, size } = useThree();
  const look = useRef(new THREE.Vector3());
  useFrame(({ clock }) => {                   // a slow sway, as if standing on the approach
    const t = clock.elapsedTime * 0.12;
    // Step back far enough that the whole hall fits a narrow (portrait) screen, and aim so the ridge sits
    // near the top of the screen, above the entry card.
    const tan = Math.tan((((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180) / 2);
    const dist = Math.min(84, Math.max(36, 18.5 / (tan * (size.width / size.height))));
    camera.position.set(Math.sin(t) * dist * 0.2, 5 + Math.sin(t * 1.7) * 0.6, dist + Math.cos(t) * 2);
    look.current.set(0, 22.5 - dist * tan * 0.9, 0);
    camera.lookAt(look.current);
  });
  return null;
}

/** One storey of wall: white plaster between dark posts and tie beams, with wooden doors in the bays. */
function Storey({ y, w, d, h, bays, doors }: { y: number; w: number; d: number; h: number; bays: number; doors: boolean }) {
  const posts = Array.from({ length: bays + 1 }, (_, i) => -w / 2 + (i * w) / bays);
  const centre = (bays - 1) / 2;
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, h / 2, 0]}><boxGeometry args={[w, h, d]} /><meshStandardMaterial color={PLASTER} roughness={0.95} /></mesh>
      {posts.map(x => <mesh key={x} position={[x, h / 2, d / 2 + 0.06]}><boxGeometry args={[0.42, h, 0.3]} />{timber}</mesh>)}
      {[0.14, h - 0.14, ...(doors ? [h * 0.72] : [])].map(yy => <mesh key={yy} position={[0, yy, d / 2 + 0.05]}><boxGeometry args={[w + 0.4, 0.28, 0.26]} />{timber}</mesh>)}
      {[-1, 1].map(s => (
        <group key={s}>
          {[-d / 2, -d / 6, d / 6, d / 2].map(z => <mesh key={z} position={[s * (w / 2 + 0.06), h / 2, z]}><boxGeometry args={[0.3, h, 0.42]} />{timber}</mesh>)}
          <mesh position={[s * (w / 2 + 0.05), h - 0.14, 0]}><boxGeometry args={[0.26, 0.28, d + 0.4]} />{timber}</mesh>
        </group>
      ))}
      {doors && Array.from({ length: bays }, (_, i) => {
        const x = -w / 2 + ((i + 0.5) * w) / bays, bw = w / bays - 0.7, mid = i === centre;
        if (Math.abs(i - centre) > 2) return null;                          // the outer bays are plain plaster
        return (
          <group key={i} position={[x, 0, d / 2 + 0.08]}>
            <mesh position={[0, h * 0.36, 0]}><planeGeometry args={[bw, h * 0.72 - 0.3]} /><meshStandardMaterial color={mid ? '#1b120c' : '#6b3a26'} roughness={0.8} /></mesh>
            {mid && <mesh position={[0, h * 0.4, 0.02]}><circleGeometry args={[bw * 0.3, 24]} /><meshBasicMaterial color="#c99a3c" toneMapped={false} /></mesh>}
            {!mid && [-0.25, 0.25].map(k => <mesh key={k} position={[k * bw, h * 0.36, 0.02]}><planeGeometry args={[0.06, h * 0.72 - 0.5]} /><meshBasicMaterial color="#3a1f14" /></mesh>)}
          </group>
        );
      })}
    </group>
  );
}

/** The great hall from the approach: stone terrace, two roofs, lantern, lawns, cloister, hills behind. */
export function TempleScene() {
  const lower = useMemo(() => roofGeometry([34, 23], [25, 14], 2.5, { lift: 0.7 }), []);
  const upper = useMemo(() => roofGeometry([32, 21], [15, 0], 6.6, { lift: 0.9 }), []);
  const gable = useMemo(() => {
    const { band, fill } = cuspedGableShape(4.6, 2.3, 0.42);
    return { band: new THREE.ExtrudeGeometry(band, { depth: 3.4, bevelEnabled: false }), fill: new THREE.ShapeGeometry(fill) };
  }, []);
  const horn = useMemo(() => new THREE.ExtrudeGeometry(ridgeHornShape(), { depth: 0.5, bevelEnabled: false }), []);
  return (
    <>
      <color attach="background" args={['#f3dfbb']} />
      <fog attach="fog" args={['#f3dfbb', 90, 210]} />
      <ambientLight intensity={1.1} color="#fff0d6" />
      <hemisphereLight args={['#fff3da', '#6f7a4c', 1.2]} />
      <directionalLight position={[-18, 26, 22]} intensity={2.3} color="#ffe6bc" />

      {/* lawns either side of a stone approach, as in Nara */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[280, 280]} /><meshStandardMaterial color="#8fa863" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 30]}><planeGeometry args={[7, 70]} /><meshStandardMaterial color="#d2c8b4" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 1]}><planeGeometry args={[52, 34]} /><meshStandardMaterial color="#c9bea6" roughness={1} /></mesh>
      <mesh position={[0, 30, -80]}><circleGeometry args={[7, 40]} /><meshBasicMaterial color="#fff6dc" toneMapped={false} /></mesh>
      {[[-52, 30, -84, '#8ea58f'], [-14, 42, -100, '#a3b7a2'], [34, 34, -90, '#89a08c'], [70, 26, -80, '#9db19d'], [-84, 24, -76, '#a3b7a2']].map(([x, h, z, c]) => (
        <mesh key={String(x)} position={[x as number, (h as number) / 2 - 1, z as number]}><coneGeometry args={[(h as number) * 1.15, h as number, 7]} /><meshStandardMaterial color={c as string} roughness={1} /></mesh>
      ))}

      {/* the cloister that closes the court on both sides */}
      {[-1, 1].map(s => (
        <group key={s} position={[s * 33, 0, 6]}>
          <mesh position={[0, 1.9, 0]}><boxGeometry args={[14, 3.2, 3]} /><meshStandardMaterial color={PLASTER} roughness={0.95} /></mesh>
          {[-6, -3, 0, 3, 6].map(x => <mesh key={x} position={[x, 1.75, 1.6]}><cylinderGeometry args={[0.2, 0.22, 3.5, 10]} /><meshStandardMaterial color={VERMILION} roughness={0.6} /></mesh>)}
          <mesh position={[0, 3.5, 0]} geometry={cloisterRoof(15.4, 5)}>{tile}</mesh>
        </group>
      ))}

      {/* stone terrace and steps */}
      <mesh position={[0, 0.6, 0]}><boxGeometry args={[36, 1.2, 25]} /><meshStandardMaterial color="#a8a094" roughness={0.95} /></mesh>
      {[0, 1, 2].map(i => (
        <mesh key={i} position={[0, 0.2 + i * 0.4, 13.6 - i * 0.55]}><boxGeometry args={[9, 0.4, 1.1]} /><meshStandardMaterial color="#b5ad9f" roughness={0.95} /></mesh>
      ))}

      {/* the hall: a tall storey, a skirt roof, a short upper storey, the great hipped roof */}
      <Storey y={1.2} w={27} d={16} h={5.4} bays={7} doors />
      <mesh position={[0, 6.4, 0]} geometry={lower}>{tile}</mesh>
      <mesh position={[0, 6.3, 0]}><boxGeometry args={[33.6, 0.22, 22.6]} /><meshStandardMaterial color={TILE_EDGE} roughness={0.8} /></mesh>
      <Storey y={8.6} w={24} d={13} h={2.4} bays={7} doors={false} />
      {Array.from({ length: 15 }, (_, i) => (                                   // bracket blocks under the upper eaves
        <mesh key={i} position={[-11.2 + i * 1.6, 10.75, 6.9]}><boxGeometry args={[0.5, 0.4, 0.9]} /><meshStandardMaterial color={PLASTER} roughness={0.9} /></mesh>
      ))}
      <mesh position={[0, 11.0, 0]} geometry={upper}>{tile}</mesh>
      <mesh position={[0, 10.9, 0]}><boxGeometry args={[31.6, 0.24, 20.6]} /><meshStandardMaterial color={TILE_EDGE} roughness={0.8} /></mesh>
      <mesh position={[0, 17.75, 0]}><boxGeometry args={[15.6, 0.6, 0.8]} /><meshStandardMaterial color={TILE_EDGE} roughness={0.7} /></mesh>
      {[-1, 1].map(s => (
        <mesh key={s} geometry={horn} position={[s * 7.9, 17.9, s * 0.25]} rotation={[0, s > 0 ? Math.PI : 0, 0]} scale={1.3}>{gold}</mesh>
      ))}

      {/* the cusped gable over the entrance, and the window through which the Buddha looks out */}
      <group position={[0, 6.75, 8.4]}>
        <mesh geometry={gable.band}><meshStandardMaterial color={TILE} roughness={0.8} /></mesh>
        <mesh geometry={gable.fill} position={[0, 0, 3.3]}><meshStandardMaterial color={PLASTER} roughness={0.95} /></mesh>
        <mesh position={[0, 0.85, 3.34]}><planeGeometry args={[2.3, 1.3]} /><meshStandardMaterial color="#1b120c" roughness={0.8} /></mesh>
        <mesh position={[0, 0.85, 3.36]}><circleGeometry args={[0.5, 20]} /><meshBasicMaterial color="#d8aa48" toneMapped={false} /></mesh>
        <mesh position={[0, 2.62, 3.42]}><boxGeometry args={[0.5, 0.5, 0.2]} />{gold}</mesh>
        {[-4.3, 4.3].map(x => <mesh key={x} position={[x, -2.7, 3.0]}><boxGeometry args={[0.46, 5.4, 0.46]} />{timber}</mesh>)}
      </group>

      <BronzeLantern z={20} />
      <Deer x={-13} z={26} turn={0.6} grazing /><Deer x={-17} z={23} turn={-0.4} s={0.8} /><Deer x={12} z={28} turn={2.6} /><Deer x={16} z={24} turn={3.4} grazing s={0.9} /><Deer x={-9} z={36} turn={1.4} s={0.7} />
      <Pine x={-23} z={-6} s={2.2} /><Pine x={24} z={-7} s={2.3} /><Pine x={-17} z={-17} s={2.6} /><Pine x={18} z={-18} s={2.7} />
      <Pine x={-44} z={14} s={1.6} /><Pine x={45} z={15} s={1.5} /><Pine x={-30} z={30} s={1.2} /><Pine x={31} z={32} s={1.3} />
      <Drift />
    </>
  );
}

const cloisterRoofs = new Map<string, THREE.BufferGeometry>();
/** Small hipped roofs for the cloister, made once. */
function cloisterRoof(w: number, d: number) {
  const key = `${w}x${d}`;
  if (!cloisterRoofs.has(key)) cloisterRoofs.set(key, roofGeometry([w, d], [w - d, 0], 1.3, { lift: 0.25, steps: 4 }));
  return cloisterRoofs.get(key)!;
}
