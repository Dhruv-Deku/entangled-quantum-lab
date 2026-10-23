import type { Op } from './circuit';
import { H2, type H2Point } from './h2-data';
import type { QState } from './state';

/**
 * The circuits behind the algorithm chapters: the quantum Fourier transform,
 * phase estimation, a compiled Shor for 15, Grover on three qubits, Simon's
 * algorithm, and VQE for the H2 molecule.
 *
 * Integers are little-endian like everything else: x = sum of x_k 2^k with
 * qubit 0 the lowest bit.
 */

const h = (q: number): Op => ({ kind: 'gate', gate: 'h', target: q });
const x = (q: number): Op => ({ kind: 'gate', gate: 'x', target: q });
const cx = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });
const cp = (phi: number, c: number, t: number): Op => ({ kind: 'gate', gate: 'p', target: t, controls: [c], params: [phi] });

/**
 * QFT on the listed qubits (qs[0] the lowest bit):
 * |x> -> 1/sqrt(N) sum_y e^{2 pi i x y / N} |y>. Hadamards and controlled
 * phases from the top qubit down, then swaps to reverse the order.
 */
export function qftOps(qs: readonly number[], inverse = false): Op[] {
  const m = qs.length;
  const ops: Op[] = [];
  for (let j = m - 1; j >= 0; j--) {
    ops.push(h(qs[j]));
    for (let k = j - 1; k >= 0; k--) ops.push(cp(Math.PI / 2 ** (j - k), qs[k], qs[j]));
  }
  for (let k = 0; k < Math.floor(m / 2); k++) ops.push({ kind: 'swap', a: qs[k], b: qs[m - 1 - k] });
  if (!inverse) return ops;
  // the inverse: the same steps backwards, every phase negated
  return ops.reverse().map((op) => (op.kind === 'gate' && op.gate === 'p' ? { ...op, params: [-op.params![0]] } : op));
}

/**
 * Phase estimation: counting qubits qs, target qubit t in an eigenstate of
 * U = P(2 pi phase). Each counting qubit j runs U^(2^j) controlled, which kicks
 * back a phase 2 pi phase 2^j; an inverse QFT then reads the phase in binary.
 */
export function controlledPowers(qs: readonly number[], t: number, phase: number): Op[] {
  return qs.map((c, j) => cp(2 * Math.PI * phase * 2 ** j, c, t));
}

/**
 * The modular exponent for Shor with N = 15, a = 7, compiled: 7^x mod 15
 * cycles 1, 7, 4, 13 with x mod 4, so it is fixed by the two lowest counting
 * bits; copying them into the work register gives one distinct work state per
 * value. A full Shor circuit computes 7^x mod 15 with arithmetic and more
 * qubits; the period it finds is the same.
 */
export const shorModExp = (counting: readonly number[], work: readonly number[]): Op[] => [cx(counting[0], work[0]), cx(counting[1], work[1])];

/** From a measured counting value and the register size, the period r and the factors of 15 (a = 7). */
export function shorFactors(readings: readonly number[], bits = 3): { r: number; factors: [number, number] } {
  const N = 2 ** bits;
  // the readings are multiples of N / r; the smallest non-zero step gives r
  const nonzero = readings.filter((v) => v > 0);
  const g = nonzero.reduce((a, b) => gcd(a, b), N);
  const r = N / g;
  const half = 7 ** (r / 2) % 15;
  return { r, factors: [gcd(half - 1, 15), gcd(half + 1, 15)] };
}

export function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : Math.abs(a);
}

/** Grover's oracle on three qubits: a minus sign on |secret>, by X gates around a doubly controlled Z. */
export function groverOracle(secret: number): Op[] {
  const flips = [0, 1, 2].filter((q) => !((secret >> q) & 1)).map(x);
  return [...flips, { kind: 'gate', gate: 'z', target: 2, controls: [0, 1] }, ...flips];
}

