import { describe, expect, it } from 'vitest';
import { run, type Op } from '../quantum/circuit';
import { noteFreq, PHASE_SPREAD, stateNotes } from './sonify';

const st = (n: number, ops: Op[]) => run(n, ops, () => 0.5).state;

describe('listening to a state', () => {
  it('|0> is one note, middle C; a Bell pair is two notes at once', () => {
    expect(stateNotes(st(1, []))).toEqual([{ k: 0, freq: noteFreq(0), gain: 1, delay: 0 }]);
    const bell = stateNotes(st(2, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 1, controls: [0] }]));
    expect(bell.map((n) => n.k)).toEqual([0, 3]);
    expect(bell.every((n) => n.delay === 0)).toBe(true);
    expect(bell[0].gain).toBeCloseTo(0.5, 12);
  });

  it('phase becomes timing: |+> rings together, |-> and |+i> roll out', () => {
    const plus = stateNotes(st(1, [{ kind: 'gate', gate: 'h', target: 0 }]));
    expect(plus.map((n) => n.delay)).toEqual([0, 0]);
    const minus = stateNotes(st(1, [{ kind: 'gate', gate: 'x', target: 0 }, { kind: 'gate', gate: 'h', target: 0 }]));
    expect(minus.map((n) => n.delay)).toEqual([0, PHASE_SPREAD / 2]);
    const plusI = stateNotes(st(1, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 's', target: 0 }]));
    expect(plusI.map((n) => n.delay)).toEqual([0, PHASE_SPREAD / 4]);
  });

  it('a global phase changes nothing, and notes climb a pentatonic scale', () => {
    // Z X Z X = -1: the same state times a global phase
    const g = (gate: 'h' | 'x' | 'z' | 't'): Op => ({ kind: 'gate', gate, target: 0 });
    const a = stateNotes(st(1, [g('h'), g('t')]));
    const b = stateNotes(st(1, [g('h'), g('t'), g('z'), g('x'), g('z'), g('x')]));
    expect(b).toEqual(a);
    expect(a[1].delay).toBeCloseTo(PHASE_SPREAD / 8, 3);
    expect(noteFreq(5) / noteFreq(0)).toBeCloseTo(2, 12);
    for (let k = 1; k < 10; k++) expect(noteFreq(k)).toBeGreaterThan(noteFreq(k - 1));
  });
});
