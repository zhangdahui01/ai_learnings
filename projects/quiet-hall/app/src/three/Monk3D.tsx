import React, { useRef } from 'react';
import * as THREE from 'three';
import type { Monk } from '../api';
import { useFrame } from './r3f';

// Geometry is shared by every monk in the hall.
const G = {
  head: new THREE.SphereGeometry(0.27, 20, 16),
  ear: new THREE.SphereGeometry(0.07, 8, 8),
  torso: new THREE.SphereGeometry(0.5, 20, 14),
  lap: new THREE.SphereGeometry(0.5, 20, 12),
  standing: new THREE.CapsuleGeometry(0.3, 0.75, 6, 14),
  hand: new THREE.SphereGeometry(0.1, 10, 8),
  eye: new THREE.SphereGeometry(0.03, 8, 6),
  lid: new THREE.BoxGeometry(0.09, 0.014, 0.02),
  cheek: new THREE.SphereGeometry(0.05, 8, 6),
  dot: new THREE.SphereGeometry(0.022, 8, 6),
  beads: new THREE.TorusGeometry(0.2, 0.028, 8, 20),
  sash: new THREE.TorusGeometry(0.46, 0.05, 8, 24, Math.PI * 1.1),
  ring: new THREE.TorusGeometry(0.78, 0.045, 8, 40),
};
const M = {
  ink: new THREE.MeshStandardMaterial({ color: '#2a1f18', roughness: 0.6 }),
  blush: new THREE.MeshStandardMaterial({ color: '#e58f7c', roughness: 0.9, transparent: true, opacity: 0.75 }),
  beads: new THREE.MeshStandardMaterial({ color: '#3b2a20', roughness: 0.5 }),
  mark: new THREE.MeshStandardMaterial({ color: '#a63d2f', roughness: 0.6 }),
  ring: new THREE.MeshStandardMaterial({ color: '#f3c95a', emissive: '#c9912a', emissiveIntensity: 0.9, roughness: 0.3 }),
};
const cache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, roughness = 0.85) {
  const key = `${color}|${roughness}`;
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return cache.get(key)!;
}

const WALK_SPEED = 2.6;                 // hall units per second
const BOW_SECONDS = 2.4;

/**
 * One monk, drawn from the look the server derived from the person's ID. Faces -z (toward the altar).
 * `position` is where the monk should be: the figure walks there instead of jumping. A prostration plays
 * when `bowTick` changes (your own monk) or when the hall reports one more prostration (everyone else).
 */
