import { blochLength } from './bloch';
import type { QState } from './state';

/**
 * Entanglement measures that drive the visuals.
 *
 * - pairStrength(a, b): entanglement between two specific qubits, from the
 *   negativity of their two-qubit reduced state (exact separability test for
 *   two qubits). 0 = not entangled, 1 = a Bell pair. Draws the gold thread.
 * - mixedness(q): how much qubit q is entangled with everything else
 *   (1 - |r|^2). Catches GHZ-style entanglement that no single pair shows.
 */

/** Reduced 4x4 density matrix of qubits (a, b); local index = bit_a + 2 * bit_b. */
export function reducedDensityPair(s: QState, a: number, b: number): { re: Float64Array; im: Float64Array } {
  if (a === b) throw new Error('need two different qubits');
  const ma = 1 << a, mb = 1 << b;
  const re = new Float64Array(16), im = new Float64Array(16);
  for (let i = 0; i < s.dim; i++) {
    if (i & ma || i & mb) continue; // i enumerates the rest of the register
    const idx = [i, i | ma, i | mb, i | ma | mb];
    for (let r = 0; r < 4; r++) {
      const xr = s.re[idx[r]], xi = s.im[idx[r]];
      for (let c = 0; c < 4; c++) {
        const yr = s.re[idx[c]], yi = s.im[idx[c]];
        // rho[r][c] += x * conj(y)
        re[r * 4 + c] += xr * yr + xi * yi;
        im[r * 4 + c] += xi * yr - xr * yi;
      }
    }
  }
  return { re, im };
}

/** Eigenvalues of a real symmetric n x n matrix (cyclic Jacobi). Input is copied. */
export function symmetricEigenvalues(n: number, input: Float64Array): number[] {
  const a = Float64Array.from(input);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p], akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k], aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
      }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(a[i * n + i]);
  return out.sort((x, y) => x - y);
}

/** Eigenvalues of a complex Hermitian matrix via the real embedding [[A, -B], [B, A]]. */
export function hermitianEigenvalues(n: number, re: Float64Array, im: Float64Array): number[] {
  const m = 2 * n;
  const big = new Float64Array(m * m);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      big[r * m + c] = re[r * n + c];
      big[(r + n) * m + c + n] = re[r * n + c];
      big[r * m + c + n] = -im[r * n + c];
      big[(r + n) * m + c] = im[r * n + c];
    }
  }
  // every eigenvalue appears twice in the embedding
  return symmetricEigenvalues(m, big).filter((_, i) => i % 2 === 0);
}

/** Negativity of the pair (a, b): sum of |negative eigenvalues| of the partial transpose. */
export function negativity(s: QState, a: number, b: number): number {
  const rho = reducedDensityPair(s, a, b);
  // partial transpose on qubit b: swap the b bits of row and column
  const re = new Float64Array(16), im = new Float64Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const r2 = (r & 1) | (c & 2), c2 = (c & 1) | (r & 2);
      re[r2 * 4 + c2] = rho.re[r * 4 + c];
      im[r2 * 4 + c2] = rho.im[r * 4 + c];
    }
  }
  let neg = 0;
  for (const ev of hermitianEigenvalues(4, re, im)) if (ev < 0) neg -= ev;
  return neg;
}

/** 0 (separable) to 1 (Bell pair). */
export function pairStrength(s: QState, a: number, b: number): number {
  const v = 2 * negativity(s, a, b);
  return v < 1e-9 ? 0 : Math.min(1, v);
}

/** 1 - |r|^2: 0 for a qubit with its own pure state, 1 when maximally entangled with the rest. */
export function mixedness(s: QState, q: number): number {
  const len = blochLength(s, q);
  return Math.max(0, Math.min(1, 1 - len * len));
}
