import { describe, expect, it } from 'vitest';
import { mulberry32 } from './measure';
import { bombOdds, fireBomb, fireZeno, FRINGES, histogram, runAtom, sampleSlit, SG_EXPERIMENTS, sgExpected, slitIntensity, zenoOdds } from './experiments';

describe('the double slit', () => {
  it('both slits open: dark fringes where the waves cancel; watched or one slit: none', () => {
    const dark = 1 / (2 * FRINGES);
    expect(slitIntensity(dark, 'both')).toBeLessThan(1e-9);
    expect(slitIntensity(0, 'both')).toBeCloseTo(1, 6);
    expect(slitIntensity(dark, 'watched')).toBeGreaterThan(0.5);
    expect(slitIntensity(dark, 'one')).toBeGreaterThan(0.5);
  });

  it('photons one at a time build the pattern: few land in a dark fringe unless someone watches', () => {
    const rng = mulberry32(3);
    const inDark = (hits: number[]) => hits.filter((x) => Math.abs(Math.abs(x) - 1 / (2 * FRINGES)) < 0.015).length / hits.length;
    const both = Array.from({ length: 4000 }, () => sampleSlit('both', rng));
    const watched = Array.from({ length: 4000 }, () => sampleSlit('watched', rng));
    expect(inDark(both)).toBeLessThan(0.01);
    expect(inDark(watched)).toBeGreaterThan(0.04);
    const h = histogram(both, 20);
    expect(h.reduce((a, b) => a + b, 0)).toBe(4000);
    // symmetric about the middle
    expect(Math.abs(h[9] - h[10]) / (h[9] + h[10])).toBeLessThan(0.15);
  });
});

describe('Stern-Gerlach', () => {
  const by = (id: string) => SG_EXPERIMENTS.find((e) => e.id === id)!.stages;

  it('one magnet splits the beam in two; a second along the same axis agrees; an X in between scrambles Z again', () => {
    expect(sgExpected(by('z'))).toEqual({ up: 0.5, down: 0.5, stopped: 0 });
    expect(sgExpected(by('zz'))).toEqual({ up: 1, down: 0, stopped: 0.5 });
    expect(sgExpected(by('zxz'))).toEqual({ up: 0.5, down: 0.5, stopped: 0.75 });
  });

  it('atom by atom, the counts match', () => {
    const rng = mulberry32(11);
    for (const e of SG_EXPERIMENTS) {
      const runs = Array.from({ length: 6000 }, () => runAtom(e.stages, rng));
      const reached = runs.filter((r) => r.blockedAt === null);
      const up = reached.filter((r) => r.outcomes[r.outcomes.length - 1] === 'up').length / reached.length;
      const want = sgExpected(e.stages);
      expect(up).toBeCloseTo(want.up, 1);
      expect(1 - reached.length / runs.length).toBeCloseTo(want.stopped, 1);
    }
  });
});

describe('the bomb tester', () => {
  it('a dud always lights the bright port; a live bomb: boom half the time, the dark port a quarter', () => {
    expect(bombOdds(false)).toEqual({ C: expect.closeTo(1, 9), D: expect.closeTo(0, 9), boom: 0 });
    const live = bombOdds(true);
    expect(live.boom).toBeCloseTo(0.5, 9);
    expect(live.C).toBeCloseTo(0.25, 9);
    expect(live.D).toBeCloseTo(0.25, 9);
    const rng = mulberry32(5);
    expect(Array.from({ length: 500 }, () => fireBomb(false, rng)).every((o) => o === 'C')).toBe(true);
    const shots = Array.from({ length: 8000 }, () => fireBomb(true, rng));
    expect(shots.filter((o) => o === 'D').length / shots.length).toBeCloseTo(0.25, 1);
  });

  it('the Zeno version certifies most live bombs without setting them off, and never calls a dud live', () => {
    expect(zenoOdds(true, 10).live).toBeCloseTo(0.78, 2);
    expect(zenoOdds(true, 50).live).toBeGreaterThan(0.95);
    const rng = mulberry32(9);
    expect(Array.from({ length: 200 }, () => fireZeno(false, rng).result).every((r) => r === 'dud')).toBe(true);
    const live = Array.from({ length: 5000 }, () => fireZeno(true, rng));
    expect(live.filter((r) => r.result === 'live').length / live.length).toBeCloseTo(0.78, 1);
    expect(live.every((r) => r.result !== 'dud')).toBe(true);
  });
});
