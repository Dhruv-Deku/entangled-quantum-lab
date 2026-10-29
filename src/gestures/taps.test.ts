import { describe, expect, it } from 'vitest';
import { synthHand } from './synthetic';
import { TapDetector } from './taps';

const run = (det: TapDetector, frames: Float32Array[], dt = 1 / 72) => frames.map((f) => det.update(f, dt)).filter(Boolean);
const hold = (f: Float32Array, n: number) => Array.from({ length: n }, () => f);

describe('finger taps', () => {
  it('fires once for a thumb on the middle, ring or little fingertip', () => {
    for (const finger of ['middle', 'ring', 'pinky'] as const) {
      const det = new TapDetector();
      const open = synthHand();
      const tap = synthHand({ pinch: 1, pinchTo: finger });
      expect(run(det, [...hold(open, 5), ...hold(tap, 20), ...hold(open, 5)])).toEqual([finger]);
    }
  });

  it('needs the fingers to part (and a short pause) before the next tap', () => {
    const det = new TapDetector();
    const open = synthHand(), tap = synthHand({ pinch: 1, pinchTo: 'middle' });
    expect(run(det, [...hold(tap, 60)])).toEqual(['middle']);
    expect(run(det, [...hold(open, 50), ...hold(tap, 10)])).toEqual(['middle']);
  });

  it('ignores the index pinch (grabbing), a fist, a brush too short, and jitter', () => {
    const det = new TapDetector();
    expect(run(det, hold(synthHand({ pinch: 1 }), 40))).toEqual([]);
    expect(run(det, hold(synthHand({ curl: 0.95, pinch: 1, pinchTo: 'middle' }), 40))).toEqual([]);
    expect(run(det, [...hold(synthHand({ pinch: 1, pinchTo: 'ring' }), 3), ...hold(synthHand(), 10)])).toEqual([]);
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    expect(run(det, Array.from({ length: 200 }, () => synthHand({ noise: 0.003, rng, pinch: 0.3 })))).toEqual([]);
  });

  it('stops when the hand is lost', () => {
    const det = new TapDetector();
    const tap = synthHand({ pinch: 1, pinchTo: 'pinky' });
    expect(det.update(tap, 0.03)).toBeNull();
    expect(det.update(null, 0.03)).toBeNull();
    expect(run(det, hold(tap, 8))).toEqual(['pinky']);
  });
});
