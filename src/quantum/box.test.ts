import { describe, expect, it } from 'vitest';
import { handsToNm, levelEv, lightName, photonNm, spectrumRgb, standing } from './box';

describe('particle in a box', () => {
  it('standing waves are normalised and vanish at the walls', () => {
    for (const n of [1, 2, 3, 4]) {
      let s = 0;
      const N = 20000;
      for (let i = 0; i < N; i++) s += standing(n, (i + 0.5) / N) ** 2 / N;
      expect(s).toBeCloseTo(1, 6);
      expect(standing(n, 0)).toBeCloseTo(0, 12);
      expect(standing(n, 1)).toBeCloseTo(0, 12);
    }
  });

  it('levels go as n^2 / L^2, with the textbook ground state', () => {
    // an electron in a 1 nm box: 0.376 eV
    expect(levelEv(1, 1)).toBeCloseTo(0.376, 3);
    expect(levelEv(3, 1) / levelEv(1, 1)).toBeCloseTo(9, 9);
    expect(levelEv(1, 0.5) / levelEv(1, 1)).toBeCloseTo(4, 9);
  });

  it('a smaller box gives bluer light', () => {
    // 2 -> 1 in a 0.7 nm box: green, about 539 nm
    expect(photonNm(2, 1, 0.7)).toBeCloseTo(539, 0);
    expect(photonNm(2, 1, 0.6)).toBeLessThan(photonNm(2, 1, 0.7));
    expect(lightName(photonNm(2, 1, 0.7))).toBe('green');
    expect(lightName(photonNm(2, 1, 1.0))).toBe('infrared (invisible)');
    expect(lightName(photonNm(2, 1, 0.45))).toBe('ultraviolet (invisible)');
  });

  it('hands map across the rainbow, and colours look right', () => {
    expect(handsToNm(0.05)).toBe(0.45);
    expect(handsToNm(0.5)).toBe(1);
    expect(handsToNm(0.24)).toBeGreaterThan(handsToNm(0.12));
    expect(spectrumRgb(300)).toBeNull();
    expect(spectrumRgb(800)).toBeNull();
    const red = spectrumRgb(650)!, blue = spectrumRgb(460)!, green = spectrumRgb(530)!;
    expect(red[0]).toBeGreaterThan(red[2]);
    expect(blue[2]).toBeGreaterThan(blue[0]);
    expect(green[1]).toBeGreaterThan(green[2]);
  });
});
