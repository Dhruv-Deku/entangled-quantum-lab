/**
 * Short synthesized sounds for every recognized action (no audio files).
 * Browsers only allow audio after a user gesture; until then calls are silent.
 */
export type Cue = 'gate' | 'measure' | 'entangle' | 'shots' | 'success' | 'select' | 'reject' | 'storm';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Where tones go: the master, or a panner placing the current cue in the room. */
let bus: AudioNode | null = null;

type P3 = { x: number; y: number; z: number };
/** The qubit the next sound comes from (world position), and the listener's head. */
let source: P3 | null = null;

/** The sounds of gates, measurements and entanglement come from this point in the room (null: from everywhere). */
export function setSoundSource(p: P3 | null): void {
  source = p ? { x: p.x, y: p.y, z: p.z } : null;
}

/** Each frame: where the head is and which way it faces, so sounds come from the right place. */
export function setListener(pos: P3, forward: P3, up: P3): void {
  if (!ctx) return;
  const l = ctx.listener;
  try {
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  } catch {
    // an older audio engine: sounds stay centred
  }
}

/** A panner at the current source for one cue (HRTF: above, behind and to the side all sound different). */
function placed(a: AudioContext): AudioNode | null {
  if (!source || !master) return null;
  try {
    const p = a.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 0.35;
    p.rolloffFactor = 0.6;
    p.positionX.value = source.x;
    p.positionY.value = source.y;
    p.positionZ.value = source.z;
    p.connect(master);
    return p;
  } catch {
    return null;
  }
}

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A burst of filtered noise: thunder for The Storm. */
function noise(start: number, dur: number, freq: number, gain = 1): void {
  const a = audio();
  if (!a || !master) return;
  const t0 = a.currentTime + start;
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t0);
  f.frequency.exponentialRampToValueAtTime(80, t0 + dur);
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(bus ?? master);
  src.start(t0);
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 1): void {
  const a = audio();
  if (!a || !master) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(bus ?? master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Told about every cue as it plays (sound captions listen here). */
export const cueListeners: ((cue: Cue) => void)[] = [];

/** The cues that belong to a qubit, and so come from where it is. */
const SPATIAL = new Set<Cue>(['gate', 'measure', 'entangle', 'shots', 'storm']);

export function feedback(cue: Cue): void {
  for (const l of cueListeners) l(cue);
  const a = SPATIAL.has(cue) ? audio() : null;
  bus = a ? placed(a) : null;
  try {
    play(cue);
  } finally {
    bus = null;
  }
}

function play(cue: Cue): void {
  switch (cue) {
    case 'gate':
      tone(660, 0, 0.35, 'sine', 0.6);
      tone(990, 0.05, 0.3, 'sine', 0.3);
      break;
    case 'measure':
      tone(220, 0, 0.18, 'triangle', 0.9);
      tone(110, 0, 0.3, 'sine', 0.6);
      break;
    case 'entangle':
      // two qubits, one chord: a perfect fifth that settles into an octave
      tone(392, 0, 1.1, 'sine', 0.55);
      tone(587.33, 0.04, 1.0, 'sine', 0.45);
      tone(784, 0.25, 0.9, 'sine', 0.35);
      break;
    case 'shots':
      for (let i = 0; i < 14; i++) tone(1400 + Math.random() * 900, i * 0.05 + Math.random() * 0.03, 0.05, 'triangle', 0.25);
      break;
    case 'success':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.5, 'sine', 0.45));
      break;
    case 'select':
      tone(880, 0, 0.08, 'sine', 0.25);
      break;
    case 'reject':
      tone(180, 0, 0.15, 'square', 0.15);
      break;
    case 'storm':
      noise(0, 0.08, 6000, 0.9);
      noise(0.06, 1.4, 900, 1.2);
      break;
  }
}

/** Call from any user gesture (click, key, XR start) so later cues can play. */
export function unlockAudio(): void {
  audio();
}

/** Several soft tones (Listen plays a state as a chord). Gains should add up to about 1. */
export function playNotes(notes: { freq: number; gain: number; delay: number; dur: number }[]): void {
  for (const n of notes) {
    tone(n.freq, n.delay, n.dur, 'sine', 1.6 * n.gain);
    tone(n.freq * 2, n.delay, n.dur * 0.6, 'sine', 0.25 * n.gain);
  }
}
