import { run, type Op } from '../quantum/circuit';
import { Density, runNoisy, zne, type DeviceNoise } from '../quantum/density';

/**
 * The noise lab's settings and results. When it is on, the orbs show the
 * noisy (mixed) state: arrows shrink inside the spheres, shots sample the noisy
 * probabilities, and the board shows the density matrix.
 */

/** Steps the panel's - and + buttons move through. */
export const T1_STEPS = [1, 2, 5, 10, 20, 50, 100, 200];
export const T2_STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 400];
export const DEPOL_STEPS = [0, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02];

export interface ZneResult {
  scales: [number, number, number];
  values: [number, number, number];
  mitigated: number;
  ideal: number;
}

class NoiseLab {
  on = false;
  noise: DeviceNoise = { t1: 10, t2: 10, depol: 0.002 };
  /** Bumped on every change, so caches know to recompute. */
  version = 0;
  zne: ZneResult | null = null;
  private cache: { key: string; rho: Density } | null = null;
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    this.version++;
    this.zne = null;
    for (const fn of this.listeners) fn();
  }

  toggle(): void {
    this.on = !this.on;
    this.changed();
  }

  /** Move one setting a step up or down its list. T2 can never exceed 2 T1. */
  step(which: 't1' | 't2' | 'depol', dir: 1 | -1): void {
    const list = which === 't1' ? T1_STEPS : which === 't2' ? T2_STEPS : DEPOL_STEPS;
    const cur = this.noise[which];
    let i = list.findIndex((v) => v >= cur - 1e-12);
    if (i < 0) i = list.length - 1;
    i = Math.max(0, Math.min(list.length - 1, i + dir));
    this.noise = { ...this.noise, [which]: list[i] };
    if (this.noise.t2 > 2 * this.noise.t1) this.noise.t2 = T2_STEPS.filter((v) => v <= 2 * this.noise.t1).pop() ?? T2_STEPS[0];
    this.changed();
  }

  /** The noisy state of a circuit (cached until the circuit or the settings change). */
  rho(n: number, ops: readonly Op[]): Density {
    const key = `${this.version}:${n}:${JSON.stringify(ops)}`;
    if (this.cache?.key !== key) this.cache = { key, rho: runNoisy(n, ops, this.noise) };
    return this.cache.rho;
  }

  /**
   * Zero-noise extrapolation on the circuit: the fidelity with the ideal
   * state, at the noise turned up 1x, 2x and 3x, extrapolated back to no noise.
   * (Hardware would estimate an observable from shots; the idea is the same.)
   */
  mitigate(n: number, ops: readonly Op[]): ZneResult {
    const scales: [number, number, number] = [1, 2, 3];
    const psi = run(n, ops, () => 0.5).state;
    const values = scales.map((s) => runNoisy(n, ops, this.noise, s).fidelity(psi)) as [number, number, number];
    this.zne = { scales, values, mitigated: zne(values, scales), ideal: 1 };
    for (const fn of this.listeners) fn();
    return this.zne;
  }
}

export const noiseLab = new NoiseLab();
