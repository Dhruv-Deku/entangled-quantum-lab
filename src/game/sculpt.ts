import { shape, type Shape } from '../quantum/stateprep';

/**
 * The State sculptor's model: a bar per outcome, each at a height you tap
 * (0 to MAX_LEVEL steps), read as a probability distribution; shots sampled
 * from the prepared state; and how closely the shots match what you drew.
 */

/** Taps a bar can take before it wraps back to empty. */
export const MAX_LEVEL = 4;

/** One tap: up a whole step (a ready-made shape's fractional height rounds down first), past the top back to empty. */
export function tapLevel(level: number): number {
  return level >= MAX_LEVEL - 1e-9 ? 0 : Math.floor(level + 1e-9) + 1;
}

/** A ready-made shape as bar heights, the tallest at the top step. */
export function levelsFor(id: Shape, n: number): number[] {
  const w = shape(id, n);
  const max = Math.max(...w);
  return w.map((v) => (max > 0 ? (v / max) * MAX_LEVEL : 0));
}

/** The distribution the bars draw, or null when every bar is empty. */
export function probsOf(levels: readonly number[]): number[] | null {
  const total = levels.reduce((a, b) => a + Math.max(0, b), 0);
  return total > 0 ? levels.map((v) => Math.max(0, v) / total) : null;
}

/** One outcome drawn from `probs`, given a uniform number in [0, 1). */
export function sampleOne(probs: ArrayLike<number>, r: number): number {
  let k = 0;
  for (; k < probs.length - 1; k++) {
    r -= probs[k];
    if (r < 0) break;
  }
  return k;
}

/** `shots` outcomes drawn from `probs`, as counts per outcome. */
export function sampleShots(probs: readonly number[], shots: number, rng: () => number): number[] {
  const counts = probs.map(() => 0);
  for (let s = 0; s < shots; s++) counts[sampleOne(probs, rng())]++;
  return counts;
}

/** Bars moved to another qubit count, keeping the shape: each new bar takes the height of the old bar under it. */
export function resample(levels: readonly number[], count: number): number[] {
  return Array.from({ length: count }, (_, k) => levels[Math.floor((k * levels.length) / count)] ?? 0);
}

/** How alike the drawn distribution and the shots are (classical fidelity, 0 to 1). */
export function match(target: readonly number[], counts: readonly number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let s = 0;
  target.forEach((p, k) => (s += Math.sqrt(Math.max(0, p) * (counts[k] / total))));
  return s * s;
}

/** Outcome k on n qubits as written in a ket, qubit n-1 first: |0110>. */
export const bitLabel = (k: number, n: number) => k.toString(2).padStart(n, '0');
