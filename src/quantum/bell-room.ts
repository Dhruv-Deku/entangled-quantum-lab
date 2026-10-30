import { CHSH_ALICE, CHSH_BOB } from './advanced';

/**
 * The Bell test across your room (the experiment behind the 2022 Nobel prize
 * in physics). A source on the desk sends one particle to each of two
 * detectors far apart. Each round each detector picks one of two settings at
 * random, after the particles have left, and reads +1 or -1. The CHSH score
 *   S = E(a0,b0) + E(a0,b1) + E(a1,b0) - E(a1,b1)
 * can never pass 2 if the particles carry hidden instructions decided at the
 * source (any local, realistic theory). Entangled particles reach 2 sqrt 2.
 */

export type BellMode = 'quantum' | 'hidden';

export interface BellRound {
  /** Settings (0 or 1) and their angles. */
  x: number;
  y: number;
  /** Outcomes, +1 or -1. */
  a: number;
  b: number;
}

/** One round. Quantum: a Bell pair measured at the CHSH angles (same answer with chance cos^2 of half the angle between). Hidden: each pair carries a random direction and each detector answers by which side of it its setting falls (the best such model, reaching exactly 2). */
export function bellRound(mode: BellMode, rng: () => number): BellRound {
  const x = rng() < 0.5 ? 0 : 1, y = rng() < 0.5 ? 0 : 1;
  const ta = CHSH_ALICE[x], tb = CHSH_BOB[y];
  if (mode === 'quantum') {
    const a = rng() < 0.5 ? 1 : -1;
    const same = rng() < Math.cos((ta - tb) / 2) ** 2;
    return { x, y, a, b: same ? a : -a };
  }
  // instructions fixed at the source: a hidden angle; each side answers by the sign of cos(setting - hidden)
  const lam = rng() * 2 * Math.PI;
  const sign = (v: number) => (v >= 0 ? 1 : -1);
  return { x, y, a: sign(Math.cos(ta - lam)), b: sign(Math.cos(tb - lam)) };
}

export interface BellTally {
  sum: number[][];
  count: number[][];
}

export const emptyTally = (): BellTally => ({ sum: [[0, 0], [0, 0]], count: [[0, 0], [0, 0]] });

export function addRound(t: BellTally, r: BellRound): void {
  t.sum[r.x][r.y] += r.a * r.b;
  t.count[r.x][r.y]++;
}

/** Correlations so far, the score S and its standard error. */
export function score(t: BellTally): { e: number[][]; s: number; se: number; rounds: number } {
  const e = [0, 1].map((x) => [0, 1].map((y) => (t.count[x][y] ? t.sum[x][y] / t.count[x][y] : 0)));
  let v = 0;
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) v += t.count[x][y] ? (1 - e[x][y] ** 2) / t.count[x][y] : 0;
  const rounds = t.count[0][0] + t.count[0][1] + t.count[1][0] + t.count[1][1];
  return { e, s: e[0][0] + e[0][1] + e[1][0] - e[1][1], se: Math.sqrt(v), rounds };
}

/** The angle each setting turns the detector's dial to, in degrees (for the dials). */
export const dialDeg = (side: 'a' | 'b', setting: number) => ((side === 'a' ? CHSH_ALICE[setting] : CHSH_BOB[setting]) * 180) / Math.PI;
