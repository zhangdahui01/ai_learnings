// The hall's sound, synthesized in the browser: a low chanting voice, a wooden fish keeping the beat,
// and a bell now and then. Nothing is downloaded and no recording is used.
export const soundSupported = typeof window !== 'undefined' && !!(window.AudioContext || (window as any).webkitAudioContext);

const BEAT = 0.92;                                   // seconds per syllable
// Vowel shapes as formant frequencies (Hz). The voice moves between them, one per beat.
const VOWELS: [number, number, number][] = [[700, 1150, 2600], [450, 820, 2600], [330, 720, 2500], [520, 1650, 2500], [300, 2100, 2950], [260, 950, 2300]];
const PITCH = [0, 0, 0, 2, 0, 0, -2, 0, 0, 0, 3, 2, 0, 0, -2, -2];      // semitones around the reciting note
const BASE = 147;                                    // D3: high enough to carry on a phone speaker

let ctx: AudioContext | null = null;
let out: GainNode, voiceBus: GainNode, voice: GainNode, formants: BiquadFilterNode[] = [], oscs: OscillatorNode[] = [];
let meter: AnalyserNode | null = null, silent: HTMLAudioElement | null = null;
let chanting = false, nextBeat = 0, beat = 0, timer: ReturnType<typeof setInterval> | null = null;

function hallReverb(c: AudioContext): ConvolverNode {
  const seconds = 3.2, len = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const conv = c.createConvolver(); conv.buffer = buf; return conv;
}

function build(): AudioContext {
  if (ctx) return ctx;
  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const c = (ctx = new AC());
  // Everything goes through a limiter so the louder mix cannot clip.
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -10; limiter.knee.value = 8; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.2;
  limiter.connect(c.destination);
  meter = c.createAnalyser(); meter.fftSize = 2048; limiter.connect(meter);
  out = c.createGain(); out.gain.value = 1.6; out.connect(limiter);
  const wet = c.createGain(); wet.gain.value = 0.5;
  const reverb = hallReverb(c); reverb.connect(wet); wet.connect(out);
  voiceBus = c.createGain(); voiceBus.gain.value = 0; voiceBus.connect(out); voiceBus.connect(reverb);

  // Three slightly detuned voices through formant filters: a small group reciting on one note.
  voice = c.createGain(); voice.gain.value = 0;
  formants = VOWELS[0].map((f, i) => {
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = [9, 11, 12][i];
    const g = c.createGain(); g.gain.value = [1.6, 1.3, 0.7][i];
    voice.connect(bp); bp.connect(g); g.connect(voiceBus);
    return bp;
  });
  const vibrato = c.createOscillator(); vibrato.frequency.value = 4.6;
  const depth = c.createGain(); depth.gain.value = 1.1; vibrato.connect(depth); vibrato.start();
  oscs = [-7, 0, 6].map(cents => {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = BASE; o.detune.value = cents;
    depth.connect(o.frequency); o.connect(voice); o.start(); return o;
  });
  const drone = c.createOscillator(); drone.type = 'sine'; drone.frequency.value = BASE;
  const dg = c.createGain(); dg.gain.value = 0.1; drone.connect(dg); dg.connect(voiceBus); drone.start();
  return c;
}

function knockAt(t: number, level = 0.5): void {
  const c = build();
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(760, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.09);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  const body = c.createBiquadFilter(); body.type = 'bandpass'; body.frequency.value = 620; body.Q.value = 3.5;
  o.connect(g); g.connect(body); body.connect(out); o.start(t); o.stop(t + 0.25);
}

function bellAt(t: number, level = 0.22): void {
  const c = build();
  [[1, 1], [2.76, 0.5], [5.4, 0.28], [8.93, 0.14]].forEach(([ratio, amp]) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 196 * ratio;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level * amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 7 / Math.sqrt(ratio));
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 7.2);
  });
}

