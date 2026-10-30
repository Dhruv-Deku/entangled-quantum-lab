/**
 * Quantum tunnelling, solved: a wave packet in one dimension meets a wall it
 * does not have the energy to climb, and part of it comes out the other side.
 * The Schrodinger equation is integrated by the split-step Fourier method
 * (half a step of potential, a full step of kinetic energy in momentum
 * space, half a step of potential), which is exact for free motion and keeps
 * the total probability at 1. Units: hbar = m = 1, the wall 1 high.
 *
 * The same physics lets electrons cross the thin oxide of a flash-memory
 * cell, and is the heart of every superconducting qubit's Josephson junction.
 */

/** In-place iterative radix-2 FFT; `inverse` includes the 1/N. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] /= n;
  }
}

/** The wall's height. */
export const V0 = 1;
/** Grid: 2048 points, 1/8 apart, from -128 to 128 (a wall of width 1 is exactly 8 points). */
export const GRID = 2048;
export const DX = 0.125;
export const X0 = -GRID * DX / 2;
/** The packet starts here, this wide. */
export const START = -40;
export const SIGMA = 8;
export const DT = 0.1;

/** Transmission of a plane wave of energy e through a square wall (height V0, width a). */
export function wallT(e: number, a: number): number {
  if (e <= 0) return 0;
  if (Math.abs(e - V0) < 1e-9) return 1 / (1 + (V0 * a * a) / 2);
  if (e < V0) {
    const k = Math.sqrt(2 * (V0 - e));
    return 1 / (1 + (V0 * V0 * Math.sinh(k * a) ** 2) / (4 * e * (V0 - e)));
  }
  const k = Math.sqrt(2 * (e - V0));
  return 1 / (1 + (V0 * V0 * Math.sin(k * a) ** 2) / (4 * e * (e - V0)));
}

/** The packet's expected transmission: the plane-wave answer averaged over its momenta. */
export function packetT(e: number, a: number, sigma = SIGMA): number {
  const k0 = Math.sqrt(2 * e);
  const sk = 1 / (2 * sigma);
  let s = 0, w = 0;
  for (let i = -400; i <= 400; i++) {
    const k = k0 + (i / 100) * sk;
    if (k <= 0) continue;
    const g = Math.exp(-((k - k0) ** 2) / (2 * sk * sk));
    s += g * wallT((k * k) / 2, a);
    w += g;
  }
  return s / w;
}

/** A packet in flight: energy e (the wall is 1), wall width a starting at x = 0. */
export class Packet {
  readonly re = new Float64Array(GRID);
  readonly im = new Float64Array(GRID);
  private readonly halfV: { c: Float64Array; s: Float64Array };
  private readonly kin: { c: Float64Array; s: Float64Array };
  readonly wall: Float64Array;
  time = 0;

  constructor(readonly energy: number, readonly width: number) {
    const k0 = Math.sqrt(2 * energy);
    let norm = 0;
    this.wall = new Float64Array(GRID);
    for (let i = 0; i < GRID; i++) {
      const x = X0 + i * DX;
      const g = Math.exp(-((x - START) ** 2) / (4 * SIGMA * SIGMA));
      this.re[i] = g * Math.cos(k0 * x);
      this.im[i] = g * Math.sin(k0 * x);
      norm += g * g * DX;
      this.wall[i] = x >= -1e-9 && x < width - 1e-9 ? V0 : 0;
    }
    const s = 1 / Math.sqrt(norm);
    for (let i = 0; i < GRID; i++) {
      this.re[i] *= s;
      this.im[i] *= s;
    }
    const phase = (n: number, f: (i: number) => number) => {
      const c = new Float64Array(n), sn = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        c[i] = Math.cos(f(i));
        sn[i] = Math.sin(f(i));
      }
      return { c, s: sn };
    };
    this.halfV = phase(GRID, (i) => (-this.wall[i] * DT) / 2);
    const dk = (2 * Math.PI) / (GRID * DX);
    this.kin = phase(GRID, (i) => {
      const k = (i < GRID / 2 ? i : i - GRID) * dk;
      return (-k * k * DT) / 2;
    });
  }

  private rotate(p: { c: Float64Array; s: Float64Array }): void {
    for (let i = 0; i < GRID; i++) {
      const r = this.re[i], m = this.im[i];
      this.re[i] = r * p.c[i] - m * p.s[i];
      this.im[i] = r * p.s[i] + m * p.c[i];
    }
  }

  step(n = 1): void {
    for (let k = 0; k < n; k++) {
      this.rotate(this.halfV);
      fft(this.re, this.im);
      this.rotate(this.kin);
      fft(this.re, this.im, true);
      this.rotate(this.halfV);
      this.time += DT;
    }
  }

  /** Probability beyond the wall, before it, and in all. */
  parts(): { through: number; back: number; total: number } {
    let through = 0, back = 0;
    for (let i = 0; i < GRID; i++) {
      const p = (this.re[i] ** 2 + this.im[i] ** 2) * DX;
      const x = X0 + i * DX;
      if (x >= this.width) through += p;
      else if (x < 0) back += p;
    }
    return { through, back, total: through + back + this.inside() };
  }

  private inside(): number {
    let s = 0;
    for (let i = 0; i < GRID; i++) if (this.wall[i]) s += (this.re[i] ** 2 + this.im[i] ** 2) * DX;
    return s;
  }

  /** Long enough for the two parts to have separated, before either wraps round the box. */
  get done(): boolean {
    const v = Math.sqrt(2 * this.energy);
    return this.time >= (-START + 3 * SIGMA + this.width) / v + 25;
  }
}
