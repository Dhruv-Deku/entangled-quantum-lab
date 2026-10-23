import type { Op } from './circuit';
import { gateMatrix, type Mat2, X, Y, Z } from './gates';
import type { QState } from './state';

/**
 * Density matrices: states that can be mixed, not just pure. A pure state |psi>
 * becomes rho = |psi><psi|; noise turns it into a weighted mix, and a qubit's
 * Bloch arrow shrinks inside the sphere (its length is 1 only when pure).
 *
 * rho is stored row-major, rho[i * dim + j], qubit 0 the lowest bit as everywhere.
 * Gates act as rho -> U rho U+; noise as Kraus channels rho -> sum K rho K+.
 */
export class Density {
  readonly dim: number;
  re: Float64Array;
  im: Float64Array;

  constructor(readonly n: number) {
    this.dim = 1 << n;
    this.re = new Float64Array(this.dim * this.dim);
    this.im = new Float64Array(this.dim * this.dim);
    this.re[0] = 1;
  }

  static fromState(s: QState): Density {
    const d = new Density(s.n);
    for (let i = 0; i < d.dim; i++)
      for (let j = 0; j < d.dim; j++) {
        // |psi><psi|: psi_i conj(psi_j)
        d.re[i * d.dim + j] = s.re[i] * s.re[j] + s.im[i] * s.im[j];
        d.im[i * d.dim + j] = s.im[i] * s.re[j] - s.re[i] * s.im[j];
      }
    return d;
  }

  clone(): Density {
    const d = new Density(this.n);
    d.re.set(this.re);
    d.im.set(this.im);
    return d;
  }

  /** Apply a 2x2 matrix m along bit q of every column (rows: false) or every row (conjugated: true). */
  private side(q: number, m: Mat2, controls: readonly number[], rows: boolean): void {
    const { dim, re, im } = this;
    const bit = 1 << q;
    let cmask = 0;
    for (const c of controls) cmask |= 1 << c;
    const [a, b, c, d] = m.re;
    const sgn = rows ? -1 : 1;
    const [ai, bi, ci, di] = m.im.map((v) => v * sgn);
    for (let line = 0; line < dim; line++) {
      for (let i0 = 0; i0 < dim; i0++) {
        if (i0 & bit || (i0 & cmask) !== cmask) continue;
        const i1 = i0 | bit;
        // element positions: along a column (fixed column = line) or a row (fixed row = line)
        const p0 = rows ? line * dim + i0 : i0 * dim + line;
        const p1 = rows ? line * dim + i1 : i1 * dim + line;
        const r0 = re[p0], m0 = im[p0], r1 = re[p1], m1 = im[p1];
        re[p0] = a * r0 - ai * m0 + b * r1 - bi * m1;
        im[p0] = a * m0 + ai * r0 + b * m1 + bi * r1;
        re[p1] = c * r0 - ci * m0 + d * r1 - di * m1;
        im[p1] = c * m0 + ci * r0 + d * m1 + di * r1;
      }
    }
  }

  /** rho -> U rho U+ for a (controlled) single-qubit gate. */
  apply1(q: number, m: Mat2, controls: readonly number[] = []): void {
    this.side(q, m, controls, false);
    this.side(q, m, controls, true);
  }

  /** rho -> K rho K+ summed over the Kraus operators (one qubit). */
  kraus(q: number, ks: readonly Mat2[]): void {
    const base = this.clone();
    this.re.fill(0);
    this.im.fill(0);
    for (const k of ks) {
      const t = base.clone();
      t.apply1(q, k);
      for (let i = 0; i < this.re.length; i++) {
        this.re[i] += t.re[i];
        this.im[i] += t.im[i];
      }
    }
  }

  /** Swap two qubits (a permutation of the basis, on both sides). */
  swap(a: number, b: number, controls: readonly number[] = []): void {
    const { dim } = this;
    let cmask = 0;
    for (const c of controls) cmask |= 1 << c;
    const perm = (i: number) => {
      if ((i & cmask) !== cmask) return i;
      const ba = (i >> a) & 1, bb = (i >> b) & 1;
      return ba === bb ? i : i ^ ((1 << a) | (1 << b));
    };
    const re = new Float64Array(this.re.length), im = new Float64Array(this.im.length);
    for (let i = 0; i < dim; i++)
      for (let j = 0; j < dim; j++) {
        re[perm(i) * dim + perm(j)] = this.re[i * dim + j];
        im[perm(i) * dim + perm(j)] = this.im[i * dim + j];
      }
    this.re = re;
    this.im = im;
  }

