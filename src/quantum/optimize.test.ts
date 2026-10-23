import { describe, expect, it } from 'vitest';
import { sameUnitary } from '../game/builder';
import type { Op } from './circuit';
import type { GateName } from './gates';
import { mulberry32 } from './measure';
import { commutes, simplify } from './optimize';

const g = (gate: GateName, target: number, controls?: number[], params?: number[]): Op => ({
  kind: 'gate', gate, target, ...(controls ? { controls } : {}), ...(params ? { params } : {}),
});
const cx = (c: number, t: number) => g('x', t, [c]);

const GATES: GateName[] = ['h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg', 'sx', 'sxdg', 'rx', 'ry', 'rz', 'p'];
const ANGLES = [Math.PI / 4, Math.PI / 2, -Math.PI / 4, Math.PI, 0.3, -1.1];

/** A random circuit on n qubits: single-qubit gates, some with controls, and swaps. */
function randomCircuit(n: number, len: number, rnd: () => number): Op[] {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const ops: Op[] = [];
  for (let i = 0; i < len; i++) {
    const t = Math.floor(rnd() * n);
    const r = rnd();
    if (r < 0.08 && n > 1) {
      const a = t, b = (t + 1 + Math.floor(rnd() * (n - 1))) % n;
      ops.push({ kind: 'swap', a, b });
      continue;
    }
    const gate = pick(GATES);
    const params = ['rx', 'ry', 'rz', 'p'].includes(gate) ? [pick(ANGLES)] : undefined;
    const controls = r < 0.4 && n > 1 ? [(t + 1 + Math.floor(rnd() * (n - 1))) % n] : undefined;
    ops.push(g(gate, t, controls, params));
  }
  return ops;
}

describe('simplify', () => {
  it('cancels gates that undo each other', () => {
    expect(simplify([g('h', 0), g('h', 0)]).ops).toEqual([]);
    expect(simplify([cx(0, 1), cx(0, 1)]).ops).toEqual([]);
    expect(simplify([g('s', 0), g('sdg', 0)]).ops).toEqual([]);
    expect(simplify([g('sx', 1), g('sxdg', 1)]).ops).toEqual([]);
    expect(simplify([{ kind: 'swap', a: 0, b: 1 }, { kind: 'swap', a: 1, b: 0 }]).ops).toEqual([]);
    expect(simplify(Array.from({ length: 8 }, () => g('t', 0))).ops).toEqual([]);
  });

  it('merges gates that add up, and names the result', () => {
    expect(simplify([g('t', 0), g('t', 0)]).ops).toEqual([g('s', 0)]);
    expect(simplify([g('s', 2), g('s', 2)]).ops).toEqual([g('z', 2)]);
    expect(simplify([g('sx', 0), g('sx', 0)]).ops).toEqual([g('x', 0)]);
    expect(simplify([g('t', 0, [1]), g('t', 0, [1])]).ops).toEqual([g('s', 0, [1])]);
    const r = simplify([g('rz', 0, undefined, [0.25]), g('rz', 0, undefined, [0.5])]);
    expect(r.ops).toHaveLength(1);
    expect(r.ops[0]).toMatchObject({ gate: 'rz', params: [0.75] });
    expect(r.merged).toBe(1);
  });

  it('slides gates past ones they commute with', () => {
    // a Z on the control commutes with the CNOT, so the two CNOTs meet and cancel
    expect(simplify([cx(0, 1), g('z', 0), cx(0, 1)]).ops).toEqual([g('z', 0)]);
    // an X on the target commutes too
    expect(simplify([cx(0, 1), g('x', 1), cx(0, 1)]).ops).toEqual([g('x', 1)]);
    // CNOTs sharing a control commute
    expect(simplify([cx(0, 1), cx(0, 2), cx(0, 1)]).ops).toEqual([cx(0, 2)]);
    // but a Z on the target does not
    expect(simplify([cx(0, 1), g('z', 1), cx(0, 1)]).ops).toHaveLength(3);
  });

  it('drops rotations by a full turn, but keeps a controlled 2 pi (its sign is real)', () => {
    expect(simplify([g('ry', 0, undefined, [2 * Math.PI])]).ops).toEqual([]);
    expect(simplify([g('ry', 0, [1], [2 * Math.PI])]).ops).toHaveLength(1);
    expect(simplify([g('ry', 0, [1], [4 * Math.PI])]).ops).toEqual([]);
  });

  it('never moves measurements or what comes after them', () => {
    const ops: Op[] = [g('h', 0), { kind: 'measure', qubit: 0 }, g('h', 0)];
    expect(simplify(ops).ops).toHaveLength(3);
    const ff: Op[] = [g('x', 1), { kind: 'measure', qubit: 0 }, { kind: 'gate', gate: 'x', target: 1, condition: { bit: 0, value: 1 } }, g('x', 1)];
    expect(simplify(ff).ops).toHaveLength(4);
  });

  it('commutes() is right: every pair it calls commuting really does', () => {
    const rnd = mulberry32(11);
    let yes = 0;
    for (let k = 0; k < 3000; k++) {
      const [a, b] = randomCircuit(3, 2, rnd);
      if (!commutes(a, b)) continue;
      yes++;
      expect(sameUnitary(3, [a, b], [b, a]), JSON.stringify([a, b])).toBe(true);
    }
    expect(yes).toBeGreaterThan(300);
  });

  it('random circuits: same unitary, never longer', () => {
    const rnd = mulberry32(7);
    let saved = 0;
    for (let k = 0; k < 300; k++) {
      const n = 1 + Math.floor(rnd() * 3);
      const ops = randomCircuit(n, 4 + Math.floor(rnd() * 30), rnd);
      const r = simplify(ops);
      expect(r.ops.length).toBeLessThanOrEqual(ops.length);
      expect(r.ops.length).toBe(ops.length - r.cancelled - r.merged);
      expect(sameUnitary(n, ops, r.ops), JSON.stringify(ops)).toBe(true);
      saved += ops.length - r.ops.length;
    }
    expect(saved).toBeGreaterThan(100);
  });

  it('leaves the input alone', () => {
    const ops = [g('h', 0), g('h', 0)];
    simplify(ops);
    expect(ops).toHaveLength(2);
  });
});
