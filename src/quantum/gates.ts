/**
 * Single-qubit gate matrices plus helpers to view any single-qubit gate as a
 * rotation of the Bloch sphere (used to animate gates honestly).
 */

/** 2x2 complex matrix, row-major [m00, m01, m10, m11], split into real and imaginary parts. */
export interface Mat2 {
  re: [number, number, number, number];
  im: [number, number, number, number];
}

export type Vec3 = [number, number, number];

const mat = (
  re: [number, number, number, number],
  im: [number, number, number, number] = [0, 0, 0, 0],
): Mat2 => ({ re, im });

const R2 = Math.SQRT1_2;

export const I: Mat2 = mat([1, 0, 0, 1]);
export const X: Mat2 = mat([0, 1, 1, 0]);
export const Y: Mat2 = mat([0, 0, 0, 0], [0, -1, 1, 0]);
export const Z: Mat2 = mat([1, 0, 0, -1]);
export const H: Mat2 = mat([R2, R2, R2, -R2]);
export const S: Mat2 = mat([1, 0, 0, 0], [0, 0, 0, 1]);
export const Sdg: Mat2 = mat([1, 0, 0, 0], [0, 0, 0, -1]);
export const T: Mat2 = mat([1, 0, 0, R2], [0, 0, 0, R2]);
export const Tdg: Mat2 = mat([1, 0, 0, R2], [0, 0, 0, -R2]);
/** Square root of X: (1/2)[[1+i, 1-i], [1-i, 1+i]]. */
export const SX: Mat2 = mat([0.5, 0.5, 0.5, 0.5], [0.5, -0.5, -0.5, 0.5]);
/** SX dagger: the square root of X turned the other way. */
export const SXdg: Mat2 = mat([0.5, 0.5, 0.5, 0.5], [-0.5, 0.5, 0.5, -0.5]);

export function Rx(theta: number): Mat2 {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  return mat([c, 0, 0, c], [0, -s, -s, 0]);
}

export function Ry(theta: number): Mat2 {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  return mat([c, -s, s, c]);
}

export function Rz(theta: number): Mat2 {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  return mat([c, 0, 0, c], [-s, 0, 0, s]);
}

/** Phase gate diag(1, e^{i phi}). */
export function P(phi: number): Mat2 {
  return mat([1, 0, 0, Math.cos(phi)], [0, 0, 0, Math.sin(phi)]);
}

/** General single-qubit gate, same convention as Qiskit's UGate. */
export function U(theta: number, phi: number, lambda: number): Mat2 {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  return mat(
    [c, -Math.cos(lambda) * s, Math.cos(phi) * s, Math.cos(phi + lambda) * c],
    [0, -Math.sin(lambda) * s, Math.sin(phi) * s, Math.sin(phi + lambda) * c],
  );
}

export type GateName =
  | 'x' | 'y' | 'z' | 'h' | 's' | 'sdg' | 't' | 'tdg' | 'sx' | 'sxdg'
  | 'rx' | 'ry' | 'rz' | 'p' | 'u';

export interface GateDef {
  /** Number of angle parameters the gate takes. */
  params: number;
  matrix: (p: readonly number[]) => Mat2;
}

/** Data-driven gate table: adding a gate is one entry here. */
export const GATES: Record<GateName, GateDef> = {
  x: { params: 0, matrix: () => X },
  y: { params: 0, matrix: () => Y },
  z: { params: 0, matrix: () => Z },
  h: { params: 0, matrix: () => H },
  s: { params: 0, matrix: () => S },
  sdg: { params: 0, matrix: () => Sdg },
  t: { params: 0, matrix: () => T },
  tdg: { params: 0, matrix: () => Tdg },
  sx: { params: 0, matrix: () => SX },
  sxdg: { params: 0, matrix: () => SXdg },
  rx: { params: 1, matrix: (p) => Rx(p[0]) },
  ry: { params: 1, matrix: (p) => Ry(p[0]) },
  rz: { params: 1, matrix: (p) => Rz(p[0]) },
  p: { params: 1, matrix: (p) => P(p[0]) },
  u: { params: 3, matrix: (p) => U(p[0], p[1], p[2]) },
};

