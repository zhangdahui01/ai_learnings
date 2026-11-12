import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Monk } from './api';

/**
 * Count taps at once and send them to the hall as a batch shortly after the last one. A burst is one
 * request, and nothing waits long enough to be lost when the page closes: what is left is sent on the way out.
 * `extra` is how many taps the hall has not confirmed yet; add it to the hall's own count for display.
 */
export function useBatched(send: (count: number) => Promise<{ me: Monk }>, onSaved: (me: Monk) => void) {
  const pending = useRef(0), inFlight = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [extra, setExtra] = useState(0);
  const sendRef = useRef(send); sendRef.current = send;
  const savedRef = useRef(onSaved); savedRef.current = onSaved;

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const count = pending.current;
    if (!count || inFlight.current) return;
    pending.current = 0; inFlight.current = count;
    try {
      const res = await sendRef.current(count);
      inFlight.current = 0;
      savedRef.current(res.me);                  // the hall's count and the local remainder change together
      setExtra(pending.current);
    } catch {
      inFlight.current = 0; pending.current += count;           // keep them for the next try
    }
    if (pending.current && !timer.current) timer.current = setTimeout(flush, 400);
  }, []);

  const add = useCallback(() => {
    pending.current += 1;
    setExtra(pending.current + inFlight.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  }, [flush]);

  useEffect(() => {
    const onHide = () => { flush(); };
    if (Platform.OS === 'web') window.addEventListener('pagehide', onHide);
    return () => { if (Platform.OS === 'web') window.removeEventListener('pagehide', onHide); flush(); };
  }, [flush]);

  return { add, extra };
}
