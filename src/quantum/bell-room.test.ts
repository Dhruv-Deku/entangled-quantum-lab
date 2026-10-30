import { describe, expect, it } from 'vitest';
import { addRound, bellRound, dialDeg, emptyTally, score } from './bell-room';
import { mulberry32 } from './measure';

const play = (mode: 'quantum' | 'hidden', n: number, seed: number) => {
  const t = emptyTally(), rng = mulberry32(seed);
  for (let i = 0; i < n; i++) addRound(t, bellRound(mode, rng));
  return score(t);
};

describe('the Bell test across the room', () => {
  it('entangled pairs score 2 sqrt 2', () => {
    const s = play('quantum', 40000, 1);
    expect(Math.abs(s.s - 2 * Math.SQRT2)).toBeLessThan(4 * s.se);
    expect(s.s).toBeGreaterThan(2.6);
    expect(s.rounds).toBe(40000);
  });

  it('hidden instructions reach 2 and no further', () => {
    const s = play('hidden', 40000, 2);
    expect(Math.abs(s.s - 2)).toBeLessThan(4 * s.se + 0.01);
    expect(s.s).toBeLessThan(2.1);
  });

  it('each side alone looks like a fair coin either way', () => {
    for (const mode of ['quantum', 'hidden'] as const) {
      const rng = mulberry32(9);
      let a = 0, b = 0;
      for (let i = 0; i < 20000; i++) {
        const r = bellRound(mode, rng);
        a += r.a;
        b += r.b;
      }
      expect(Math.abs(a / 20000)).toBeLessThan(0.03);
      expect(Math.abs(b / 20000)).toBeLessThan(0.03);
    }
  });

  it('dials sit at the CHSH angles', () => {
    expect([dialDeg('a', 0), dialDeg('a', 1), dialDeg('b', 0), dialDeg('b', 1)]).toEqual([0, 90, 45, -45]);
  });
});