function schedule(): void {
  const c = ctx; if (!c || !chanting) return;
  while (nextBeat < c.currentTime + 0.5) {
    const t = nextBeat, rest = beat % 16 === 15;                    // a breath at the end of each line
    const [f1, f2, f3] = VOWELS[(beat * 5 + Math.floor(beat / 16)) % VOWELS.length];
    [f1, f2, f3].forEach((f, i) => formants[i].frequency.setTargetAtTime(f, t, 0.035));
    const hz = BASE * Math.pow(2, PITCH[beat % PITCH.length] / 12);
    oscs.forEach(o => o.frequency.setTargetAtTime(hz, t, 0.03));
    voice.gain.cancelScheduledValues(t);
    voice.gain.setTargetAtTime(rest ? 0 : 0.5, t, 0.03);
    voice.gain.setTargetAtTime(rest ? 0 : 0.3, t + BEAT * 0.55, 0.12);
    knockAt(t, beat % 4 === 0 ? 0.34 : 0.2);
    if (beat % 64 === 0) bellAt(t);
    nextBeat += BEAT; beat += 1;
  }
}

// iPhones mute Web Audio when the ringer switch is on silent. Playing a silent, looping media element
// (and asking for the "playback" audio session where the browser offers it) moves the page to the media
// channel, which the switch does not mute.
function silentTrack(): string {
  const rate = 8000, n = rate / 2, bytes = new DataView(new ArrayBuffer(44 + n * 2));
  const text = (at: number, t: string) => { for (let i = 0; i < t.length; i += 1) bytes.setUint8(at + i, t.charCodeAt(i)); };
  text(0, 'RIFF'); bytes.setUint32(4, 36 + n * 2, true); text(8, 'WAVEfmt '); bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true); bytes.setUint32(24, rate, true); bytes.setUint32(28, rate * 2, true);
  bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true); text(36, 'data'); bytes.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([bytes.buffer], { type: 'audio/wav' }));
}
function useMediaChannel(): void {
  try { const session = (navigator as any).audioSession; if (session) session.type = 'playback'; } catch { /* not offered */ }
  try {
    if (!silent) { silent = new Audio(silentTrack()); silent.loop = true; silent.setAttribute('playsinline', ''); }
    if (silent.paused) silent.play().catch(() => {});
  } catch { /* sound still works where the switch is not an issue */ }
}

/** Browsers only allow sound after a tap: this runs on every tap and key press, and is cheap once sound is running. */
export function unlockSound(): void {
  if (!soundSupported) return;
  const c = build();
  useMediaChannel();
  if (c.state !== 'running') c.resume().then(() => { if (chanting) schedule(); }).catch(() => {});
}
if (soundSupported) {
  for (const type of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(type, unlockSound, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx) unlockSound(); });
}

/** For checks: is sound allowed to play, and how loud is it right now (0 = silence)? */
export function soundStatus(): { state: string; level: number } {
  if (!ctx || !meter) return { state: 'not started', level: 0 };
  const data = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(data);
  let sum = 0; for (const v of data) sum += v * v;
  return { state: ctx.state, level: Math.sqrt(sum / data.length) };
}
if (typeof window !== 'undefined') (window as any).__quietHallSound = soundStatus;

export function setChanting(on: boolean): void {
  if (!soundSupported) return;
  const c = build();
  chanting = on;
  voiceBus.gain.setTargetAtTime(on ? 1 : 0, c.currentTime, on ? 1.2 : 0.4);      // fade in and out
  if (on) {
    if (c.state !== 'running') c.resume().catch(() => {});
    nextBeat = Math.max(nextBeat, c.currentTime + 0.15);
    if (!timer) timer = setInterval(schedule, 120);
    schedule();
  } else if (timer) { clearInterval(timer); timer = null; }
}

export function playKnock(): void { if (soundSupported) { unlockSound(); knockAt(build().currentTime + 0.01, 0.6); } }
export function playBell(): void { if (soundSupported) { unlockSound(); bellAt(build().currentTime + 0.01, 0.3); } }
