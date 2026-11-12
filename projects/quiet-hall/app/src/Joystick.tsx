import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

const R = 46;        // how far the knob travels

/** A thumb stick. While held, `vector.current` is the direction (x right, y up on screen), each within -1..1. */
export function Joystick({ vector, onRelease }: { vector: React.RefObject<{ x: number; y: number }>; onRelease: () => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const release = useRef(onRelease); release.current = onRelease;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,          // the stick owns its touches: the camera must not turn
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => {
      const d = Math.hypot(g.dx, g.dy), k = d > R ? R / d : 1;
      const x = g.dx * k, y = g.dy * k;
      setKnob({ x, y });
      if (vector.current) { vector.current.x = x / R; vector.current.y = -y / R; }
    },
    onPanResponderRelease: () => { setKnob({ x: 0, y: 0 }); if (vector.current) { vector.current.x = 0; vector.current.y = 0; } release.current(); },
    onPanResponderTerminate: () => { setKnob({ x: 0, y: 0 }); if (vector.current) { vector.current.x = 0; vector.current.y = 0; } release.current(); },
  }), [vector]);
  return (
    <View testID="hall.joystick" style={styles.base} {...responder.panHandlers} accessibilityLabel="摇杆：拖动让小和尚走动" accessibilityRole="adjustable">
      <View style={[styles.knob, { transform: [{ translateX: knob.x }, { translateY: knob.y }] }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { position: 'absolute', left: 16, bottom: 34, width: 128, height: 128, borderRadius: 64, backgroundColor: '#2a1f1866',
          borderWidth: 1, borderColor: '#c9a24a88', alignItems: 'center', justifyContent: 'center' },
  knob: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#f3ead9cc', borderWidth: 1, borderColor: '#c9a24a' },
});