  /** Project qubit q onto a measured outcome and renormalise (as a recorded measurement does). */
  collapse(q: number, outcome: 0 | 1): void {
    const { dim } = this;
    const bit = 1 << q;
    for (let i = 0; i < dim; i++)
      for (let j = 0; j < dim; j++)
        if (((i & bit) !== 0) !== (outcome === 1) || ((j & bit) !== 0) !== (outcome === 1)) {
          this.re[i * dim + j] = 0;
          this.im[i * dim + j] = 0;
        }
    const t = this.trace();
    if (t > 1e-12) for (let i = 0; i < this.re.length; i++) {
      this.re[i] /= t;
      this.im[i] /= t;
    }
  }

  trace(): number {
    let t = 0;
    for (let i = 0; i < this.dim; i++) t += this.re[i * this.dim + i];
    return t;
  }

  /** tr(rho^2): 1 for a pure state, down to 1/2^n for the fully mixed one. */
  purity(): number {
    let p = 0;
    for (let i = 0; i < this.re.length; i++) p += this.re[i] ** 2 + this.im[i] ** 2;
    return p;
  }

  probabilities(): Float64Array {
    const p = new Float64Array(this.dim);
    for (let i = 0; i < this.dim; i++) p[i] = Math.max(0, this.re[i * this.dim + i]);
    return p;
  }

  /** Bloch vector of qubit q from the reduced state: (<X>, <Y>, <Z>); shorter than 1 when mixed. */
  bloch(q: number): [number, number, number] {
    const { dim } = this;
    const bit = 1 << q;
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < dim; i++) {
      z += (i & bit ? -1 : 1) * this.re[i * dim + i];
      if (i & bit) continue;
      const j = i | bit;
      // rho_{i j} with q = 0 in i and 1 in j
      x += 2 * this.re[i * dim + j];
      y += 2 * this.im[j * dim + i];
    }
    return [x, y, z];
  }

  /** <psi| rho |psi>: how close this (noisy) state is to a pure target state; 1 when they are the same. */
  fidelity(psi: QState): number {
    const { dim } = this;
    let f = 0;
    for (let i = 0; i < dim; i++)
      for (let j = 0; j < dim; j++) {
        // conj(psi_i) rho_ij psi_j, real part
        const ar = psi.re[i], ai = -psi.im[i], br = psi.re[j], bi = psi.im[j];
        const rr = this.re[i * dim + j], ri = this.im[i * dim + j];
        const xr = ar * rr - ai * ri, xi = ar * ri + ai * rr;
        f += xr * br - xi * bi;
      }
    return f;
  }

  /** <Z_0 Z_1 ... > over the given qubits. */
  parity(qubits: readonly number[]): number {
    let mask = 0;
    for (const q of qubits) mask |= 1 << q;
    let e = 0;
    for (let i = 0; i < this.dim; i++) {
      let ones = 0;
      for (let m = i & mask; m; m &= m - 1) ones++;
      e += (ones % 2 ? -1 : 1) * this.re[i * this.dim + i];
    }
    return e;
  }
}

/** The noise of a superconducting chip, per gate. */
export interface DeviceNoise {
  /** Energy relaxation time, microseconds (|1> decays to |0>). */
  t1: number;
  /** Dephasing time, microseconds (T2 <= 2 T1). */
  t2: number;
  /** Depolarizing error per single-qubit gate (two-qubit gates get ten times this). */
  depol: number;
}

export const GATE_NS = { one: 36, two: 280, readout: 1200 };

const mat = (re: [number, number, number, number], im: [number, number, number, number] = [0, 0, 0, 0]): Mat2 => ({ re, im });

/** Amplitude damping (T1) with probability gamma. */
const dampKraus = (g: number): Mat2[] => [mat([1, 0, 0, Math.sqrt(1 - g)]), mat([0, Math.sqrt(g), 0, 0])];
/** Pure dephasing: a Z with probability p. */
const dephaseKraus = (p: number): Mat2[] => [mat([Math.sqrt(1 - p), 0, 0, Math.sqrt(1 - p)]), mat([Math.sqrt(p), 0, 0, -Math.sqrt(p)])];
/** Depolarizing: X, Y or Z, each with probability p/3. */
function depolKraus(p: number): Mat2[] {
  const s = (m: Mat2, k: number): Mat2 => ({ re: m.re.map((v) => v * k) as Mat2['re'], im: m.im.map((v) => v * k) as Mat2['im'] });
  return [mat([Math.sqrt(1 - p), 0, 0, Math.sqrt(1 - p)]), s(X, Math.sqrt(p / 3)), s(Y, Math.sqrt(p / 3)), s(Z, Math.sqrt(p / 3))];
}

