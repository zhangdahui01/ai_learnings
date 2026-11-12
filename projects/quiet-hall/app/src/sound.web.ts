// The hall's sound on the web. Chanting is real recordings (see public/audio/CREDITS.md) played through a
// media element, which also keeps sound on when an iPhone's ringer switch is silent. The wooden fish and
// the bell are short synthesized strokes.
export interface Track { id: string; title: string; credit: string; file: string }
export const TRACKS: Track[] = [
  { id: 'lingyin', title: '灵隐寺', file: '/audio/lingyin-temple-chanting.mp3',
    credit: '杭州灵隐寺僧众诵经 · 录音 LouiseBrown1981 · CC BY-SA 3.0 · Wikimedia Commons' },
  { id: 'xinjing', title: '心经', file: '/audio/heart-sutra-mandarin.mp3',
    credit: '般若心经 普通话念诵 · Nyarlathotep1001 · CC0 · Wikimedia Commons' },
];
export const soundSupported = typeof window !== 'undefined' && typeof Audio !== 'undefined';

let player: HTMLAudioElement | null = null;
let wanted: string | null = null;
let ctx: AudioContext | null = null, out: GainNode | null = null;

function element(): HTMLAudioElement {
  if (!player) {
    player = new Audio();
    player.loop = true; player.preload = 'auto'; player.volume = 0.85;
    player.setAttribute('playsinline', '');
  }
  return player;
}

function strokes(): AudioContext | null {
  const AC: typeof AudioContext | undefined = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) { ctx = new AC(); out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination); }
  return ctx;
}

/** Browsers only allow sound after a tap: this runs on every tap and key press. */
export function unlockSound(): void {
  if (!soundSupported) return;
  try { const session = (navigator as any).audioSession; if (session) session.type = 'playback'; } catch { /* not offered */ }
  const c = strokes();
  if (c && c.state !== 'running') c.resume().catch(() => {});
  if (wanted && element().paused) element().play().catch(() => {});
}
if (soundSupported) {
  for (const type of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(type, unlockSound, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) unlockSound(); });
}

/** Play one of TRACKS on a loop, or stop with null. */
export function setChanting(trackId: string | null): void {
  if (!soundSupported) return;
  const track = TRACKS.find(t => t.id === trackId) ?? null;
  wanted = track ? track.id : null;
  const el = element();
  if (!track) { el.pause(); return; }
  if (!el.src.endsWith(track.file)) { el.src = track.file; el.currentTime = 0; }
  el.play().catch(() => {});            // refused until the first tap; unlockSound() starts it then
}

export function playKnock(): void {
  const c = soundSupported ? strokes() : null; if (!c || !out) return;
  unlockSound();
  const t = c.currentTime + 0.01;
  // A hollow wooden block: two short pitched thumps and a click.
  [[520, 0.5, 0.2], [1040, 0.22, 0.09], [2100, 0.1, 0.03]].forEach(([hz, level, len]) => {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(hz * 1.12, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.03);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(out!); o.start(t); o.stop(t + len + 0.02);
  });
}

/** A prayer bead sliding along the string: one small click. */
export function playTick(): void {
  const c = soundSupported ? strokes() : null; if (!c || !out) return;
  unlockSound();
  const t = c.currentTime + 0.005;
  const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.04);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.09);
}

export function playBell(): void {
  const c = soundSupported ? strokes() : null; if (!c || !out) return;
  unlockSound();
  const t = c.currentTime + 0.01;
  [[1, 1], [2.76, 0.5], [5.4, 0.28], [8.93, 0.14]].forEach(([ratio, amp]) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 392 * ratio;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5 / Math.sqrt(ratio));
    o.connect(g); g.connect(out!); o.start(t); o.stop(t + 5.2);
  });
}

/** For checks: is the chanting actually playing, and where is it in the track? */
export function soundStatus(): { state: string; position: number } {
  if (!player || !wanted) return { state: 'off', position: 0 };
  return { state: player.paused ? 'blocked' : 'running', position: player.currentTime };
}
if (typeof window !== 'undefined') (window as any).__quietHallSound = soundStatus;
