import { describe, expect, it } from 'vitest';
import { run } from './circuit';
import { mulberry32 } from './measure';
import { gateCounts, prepare, shape, SHAPES, ucry, ucryAngles } from './stateprep';

const probsOf = (n: number, ops: ReturnType<typeof prepare>) => Array.from(run(n, ops, () => 0.5).state.probabilities());

describe('state preparation: any distribution as a quantum program', () => {
  it('builds a uniformly controlled rotation from Ry and CNOT', () => {
    const theta = [0.3, 1.1, -0.7, 2.0];
    // on the target, with the controls set to c, the net rotation is theta[c]
    for (let c = 0; c < 4; c++) {
      const set = [0, 1].filter((m) => (c >> m) & 1).map((m) => ({ kind: 'gate' as const, gate: 'x' as const, target: [2, 1][m] }));
      const p1 = run(3, [...set, ...ucry(theta, [2, 1], 0)], () => 0.5).state.prob1(0);
      expect(p1).toBeCloseTo(Math.sin(theta[c] / 2) ** 2, 9);
    }
    expect(ucryAngles([1, 1]).map((a) => +a.toFixed(9))).toEqual([1, 0]);
  });

  it('loads random distributions exactly, on 1 to 5 qubits', () => {
    const rng = mulberry32(5);
    for (let n = 1; n <= 5; n++)
      for (let trial = 0; trial < 6; trial++) {
        const target = Array.from({ length: 2 ** n }, () => (rng() < 0.2 ? 0 : rng()));
        if (!target.some((v) => v > 0)) target[0] = 1;
        const total = target.reduce((a, b) => a + b, 0);
        const got = probsOf(n, prepare(target));
        got.forEach((p, k) => expect(p).toBeCloseTo(target[k] / total, 9));
      }
  });

  it('uses only Ry and CNOT, at most 2^n - 1 rotations and 2^n - 2 CNOTs', () => {
    for (let n = 1; n <= 5; n++) {
      const ops = prepare(shape('bell', n));
      expect(ops.every((o) => o.kind === 'gate' && (o.gate === 'ry' || (o.gate === 'x' && o.controls?.length === 1)))).toBe(true);
      const c = gateCounts(ops);
      expect(c.rotations).toBeLessThanOrEqual(2 ** n - 1);
      expect(c.cnots).toBeLessThanOrEqual(Math.max(0, 2 ** n - 2));
    }
  });

  it('makes every ready shape, and simple ones simply', () => {
    for (const s of SHAPES) for (const n of [2, 3, 4]) {
      const t = shape(s.id, n), total = t.reduce((a, b) => a + b, 0);
      probsOf(n, prepare(t)).forEach((p, k) => expect(p).toBeCloseTo(t[k] / total, 9));
    }
    // a flat distribution is just one rotation per qubit, no CNOTs
    expect(gateCounts(prepare(shape('uniform', 4)))).toEqual({ rotations: 4, cnots: 0 });
    // a single answer needs no entangling gates either
    expect(gateCounts(prepare(shape('one', 3))).cnots).toBe(0);
  });
});
