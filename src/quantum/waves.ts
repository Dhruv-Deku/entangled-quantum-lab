/**
 * Waves from point sources, the way Huygens and Feynman add them: every
 * source sends out circular waves, and at each point the amplitudes add as
 * complex numbers. Where they arrive in step they reinforce (a bright
 * fringe); half a wavelength out of step they cancel (dark). For a quantum
 * particle with several ways to go, the chance of finding it is |sum|^2.
 *
 * Positions are metres on the desk (x across, z away from you); the
 * amplitude falls off as 1/sqrt(r), as for circular waves on a surface.
 */

export type Source = [number, number];

/** Complex amplitude at (x, z) from the sources, wavenumber k. */
export function amplitude(sources: readonly Source[], x: number, z: number, k: number): [number, number] {
  let re = 0, im = 0;
  for (const [sx, sz] of sources) {
    const r = Math.hypot(x - sx, z - sz);
    const a = 1 / Math.sqrt(r + 0.004);
    re += a * Math.cos(k * r);
    im += a * Math.sin(k * r);
  }
  return [re, im];
}

/** Intensity |amplitude|^2 along a line z = zScreen, at the given x positions. */
export function screenIntensity(sources: readonly Source[], xs: readonly number[], zScreen: number, k: number): number[] {
  return xs.map((x) => {
    const [re, im] = amplitude(sources, x, zScreen, k);
    return re * re + im * im;
  });
}

/** Two sources d apart, a screen L away: bright fringes about lambda L / d apart (far from the sources). */
export const fringeSpacing = (wavelength: number, d: number, L: number) => (wavelength * L) / d;

/** One detection on the screen: an x drawn with probability proportional to the intensity. */
export function detect(xs: readonly number[], intensity: readonly number[], rng: () => number): number {
  const total = intensity.reduce((a, b) => a + b, 0);
  let u = rng() * total;
  for (let i = 0; i < xs.length; i++) {
    u -= intensity[i];
    if (u <= 0) return xs[i];
  }
  return xs[xs.length - 1];
}
