import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from './r3f';

const roofMat = <meshStandardMaterial color="#3d4a4a" roughness={0.75} />;

/** A hip roof with wide eaves: a flattened four-sided pyramid, with upturned corners. */
function Roof({ y, w, d, h }: { y: number; w: number; d: number; h: number }) {
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[0, Math.PI / 4, 0]} scale={[w / 1.414, 1, d / 1.414]} position={[0, h / 2, 0]}><coneGeometry args={[1, h, 4]} />{roofMat}</mesh>
      <mesh position={[0, -0.12, 0]}><boxGeometry args={[w * 0.985, 0.26, d * 0.985]} /><meshStandardMaterial color="#1f6b62" roughness={0.6} /></mesh>
      <mesh position={[0, -0.34, 0]}><boxGeometry args={[w * 0.93, 0.2, d * 0.93]} /><meshStandardMaterial color="#c0392b" roughness={0.6} /></mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh key={`${sx}${sz}`} position={[sx * w * 0.485, 0.12, sz * d * 0.485]} rotation={[sz * 0.5, 0, -sx * 0.5]}>
          <coneGeometry args={[0.32, 1.5, 4]} />{roofMat}
        </mesh>
      ))}
      <mesh position={[0, h + 0.05, 0]}><boxGeometry args={[w * 0.3, 0.3, 0.35]} /><meshStandardMaterial color="#2c3636" roughness={0.7} /></mesh>
    </group>
  );
}

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

function StoneLantern({ x, z }: { x: number; z: number }) {
  const stone = <meshStandardMaterial color="#a39c90" roughness={0.95} />;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.15, 0]}><boxGeometry args={[0.8, 0.3, 0.8]} />{stone}</mesh>
      <mesh position={[0, 0.85, 0]}><cylinderGeometry args={[0.16, 0.2, 1.1, 8]} />{stone}</mesh>
      <mesh position={[0, 1.6, 0]}><boxGeometry args={[0.6, 0.5, 0.6]} /><meshBasicMaterial color="#ffd98a" toneMapped={false} /></mesh>
      <mesh position={[0, 2.05, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.62, 0.5, 4]} />{stone}</mesh>
    </group>
  );
}

function Drift() {
  const { camera, size } = useThree();
  const look = useRef(new THREE.Vector3());
  useFrame(({ clock }) => {                   // a slow sway, as if standing in the courtyard
    const t = clock.elapsedTime * 0.12;
    // Step back far enough that the whole hall fits a narrow (portrait) screen, and aim low so the
    // temple sits in the upper part of the screen, above the entry card.
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const dist = Math.min(78, Math.max(30, 16.5 / (Math.tan(fov / 2) * (size.width / size.height))));
    camera.position.set(Math.sin(t) * dist * 0.2, 5 + Math.sin(t * 1.7) * 0.6, dist + Math.cos(t) * 2);
    look.current.set(0, 6.5 - dist * 0.2, 0);
    camera.lookAt(look.current);
  });
  return null;
}

/** The temple from the courtyard: main hall on a stone terrace, pines, lanterns, mountains behind. */
export function TempleScene() {
  const red = <meshStandardMaterial color="#9c2f24" roughness={0.6} />;
  return (
    <>
      <color attach="background" args={['#f1d9b0']} />
      <fog attach="fog" args={['#f1d9b0', 70, 190]} />
      <ambientLight intensity={1.1} color="#fff0d6" />
      <hemisphereLight args={['#fff3da', '#7c6a4c', 1.2]} />
      <directionalLight position={[-14, 18, 16]} intensity={2.2} color="#ffe2b0" />

      <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[240, 240]} /><meshStandardMaterial color="#b9a57c" roughness={1} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 12]}><planeGeometry args={[4.2, 30]} /><meshStandardMaterial color="#cfc5b2" roughness={1} /></mesh>
      <mesh position={[0, 26, -70]}><circleGeometry args={[7, 40]} /><meshBasicMaterial color="#fff4d6" toneMapped={false} /></mesh>
      {[[-46, 30, -78, '#93a79b'], [-12, 40, -92, '#a9b8a9'], [30, 34, -84, '#8fa396'], [62, 26, -74, '#a2b3a4'], [-74, 24, -70, '#a9b8a9']].map(([x, h, z, c]) => (
        <mesh key={String(x)} position={[x as number, (h as number) / 2 - 1, z as number]}><coneGeometry args={[(h as number) * 1.05, h as number, 7]} /><meshStandardMaterial color={c as string} roughness={1} /></mesh>
      ))}

      {/* stone terrace and steps */}
      <mesh position={[0, 0.6, 0]}><boxGeometry args={[25, 1.2, 14.5]} /><meshStandardMaterial color="#a8a094" roughness={0.95} /></mesh>
      {[0, 1, 2].map(i => (
        <mesh key={i} position={[0, 0.2 + i * 0.4, 8.4 - i * 0.55]}><boxGeometry args={[6.4, 0.4, 1.1]} /><meshStandardMaterial color="#b5ad9f" roughness={0.95} /></mesh>
      ))}

      {/* main hall */}
      <mesh position={[0, 3.6, -0.6]}><boxGeometry args={[19, 4.8, 9.4]} /><meshStandardMaterial color="#e9dcc0" roughness={0.9} /></mesh>
      {[-7.6, -3.8, 0, 3.8, 7.6].map(x => (
        <group key={x} position={[x, 3.3, 4.16]}>
          <mesh><planeGeometry args={[3, 4]} /><meshStandardMaterial color={x === 0 ? '#3a2317' : '#8a3a2c'} roughness={0.7} /></mesh>
          {x !== 0 && <mesh position={[0, 0.5, 0.01]}><planeGeometry args={[2.4, 2.4]} /><meshStandardMaterial color="#f3e5c3" roughness={0.9} /></mesh>}
        </group>
      ))}
      {[-9.6, -5.7, -1.9, 1.9, 5.7, 9.6].map(x => (
        <mesh key={x} position={[x, 3.6, 5.3]}><cylinderGeometry args={[0.36, 0.4, 4.8, 16]} />{red}</mesh>
      ))}
      <Roof y={6.3} w={25} d={15} h={2.5} />
      <mesh position={[0, 9.5, -0.6]}><boxGeometry args={[13, 1.8, 6.4]} /><meshStandardMaterial color="#e9dcc0" roughness={0.9} /></mesh>
      <Roof y={10.7} w={18} d={10.5} h={3} />
      <mesh position={[0, 7.75, 6.4]}><boxGeometry args={[4.6, 1.15, 0.2]} /><meshStandardMaterial color="#1f2a44" roughness={0.6} /></mesh>
      <mesh position={[0, 7.75, 6.52]}><planeGeometry args={[4, 0.7]} /><meshBasicMaterial color="#e2b24a" toneMapped={false} /></mesh>

      <StoneLantern x={-4.2} z={11} /><StoneLantern x={4.2} z={11} />
      <Pine x={-16} z={6} s={1.5} /><Pine x={-21} z={-2} s={1.9} /><Pine x={17} z={7} s={1.4} /><Pine x={22} z={-3} s={2} />
      <Pine x={-12} z={-12} s={2.2} /><Pine x={13} z={-13} s={2.3} /><Pine x={-27} z={10} s={1.3} /><Pine x={28} z={11} s={1.2} />
      <Drift />
    </>
  );
}
