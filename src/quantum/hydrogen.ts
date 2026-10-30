/**
 * The hydrogen atom, exactly: psi_nlm(r, theta, phi) = R_nl(r) Y_lm(theta, phi)
 * with lengths in Bohr radii. R_nl from the associated Laguerre polynomials;
 * Y as the real spherical harmonics chemists draw (so lobes have a sign, not a
 * complex phase). Sampling draws electron positions with probability
 * |psi|^2: the radius from the radial distribution r^2 R^2 by its inverse
 * cumulative table, the direction by rejection from |Y|^2.
 */

export type OrbitalId = '1s' | '2s' | '2p' | '3s' | '3p' | '3dz2' | '3dxy' | '4fz3' | '4fxyz';

export interface Orbital {
  id: OrbitalId;
  name: string;
  n: number;
  l: number;
  /** One line on what to notice. */
  note: string;
}

export const ORBITALS: Orbital[] = [
  { id: '1s', name: '1s', n: 1, l: 0, note: 'The ground state: a round cloud, densest at the nucleus. Where the electron is, nobody knows until you look.' },
  { id: '2s', name: '2s', n: 2, l: 0, note: 'Round again, with a shell inside a shell: between them a node, a sphere where the electron is never found.' },
  { id: '2p', name: '2p', n: 2, l: 1, note: 'Two lobes of opposite sign, and a plane through the nucleus where the electron is never found.' },
  { id: '3s', name: '3s', n: 3, l: 0, note: 'Three nested shells and two spherical nodes. Higher energy, a bigger atom.' },
  { id: '3p', name: '3p', n: 3, l: 1, note: 'Lobes with a shell inside each: a planar node and a spherical one.' },
  { id: '3dz2', name: '3d z2', n: 3, l: 2, note: 'Two lobes and a ring around the middle: the shape behind the colours of copper and iron salts.' },
  { id: '3dxy', name: '3d xy', n: 3, l: 2, note: 'Four lobes like a clover, signs alternating around the circle.' },
  { id: '4fz3', name: '4f z3', n: 4, l: 3, note: 'Two lobes and two rings: f orbitals hold the rare earths magnets and lasers are made from.' },
  { id: '4fxyz', name: '4f xyz', n: 4, l: 3, note: 'Eight lobes at the corners of a cube, signs alternating like a checkerboard.' },
];

/** Generalised Laguerre polynomial L_k^a(x) by its recurrence. */
export function laguerre(k: number, a: number, x: number): number {
  if (k === 0) return 1;
  let prev = 1;
  let cur = 1 + a - x;
  for (let i = 1; i < k; i++) {
    const next = ((2 * i + 1 + a - x) * cur - (i + a) * prev) / (i + 1);
    prev = cur;
    cur = next;
  }
  return cur;
}

const factorial = (k: number) => {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return f;
};

/** The radial wavefunction R_nl(r), r in Bohr radii, normalised so the integral of r^2 R^2 is 1. */
export function radial(n: number, l: number, r: number): number {
  const rho = (2 * r) / n;
  const norm = Math.sqrt((2 / n) ** 3 * (factorial(n - l - 1) / (2 * n * factorial(n + l))));
  return norm * Math.exp(-rho / 2) * rho ** l * laguerre(n - l - 1, 2 * l + 1, rho);
}

/** The real spherical harmonic for each orbital's shape, in terms of the unit direction (x, y, z). */
export function angular(id: OrbitalId, x: number, y: number, z: number): number {
  const PI = Math.PI;
  switch (id) {
    case '1s':
    case '2s':
    case '3s':
      return 0.5 / Math.sqrt(PI);
    case '2p':
    case '3p':
      return Math.sqrt(3 / (4 * PI)) * z;
    case '3dz2':
      return Math.sqrt(5 / (16 * PI)) * (3 * z * z - 1);
    case '3dxy':
      return Math.sqrt(15 / (4 * PI)) * x * y;
    case '4fz3':
      return Math.sqrt(7 / (16 * PI)) * (5 * z * z * z - 3 * z);
    case '4fxyz':
      return Math.sqrt(105 / (4 * PI)) * x * y * z;
  }
}

/** The wavefunction at (x, y, z), in Bohr radii. */
export function psi(o: Orbital, x: number, y: number, z: number): number {
  const r = Math.hypot(x, y, z);
  if (r < 1e-12) return o.l === 0 ? radial(o.n, 0, 0) * angular(o.id, 0, 0, 1) : 0;
  return radial(o.n, o.l, r) * angular(o.id, x / r, y / r, z / r);
}

/** The mean distance of the electron from the nucleus: (3n^2 - l(l+1)) / 2 Bohr radii. */
export const meanRadius = (n: number, l: number) => (3 * n * n - l * (l + 1)) / 2;

/** How far out to sample: past nearly all of the probability. */
export const extent = (n: number) => 4 * n * n + 6;

/** The radial distribution r^2 R^2 on a grid, for the board. */
export function radialCurve(n: number, l: number, points = 200): [number, number][] {
  const rmax = extent(n);
  return Array.from({ length: points }, (_, i) => {
    const r = (i / (points - 1)) * rmax;
    const R = radial(n, l, r);
    return [r, r * r * R * R];
  });
}

/** `count` electron positions drawn from |psi|^2, each with the sign of psi there. */
export function sampleOrbital(o: Orbital, count: number, rng: () => number): { pos: Float32Array; sign: Int8Array } {
  // the radius: invert the cumulative radial distribution
  const N = 2048;
  const rmax = extent(o.n);
  const cdf = new Float64Array(N);
  let acc = 0;
  for (let i = 0; i < N; i++) {
    const r = ((i + 0.5) / N) * rmax;
    const R = radial(o.n, o.l, r);
    acc += r * r * R * R;
    cdf[i] = acc;
  }
  // the direction: rejection from |Y|^2, bounded by its largest value
  let ymax = 0;
  for (let i = 0; i < 4000; i++) {
    const [x, y, z] = randomDirection(rng);
    ymax = Math.max(ymax, angular(o.id, x, y, z) ** 2);
  }
  ymax *= 1.05;
  const pos = new Float32Array(count * 3);
  const sign = new Int8Array(count);
  for (let s = 0; s < count; s++) {
    const u = rng() * acc;
    let lo = 0, hi = N - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    const r = ((lo + rng()) / N) * rmax;
    let x = 0, y = 0, z = 1;
    for (let tries = 0; tries < 200; tries++) {
      [x, y, z] = randomDirection(rng);
      if (rng() * ymax <= angular(o.id, x, y, z) ** 2) break;
    }
    pos[s * 3] = x * r;
    pos[s * 3 + 1] = y * r;
    pos[s * 3 + 2] = z * r;
    sign[s] = psi(o, x * r, y * r, z * r) >= 0 ? 1 : -1;
  }
  return { pos, sign };
}

function randomDirection(rng: () => number): [number, number, number] {
  const z = 2 * rng() - 1;
  const a = 2 * Math.PI * rng();
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(a), s * Math.sin(a), z];
}
