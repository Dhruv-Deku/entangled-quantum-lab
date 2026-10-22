import type { QState } from './state';

/** Uniform random number in [0, 1). */
export type Rng = () => number;

/** Small seeded generator for reproducible tests and replays. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Project qubit q onto `outcome` and renormalize the whole state. */
export function collapse(s: QState, q: number, outcome: 0 | 1): void {
  const bit = 1 << q;
  const keep = outcome ? bit : 0;
  for (let i = 0; i < s.dim; i++) {
    if ((i & bit) !== keep) {
      s.re[i] = 0;
      s.im[i] = 0;
    }
  }
  if (s.norm2() < 1e-24) throw new Error(`outcome ${outcome} on qubit ${q} has zero probability`);
  s.normalize();
}

/** Born-rule measurement of one qubit; collapses the full state (entangled partners included). */
export function measureQubit(s: QState, q: number, rng: Rng): 0 | 1 {
  const outcome: 0 | 1 = rng() < s.prob1(q) ? 1 : 0;
  collapse(s, q, outcome);
  return outcome;
}

function pickIndex(p: Float64Array, r: number): number {
  let acc = 0;
  for (let i = 0; i < p.length; i++) {
    acc += p[i];
    if (r < acc) return i;
  }
  // rounding left r just above the total: return the last index with nonzero probability
  for (let i = p.length - 1; i >= 0; i--) if (p[i] > 0) return i;
  return 0;
}

/** Measure every qubit; the state becomes the observed basis state. Returns its index. */
export function measureAll(s: QState, rng: Rng): number {
  const k = pickIndex(s.probabilities(), rng());
  s.re.fill(0);
  s.im.fill(0);
  s.re[k] = 1;
  return k;
}

/**
 * Sample `shots` full measurements WITHOUT touching the state, as if the circuit
 * were prepared again for every shot. Returns a count per basis index.
 */
export function sample(s: QState, shots: number, rng: Rng): Uint32Array {
  const p = s.probabilities();
  const cdf = new Float64Array(p.length);
  let acc = 0;
  for (let i = 0; i < p.length; i++) cdf[i] = acc += p[i];
  const counts = new Uint32Array(p.length);
  for (let k = 0; k < shots; k++) {
    const r = rng() * acc;
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (r < cdf[mid]) hi = mid;
      else lo = mid + 1;
    }
    counts[lo]++;
  }
  return counts;
}
