/**
 * A Galton board two ways. A marble meets a peg and goes left or right, a
 * coin toss each row: after t rows its position is binomial, the bell curve,
 * spreading like sqrt t. A quantum walker has a coin qubit instead: each row
 * a Hadamard on the coin, then a step left for |0> and right for |1>. Its
 * paths interfere: the middle cancels, the probability piles up near the
 * edges, and it spreads like t, quadratically faster. This is the speed-up
 * behind quantum-walk search algorithms.
 *
 * Positions run from -t to t; index i of a distribution is position i - t.
 */

/** The marble: binomial over 2t + 1 positions (odd offsets are never reached on even rows, and vice versa). */
export function classicalBoard(t: number): number[] {
  const out = new Array(2 * t + 1).fill(0);
  let row = [1];
  for (let s = 0; s < t; s++) {
    const next = new Array(row.length + 1).fill(0);
    row.forEach((p, k) => {
      next[k] += p / 2;
      next[k + 1] += p / 2;
    });
    row = next;
  }
  // k steps right of t: position 2k - t
  row.forEach((p, k) => (out[2 * k] = p));
  return out;
}

/** The Hadamard walk: coin (|0> + i|1>)/sqrt 2 so it spreads the same both ways. Amplitudes per position, [re0, im0, re1, im1]. */
export function quantumBoard(t: number): number[] {
  const W = 2 * t + 1;
  let a = new Float64Array(W * 4);
  // start at position 0 (index t)
  a[t * 4] = Math.SQRT1_2;
  a[t * 4 + 3] = Math.SQRT1_2;
  const h = Math.SQRT1_2;
  for (let s = 0; s < t; s++) {
    const b = new Float64Array(W * 4);
    for (let i = 0; i < W; i++) {
      const r0 = a[i * 4], i0 = a[i * 4 + 1], r1 = a[i * 4 + 2], i1 = a[i * 4 + 3];
      if (!r0 && !i0 && !r1 && !i1) continue;
      // coin: Hadamard; then |0> steps left, |1> right
      const c0r = h * (r0 + r1), c0i = h * (i0 + i1);
      const c1r = h * (r0 - r1), c1i = h * (i0 - i1);
      if (i > 0) {
        b[(i - 1) * 4] += c0r;
        b[(i - 1) * 4 + 1] += c0i;
      }
      if (i < W - 1) {
        b[(i + 1) * 4 + 2] += c1r;
        b[(i + 1) * 4 + 3] += c1i;
      }
    }
    a = b;
  }
  return Array.from({ length: W }, (_, i) => a[i * 4] ** 2 + a[i * 4 + 1] ** 2 + a[i * 4 + 2] ** 2 + a[i * 4 + 3] ** 2);
}

/** Standard deviation of a distribution over positions -t..t. */
export function spreadOf(dist: readonly number[]): number {
  const t = (dist.length - 1) / 2;
  let m = 0, m2 = 0;
  dist.forEach((p, i) => {
    m += p * (i - t);
    m2 += p * (i - t) ** 2;
  });
  return Math.sqrt(Math.max(0, m2 - m * m));
}

/** One marble's path: t lefts and rights (+1 right, -1 left). */
export function marblePath(t: number, rng: () => number): number[] {
  return Array.from({ length: t }, () => (rng() < 0.5 ? -1 : 1));
}

/** Where one measured quantum walker lands, drawn from the walk's distribution. */
export function walkerLanding(dist: readonly number[], rng: () => number): number {
  let r = rng();
  for (let i = 0; i < dist.length; i++) {
    r -= dist[i];
    if (r < 0) return i;
  }
  return dist.length - 1;
}
