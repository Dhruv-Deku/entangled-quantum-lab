import { describe, expect, it } from 'vitest';
import { sameUnitary } from '../game/builder';
import { run, type Op } from './circuit';
import type { GateName } from './gates';
import { mulberry32 } from './measure';
import { adjacent, decompose, route, RoutingError, T5 } from './routing';
import { QState } from './state';

const cx = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });
const g = (gate: GateName, target: number, controls?: number[], params?: number[]): Op => ({
  kind: 'gate', gate, target, ...(controls ? { controls } : {}), ...(params ? { params } : {}),
});

/**
 * The routed circuit does the same thing: for every logical input, put its bits
 * on the physical qubits of the starting layout, run the routed ops on the
 * whole chip, and read the answer through the final layout. Same amplitudes,
 * up to one global phase for all inputs.
 */
function equivalent(n: number, ops: Op[]): boolean {
  const r = route(T5, n, ops);
  const m = T5.qubits;
  let phase: [number, number] | null = null;
  for (let k = 0; k < 1 << n; k++) {
    const a = new QState(n);
    a.re[0] = 0;
    a.re[k] = 1;
    const want = run(n, ops, () => 0.5, a).state;
    let K = 0;
    for (let i = 0; i < n; i++) if ((k >> i) & 1) K |= 1 << r.initial[i];
    const b = new QState(m);
    b.re[0] = 0;
    b.re[K] = 1;
    const got = run(m, r.ops, () => 0.5, b).state;
    // <want|got> through the final layout
    let re = 0, im = 0, norm = 0;
    for (let j = 0; j < 1 << n; j++) {
      let J = 0;
      for (let i = 0; i < n; i++) if ((j >> i) & 1) J |= 1 << r.final[i];
      re += want.re[j] * got.re[J] + want.im[j] * got.im[J];
      im += want.re[j] * got.im[J] - want.im[j] * got.re[J];
      norm += got.re[J] ** 2 + got.im[J] ** 2;
    }
    if (Math.abs(Math.hypot(re, im) - 1) > 1e-6 || Math.abs(norm - 1) > 1e-6) return false;
    if (!phase) phase = [re, im];
    else if (Math.abs(re - phase[0]) > 1e-6 || Math.abs(im - phase[1]) > 1e-6) return false;
  }
  return true;
}

function randomCircuit(n: number, len: number, rnd: () => number): Op[] {
  const ops: Op[] = [];
  const others = (t: number) => [...Array(n).keys()].filter((q) => q !== t);
  for (let i = 0; i < len; i++) {
    const t = Math.floor(rnd() * n);
    const o = others(t);
    const r = rnd();
    if (n > 2 && r < 0.06) ops.push(g('x', t, [o[0], o[1]]));
    else if (n > 2 && r < 0.09) ops.push(g('z', t, [o[0], o[1]]));
    else if (n > 2 && r < 0.12) ops.push({ kind: 'swap', a: t, b: o[0], controls: [o[1]] });
    else if (n > 1 && r < 0.2) ops.push({ kind: 'swap', a: t, b: o[Math.floor(rnd() * o.length)] });
    else if (n > 1 && r < 0.24) ops.push({ kind: 'iswap', a: t, b: o[0] });
    else if (n > 1 && r < 0.6) ops.push(g((['x', 'z', 'y', 'h', 'ry'] as GateName[])[Math.floor(rnd() * 5)], t, [o[Math.floor(rnd() * o.length)]], [0.7]));
    else ops.push(g((['h', 't', 's', 'sx', 'rz'] as GateName[])[Math.floor(rnd() * 5)], t, undefined, [0.4]));
  }
  // params only where the gate takes one
  return ops.map((op) => (op.kind === 'gate' && !['ry', 'rz'].includes(op.gate) ? { ...op, params: undefined } : op));
}

describe('routing onto the T5 chip', () => {
  it('the Toffoli, CCZ and Fredkin decompositions are exact', () => {
    expect(sameUnitary(3, [g('x', 2, [0, 1])], decompose([g('x', 2, [0, 1])]))).toBe(true);
    expect(sameUnitary(3, [g('z', 0, [1, 2])], decompose([g('z', 0, [1, 2])]))).toBe(true);
    const fredkin: Op = { kind: 'swap', a: 1, b: 2, controls: [0] };
    expect(sameUnitary(3, [fredkin], decompose([fredkin]))).toBe(true);
    expect(decompose([fredkin]).every((op) => op.kind !== 'gate' || (op.controls?.length ?? 0) <= 1)).toBe(true);
  });

  it('picks a layout that needs no SWAPs when one exists', () => {
    // q0 talks to three others: put it on the T's centre
    const star = [cx(0, 1), cx(0, 2), cx(0, 3)];
    const r = route(T5, 4, star);
    expect(r.swaps).toBe(0);
    expect(r.initial[0]).toBe(1);
  });

  it('adds SWAPs when the circuit needs a triangle the chip does not have', () => {
    const r = route(T5, 3, [cx(0, 1), cx(1, 2), cx(0, 2)]);
    expect(r.swaps).toBe(1);
    expect(r.twoQubitAfter).toBe(3 + 3);
    expect(equivalent(3, [cx(0, 1), cx(1, 2), cx(0, 2)])).toBe(true);
  });

  it('a SWAP in your circuit costs nothing: the layout is relabelled', () => {
    const r = route(T5, 2, [{ kind: 'swap', a: 0, b: 1 }, g('h', 0)]);
    expect(r.ops).toHaveLength(1);
    expect(r.final).toEqual([r.initial[1], r.initial[0]]);
  });

  it('random circuits: every two-qubit gate sits on a coupler, and the result is the same', () => {
    const rnd = mulberry32(21);
    let added = 0;
    for (let k = 0; k < 120; k++) {
      const n = 2 + Math.floor(rnd() * 4);
      const ops = randomCircuit(n, 3 + Math.floor(rnd() * 14), rnd);
      const r = route(T5, n, ops);
      for (const op of r.ops) {
        const qs = op.kind === 'gate' ? [...(op.controls ?? []), op.target] : op.kind === 'swap' || op.kind === 'iswap' ? [op.a, op.b] : [op.qubit];
        expect(qs.length).toBeLessThanOrEqual(2);
        if (qs.length === 2) expect(adjacent(T5, qs[0], qs[1]), JSON.stringify(op)).toBe(true);
      }
      expect(equivalent(n, ops), JSON.stringify(ops)).toBe(true);
      added += r.swaps;
    }
    expect(added).toBeGreaterThan(20);
  });

  it('measurements keep their logical classical bit', () => {
    const r = route(T5, 2, [g('h', 0), cx(0, 1), { kind: 'measure', qubit: 1 }]);
    const m = r.ops.find((op) => op.kind === 'measure');
    expect(m).toMatchObject({ qubit: r.final[1], bit: 1 });
  });

  it('refuses what it cannot route, and circuits too big for the chip', () => {
    expect(() => route(T5, 4, [g('x', 3, [0, 1, 2])])).toThrow(RoutingError);
    expect(() => route(T5, 3, [g('y', 2, [0, 1])])).toThrow(RoutingError);
    expect(() => route(T5, 6, [])).toThrow(RoutingError);
  });
});
