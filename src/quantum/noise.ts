import { X, Y, Z } from './gates';
import type { Rng } from './measure';
import type { QState } from './state';

/**
 * Noise for "The Storm", as random quantum trajectories on a plain statevector.
 * Averaged over many runs these match the usual density-matrix channels.
 */

export function bitFlip(s: QState, q: number, p: number, rng: Rng): boolean {
  if (rng() >= p) return false;
  s.apply1(q, X);
  return true;
}

export function phaseFlip(s: QState, q: number, p: number, rng: Rng): boolean {
  if (rng() >= p) return false;
  s.apply1(q, Z);
  return true;
}

/** With probability p apply a uniformly random X, Y or Z. */
export function depolarize(s: QState, q: number, p: number, rng: Rng): 'x' | 'y' | 'z' | null {
  if (rng() >= p) return null;
  const k = Math.floor(rng() * 3);
  s.apply1(q, [X, Y, Z][k]);
  return (['x', 'y', 'z'] as const)[k];
}

/** Energy loss: |1> decays toward |0> with probability gamma. Returns true if a decay happened. */
export function amplitudeDamping(s: QState, q: number, gamma: number, rng: Rng): boolean {
  const bit = 1 << q;
  const jump = rng() < gamma * s.prob1(q);
  const keep = Math.sqrt(1 - gamma);
  for (let i = 0; i < s.dim; i++) {
    if (i & bit) continue;
    const j = i | bit;
    if (jump) {
      // K1 = |0><1|: the |1> part drops to |0>
      s.re[i] = s.re[j];
      s.im[i] = s.im[j];
      s.re[j] = 0;
      s.im[j] = 0;
    } else {
      // K0 = diag(1, sqrt(1 - gamma))
      s.re[j] *= keep;
      s.im[j] *= keep;
    }
  }
  s.normalize();
  return jump;
}