/** Grover's diffuser: reflect about the average amplitude. */
export function groverDiffuser(): Op[] {
  const all = [0, 1, 2];
  return [...all.map(h), ...all.map(x), { kind: 'gate', gate: 'z', target: 2, controls: [0, 1] }, ...all.map(x), ...all.map(h)];
}

/**
 * Simon's oracle for a 2-bit secret s: inputs q0, q1, outputs q2, q3.
 * f(x) = x xor (x_j s), j the lowest set bit of s, so f(x) = f(x xor s).
 */
export function simonOracle(s: number): Op[] {
  const ops: Op[] = [cx(0, 2), cx(1, 3)];
  const j = s & 1 ? 0 : 1;
  for (let k = 0; k < 2; k++) if ((s >> k) & 1) ops.push(cx(j, 2 + k));
  return ops;
}

/** The secret consistent with Simon's readings: the non-zero s with y.s = 0 (mod 2) for every reading y. */
export function simonSecret(readings: readonly number[]): number | null {
  const fits = [1, 2, 3].filter((s) => readings.every((y) => (popcount(y & s) & 1) === 0));
  return fits.length === 1 ? fits[0] : null;
}

const popcount = (v: number) => {
  let c = 0;
  for (; v; v &= v - 1) c++;
  return c;
};

/** <psi| P |psi> for a Pauli word (character w acts on qubit w). */
export function pauliExpectation(s: QState, word: string): number {
  let flip = 0;
  for (let w = 0; w < word.length; w++) if (word[w] === 'X' || word[w] === 'Y') flip |= 1 << w;
  let e = 0;
  for (let i = 0; i < s.dim; i++) {
    // P|i> = phase |i xor flip>
    let pr = 1, pi = 0;
    for (let w = 0; w < word.length; w++) {
      const b = (i >> w) & 1;
      const c = word[w];
      if (c === 'Z' && b) {
        pr = -pr;
        pi = -pi;
      } else if (c === 'Y') {
        // Y|0> = i|1>, Y|1> = -i|0>
        const sgn = b ? -1 : 1;
        [pr, pi] = [-pi * sgn, pr * sgn];
      }
    }
    const j = i ^ flip;
    // conj(psi_j) * phase * psi_i
    const ar = s.re[i] * pr - s.im[i] * pi, ai = s.re[i] * pi + s.im[i] * pr;
    e += s.re[j] * ar + s.im[j] * ai;
  }
  return e;
}

/**
 * The VQE ansatz for H2: cos(theta/2)|q2 q3 occupied> + sin(theta/2)|q0 q1 occupied>,
 * one dial in the two-electron subspace the ground state lives in. theta = pi is
 * Hartree-Fock (both electrons in the lowest orbital, qubits 0 and 1).
 */
export const vqeAnsatz = (theta: number): Op[] => [
  { kind: 'gate', gate: 'ry', target: 0, params: [theta] },
  cx(0, 1),
  x(2),
  x(3),
  cx(0, 2),
  cx(0, 3),
];

export function energy(point: H2Point, s: QState): number {
  return point.terms.reduce((e, [c, w]) => e + c * pauliExpectation(s, w), 0);
}

export const h2At = (r: number): H2Point => H2.reduce((best, p) => (Math.abs(p.r - r) < Math.abs(best.r - r) ? p : best));

/** Gradient descent on the single dial (parameter-shift rule: the dial sits in one Ry, so it is exact). */
export function vqeOptimize(point: H2Point, run: (ops: Op[]) => QState, theta = Math.PI, steps = 40, rate = 0.6): { theta: number; energy: number; path: [number, number][] } {
  const e = (t: number) => energy(point, run(vqeAnsatz(t)));
  const path: [number, number][] = [[theta, e(theta)]];
  for (let k = 0; k < steps; k++) {
    const grad = (e(theta + Math.PI / 2) - e(theta - Math.PI / 2)) / 2;
    theta -= rate * grad;
    path.push([theta, e(theta)]);
  }
  return { theta, energy: path[path.length - 1][1], path };
}
