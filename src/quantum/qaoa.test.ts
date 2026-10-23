import { describe, expect, it } from 'vitest';
import { approximationRatio, bestCut, BETA_MAX, cost, expectation, GAMMA_MAX, KITE, landscape, optimize, qaoaOps, SQUARE } from './qaoa';

describe('QAOA for MaxCut', () => {
  it('a split costs minus the edges it cuts; the best square cut is 0101 or 1010', () => {
    expect(cost(0b0000, SQUARE)).toBe(0);
    expect(cost(0b0101, SQUARE)).toBe(-4);
    expect(cost(0b0011, SQUARE)).toBe(-2);
    expect(bestCut(SQUARE)).toEqual({ energy: -4, states: [0b0101, 0b1010] });
    expect(bestCut(KITE).energy).toBe(-4);
  });

  it('with no rotation (gamma = beta = 0) QAOA is a fair coin per qubit: <H_C> = -edges/2', () => {
    expect(expectation(SQUARE, [0], [0])).toBeCloseTo(-2, 9);
  });

  it('the circuit has Hadamards, three ops per edge per layer, and one Rx per qubit per layer', () => {
    expect(qaoaOps(SQUARE, [0.1, 0.2], [0.3, 0.4])).toHaveLength(4 + 2 * (3 * 4 + 4));
  });

  it('the grid holds the best one-layer point (the landscape repeats outside it)', () => {
    const res = 24;
    const grid = landscape(SQUARE, res);
    const inGrid = Math.min(...grid);
    // a finer search over a wider window finds nothing lower
    let wide = 0;
    for (let a = 0; a < 48; a++) for (let b = 0; b < 48; b++) wide = Math.min(wide, expectation(SQUARE, [(a / 48) * 2 * GAMMA_MAX], [(b / 48) * 2 * BETA_MAX]));
    expect(inGrid).toBeLessThan(wide + 0.08);
  });

  it('optimizing lowers the energy; one layer on the square reaches a ratio of about 0.75, two layers more', () => {
    const p1 = optimize(SQUARE, [0.4], [0.3]);
    expect(p1[p1.length - 1].energy).toBeLessThan(p1[0].energy);
    const r1 = approximationRatio(SQUARE, p1[p1.length - 1].energy);
    expect(r1).toBeGreaterThan(0.72);
    expect(r1).toBeLessThan(0.76);
    const p2 = optimize(SQUARE, [0.4, 0.8], [0.6, 0.3], 120);
    expect(approximationRatio(SQUARE, p2[p2.length - 1].energy)).toBeGreaterThan(r1 + 0.05);
  });
});
