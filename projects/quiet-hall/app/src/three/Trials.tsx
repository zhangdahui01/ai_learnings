import React, { useRef } from 'react';
import * as THREE from 'three';
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

/** Seven celestial maidens drifting in a ring around the cushion, ribbons trailing. */
function Fairies({ center }: { center: [number, number, number] }) {
  const ring = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) {
      ring.current.rotation.y = t * 0.55;
      ring.current.children.forEach((f, i) => {
        f.position.y = 0.55 + Math.sin(t * 1.8 + i * 0.9) * 0.22;
        f.rotation.y = Math.sin(t * 1.2 + i) * 0.5;
      });
    }
  });
  return (
    <group ref={ring} position={center}>
      {ROBES.map((color, i) => {
        const a = (i / ROBES.length) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(a) * 2.3, 0.55, Math.sin(a) * 2.3]}>
            <mesh position={[0, 0.55, 0]}><coneGeometry args={[0.42, 1.25, 14]} /><meshStandardMaterial color={color} roughness={0.6} /></mesh>
            <mesh position={[0, 1.28, 0]}><sphereGeometry args={[0.19, 14, 12]} /><meshStandardMaterial color="#fbe4d2" roughness={0.7} /></mesh>
            <mesh position={[0, 1.47, -0.02]}><sphereGeometry args={[0.13, 12, 10]} /><meshStandardMaterial color="#2a1f18" roughness={0.6} /></mesh>
            <mesh position={[0, 1.02, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.5, 0.035, 6, 24]} /><meshBasicMaterial color="#fff6c8" toneMapped={false} /></mesh>
            <mesh position={[0.5, 0.75, 0]} rotation={[0, 0, -0.9]}><boxGeometry args={[0.07, 1.1, 0.02]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
          </group>
        );
      })}
      <pointLight position={[0, 2.4, 0]} intensity={18} distance={9} color="#ffd9f0" />
    </group>
  );
}

export function TrialVisitors({ kind, center }: { kind: TrialKind; center: [number, number, number] }) {
  return kind === 'dog' ? <Dog center={center} /> : <Fairies center={center} />;
}
