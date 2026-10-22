/**
 * Short synthesized sounds for every recognized action (no audio files).
 * Browsers only allow audio after a user gesture; until then calls are silent.
 */
export type Cue = 'gate' | 'measure' | 'entangle' | 'shots' | 'success' | 'select' | 'reject' | 'storm';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

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
  src.connect(f).connect(g).connect(master);
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
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function feedback(cue: Cue): void {
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
