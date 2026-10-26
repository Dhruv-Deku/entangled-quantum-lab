import { describe, expect, it } from 'vitest';
import { shorStages } from './shor-3d';

describe("Shor's algorithm in 3D", () => {
  it('finds period 4 for 7 mod 15, spikes every 4, and the factors 3 and 5', () => {
    const s = shorStages();
    expect(s).toHaveLength(5);
    const spikes = s[3].heights.map((h, y) => (h > 0.99 ? y : -1)).filter((y) => y >= 0);
    expect(spikes).toEqual([0, 4, 8, 12]);
    expect(s[3].heights.filter((h) => h > 1e-9)).toHaveLength(4);
    expect(s[4].title).toBe('15 = 3 x 5');
    expect(s[2].heights.filter((h) => h > 0)).toHaveLength(4);
  });
});
