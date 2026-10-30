import { describe, expect, it } from 'vitest';
import { fft, Packet, packetT, wallT } from './tunnel';

describe('tunnelling', () => {
  it('the FFT inverts and matches a direct transform', () => {
    const n = 16;
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 1.3) + 0.2 * i);
    const im = Float64Array.from({ length: n }, (_, i) => Math.cos(i * 0.7));
    const r0 = re.slice(), i0 = im.slice();
    fft(re, im);
    for (const k of [0, 3, 9]) {
      let sr = 0, si = 0;
      for (let j = 0; j < n; j++) {
        const a = (-2 * Math.PI * j * k) / n;
        sr += r0[j] * Math.cos(a) - i0[j] * Math.sin(a);
        si += r0[j] * Math.sin(a) + i0[j] * Math.cos(a);
      }
      expect(re[k]).toBeCloseTo(sr, 10);
      expect(im[k]).toBeCloseTo(si, 10);
    }
    fft(re, im, true);
    r0.forEach((v, j) => expect(re[j]).toBeCloseTo(v, 12));
  });

  it('textbook transmission: thicker walls let less through, more energy more', () => {
    expect(wallT(0.6, 1)).toBeCloseTo(0.48061, 4);
    expect(wallT(0.6, 2)).toBeLessThan(wallT(0.6, 1));
    expect(wallT(0.8, 2)).toBeGreaterThan(wallT(0.6, 2));
    // continuous through e = 1
    expect(wallT(1 + 1e-6, 2)).toBeCloseTo(wallT(1, 2), 4);
    expect(wallT(1 - 1e-6, 2)).toBeCloseTo(wallT(1, 2), 4);
  });

  it('a simulated packet keeps its probability and tunnels as the formula says', () => {
    for (const [e, a] of [[0.6, 1], [0.6, 2], [0.4, 1], [1.2, 2]] as const) {
      const p = new Packet(e, a);
      while (!p.done) p.step(20);
      const { through, total } = p.parts();
      expect(total).toBeCloseTo(1, 9);
      expect(Math.abs(through - packetT(e, a))).toBeLessThan(0.01);
    }
  });
});