/**
 * Let every qubit sit for t nanoseconds: amplitude damping with
 * gamma = 1 - e^(-t/T1), and pure dephasing with 1/T_phi = 1/T2 - 1/(2 T1).
 */
export function idle(rho: Density, tNs: number, noise: DeviceNoise, scale = 1): void {
  const t = (tNs / 1000) * scale;
  const gamma = 1 - Math.exp(-t / noise.t1);
  const invPhi = Math.max(0, 1 / noise.t2 - 1 / (2 * noise.t1));
  const pz = (1 - Math.exp(-t * invPhi)) / 2;
  for (let q = 0; q < rho.n; q++) {
    if (gamma > 0) rho.kraus(q, dampKraus(gamma));
    if (pz > 0) rho.kraus(q, dephaseKraus(pz));
  }
}

function qubitsOf(op: Op): number[] {
  if (op.kind === 'gate') return [...(op.controls ?? []), op.target];
  if (op.kind === 'swap' || op.kind === 'iswap') return [...(op.kind === 'swap' ? op.controls ?? [] : []), op.a, op.b];
  return [op.qubit];
}

/** Apply one op exactly (no noise). Measurements use their recorded outcome. */
export function applyExact(rho: Density, op: Op): void {
  switch (op.kind) {
    case 'gate':
      // a classical condition is checked by runNoisy against the recorded bits
      rho.apply1(op.target, gateMatrix(op.gate, op.params), op.controls ?? []);
      return;
    case 'swap':
      rho.swap(op.a, op.b, op.controls ?? []);
      return;
    case 'iswap': {
      // iSWAP = CZ (S x S) SWAP: the swapped |01>, |10> pick up i; |11> picks up i*i, undone by the CZ
      rho.swap(op.a, op.b);
      const s = gateMatrix('s');
      rho.apply1(op.a, s);
      rho.apply1(op.b, s);
      rho.apply1(op.b, gateMatrix('z'), [op.a]);
      return;
    }
    case 'measure':
      rho.collapse(op.qubit, op.outcome ?? 0);
      return;
    case 'reset':
      rho.collapse(op.qubit, op.outcome ?? 0);
      if ((op.outcome ?? 0) === 1) rho.apply1(op.qubit, gateMatrix('x'));
      return;
  }
}

/**
 * Run a circuit as a noisy chip would: after each op, depolarizing error on
 * the qubits it touched, and every qubit decoheres for the op's duration.
 * `scale` stretches the noise (zero-noise extrapolation runs 1x, 2x, 3x).
 */
export function runNoisy(n: number, ops: readonly Op[], noise: DeviceNoise, scale = 1, bits: number[] = []): Density {
  const rho = new Density(n);
  for (const op of ops) {
    if (op.kind === 'gate' && op.condition && (bits[op.condition.bit] ?? 0) !== op.condition.value) continue;
    applyExact(rho, op);
    if (op.kind === 'measure') bits[op.bit ?? op.qubit] = op.outcome ?? 0;
    const qs = qubitsOf(op);
    const two = qs.length > 1;
    const p = Math.min(0.75, noise.depol * (two ? 10 : 1) * scale);
    if (op.kind !== 'measure' && op.kind !== 'reset' && p > 0) for (const q of qs) rho.kraus(q, depolKraus(p));
    idle(rho, op.kind === 'measure' || op.kind === 'reset' ? GATE_NS.readout : two ? GATE_NS.two : GATE_NS.one, noise, scale);
  }
  return rho;
}

/**
 * Zero-noise extrapolation: measure an observable at noise x1, x2, x3 and fit
 * a parabola back to zero noise (Richardson extrapolation).
 */
export function zne(values: readonly [number, number, number], scales: readonly [number, number, number] = [1, 2, 3]): number {
  const [x0, x1, x2] = scales, [y0, y1, y2] = values;
  // Lagrange interpolation at x = 0
  return (
    (y0 * (0 - x1) * (0 - x2)) / ((x0 - x1) * (x0 - x2)) +
    (y1 * (0 - x0) * (0 - x2)) / ((x1 - x0) * (x1 - x2)) +
    (y2 * (0 - x0) * (0 - x1)) / ((x2 - x0) * (x2 - x1))
  );
}
