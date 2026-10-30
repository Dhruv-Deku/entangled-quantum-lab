import { describe, expect, it } from 'vitest';
import { amplitude, detect, fringeSpacing, screenIntensity } from './waves';
import { mulberry32 } from './measure';

const peaks = (xs: number[], ys: number[]) => xs.filter((_, i) => i > 0 && i < ys.length - 1 && ys[i] > ys[i - 1] && ys[i] >= ys[i + 1]);

describe('waves from point sources', () => {
  const lambda = 0.024, k = (2 * Math.PI) / lambda;
  const xs = Array.from({ length: 2001 }, (_, i) => -0.5 + i * 0.0005);

  it('two sources in step make a bright middle and fringes lambda L / d apart', () => {
    const d = 0.12, L = 1;
    const I = screenIntensity([[-d / 2, 0], [d / 2, 0]], xs, L, k);
    const mid = I[1000];
    expect(mid).toBeGreaterThan(I[1000 + 20] * 0.99);
    const p = peaks(xs, I);
    const near = p.filter((x) => Math.abs(x) < 0.25).sort((a, b) => a - b);
    expect(near.length).toBeGreaterThanOrEqual(3);
    const gaps = near.slice(1).map((x, i) => x - near[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(Math.abs(mean - fringeSpacing(lambda, d, L)) / fringeSpacing(lambda, d, L)).toBeLessThan(0.03);
    // dark fringes nearly cancel
    expect(Math.min(...I.slice(700, 1300))).toBeLessThan(mid * 0.01);
  });

  it('moving the sources apart packs the fringes closer', () => {
    const count = (d: number) => peaks(xs, screenIntensity([[-d / 2, 0], [d / 2, 0]], xs, 0.3, k)).filter((x) => Math.abs(x) < 0.2).length;
    expect(count(0.08)).toBeGreaterThan(count(0.04));
  });

  it('one source alone has no fringes, and amplitudes add', () => {
    const one = screenIntensity([[0, 0]], xs, 0.3, k);
    expect(peaks(xs, one)).toHaveLength(1);
    const [a, b] = amplitude([[0, 0]], 0.1, 0.2, k), [c, d] = amplitude([[0.05, 0]], 0.1, 0.2, k);
    const [e, f] = amplitude([[0, 0], [0.05, 0]], 0.1, 0.2, k);
    expect(e).toBeCloseTo(a + c, 12);
    expect(f).toBeCloseTo(b + d, 12);
  });

  it('detections land where the intensity is', () => {
    const I = screenIntensity([[-0.03, 0], [0.03, 0]], xs, 0.3, k);
    const rng = mulberry32(4);
    let bright = 0, dark = 0;
    const brightest = I.indexOf(Math.max(...I));
    for (let n = 0; n < 4000; n++) {
      const x = detect(xs, I, rng);
      const i = Math.round((x + 0.5) / 0.0005);
      if (I[i] > 0.5 * I[brightest]) bright++;
      if (I[i] < 0.02 * I[brightest]) dark++;
    }
    expect(bright).toBeGreaterThan(20 * Math.max(1, dark));
  });
});