export function gateMatrix(name: GateName, params: readonly number[] = []): Mat2 {
  const def = GATES[name];
  if (params.length !== def.params) {
    throw new Error(`gate ${name} takes ${def.params} parameter(s), got ${params.length}`);
  }
  return def.matrix(params);
}

export function multiply(a: Mat2, b: Mat2): Mat2 {
  const re: [number, number, number, number] = [0, 0, 0, 0];
  const im: [number, number, number, number] = [0, 0, 0, 0];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      for (let k = 0; k < 2; k++) {
        const ar = a.re[r * 2 + k], ai = a.im[r * 2 + k];
        const br = b.re[k * 2 + c], bi = b.im[k * 2 + c];
        re[r * 2 + c] += ar * br - ai * bi;
        im[r * 2 + c] += ar * bi + ai * br;
      }
    }
  }
  return { re, im };
}

/**
 * Split U = e^{i alpha} * R_n(theta) with theta in [0, pi] where possible.
 * R_n(theta) = cos(theta/2) I - i sin(theta/2) (n . sigma).
 */
export function decompose(u: Mat2): { phase: number; axis: Vec3; angle: number } {
  // det(U) = m00 m11 - m01 m10
  const detRe = u.re[0] * u.re[3] - u.im[0] * u.im[3] - (u.re[1] * u.re[2] - u.im[1] * u.im[2]);
  const detIm = u.re[0] * u.im[3] + u.im[0] * u.re[3] - (u.re[1] * u.im[2] + u.im[1] * u.re[2]);
  let alpha = Math.atan2(detIm, detRe) / 2; // e^{i alpha} = sqrt(det)
  let cr = Math.cos(-alpha), ci = Math.sin(-alpha);
  // V = U e^{-i alpha} is in SU(2)
  const v = (k: number): [number, number] => [u.re[k] * cr - u.im[k] * ci, u.re[k] * ci + u.im[k] * cr];
  let v00 = v(0), v01 = v(1), v11 = v(3);
  let cosHalf = (v00[0] + v11[0]) / 2;
  if (cosHalf < 0) {
    // flip the sign of V (a global phase of pi) so the rotation angle is at most pi
    alpha += Math.PI;
    v00 = [-v00[0], -v00[1]];
    v01 = [-v01[0], -v01[1]];
    cosHalf = -cosHalf;
  }
  const angle = 2 * Math.acos(Math.min(1, cosHalf));
  const s = Math.sin(angle / 2);
  if (s < 1e-12) return { phase: alpha, axis: [0, 0, 1], angle: 0 };
  const axis: Vec3 = [-v01[1] / s, -v01[0] / s, -v00[1] / s];
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  return { phase: alpha, axis: [axis[0] / len, axis[1] / len, axis[2] / len], angle };
}

/** Rotation about a unit axis: cos(theta/2) I - i sin(theta/2) (n . sigma). */
export function rotation(axis: Vec3, theta: number): Mat2 {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  const [nx, ny, nz] = axis;
  return mat([c, -s * ny, s * ny, c], [-s * nz, -s * nx, -s * nx, s * nz]);
}

/**
 * U^t along the same rotation axis: e^{i alpha t} R_n(theta t).
 * fractional(U, 0) = I and fractional(U, 1) = U. Used to animate gates, including
 * the control in controlled gates (where U's phase is physical).
 */
export function fractional(u: Mat2, t: number): Mat2 {
  const { phase, axis, angle } = decompose(u);
  const r = rotation(axis, angle * t);
  const pr = Math.cos(phase * t), pi = Math.sin(phase * t);
  const re = r.re.map((x, k) => x * pr - r.im[k] * pi) as Mat2['re'];
  const im = r.re.map((x, k) => x * pi + r.im[k] * pr) as Mat2['im'];
  return { re, im };
}
