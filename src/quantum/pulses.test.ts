import { describe, expect, it } from 'vitest';
import type { Op } from './circuit';
import { CROSS_NS, DRIVE_NS, READOUT_NS, schedule } from './pulses';
import { route, T5 } from './routing';

const g = (gate: 'h' | 'x' | 'z' | 's' | 't' | 'sx' | 'ry', target: number, params?: number[]): Op => ({ kind: 'gate', gate, target, ...(params ? { params } : {}) });
const cx = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });

describe('pulse schedule', () => {
  it('Z rotations are free: no pulse, no time', () => {
    const s = schedule([g('z', 0), g('s', 0), g('t', 0)], 1);
    expect(s.duration).toBe(0);
    expect(s.pulses.every((p) => p.kind === 'virtual')).toBe(true);
  });

  it('gates on different qubits run at the same time; a two-qubit gate waits for both', () => {
    const s = schedule([g('h', 0), g('x', 1), g('x', 1), cx(0, 1)], 2);
    const cr = s.pulses.find((p) => p.kind === 'cross')!;
    expect(s.pulses[0].start).toBe(0);
    expect(s.pulses[1].start).toBe(0);
    expect(cr.start).toBe(2 * DRIVE_NS);
    expect(s.duration).toBe(2 * DRIVE_NS + CROSS_NS);
  });

  it('a SWAP is three cross-resonance pulses, a measurement a long readout', () => {
    const s = schedule([{ kind: 'swap', a: 0, b: 1 }, { kind: 'measure', qubit: 0 }], 2);
    expect(s.pulses.filter((p) => p.kind === 'cross')).toHaveLength(3);
    expect(s.duration).toBe(3 * CROSS_NS + READOUT_NS);
  });

  it('drive amplitude follows the rotation angle', () => {
    const s = schedule([g('x', 0), g('sx', 0), g('ry', 0, [Math.PI / 4])], 1);
    expect(s.pulses.map((p) => p.amplitude)).toEqual([1, 0.5, 0.25]);
  });

  it('routing SWAPs make the schedule longer', () => {
    const line = schedule(route(T5, 3, [cx(0, 1), cx(1, 2)]).ops, 5);
    const triangle = schedule(route(T5, 3, [cx(0, 1), cx(1, 2), cx(0, 2)]).ops, 5);
    expect(triangle.duration).toBeGreaterThan(line.duration + 2 * CROSS_NS);
  });
});
