/**
 * A particle in a box: an electron trapped between two walls a distance L
 * apart can only hold the standing waves that fit, psi_n = sqrt(2/L)
 * sin(n pi x / L), with energies E_n = n^2 h^2 / (8 m L^2). Squeeze the box
 * and every level climbs as 1/L^2. When the electron drops from level n to a
 * lower one it gives out a photon with exactly the difference: a smaller box
 * shines bluer. This is how quantum dots in QLED screens pick their colour,
 * by their size alone.
 */

const H = 6.62607015e-34;
const M_E = 9.1093837e-31;
const C = 299792458;
const EV = 1.602176634e-19;

/** Energy of level n in a box L nanometres wide, in electronvolts. */
export const levelEv = (n: number, lNm: number) => (n * n * H * H) / (8 * M_E * (lNm * 1e-9) ** 2) / EV;

/** The photon given out dropping from level `from` to level `to` (nanometres of wavelength). */
export const photonNm = (from: number, to: number, lNm: number) => (H * C) / ((levelEv(from, lNm) - levelEv(to, lNm)) * EV) * 1e9;

/** The standing wave of level n at x (0..L), in units where L is 1. */
export const standing = (n: number, x: number) => Math.SQRT2 * Math.sin(n * Math.PI * x);

/** Your hands to the box: 8 cm apart is 0.45 nm, 40 cm is 1 nm, so a squeeze sweeps the light across the rainbow. */
export function handsToNm(metres: number): number {
  const t = Math.max(0, Math.min(1, (metres - 0.08) / (0.4 - 0.08)));
  return 0.45 + t * (1.0 - 0.45);
}

/** The colour of light of this wavelength (sRGB 0..1), or null when the eye cannot see it. */
export function spectrumRgb(nm: number): [number, number, number] | null {
  if (nm < 380 || nm > 750) return null;
  let r = 0, g = 0, b = 0;
  if (nm < 440) {
    r = -(nm - 440) / 60;
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / 50;
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = -(nm - 510) / 20;
  } else if (nm < 580) {
    r = (nm - 510) / 70;
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = -(nm - 645) / 65;
  } else r = 1;
  // dimmer toward the ends of what the eye sees
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (750 - nm)) / 50 : 1;
  return [r * f, g * f, b * f];
}

/** A plain name for a wavelength. */
export function lightName(nm: number): string {
  if (nm < 380) return 'ultraviolet (invisible)';
  if (nm < 450) return 'violet';
  if (nm < 495) return 'blue';
  if (nm < 570) return 'green';
  if (nm < 590) return 'yellow';
  if (nm < 620) return 'orange';
  if (nm <= 750) return 'red';
  return 'infrared (invisible)';
}
