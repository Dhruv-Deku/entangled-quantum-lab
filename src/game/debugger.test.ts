import { describe, expect, it } from 'vitest';
import { History } from '../quantum/history';
import type { Op } from '../quantum/circuit';
import { mulberry32 } from '../quantum/measure';
import { explainStep, histogram, nextStop, stepTitle } from './debugger';

function steps(n: number, ops: Op[]) {
  const h = new History(n);
  const rng = mulberry32(3);
  const done = ops.map((op) => h.push(op, rng));
  return done.map((op, i) => ({ op, before: h.stateAt(i), after: h.stateAt(i + 1) }));
}

describe('step debugger', () => {
  it('explains a Bell pair being made, step by step', () => {
    const [h, cx] = steps(2, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 1, controls: [0] }]);
    expect(explainStep(h.op, h.before, h.after)[0]).toContain('P|00> 1.00 -> 0.50');
    expect(explainStep(h.op, h.before, h.after).join(' ')).toMatch(/q0's arrow turned 90 degrees/);
    const why = explainStep(cx.op, cx.before, cx.after).join(' ');
    expect(why).toContain('P|11> 0.00 -> 0.50');
    expect(why).toContain('q0 and q1 became entangled (strength 1.00)');
    expect(stepTitle(cx.op, 2, 2)).toBe('Step 2 of 2: CX on q0, q1');
  });

  it('says when only phases changed, and when nothing did', () => {
    const [, z] = steps(1, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'z', target: 0 }]);
    expect(explainStep(z.op, z.before, z.after)[0]).toMatch(/only shifted phases/);
    const [z0] = steps(1, [{ kind: 'gate', gate: 'z', target: 0 }]);
    expect(explainStep(z0.op, z0.before, z0.after)[0]).toMatch(/^Nothing changed/);
  });

  it('explains a measurement as a collapse', () => {
    const [, m] = steps(1, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'measure', qubit: 0 }]);
    expect(explainStep(m.op, m.before, m.after)[0]).toMatch(/^Measured q0 = [01]: the state collapsed/);
  });

  it('histogram shows all outcomes up to 3 qubits, the top 8 beyond; breakpoints stop the run', () => {
    const [h] = steps(2, [{ kind: 'gate', gate: 'h', target: 0 }]);
    expect(histogram(h.after).map((b) => b.label)).toEqual(['00', '01', '10', '11']);
    expect(histogram(h.after)[1].p).toBeCloseTo(0.5, 9);
    expect(nextStop(1, 9, new Set([4, 7]))).toBe(4);
    expect(nextStop(4, 9, new Set([4, 7]))).toBe(7);
    expect(nextStop(7, 9, new Set([4, 7]))).toBe(9);
  });
});
