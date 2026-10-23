import { describe, expect, it } from 'vitest';
import { run, type Op } from './circuit';
import { angleText, exact } from './exact';
import { dirac, factor, gateFormula, gateName, kronLabel, localMatrix, toAscii, type C } from './matrix';
import { mulberry32 } from './measure';

const R = Math.SQRT1_2;
const close = (m: C[][], want: number[][]) =>
  m.forEach((row, i) => row.forEach(([re, im], j) => {
    expect(re).toBeCloseTo(want[i][j], 9);
    expect(im).toBeCloseTo(0, 9);
  }));

describe('exact numbers', () => {
  it('writes the common values the way a textbook does', () => {
    expect(exact(R, 0).text).toBe('1/√2');
    expect(exact(-R, 0).text).toBe('-1/√2');
    expect(exact(0, R).text).toBe('i/√2');
    expect(exact(0, -0.5).text).toBe('-i/2');
    expect(exact(0.5, 0.5).text).toBe('e^{iπ/4}/√2');
    expect(exact(Math.sqrt(3) / 2, 0).text).toBe('√3/2');
    expect(exact(0, 1).text).toBe('i');
    expect(exact(0.3827, 0).exact).toBe(false);
    expect(exact(R, 0).ascii).toBe('1/sqrt2');
  });

  it('writes angles in π', () => {
    expect(angleText(Math.PI / 4).text).toBe('π/4');
    expect(angleText((-3 * Math.PI) / 4).text).toBe('-3π/4');
    expect(angleText(0.3).exact).toBe(false);
  });
});

describe('gate matrices', () => {
  it('H, with 1/√2 factored out', () => {
    const { m } = localMatrix({ kind: 'gate', gate: 'h', target: 2 });
    close(m, [[R, R], [R, -R]]);
    expect(factor(m.flat())?.label.text).toBe('1/√2');
  });

  it('CNOT with control q0 and target q1, in Qiskit order', () => {
    // basis |q1 q0>: |01> (q0 = 1) goes to |11>
    const { qubits, m } = localMatrix({ kind: 'gate', gate: 'x', target: 1, controls: [0] });
    expect(qubits).toEqual([0, 1]);
    close(m, [[1, 0, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [0, 1, 0, 0]]);
  });

  it('a Toffoli is a permutation that swaps |011> and |111>', () => {
    const { m } = localMatrix({ kind: 'gate', gate: 'x', target: 2, controls: [0, 1] });
    expect(m).toHaveLength(8);
    expect(m[7][3][0]).toBeCloseTo(1, 9);
    expect(m[3][7][0]).toBeCloseTo(1, 9);
    expect(m[5][5][0]).toBeCloseTo(1, 9);
  });

  it('every gate matrix is unitary', () => {
    const ops: Op[] = [
      { kind: 'gate', gate: 'ry', target: 0, params: [0.7] },
      { kind: 'gate', gate: 'u', target: 1, params: [1, 2, 3] },
      { kind: 'gate', gate: 'rz', target: 3, controls: [1], params: [0.4] },
      { kind: 'swap', a: 0, b: 2, controls: [1] },
      { kind: 'iswap', a: 1, b: 2 },
    ];
    for (const op of ops) {
      const { m } = localMatrix(op);
      // columns are orthonormal
      for (let a = 0; a < m.length; a++) for (let b = 0; b < m.length; b++) {
        let re = 0, im = 0;
        for (let r = 0; r < m.length; r++) {
          re += m[r][a][0] * m[r][b][0] + m[r][a][1] * m[r][b][1];
          im += m[r][a][0] * m[r][b][1] - m[r][a][1] * m[r][b][0];
        }
        expect(re).toBeCloseTo(a === b ? 1 : 0, 9);
        expect(im).toBeCloseTo(0, 9);
      }
    }
  });

  it('a measurement is the projector onto its outcome', () => {
    close(localMatrix({ kind: 'measure', qubit: 1, outcome: 1 }).m, [[0, 0], [0, 1]]);
  });
});

describe('formulas and notation', () => {
  it('names and tensor products', () => {
    expect(gateName({ kind: 'gate', gate: 'ry', target: 0, params: [Math.PI / 4] })).toBe('Ry(π/4)');
    expect(gateName({ kind: 'gate', gate: 'x', target: 1, controls: [0] })).toBe('CX');
    expect(gateName({ kind: 'gate', gate: 'x', target: 2, controls: [0, 1] })).toBe('CCX');
    expect(kronLabel(3, { kind: 'gate', gate: 'h', target: 1 })).toBe('I ⊗ H ⊗ I');
    expect(kronLabel(3, { kind: 'gate', gate: 'x', target: 1, controls: [0] })).toBe('I ⊗ CX');
    expect(kronLabel(3, { kind: 'gate', gate: 'x', target: 2, controls: [0] })).toMatch(/on q0, q2/);
  });

  it('Dirac notation: a Bell pair is 1/√2 (|00> + |11>)', () => {
    const s = run(2, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 1, controls: [0] }], mulberry32(1)).state;
    expect(dirac(s)).toBe('1/√2 (|00⟩ + |11⟩)');
    const minus = run(1, [{ kind: 'gate', gate: 'x', target: 0 }, { kind: 'gate', gate: 'h', target: 0 }], mulberry32(1)).state;
    expect(dirac(minus)).toBe('1/√2 (|0⟩ − |1⟩)');
    const plusI = run(1, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 's', target: 0 }], mulberry32(1)).state;
    expect(dirac(plusI)).toBe('1/√2 (|0⟩ + i|1⟩)');
  });

  it('formulas carry their angle, and everything has a plain-text form for the panels', () => {
    expect(gateFormula({ kind: 'gate', gate: 'ry', target: 0, params: [Math.PI / 2] })).toContain('θ = π/2');
    const a = toAscii(gateFormula({ kind: 'gate', gate: 'rz', target: 0, params: [Math.PI / 4] }));
    expect(/^[\x20-\x7E]+$/.test(a)).toBe(true);
    expect(a).toContain('e^(-i');
    expect(toAscii('1/√2 (|00⟩ + |11⟩)')).toBe('1/sqrt2 (|00> + |11>)');
  });
});
