import { describe, expect, it } from 'vitest';
import { run, type Op } from './circuit';
import { agreement, NO_NOISE, runOnChip, TYPICAL_NOISE } from './hardware';
import { mulberry32 } from './measure';
import { route, T5 } from './routing';

const cx = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });
const h = (t: number): Op => ({ kind: 'gate', gate: 'h', target: t });

describe('running on the noisy chip', () => {
  it('without noise it matches the ideal circuit', () => {
    const ops = [h(0), cx(0, 1), cx(1, 2)];
    const r = runOnChip(route(T5, 3, ops), 3, 5, 2000, mulberry32(1), NO_NOISE);
    expect(r.counts[0] + r.counts[7]).toBe(2000);
    expect(agreement(r.counts, run(3, ops, mulberry32(2)).state.probabilities())).toBeGreaterThan(0.97);
  });

  it('readout errors flip about 2% of the bits', () => {
    const r = runOnChip(route(T5, 1, []), 1, 5, 20000, mulberry32(3), { p1: 0, p2: 0, readout: 0.02 });
    expect(r.counts[1] / 20000).toBeGreaterThan(0.015);
    expect(r.counts[1] / 20000).toBeLessThan(0.025);
  });

  it('noise costs fidelity, and routing SWAPs cost more', () => {
    // the same three CNOTs, once on a line the chip has, once as a triangle it lacks
    const line = [h(0), cx(0, 1), cx(1, 2), cx(1, 2)];
    const triangle = [h(0), cx(0, 1), cx(1, 2), cx(0, 2)];
    const score = (ops: Op[]) => {
      const routed = route(T5, 3, ops);
      const ideal = run(3, ops, mulberry32(4)).state.probabilities();
      return { a: agreement(runOnChip(routed, 3, 5, 6000, mulberry32(5), TYPICAL_NOISE).counts, ideal), swaps: routed.swaps };
    };
    const a = score(line), b = score(triangle);
    expect(a.swaps).toBe(0);
    expect(b.swaps).toBeGreaterThan(0);
    expect(a.a).toBeLessThan(0.995);
    expect(a.a).toBeGreaterThan(0.9);
    expect(b.a).toBeLessThan(a.a);
  });

  it('mid-circuit measurements and feed-forward run fresh each shot', () => {
    // teleport-style: measure q0, then flip q1 if it read 1; q1 always ends equal to q0's outcome
    const ops: Op[] = [h(0), { kind: 'measure', qubit: 0 }, { kind: 'gate', gate: 'x', target: 1, condition: { bit: 0, value: 1 } }];
    const r = runOnChip(route(T5, 2, ops), 2, 5, 2000, mulberry32(6), NO_NOISE);
    expect(r.counts[0] + r.counts[3]).toBe(2000);
    expect(r.counts[0]).toBeGreaterThan(800);
    expect(r.counts[3]).toBeGreaterThan(800);
  });
});
