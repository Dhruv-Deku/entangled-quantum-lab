import { applyOp, type Op } from './circuit';
import { measureQubit, type Rng } from './measure';
import { depolarize } from './noise';
import type { Routed } from './routing';
import { QState } from './state';

/**
 * Running a routed circuit on a noisy chip, one shot at a time (quantum
 * trajectories on a statevector: averaged over shots they match the usual
 * density-matrix channels). The error rates are typical of superconducting
 * cloud chips of the early 2020s.
 */
export interface NoiseModel {
  /** Depolarizing probability after each single-qubit gate. */
  p1: number;
  /** Depolarizing probability on each qubit of a two-qubit gate (a SWAP is three CNOTs). */
  p2: number;
  /** Chance a measurement reports the wrong bit. */
  readout: number;
}

export const TYPICAL_NOISE: NoiseModel = { p1: 0.001, p2: 0.01, readout: 0.02 };
export const NO_NOISE: NoiseModel = { p1: 0, p2: 0, readout: 0 };

export interface ChipRun {
  /** Counts over the logical outcomes (2^n), qubit 0 the lowest bit, as everywhere else. */
  counts: Uint32Array;
  shots: number;
}

function qubitsOf(op: Op): number[] {
  if (op.kind === 'gate') return [...(op.controls ?? []), op.target];
  if (op.kind === 'swap' || op.kind === 'iswap') return [op.a, op.b];
  return [op.qubit];
}

/** Run `shots` shots of a routed circuit for n logical qubits and read every logical qubit at the end. */
export function runOnChip(routed: Routed, n: number, chipQubits: number, shots: number, rng: Rng, noise: NoiseModel = TYPICAL_NOISE): ChipRun {
  const counts = new Uint32Array(1 << n);
  for (let s = 0; s < shots; s++) {
    const state = new QState(chipQubits);
    const bits: number[] = new Array(Math.max(n, chipQubits)).fill(0);
    for (const op of routed.ops) {
      // a fresh measurement every shot, so drop any outcome the op recorded
      const fresh: Op = op.kind === 'measure' || op.kind === 'reset' ? { ...op, outcome: undefined } : op;
      applyOp(state, fresh, bits, rng);
      if (op.kind === 'measure' && rng() < noise.readout) bits[op.bit ?? op.qubit] ^= 1;
      const qs = qubitsOf(op);
      if (op.kind === 'measure' || op.kind === 'reset') continue;
      if (qs.length === 1) depolarize(state, qs[0], noise.p1, rng);
      else for (let k = 0; k < (op.kind === 'swap' && !op.controls?.length ? 3 : 1); k++) for (const q of qs) depolarize(state, q, noise.p2, rng);
    }
    let outcome = 0;
    for (let i = 0; i < n; i++) {
      let b = measureQubit(state, routed.final[i], rng);
      if (rng() < noise.readout) b = (b ^ 1) as 0 | 1;
      if (b) outcome |= 1 << i;
    }
    counts[outcome]++;
  }
  return { counts, shots };
}

/** How close measured counts are to the ideal distribution: 1 - total variation distance (1 is perfect). */
export function agreement(counts: Uint32Array, ideal: ArrayLike<number>): number {
  const shots = counts.reduce((a, b) => a + b, 0);
  let tvd = 0;
  for (let i = 0; i < counts.length; i++) tvd += Math.abs(counts[i] / shots - ideal[i]);
  return 1 - tvd / 2;
}
