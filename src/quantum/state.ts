import type { Mat2 } from './gates';

/**
 * Statevector simulator.
 *
 * Qubit order is little-endian, the same as Qiskit: qubit k is bit k of the
 * basis index, so |q2 q1 q0> has index q0 + 2*q1 + 4*q2.
 */

export const MAX_QUBITS = 10;

export class QState {
  readonly n: number;
  readonly dim: number;
  readonly re: Float64Array;
  readonly im: Float64Array;

  /** n qubits, all |0>. */
  constructor(n: number) {
    if (!Number.isInteger(n) || n < 1 || n > MAX_QUBITS) {
      throw new Error(`qubit count must be 1..${MAX_QUBITS}, got ${n}`);
    }
    this.n = n;
    this.dim = 1 << n;
    this.re = new Float64Array(this.dim);
    this.im = new Float64Array(this.dim);
    this.re[0] = 1;
  }

  static fromAmplitudes(re: readonly number[], im: readonly number[] = []): QState {
    const n = Math.log2(re.length);
    if (!Number.isInteger(n)) throw new Error('amplitude count must be a power of two');
    const s = new QState(n);
    for (let i = 0; i < s.dim; i++) {
      s.re[i] = re[i];
      s.im[i] = im[i] ?? 0;
    }
    s.normalize();
    return s;
  }

  clone(): QState {
    const s = new QState(this.n);
    s.re.set(this.re);
    s.im.set(this.im);
    return s;
  }

  copyFrom(other: QState): void {
    if (other.n !== this.n) throw new Error('qubit count mismatch');
    this.re.set(other.re);
    this.im.set(other.im);
  }

  /** Reset every qubit to |0>. */
  reset(): void {
    this.re.fill(0);
    this.im.fill(0);
    this.re[0] = 1;
  }

  private checkQubit(q: number): void {
    if (!Number.isInteger(q) || q < 0 || q >= this.n) throw new Error(`qubit ${q} out of range`);
  }

  private controlMask(controls: readonly number[], ...targets: number[]): number {
    let mask = 0;
    for (const c of controls) {
      this.checkQubit(c);
      if (targets.includes(c)) throw new Error(`qubit ${c} cannot be both control and target`);
      mask |= 1 << c;
    }
    return mask;
  }

  /** Apply a single-qubit gate to qubit q, optionally controlled on all of `controls` being 1. */
  apply1(q: number, u: Mat2, controls: readonly number[] = []): void {
    this.checkQubit(q);
    const cmask = this.controlMask(controls, q);
    const bit = 1 << q;
    const { re, im } = this;
    const [ar, br, cr, dr] = u.re;
    const [ai, bi, ci, di] = u.im;
    for (let i = 0; i < this.dim; i++) {
      if (i & bit || (i & cmask) !== cmask) continue;
      const j = i | bit;
      const xr = re[i], xi = im[i], yr = re[j], yi = im[j];
      re[i] = ar * xr - ai * xi + br * yr - bi * yi;
      im[i] = ar * xi + ai * xr + br * yi + bi * yr;
      re[j] = cr * xr - ci * xi + dr * yr - di * yi;
      im[j] = cr * xi + ci * xr + dr * yi + di * yr;
    }
  }

  /** Exchange qubits a and b (Fredkin when controlled). */
  swap(a: number, b: number, controls: readonly number[] = []): void {
    this.checkQubit(a);
    this.checkQubit(b);
    if (a === b) return;
    const cmask = this.controlMask(controls, a, b);
    const ma = 1 << a, mb = 1 << b;
    for (let i = 0; i < this.dim; i++) {
      if (!(i & ma) || i & mb || (i & cmask) !== cmask) continue;
      const j = (i & ~ma) | mb;
      let t = this.re[i]; this.re[i] = this.re[j]; this.re[j] = t;
      t = this.im[i]; this.im[i] = this.im[j]; this.im[j] = t;
    }
  }

  /** iSWAP: |01> -> i|10>, |10> -> i|01>. */
  iswap(a: number, b: number): void {
    this.checkQubit(a);
    this.checkQubit(b);
    if (a === b) throw new Error('iswap needs two different qubits');
    const ma = 1 << a, mb = 1 << b;
    for (let i = 0; i < this.dim; i++) {
      if (!(i & ma) || i & mb) continue;
      const j = (i & ~ma) | mb;
      const xr = this.re[i], xi = this.im[i], yr = this.re[j], yi = this.im[j];
      // new_i = i * old_j, new_j = i * old_i
      this.re[i] = -yi; this.im[i] = yr;
      this.re[j] = -xi; this.im[j] = xr;
    }
  }

  probabilities(): Float64Array {
    const p = new Float64Array(this.dim);
    for (let i = 0; i < this.dim; i++) p[i] = this.re[i] * this.re[i] + this.im[i] * this.im[i];
    return p;
  }

  /** Probability that qubit q reads 1. */
  prob1(q: number): number {
    this.checkQubit(q);
    const bit = 1 << q;
    let p = 0;
    for (let i = 0; i < this.dim; i++) {
      if (i & bit) p += this.re[i] * this.re[i] + this.im[i] * this.im[i];
    }
    return p;
  }

  norm2(): number {
    let s = 0;
    for (let i = 0; i < this.dim; i++) s += this.re[i] * this.re[i] + this.im[i] * this.im[i];
    return s;
  }

  normalize(): void {
    const n = Math.sqrt(this.norm2());
    if (n < 1e-300) throw new Error('cannot normalize the zero vector');
    for (let i = 0; i < this.dim; i++) {
      this.re[i] /= n;
      this.im[i] /= n;
    }
  }

  /** |<this|other>|^2 */
  fidelity(other: QState): number {
    if (other.n !== this.n) throw new Error('qubit count mismatch');
    let r = 0, i = 0;
    for (let k = 0; k < this.dim; k++) {
      // conj(this) * other
      r += this.re[k] * other.re[k] + this.im[k] * other.im[k];
      i += this.re[k] * other.im[k] - this.im[k] * other.re[k];
    }
    return r * r + i * i;
  }
}
