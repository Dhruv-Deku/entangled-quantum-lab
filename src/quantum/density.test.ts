import { describe, expect, it } from 'vitest';
import { blochVector } from './bloch';
import { run, type Op } from './circuit';
import { Density, idle, runNoisy, zne, type DeviceNoise } from './density';
import type { GateName } from './gates';
import { mulberry32 } from './measure';

const CLEAN: DeviceNoise = { t1: Infinity, t2: Infinity, depol: 0 };
const g = (gate: GateName, target: number, controls?: number[], params?: number[]): Op => ({ kind: 'gate', gate, target, ...(controls ? { controls } : {}), ...(params ? { params } : {}) });

function randomOps(n: number, len: number, rnd: () => number): Op[] {
  const names: GateName[] = ['h', 'x', 'y', 's', 't', 'sx', 'ry', 'rz', 'u'];
  const ops: Op[] = [];
  for (let i = 0; i < len; i++) {
    const t = Math.floor(rnd() * n);
    const r = rnd();
    if (n > 1 && r < 0.15) ops.push({ kind: 'swap', a: t, b: (t + 1) % n });
    else if (n > 1 && r < 0.22) ops.push({ kind: 'iswap', a: t, b: (t + 1) % n });
    else {
      const gate = names[Math.floor(rnd() * names.length)];
      const params = gate === 'u' ? [rnd() * 3, rnd() * 3, rnd() * 3] : gate === 'ry' || gate === 'rz' ? [rnd() * 3] : undefined;
      ops.push(g(gate, t, n > 1 && r < 0.5 ? [(t + 1) % n] : undefined, params));
    }
  }
  return ops;
}

describe('density matrices', () => {
  it('without noise they follow the statevector exactly: same probabilities, same Bloch arrows, purity 1', () => {
    const rnd = mulberry32(5);
    for (let k = 0; k < 40; k++) {
      const n = 1 + Math.floor(rnd() * 3);
      const ops = randomOps(n, 12, rnd);
      const psi = run(n, ops, () => 0.5).state;
      const rho = runNoisy(n, ops, CLEAN);
      const want = Density.fromState(psi);
      for (let i = 0; i < rho.re.length; i++) {
        expect(rho.re[i]).toBeCloseTo(want.re[i], 9);
        expect(rho.im[i]).toBeCloseTo(want.im[i], 9);
      }
      expect(rho.purity()).toBeCloseTo(1, 9);
      for (let q = 0; q < n; q++) blochVector(psi, q).forEach((v, a) => expect(rho.bloch(q)[a]).toBeCloseTo(v, 9));
    }
  });

  it('T1: |1> decays to |0> as e^(-t/T1)', () => {
    const rho = runNoisy(1, [g('x', 0)], CLEAN);
    idle(rho, 20000, { t1: 20, t2: 40, depol: 0 });
    expect(rho.probabilities()[1]).toBeCloseTo(Math.exp(-1), 6);
  });

  it('T2: a superposition loses its phase, so the arrow shrinks toward the axis', () => {
    const rho = runNoisy(1, [g('h', 0)], CLEAN);
    idle(rho, 10000, { t1: 1e9, t2: 10, depol: 0 });
    expect(rho.bloch(0)[0]).toBeCloseTo(Math.exp(-1), 4);
    expect(rho.trace()).toBeCloseTo(1, 9);
  });

  it('noise mixes the state: purity drops below 1, a Bell pair loses correlation', () => {
    const ops: Op[] = [g('h', 0), g('x', 1, [0])];
    const rho = runNoisy(2, ops, { t1: 5, t2: 4, depol: 0.01 });
    expect(rho.purity()).toBeLessThan(0.97);
    expect(rho.parity([0, 1])).toBeLessThan(0.98);
    expect(rho.trace()).toBeCloseTo(1, 9);
  });

  it('zero-noise extrapolation lands closer to the ideal than the raw noisy value', () => {
    const ops: Op[] = [g('h', 0), g('x', 1, [0]), g('x', 2, [1]), g('x', 2, [1]), g('x', 2, [1])];
    const noise: DeviceNoise = { t1: 30, t2: 25, depol: 0.004 };
    const ideal = runNoisy(3, ops, CLEAN).parity([0, 1, 2]);
    const vals = [1, 2, 3].map((s) => runNoisy(3, ops, noise, s).parity([0, 1, 2])) as [number, number, number];
    const mitigated = zne(vals);
    expect(Math.abs(mitigated - ideal)).toBeLessThan(Math.abs(vals[0] - ideal) / 3);
    // exact on a parabola
    expect(zne([3, 6, 11])).toBeCloseTo(2, 9);
    // the fidelity with the ideal state: 1 without noise, lower with it, and ZNE recovers most of the loss
    const psi = run(3, ops, () => 0.5).state;
    expect(runNoisy(3, ops, CLEAN).fidelity(psi)).toBeCloseTo(1, 9);
    const fs = [1, 2, 3].map((s) => runNoisy(3, ops, noise, s).fidelity(psi)) as [number, number, number];
    expect(fs[0]).toBeLessThan(0.99);
    expect(Math.abs(zne(fs) - 1)).toBeLessThan((1 - fs[0]) / 3);
  });
});
