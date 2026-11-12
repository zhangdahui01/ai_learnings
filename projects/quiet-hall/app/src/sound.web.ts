// The hall's sound, synthesized in the browser: a low chanting voice, a wooden fish keeping the beat,
// and a bell now and then. Nothing is downloaded and no recording is used.
export const soundSupported = typeof window !== 'undefined' && !!(window.AudioContext || (window as any).webkitAudioContext);

const BEAT = 0.92;                                   // seconds per syllable
// Vowel shapes as formant frequencies (Hz). The voice moves between them, one per beat.
const VOWELS: [number, number, number][] = [[700, 1150, 2600], [450, 820, 2600], [330, 720, 2500], [520, 1650, 2500], [300, 2100, 2950], [260, 950, 2300]];
const PITCH = [0, 0, 0, 2, 0, 0, -2, 0, 0, 0, 3, 2, 0, 0, -2, -2];      // semitones around the reciting note
const BASE = 98;                                     // G2

let ctx: AudioContext | null = null;
let out: GainNode, voiceBus: GainNode, voice: GainNode, formants: BiquadFilterNode[] = [], oscs: OscillatorNode[] = [];
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
  out = c.createGain(); out.gain.value = 0.9; out.connect(c.destination);
  const wet = c.createGain(); wet.gain.value = 0.5;
  const reverb = hallReverb(c); reverb.connect(wet); wet.connect(out);
  voiceBus = c.createGain(); voiceBus.gain.value = 0; voiceBus.connect(out); voiceBus.connect(reverb);

  // Three slightly detuned voices through formant filters: a small group reciting on one note.
  voice = c.createGain(); voice.gain.value = 0;
  formants = VOWELS[0].map((f, i) => {
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = [9, 11, 12][i];
    const g = c.createGain(); g.gain.value = [1, 0.55, 0.22][i];
    voice.connect(bp); bp.connect(g); g.connect(voiceBus);
    return bp;
  });
  const vibrato = c.createOscillator(); vibrato.frequency.value = 4.6;
  const depth = c.createGain(); depth.gain.value = 1.1; vibrato.connect(depth); vibrato.start();
  oscs = [-7, 0, 6].map(cents => {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = BASE; o.detune.value = cents;
    depth.connect(o.frequency); o.connect(voice); o.start(); return o;
  });
  const drone = c.createOscillator(); drone.type = 'sine'; drone.frequency.value = BASE / 2;
  const dg = c.createGain(); dg.gain.value = 0.16; drone.connect(dg); dg.connect(voiceBus); drone.start();
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

/** Browsers only allow sound after a tap: call this from a press handler. */
export function unlockSound(): void {
  if (!soundSupported) return;
  const c = build();
  if (c.state === 'suspended') c.resume().catch(() => {});
}

export function setChanting(on: boolean): void {
  if (!soundSupported) return;
  const c = build();
  chanting = on;
  voiceBus.gain.setTargetAtTime(on ? 0.55 : 0, c.currentTime, on ? 1.2 : 0.4);      // fade in and out
  if (on) {
    unlockSound();
    nextBeat = Math.max(nextBeat, c.currentTime + 0.15);
    if (!timer) timer = setInterval(schedule, 120);
    schedule();
  } else if (timer) { clearInterval(timer); timer = null; }
}

export function playKnock(): void { if (soundSupported) { unlockSound(); knockAt(build().currentTime + 0.01, 0.6); } }
export function playBell(): void { if (soundSupported) { unlockSound(); bellAt(build().currentTime + 0.01, 0.3); } }
