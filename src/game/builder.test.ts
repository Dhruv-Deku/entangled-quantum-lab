import { describe, expect, it } from 'vitest';
import { BUILDS, check, compile, emptyCells, parOf, sameUnitary, type Cells, type Tool } from './builder';

const cells = (n: number, cols: (Tool | null)[][]): Cells => cols.map((c) => Array.from({ length: n }, (_, r) => c[r] ?? null));
const byChip = (chip: string) => BUILDS.find((b) => b.chip === chip)!;

describe('circuit builder: compiling cross-dot columns', () => {
  it('a dot over a plus is a CNOT; two dots a Toffoli; a dot and two swap marks a Fredkin', () => {
    expect(compile(cells(2, [['ctrl', 'target']])).ops).toEqual([{ kind: 'gate', gate: 'x', target: 1, controls: [0] }]);
    expect(compile(cells(3, [['ctrl', 'ctrl', 'target']])).ops).toEqual([{ kind: 'gate', gate: 'x', target: 2, controls: [0, 1] }]);
    expect(compile(cells(3, [['ctrl', 'swap', 'swap']])).ops).toEqual([{ kind: 'swap', a: 1, b: 2, controls: [0] }]);
  });

  it('dots control every gate in their column (Quirk rules)', () => {
    expect(compile(cells(3, [['ctrl', 'h', 'z']])).ops).toEqual([
      { kind: 'gate', gate: 'h', target: 1, controls: [0] },
      { kind: 'gate', gate: 'z', target: 2, controls: [0] },
    ]);
  });

  it('an open dot reacts to 0', () => {
    const anti = compile(cells(2, [['anti', 'target']])).ops;
    expect(sameUnitary(2, anti, [
      { kind: 'gate', gate: 'x', target: 0 },
      { kind: 'gate', gate: 'x', target: 1, controls: [0] },
      { kind: 'gate', gate: 'x', target: 0 },
    ])).toBe(true);
  });

  it('reports lone swap marks and dots with nothing to control', () => {
    expect(compile(cells(2, [['swap']])).errors[0]).toMatch(/exactly two/);
    expect(compile(cells(2, [['ctrl']])).errors[0]).toMatch(/needs a gate/);
    expect(compile(emptyCells(3, 5)).usedColumns).toBe(0);
  });
});

describe('circuit builder: equivalence', () => {
  it('ignores global phase but not relative phase', () => {
    // Rz(90) is S up to a global phase
    expect(sameUnitary(1, [{ kind: 'gate', gate: 'rz', target: 0, params: [Math.PI / 2] }], [{ kind: 'gate', gate: 's', target: 0 }])).toBe(true);
    expect(sameUnitary(1, [{ kind: 'gate', gate: 's', target: 0 }], [{ kind: 'gate', gate: 'sdg', target: 0 }])).toBe(false);
    // a controlled phase is not a global phase
    expect(sameUnitary(2, [{ kind: 'gate', gate: 'z', target: 1, controls: [0] }], [])).toBe(false);
  });
});

describe('circuit builder: challenges', () => {
  for (const ch of BUILDS.filter((b) => b.target)) {
    it(`${ch.title}: the reference solution passes at par, and an empty grid does not`, () => {
      const r = check(ch, ch.solution!);
      expect(r).toEqual({ status: 'solved', columns: parOf(ch), par: parOf(ch) });
      expect(check(ch, emptyCells(ch.qubits, 4)).status).toBe('empty');
      for (const t of new Set(ch.solution!.flat().filter(Boolean))) expect(ch.tools).toContain(t);
    });
  }

  it('rules stop the easy way out', () => {
    expect(check(byChip('Flip CNOT'), cells(2, [['target', 'ctrl']]))).toEqual({ status: 'error', message: 'Dots may only go on q0 here.' });
    expect(check(byChip('Toffoli'), cells(3, [['ctrl', 'ctrl', 'target']])).status).toBe('error');
    expect(check(byChip('Open dot'), cells(2, [['anti', 'target']]))).toEqual({ status: 'error', message: 'anti is not allowed here.' });
  });

  it('a wrong circuit is wrong, and two CNOTs are not a SWAP', () => {
    expect(check(byChip('SWAP'), cells(2, [['ctrl', 'target'], ['target', 'ctrl']])).status).toBe('wrong');
    expect(check(byChip('Z from HX'), cells(1, [['x'], ['h']])).status).toBe('wrong');
  });

  it('any correct circuit counts, even a longer one', () => {
    // CZ is symmetric: H on q0 around a CNOT pointing the other way also works
    const r = check(byChip('CZ'), cells(2, [['h'], ['target', 'ctrl'], ['h']]));
    expect(r.status).toBe('solved');
    const longer = check(byChip('Z from HX'), cells(1, [['h'], ['x'], ['h'], ['x'], ['x']]));
    expect(longer).toEqual({ status: 'solved', columns: 5, par: 3 });
  });
});
