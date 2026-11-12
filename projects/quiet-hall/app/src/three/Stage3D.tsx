import React from 'react';
import { Platform } from 'react-native';
import { Canvas } from './r3f';

/** Can this device draw 3D at all? Many office computers and in-app browsers cannot. */
export function canRender3D(): boolean {
  if (Platform.OS !== 'web') return true;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch { return false; }
}

class Boundary extends React.Component<{ fallback: React.ReactNode; onFail?: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail?.(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/**
 * A 3D canvas that never takes the page down with it: when 3D is unavailable, or the scene fails while
 * drawing, the flat `fallback` is shown instead.
 */
export function Stage3D({ fallback, onFail, children, ...canvas }: React.ComponentProps<typeof Canvas> & { fallback: React.ReactNode; onFail?: () => void }) {
  const [ok] = React.useState(canRender3D);
  React.useEffect(() => { if (!ok) onFail?.(); }, [ok, onFail]);
  if (!ok) return <>{fallback}</>;
  return <Boundary fallback={fallback} onFail={onFail}><Canvas {...canvas}>{children}</Canvas></Boundary>;
}
