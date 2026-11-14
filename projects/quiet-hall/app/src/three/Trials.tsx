import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FACE_PATCH, faceTexture, featuresFor } from './faces';
import { useFrame } from './r3f';

export type TrialKind = 'dog' | 'fairies';

/** A stray dog that runs barking circles around the cushion. */
function Dog({ center }: { center: [number, number, number] }) {
  const g = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Mesh>(null);
  const legs = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, a = t * 2.4, r = 1.9 + Math.sin(t * 1.3) * 0.35;
    if (g.current) {
      g.current.position.set(center[0] + Math.cos(a) * r, Math.abs(Math.sin(t * 11)) * 0.09, center[2] + Math.sin(a) * r);
      g.current.rotation.y = -a;                                   // nose along the circle
    }
    if (tail.current) tail.current.rotation.x = Math.sin(t * 22) * 0.7;
    legs.current?.children.forEach((leg, i) => { leg.rotation.x = Math.sin(t * 16 + (i % 2 ? Math.PI : 0)) * 0.7; });
  });
  const fur = <meshStandardMaterial color="#b88a52" roughness={0.9} />;
  const dark = <meshStandardMaterial color="#6b4a2a" roughness={0.9} />;
  return (
    <group ref={g}>
      <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.36, 0.34, 0.86]} />{fur}</mesh>
      <mesh position={[0, 0.72, 0.5]}><boxGeometry args={[0.32, 0.3, 0.34]} />{fur}</mesh>
      <mesh position={[0, 0.66, 0.72]}><boxGeometry args={[0.18, 0.14, 0.2]} />{dark}</mesh>
      <mesh position={[-0.12, 0.92, 0.46]} rotation={[0, 0, 0.25]}><coneGeometry args={[0.07, 0.18, 4]} />{dark}</mesh>
      <mesh position={[0.12, 0.92, 0.46]} rotation={[0, 0, -0.25]}><coneGeometry args={[0.07, 0.18, 4]} />{dark}</mesh>
      <mesh position={[-0.09, 0.78, 0.68]}><sphereGeometry args={[0.03, 8, 6]} /><meshBasicMaterial color="#1a120c" /></mesh>
      <mesh position={[0.09, 0.78, 0.68]}><sphereGeometry args={[0.03, 8, 6]} /><meshBasicMaterial color="#1a120c" /></mesh>
      <mesh ref={tail} position={[0, 0.68, -0.48]}><boxGeometry args={[0.07, 0.34, 0.07]} />{dark}</mesh>
      <group ref={legs}>
        {[[-0.12, 0.3], [0.12, 0.3], [-0.12, -0.3], [0.12, -0.3]].map(([x, z], i) => (
          <group key={i} position={[x, 0.36, z]}><mesh position={[0, -0.18, 0]}><boxGeometry args={[0.09, 0.36, 0.09]} />{dark}</mesh></group>
        ))}
      </group>
    </group>
  );
}

const ROBES = ['#f2a6c8', '#a9d8f5', '#c7b5f2', '#f6d98a', '#a8e6c4', '#f7b79a', '#ffd3e6'];
const SKINS = ['#fbe4d2', '#f6d9bd', '#f9e2cf', '#eec7a4'];

/** One celestial maiden: her own face, hair up in a knot, long sleeves. Faces -z. */
function Maiden({ id, color }: { id: string; color: string }) {
  const feat = useMemo(() => featuresFor(id, 'f', 'fairy'), [id]);
  const face = useMemo(() => faceTexture(id, 'f', false, 'fairy'), [id]);
  const skin = SKINS[Math.floor(feat.age * 97) % SKINS.length];
  const hair = <meshStandardMaterial color="#1e1612" roughness={0.5} />;
  return (
    <group scale={[feat.build * 0.95, feat.height, feat.build * 0.95]}>
      <mesh position={[0, 0.5, 0]}><coneGeometry args={[0.46, 1.1, 18]} /><meshStandardMaterial color={color} roughness={0.55} /></mesh>
      <mesh position={[0, 1.02, 0]} scale={[1, 1.15, 0.8]}><sphereGeometry args={[0.2, 14, 12]} /><meshStandardMaterial color={color} roughness={0.55} /></mesh>
      <mesh position={[0, 0.98, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.2, 0.03, 6, 20]} /><meshStandardMaterial color="#c0392b" roughness={0.5} /></mesh>
      {[-1, 1].map(s => (                                          // sleeves, held out as she dances
        <mesh key={s} position={[s * 0.38, 1.0, -0.05]} rotation={[0, 0, s * 1.15]}><coneGeometry args={[0.16, 0.7, 10]} /><meshStandardMaterial color={color} roughness={0.55} /></mesh>
      ))}
      <mesh position={[0.72, 0.86, 0]} rotation={[0, 0, -0.5]}><boxGeometry args={[0.07, 1.0, 0.02]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      <mesh position={[0, 1.18, 0]}><cylinderGeometry args={[0.06, 0.07, 0.12, 10]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh>
      <group position={[0, 1.42, 0]} scale={[feat.headWide * 0.82, feat.headTall * 0.9, 0.84]}>
        <mesh><sphereGeometry args={[0.27, 22, 18]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh>
        {face && <mesh geometry={FACE_PATCH}><meshStandardMaterial map={face} transparent roughness={0.75} polygonOffset polygonOffsetFactor={-2} /></mesh>}
        <mesh position={[0, 0.05, 0.07]} scale={[1.06, 1.02, 1.0]}><sphereGeometry args={[0.27, 18, 14, 0, Math.PI * 2, 0, 1.25]} />{hair}</mesh>
        <mesh position={[0, -0.14, 0.2]} scale={[0.9, 1.5, 0.5]}><sphereGeometry args={[0.2, 12, 10]} />{hair}</mesh>
        <mesh position={[0, 0.33, 0.02]}><sphereGeometry args={[0.11, 12, 10]} />{hair}</mesh>
        <mesh position={[0.12, 0.36, 0.02]} rotation={[0, 0, 0.9]}><cylinderGeometry args={[0.012, 0.012, 0.3, 6]} /><meshStandardMaterial color="#e2b24a" metalness={0.7} roughness={0.3} /></mesh>
      </group>
    </group>
  );
}

/** Seven celestial maidens drifting in a ring around the cushion, each a different person every time they come. */
function Fairies({ center }: { center: [number, number, number] }) {
  const ring = useRef<THREE.Group>(null);
  const visit = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) {
      ring.current.rotation.y = t * 0.45;
      ring.current.children.forEach((f, i) => {
        if (f.type !== 'Group') return;
        const a = (i / ROBES.length) * Math.PI * 2;
        f.position.y = 0.25 + Math.sin(t * 1.8 + i * 0.9) * 0.18;
        f.rotation.y = Math.atan2(Math.cos(a), Math.sin(a)) + Math.sin(t * 1.2 + i) * 0.35;      // looking at the monk, swaying
      });
    }
  });
  return (
    <group ref={ring} position={center}>
      {ROBES.map((color, i) => {
        const a = (i / ROBES.length) * Math.PI * 2;
        return <group key={i} position={[Math.cos(a) * 2.2, 0.25, Math.sin(a) * 2.2]}><Maiden id={`${visit}-${i}`} color={color} /></group>;
      })}
      <pointLight position={[0, 2.6, 0]} intensity={22} distance={10} color="#ffe6f4" />
    </group>
  );
}

export function TrialVisitors({ kind, center }: { kind: TrialKind; center: [number, number, number] }) {
  return kind === 'dog' ? <Dog center={center} /> : <Fairies center={center} />;
}
