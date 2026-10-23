import { describe, expect, it } from 'vitest';
import { run, type Op } from './circuit';
import type { GateName } from './gates';
import { chooseRegion, compileForIbm, IbmCompileError, samplesToCounts, toNative, type BackendShape } from './ibm-compile';
import { mulberry32 } from './measure';
import { QState } from './state';
import { sameUnitary } from '../game/builder';

/** A heavy-hex fragment like IBM's chips: degree at most 3. */
const HEAVY: BackendShape = {
  name: 'fake_heron',
  nQubits: 12,
  couplingMap: [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [4, 6], [5, 7], [6, 11], [7, 8], [8, 9], [9, 10], [10, 11]],
  basisGates: ['cz', 'id', 'rz', 'sx', 'x', 'measure', 'reset'],
};

const g = (gate: GateName, target: number, controls?: number[], params?: number[]): Op => ({ kind: 'gate', gate, target, ...(controls ? { controls } : {}), ...(params ? { params } : {}) });

function randomCircuit(n: number, len: number, rnd: () => number): Op[] {
  const names: GateName[] = ['h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg', 'sx', 'sxdg', 'rx', 'ry', 'rz', 'p', 'u'];
  const ops: Op[] = [];
  for (let i = 0; i < len; i++) {
    const t = Math.floor(rnd() * n);
    const others = [...Array(n).keys()].filter((q) => q !== t);
    const gate = names[Math.floor(rnd() * names.length)];
    const params = gate === 'u' ? [rnd() * 3, rnd() * 3, rnd() * 3] : ['rx', 'ry', 'rz', 'p'].includes(gate) ? [rnd() * 6 - 3] : undefined;
    const r = rnd();
    if (n > 1 && r < 0.1) ops.push({ kind: 'swap', a: t, b: others[0] });
    else if (n > 2 && r < 0.15) ops.push(g('x', t, [others[0], others[1]]));
    else ops.push(g(gate, t, n > 1 && r < 0.5 ? [others[Math.floor(rnd() * others.length)]] : undefined, params));
  }
  return ops;
}

/** The native circuit on the region does what the logical circuit does, through the start and end layouts. */
function equivalent(n: number, ops: Op[], c: ReturnType<typeof compileForIbm>): boolean {
  const k = c.region.length;
  let phase: [number, number] | null = null;
  for (let x = 0; x < 1 << n; x++) {
    const a = new QState(n);
    a.re[0] = 0;
    a.re[x] = 1;
    const want = run(n, ops, () => 0.5, a).state;
    let X = 0;
    for (let i = 0; i < n; i++) if ((x >> i) & 1) X |= 1 << c.initial[i];
    const b = new QState(k);
    b.re[0] = 0;
    b.re[X] = 1;
    const got = run(k, c.native, () => 0.5, b).state;
    let re = 0, im = 0;
    for (let y = 0; y < 1 << n; y++) {
      let Y = 0;
      for (let i = 0; i < n; i++) if ((y >> i) & 1) Y |= 1 << c.final[i];
      re += want.re[y] * got.re[Y] + want.im[y] * got.im[Y];
      im += want.re[y] * got.im[Y] - want.im[y] * got.re[Y];
    }
    if (Math.abs(Math.hypot(re, im) - 1) > 1e-6) return false;
    if (!phase) phase = [re, im];
    else if (Math.abs(re - phase[0]) > 1e-6 || Math.abs(im - phase[1]) > 1e-6) return false;
  }
  return true;
}

describe('compiling for IBM hardware', () => {
  it('every one-qubit and controlled gate becomes RZ, SX, CZ with the same effect', () => {
    const rnd = mulberry32(8);
    for (let k = 0; k < 60; k++) {
      const ops = randomCircuit(2, 4, rnd).filter((o) => o.kind !== 'gate' || (o.controls?.length ?? 0) < 2);
      const native = toNative(ops);
      for (const op of native) {
        expect(op.kind).toBe('gate');
        if (op.kind === 'gate') expect(op.controls?.length ? op.gate === 'z' : op.gate === 'rz' || op.gate === 'sx').toBe(true);
      }
      expect(sameUnitary(2, ops, native), JSON.stringify(ops)).toBe(true);
    }
  });

  it('random circuits compile onto a heavy-hex chip: native gates only, wired pairs only, same result', () => {
    const rnd = mulberry32(9);
    for (let k = 0; k < 40; k++) {
      const n = 2 + Math.floor(rnd() * 3);
      const ops = randomCircuit(n, 3 + Math.floor(rnd() * 8), rnd);
      const c = compileForIbm(n, ops, HEAVY);
      for (const op of c.native) {
        if (op.kind === 'gate' && op.controls?.length) {
          const [p, q] = [c.region[op.controls[0]], c.region[op.target]];
          expect(HEAVY.couplingMap.some(([a, b]) => (a === p && b === q) || (a === q && b === p))).toBe(true);
        }
      }
      expect(equivalent(n, ops, c), JSON.stringify(ops)).toBe(true);
      expect(c.qasm).toMatch(/^OPENQASM 3\.0;/);
      expect(c.qasm.match(/measure/g)).toHaveLength(n);
    }
  });

  it('chooses a connected region, avoiding bad qubits and preferring good ones', () => {
    const region = chooseRegion(HEAVY, 4, (q) => (q === 8 ? -1 : 0), (q) => q !== 9);
    expect(region[0]).toBe(8);
    expect(region).not.toContain(9);
    expect(() => chooseRegion(HEAVY, 4, undefined, () => false)).toThrow(IbmCompileError);
  });

  it('refuses ECR-only backends and mid-circuit measurements, with a reason', () => {
    expect(() => compileForIbm(1, [g('h', 0)], { ...HEAVY, basisGates: ['ecr', 'rz', 'sx', 'x'] })).toThrow(/ECR/);
    expect(() => compileForIbm(1, [g('h', 0), { kind: 'measure', qubit: 0 }], HEAVY)).toThrow(/measure/i);
  });

  it('reads Sampler samples (hex) as counts, qubit 0 the lowest bit', () => {
    expect(Array.from(samplesToCounts(['0x0', '0x3', '0x3', '0x1'], 2))).toEqual([1, 1, 0, 2]);
  });
});
