import { useMemo, useRef } from 'react';
import { PanResponder, type GestureResponderEvent } from 'react-native';

/** Camera orbit state shared between the gesture layer (React Native) and the 3D scene. */
export interface Orbit { yaw: number; pitch: number; dist: number }
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function spread(e: GestureResponderEvent): number {
  const t = e.nativeEvent.touches;
  return t && t.length >= 2 ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY) : 0;
}

/** Drag to look around, pinch to move closer or further. A tap is left alone so it reaches the scene. */
export function useOrbit(initial: Orbit, limits = { minDist: 4, maxDist: 60 }) {
  const orbit = useRef<Orbit>({ ...initial });
  const start = useRef({ yaw: 0, pitch: 0, dist: 0, spread: 0 });
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 14 || spread(e) > 0,
    onPanResponderGrant: e => { start.current = { ...orbit.current, spread: spread(e) }; },
    onPanResponderMove: (e, g) => {
      const now = spread(e);
      if (now > 0) {
        if (start.current.spread === 0) start.current = { ...orbit.current, spread: now };
        orbit.current.dist = clamp(start.current.dist * (start.current.spread / now), limits.minDist, limits.maxDist);
        return;
      }
      if (start.current.spread > 0) { start.current = { ...orbit.current, spread: 0 }; return; }
      orbit.current.yaw = start.current.yaw - g.dx * 0.008;
      orbit.current.pitch = clamp(start.current.pitch + g.dy * 0.006, 0.04, 1.25);
    },
  }), [limits.minDist, limits.maxDist]);
  const zoom = (factor: number) => { orbit.current.dist = clamp(orbit.current.dist * factor, limits.minDist, limits.maxDist); };
  return { orbit, handlers: responder.panHandlers, zoom };
}