export function Monk3D({ monk, position, me, onPress, bowTick }: {
  monk: Monk; position: [number, number, number]; me: boolean; onPress?: (m: Monk) => void; bowTick?: number;
}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const at = useRef<[number, number] | null>(null);
  const bowStart = useRef(-100);
  const seenTick = useRef(bowTick ?? 0);
  const seenCount = useRef(monk.prostrations);
  const phase = (monk.seat ?? 0) * 0.7;
  useFrame(({ clock }, dt) => {
    const g = root.current, b = body.current; if (!g || !b) return;
    const t = clock.elapsedTime;
    if (!at.current) at.current = [position[0], position[2]];
    const dx = position[0] - at.current[0], dz = position[2] - at.current[1], far = Math.hypot(dx, dz);
    const walking = far > 0.03;
    if (walking) {
      const step = Math.min(far, WALK_SPEED * Math.min(dt, 0.1));
      at.current = [at.current[0] + (dx / far) * step, at.current[1] + (dz / far) * step];
    }
    g.position.set(at.current[0], position[1] + (walking ? Math.abs(Math.sin(t * 9)) * 0.06 : 0), at.current[1]);
    // face the way you walk; otherwise turn back to the altar
    const heading = walking ? Math.atan2(-dx, -dz) : 0;
    let turn = heading - g.rotation.y; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    g.rotation.y += turn * Math.min(1, dt * 8);

    if (bowTick !== undefined && bowTick !== seenTick.current) { seenTick.current = bowTick; bowStart.current = t; }
    if (monk.prostrations !== seenCount.current) {
      if (!me && monk.prostrations > seenCount.current) bowStart.current = t;
      seenCount.current = monk.prostrations;
    }
    // prostration: fold forward until the forehead nears the floor, hold a moment, rise
    const k = (t - bowStart.current) / BOW_SECONDS;
    const fold = k >= 0 && k < 1 ? Math.sin(Math.min(1, k * 1.6) * Math.PI / 2) * (k > 0.72 ? (1 - k) / 0.28 : 1) : 0;
    b.rotation.x = -fold * (monk.sitting ? 1.15 : 1.35);
    b.position.y = -fold * (monk.sitting ? 0.05 : 0.5);
    b.position.z = -fold * (monk.sitting ? 0.1 : 0.25);
    b.scale.y = 1 + Math.sin(t * 0.9 + phase) * (monk.sitting ? 0.018 : 0.006);     // slow breathing
  });
  const skin = mat(monk.look.skin, 0.7);
  const robe = mat(monk.look.robe);
  const headY = monk.sitting ? 1.02 : 1.62;
  return (
    <group ref={root} position={position} onClick={onPress ? e => { e.stopPropagation(); onPress(monk); } : undefined}>
      {me && <mesh geometry={G.ring} material={M.ring} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} />}
      <group ref={body}>
        {monk.sitting ? (
          <>
            <mesh geometry={G.lap} material={robe} position={[0, 0.3, -0.02]} scale={[1.28, 0.42, 1.12]} />
            <mesh geometry={G.torso} material={robe} position={[0, 0.58, 0]} scale={[0.86, 0.78, 0.74]} />
            <mesh geometry={G.hand} material={skin} position={[0, 0.42, -0.4]} scale={[1.5, 0.8, 1]} />
          </>
        ) : (
          <>
            <mesh geometry={G.standing} material={robe} position={[0, 0.82, 0]} />
            <mesh geometry={G.hand} material={skin} position={[0, 1.02, -0.3]} scale={[0.9, 1.4, 0.8]} />
          </>
        )}
        <mesh geometry={G.sash} material={mat('#00000033')} position={[0, monk.sitting ? 0.62 : 1.0, 0]}
          rotation={[Math.PI / 2 - 0.5, 0.4, 0]} scale={monk.sitting ? 0.92 : 0.7} visible={false} />
        <group position={[0, headY, 0]}>
          <mesh geometry={G.head} material={skin} />
          <mesh geometry={G.ear} material={skin} position={[-0.27, -0.02, 0]} />
          <mesh geometry={G.ear} material={skin} position={[0.27, -0.02, 0]} />
          {monk.sitting ? (
            <>
              <mesh geometry={G.lid} material={M.ink} position={[-0.1, 0.02, -0.25]} rotation={[0, 0.35, 0.12]} />
              <mesh geometry={G.lid} material={M.ink} position={[0.1, 0.02, -0.25]} rotation={[0, -0.35, -0.12]} />
            </>
          ) : (
            <>
              <mesh geometry={G.eye} material={M.ink} position={[-0.1, 0.03, -0.245]} />
              <mesh geometry={G.eye} material={M.ink} position={[0.1, 0.03, -0.245]} />
            </>
          )}
          <mesh geometry={G.lid} material={M.ink} position={[0, -0.1, -0.255]} scale={[monk.look.face % 2 ? 0.5 : 0.75, 1, 1]} />
          {monk.gender === 'f' && (
            <>
              <mesh geometry={G.cheek} material={M.blush} position={[-0.16, -0.06, -0.2]} />
              <mesh geometry={G.cheek} material={M.blush} position={[0.16, -0.06, -0.2]} />
            </>
          )}
          {monk.look.face >= 2 && <mesh geometry={G.dot} material={M.mark} position={[0, 0.13, -0.245]} />}
        </group>
        {monk.look.beads && (
          <mesh geometry={G.beads} material={M.beads} position={[0, headY - 0.27, -0.03]} rotation={[Math.PI / 2 - 0.35, 0, 0]} />
        )}
      </group>
    </group>
  );
}
