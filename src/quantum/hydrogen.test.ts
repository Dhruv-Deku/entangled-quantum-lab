import { describe, expect, it } from 'vitest';
import { angular, extent, meanRadius, ORBITALS, psi, radial, sampleOrbital } from './hydrogen';
import { mulberry32 } from './measure';

const integrate = (f: (r: number) => number, a: number, b: number, steps = 20000) => {
  const h = (b - a) / steps;
  let s = 0;
  for (let i = 0; i < steps; i++) s += f(a + (i + 0.5) * h);
  return s * h;
};

describe('hydrogen', () => {
  it('radial functions are normalised and have the textbook mean radius', () => {
    for (const o of ORBITALS) {
      const R2 = (r: number) => r * r * radial(o.n, o.l, r) ** 2;
      expect(integrate(R2, 0, extent(o.n) * 3)).toBeCloseTo(1, 6);
      expect(integrate((r) => r * R2(r), 0, extent(o.n) * 3)).toBeCloseTo(meanRadius(o.n, o.l), 4);
    }
    // 1s by hand: R = 2 e^-r
    expect(radial(1, 0, 0.7)).toBeCloseTo(2 * Math.exp(-0.7), 12);
  });

  it('angular parts are normalised over the sphere', () => {
    for (const o of ORBITALS) {
      // midpoint rule in (cos theta, phi)
      const M = 300;
      let s = 0;
      for (let i = 0; i < M; i++)
        for (let j = 0; j < M; j++) {
          const z = -1 + ((i + 0.5) * 2) / M;
          const a = ((j + 0.5) * 2 * Math.PI) / M;
          const q = Math.sqrt(1 - z * z);
          s += angular(o.id, q * Math.cos(a), q * Math.sin(a), z) ** 2;
        }
      expect(s * (2 / M) * ((2 * Math.PI) / M)).toBeCloseTo(1, 3);
    }
  });

  it('nodes are where they should be', () => {
    const p = ORBITALS.find((o) => o.id === '2p')!;
    expect(psi(p, 1, 0.5, 0)).toBe(0); // the xy plane
    expect(Math.sign(psi(p, 0, 0, 1))).toBe(-Math.sign(psi(p, 0, 0, -1)));
    // 2s changes sign at r = 2
    expect(radial(2, 0, 1.9) * radial(2, 0, 2.1)).toBeLessThan(0);
  });

  it('sampled electrons sit at the right mean distance with the right signs', () => {
    for (const id of ['1s', '2p', '3dz2'] as const) {
      const o = ORBITALS.find((x) => x.id === id)!;
      const { pos, sign } = sampleOrbital(o, 20000, mulberry32(5));
      let mean = 0;
      for (let i = 0; i < 20000; i++) mean += Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      mean /= 20000;
      expect(Math.abs(mean - meanRadius(o.n, o.l)) / meanRadius(o.n, o.l)).toBeLessThan(0.03);
      for (let i = 0; i < 200; i++) expect(sign[i]).toBe(psi(o, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) >= 0 ? 1 : -1);
    }
  });
});
