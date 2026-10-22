import type { SynthHandOptions } from './synthetic';

/** Gestures the ghost hand can demonstrate. */
export type DemoGesture = 'twist' | 'spread' | 'fist' | 'pinch';

/** One loop of a demo, seconds. */
export const DEMO_LOOP = 2.6;

/** 0 -> 1 -> hold -> 0 over one loop (u in 0..1), eased. */
export function pulse(u: number): number {
  const ease = (t: number) => t * t * (3 - 2 * t);
  if (u < 0.15) return 0;
  if (u < 0.4) return ease((u - 0.15) / 0.25);
  if (u < 0.72) return 1;
  if (u < 0.92) return 1 - ease((u - 0.72) / 0.2);
  return 0;
}

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * Hand shape for a demo at loop phase u. These are the exact poses the ghost
 * hand plays, and the tests run them through the real gesture tracker, so a
 * demo can never show a move the tracker would not recognise.
 */
export function demoHand(g: DemoGesture, u: number): SynthHandOptions {
  const a = pulse(u);
  switch (g) {
    case 'spread':
      return { curl: 0.45 * (1 - a), spread: deg(4 + 20 * a), pinch: 0 };
    case 'fist':
      return { curl: 0.15 + 0.85 * a, spread: deg(3), pinch: 0.35 * a };
    case 'twist':
      // pinch the orb and turn the wrist like a dial, both ways
      return { curl: [0.45, 0.25, 0.25, 0.25], pinch: 1, roll: 0.75 * Math.sin(2 * Math.PI * u) };
    case 'pinch':
      return { curl: [0.45, 0.25, 0.25, 0.25], pinch: 1 };
  }
}
