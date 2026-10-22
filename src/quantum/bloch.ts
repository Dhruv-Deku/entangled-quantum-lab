import type { Vec3 } from './gates';
import type { QState } from './state';

/** 2x2 density matrix, row-major [r00, r01, r10, r11]. */
export interface Density2 {
  re: [number, number, number, number];
  im: [number, number, number, number];
}

/** Reduced density matrix of one qubit (all other qubits traced out). */
export function reducedDensity(s: QState, q: number): Density2 {
  const bit = 1 << q;
  let p0 = 0, p1 = 0, cr = 0, ci = 0;
  for (let i = 0; i < s.dim; i++) {
    if (i & bit) continue;
    const j = i | bit;
    const ar = s.re[i], ai = s.im[i], br = s.re[j], bi = s.im[j];
    p0 += ar * ar + ai * ai;
    p1 += br * br + bi * bi;
    // r01 += a * conj(b)
    cr += ar * br + ai * bi;
    ci += ai * br - ar * bi;
  }
  return { re: [p0, cr, cr, p1], im: [0, ci, -ci, 0] };
}

/**
 * Bloch vector (x, y, z) from rho = (I + xX + yY + zZ) / 2.
 * Length 1 for a pure qubit, shorter when the qubit is entangled with others.
 */
export function blochVector(s: QState, q: number): Vec3 {
  const r = reducedDensity(s, q);
  return [2 * r.re[1], -2 * r.im[1], r.re[0] - r.re[3]];
}

export function blochLength(s: QState, q: number): number {
  const [x, y, z] = blochVector(s, q);
  return Math.hypot(x, y, z);
}
