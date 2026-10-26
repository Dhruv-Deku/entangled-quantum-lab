import { describe, expect, it } from 'vitest';
import { mulberry32 } from './measure';
import { SurfaceCode, thresholdCurves } from './surface';

describe('rotated surface code', () => {
  it('has d^2 data qubits and d^2 - 1 checks, half of each kind', () => {
    for (const d of [3, 5, 7]) {
      const code = new SurfaceCode(d);
      expect(code.checks.length).toBe(d * d - 1);
      expect(code.checks.filter((c) => c.type === 'X').length).toBe((d * d - 1) / 2);
      // every data qubit is seen by one or two checks of each kind
      for (let q = 0; q < d * d; q++)
        for (const t of ['X', 'Z']) {
          const n = code.checks.filter((c) => c.type === t && c.data.includes(q)).length;
          expect(n, `q${q} ${t}`).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(2);
        }
    }
  });

  it('checks of different kinds overlap on an even number of qubits (they commute)', () => {
    const code = new SurfaceCode(5);
    for (const a of code.checks.filter((c) => c.type === 'X'))
      for (const b of code.checks.filter((c) => c.type === 'Z')) expect(a.data.filter((q) => b.data.includes(q)).length % 2).toBe(0);
  });

  it('corrects any single error, and any (d - 1) / 2 errors, of either kind', () => {
    const rng = mulberry32(7);
    for (const d of [3, 5]) {
      const code = new SurfaceCode(d);
      for (const e of ['X', 'Z'] as const) {
        for (let q = 0; q < d * d; q++) {
          const fix = code.decode(code.syndrome([q], e), e);
          expect(code.logicalFlip([q], fix.correction, e), `d${d} ${e}${q}`).toBe(false);
          // the correction clears the syndrome
          const left = [q, ...fix.correction].filter((x, i, a) => a.indexOf(x) === i && a.filter((y) => y === x).length % 2 === 1);
          expect(code.syndrome(left, e)).toEqual([]);
        }
        const t = (d - 1) / 2;
        for (let trial = 0; trial < 200; trial++) {
          const errs = new Set<number>();
          while (errs.size < t) errs.add(Math.floor(rng() * d * d));
          const fix = code.decode(code.syndrome([...errs], e), e);
          expect(code.logicalFlip([...errs], fix.correction, e)).toBe(false);
        }
      }
    }
  });

  it('a chain of errors right across the grid is a logical error with no syndrome', () => {
    const code = new SurfaceCode(5);
    const column = [0, 5, 10, 15, 20];
    expect(code.syndrome(column, 'X')).toEqual([]);
    expect(code.logicalFlip(column, [], 'X')).toBe(true);
    const row = [0, 1, 2, 3, 4];
    expect(code.syndrome(row, 'Z')).toEqual([]);
    expect(code.logicalFlip(row, [], 'Z')).toBe(true);
  });

  it('below threshold bigger codes fail less; above it they fail more', () => {
    const [d3, d5] = thresholdCurves([3, 5], [0.03, 0.2], 1500, mulberry32(11));
    expect(d5.points[0][1]).toBeLessThan(d3.points[0][1]);
    expect(d5.points[1][1]).toBeGreaterThan(d3.points[1][1]);
  });
});
