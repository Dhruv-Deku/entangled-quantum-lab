import { describe, expect, it } from 'vitest';
import { recognize, type P2 } from './spells';

const line = (a: P2, b: P2, n = 12): P2[] => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)]);
const jitter = (pts: P2[], amt = 0.003, seed = 1): P2[] => {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * amt;
  return pts.map(([x, y]) => [x + r(), y + r()]);
};

describe('gesture spells', () => {
  it('a circle in the air, either way round, is S', () => {
    for (const dir of [1, -1]) {
      const c: P2[] = Array.from({ length: 40 }, (_, i) => [0.1 * Math.cos((dir * i * 2 * Math.PI) / 39), 0.09 * Math.sin((dir * i * 2 * Math.PI) / 39)]);
      expect(recognize(jitter(c))).toBe('circle');
    }
  });

  it('a Z (right, down-left, right) is Z', () => {
    const z = [...line([0, 0.1], [0.15, 0.1]), ...line([0.15, 0.1], [0, -0.02]).slice(1), ...line([0, -0.02], [0.15, -0.02]).slice(1)];
    expect(recognize(jitter(z, 0.002))).toBe('zigzag');
  });

  it('a straight stroke up is X; down, sideways or tiny strokes are nothing', () => {
    expect(recognize(line([0, 0], [0.01, 0.15]))).toBe('up');
    expect(recognize(line([0, 0.15], [0, 0]))).toBe(null);
    expect(recognize(line([0, 0], [0.2, 0]))).toBe(null);
    const tiny: P2[] = Array.from({ length: 20 }, (_, i) => [0.01 * Math.cos(i / 3), 0.01 * Math.sin(i / 3)]);
    expect(recognize(tiny)).toBe(null);
  });

  it('an open arc (half a circle) is not a circle', () => {
    const arc: P2[] = Array.from({ length: 30 }, (_, i) => [0.1 * Math.cos((i * Math.PI) / 29), 0.1 * Math.sin((i * Math.PI) / 29)]);
    expect(recognize(arc)).toBe(null);
  });
});
