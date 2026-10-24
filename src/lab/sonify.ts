import type { QState } from '../quantum/state';
import { playNotes } from './feedback';

/**
 * Listen to a state: every basis state with a real chance of turning up is a
 * note (|00...0> lowest, climbing a pentatonic scale), as loud as its
 * amplitude. Its phase sets when it sounds: equal phases ring together as a
 * chord, different phases roll out as an arpeggio. A Bell pair is two notes at
 * once; after a measurement there is only one.
 */

export interface Note {
  /** Which basis state. */
  k: number;
  freq: number;
  gain: number;
  /** Seconds after the first note. */
  delay: number;
}

const PENTATONIC = [0, 2, 4, 7, 9];
const BASE = 261.63; // middle C
/** The longest spread of the arpeggio, for a phase of almost a full turn. */
export const PHASE_SPREAD = 0.6;

export const noteFreq = (k: number) => BASE * 2 ** ((PENTATONIC[k % 5] + 12 * Math.floor(k / 5)) / 12);

export function stateNotes(s: QState, minProb = 0.01): Note[] {
  const p = s.probabilities();
  const notes: Note[] = [];
  // phases are measured from the most likely state, so a global phase changes nothing
  let ref = 0;
  for (let k = 1; k < p.length; k++) if (p[k] > p[ref] + 1e-12) ref = k;
  const refPhase = Math.atan2(s.im[ref], s.re[ref]);
  for (let k = 0; k < p.length; k++) {
    if (p[k] < minProb) continue;
    const rel = (((Math.atan2(s.im[k], s.re[k]) - refPhase) / (2 * Math.PI)) % 1 + 1) % 1;
    notes.push({ k, freq: noteFreq(k), gain: Math.sqrt(p[k]), delay: Math.round(rel * PHASE_SPREAD * 1000) / 1000 });
  }
  // the whole chord is as loud as one note
  const total = notes.reduce((t, n) => t + n.gain, 0) || 1;
  return notes.map((n) => ({ ...n, gain: n.gain / total }));
}

/** Play the state now. */
export function listen(s: QState): Note[] {
  const notes = stateNotes(s);
  playNotes(notes.map((n) => ({ freq: n.freq, gain: n.gain, delay: n.delay, dur: 1.6 })));
  return notes;
}
