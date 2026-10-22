import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../quantum/measure';
import { DEFAULT_GESTURES, withSensitivity } from './config';
import { DEMO_LOOP, demoHand, type DemoGesture } from './demos';
import { fingerCurl, fingerSpread, handFrame, pinchDistance } from './hand';
import { synthSequence } from './test-utils';
import { synthHand } from './synthetic';
import { HandTracker, type GestureEvent } from './tracker';

const DT = 1 / 72;

/** Run a tracker over `seconds` of one pose and collect every event. */
function hold(t: HandTracker, pose: Float32Array | (() => Float32Array), seconds: number): GestureEvent[] {
  const events: GestureEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) events.push(...t.update(typeof pose === 'function' ? pose() : pose, DT));
  return events;
}

const POSES = {
  relaxed: () => synthHand({ curl: 0.3, spread: (3 * Math.PI) / 180 }),
  flat: () => synthHand({ curl: 0.05, spread: (3 * Math.PI) / 180 }),
  spread: () => synthHand({ curl: 0.05, spread: (16 * Math.PI) / 180 }),
  fist: () => synthHand({ curl: 0.95, pinch: 0 }),
  pinch: () => synthHand({ curl: [0.45, 0.25, 0.25, 0.25], pinch: 1 }),
};

describe('hand features', () => {
  it('curl is ~0 for a straight finger and high for a fist', () => {
    expect(fingerCurl(POSES.flat(), 'middle')).toBeLessThan(0.1);
    expect(fingerCurl(POSES.fist(), 'middle')).toBeGreaterThan(0.85);
  });

  it('spread angle separates a spread hand from a flat one', () => {
    expect(fingerSpread(POSES.spread())).toBeGreaterThan(DEFAULT_GESTURES.spreadOn);
    expect(fingerSpread(POSES.flat())).toBeLessThan(DEFAULT_GESTURES.spreadOff);
  });

  it('pinch distance closes when the thumb meets the index', () => {
    expect(pinchDistance(POSES.pinch())).toBeLessThan(DEFAULT_GESTURES.pinchOn);
    expect(pinchDistance(POSES.flat())).toBeGreaterThan(DEFAULT_GESTURES.pinchOff);
  });

  it('palm normal points out of the palm for both hands', () => {
    expect(handFrame(synthHand(), 'right').normal[2]).toBeGreaterThan(0.9);
    expect(handFrame(synthHand({ handedness: 'left' }), 'left').normal[2]).toBeGreaterThan(0.9);
  });
});

describe('detector separation', () => {
  it('a held spread hand fires exactly one Hadamard and nothing else', () => {
    expect(hold(new HandTracker('right'), POSES.spread, 1)).toEqual(['spread']);
  });

  it('a held fist fires exactly one measure and nothing else', () => {
    expect(hold(new HandTracker('right'), POSES.fist, 1)).toEqual(['fist']);
  });

  it('a fist shorter than the hold time does not measure', () => {
    const t = new HandTracker('right');
    expect(hold(t, POSES.fist, DEFAULT_GESTURES.fistHold * 0.6)).toEqual([]);
  });

  it('a pinch is only a pinch', () => {
    expect(hold(new HandTracker('right'), POSES.pinch, 1)).toEqual(['pinch-start']);
  });

  it('a relaxed or flat hand fires nothing', () => {
    expect(hold(new HandTracker('right'), POSES.relaxed, 2)).toEqual([]);
    expect(hold(new HandTracker('right'), POSES.flat, 2)).toEqual([]);
  });

  it('closing a spread hand into a fist: Hadamard, then measure only after the cooldown', () => {
    const t = new HandTracker('right');
    const ev = [...hold(t, POSES.spread, 0.3), ...synthSequence(t, 0, 1, 0.2, DT), ...hold(t, POSES.fist, 1)];
    expect(ev).toEqual(['spread', 'fist']);
  });

  it('opening a fist sweeps through no spread unless the fingers fan out', () => {
    const t = new HandTracker('right');
    hold(t, POSES.fist, 0.5);
    expect([...synthSequence(t, 1, 0, 0.3, DT), ...hold(t, POSES.flat, 1)]).toEqual([]);
  });

  it('noisy tracking around a held fist still gives one event (hysteresis)', () => {
    const rng = mulberry32(3);
    const noisy = () => synthHand({ curl: 0.8, noise: 0.003, rng });
    expect(hold(new HandTracker('right'), noisy, 3)).toEqual(['fist']);
  });

  it('noisy relaxed hand never fires', () => {
    const rng = mulberry32(4);
    const noisy = () => synthHand({ curl: 0.3, noise: 0.003, rng });
    expect(hold(new HandTracker('right'), noisy, 5)).toEqual([]);
  });

  it('losing tracking mid-pinch ends the pinch', () => {
    const t = new HandTracker('right');
    hold(t, POSES.pinch, 0.2);
    expect(t.update(null, DT)).toEqual(['pinch-end']);
  });
});

describe('wrist roll', () => {
  it('accumulates a 60 degree turn, including slow turns below the jitter deadzone', () => {
    for (const frames of [30, 400]) {
      const t = new HandTracker('right');
      t.update(synthHand({ curl: 0.3 }), DT);
      let total = 0;
      for (let i = 1; i <= frames; i++) {
        t.update(synthHand({ curl: 0.3, roll: ((Math.PI / 3) * i) / frames }), DT);
        total += t.state.roll;
      }
      for (let i = 0; i < 30; i++) {
        t.update(synthHand({ curl: 0.3, roll: Math.PI / 3 }), DT);
        total += t.state.roll;
      }
      expect(Math.abs(Math.abs(total) - Math.PI / 3)).toBeLessThan(0.03);
    }
  });

  it('a still but noisy hand does not drift', () => {
    const rng = mulberry32(5);
    const t = new HandTracker('right');
    let total = 0;
    for (let i = 0; i < 720; i++) {
      t.update(synthHand({ curl: 0.3, noise: 0.0015, rng }), DT);
      total += t.state.roll;
    }
    expect(Math.abs(total)).toBeLessThan(0.15);
  });
});

describe('sensitivity', () => {
  it('higher sensitivity shortens holds; lower lengthens them', () => {
    expect(withSensitivity(DEFAULT_GESTURES, 1).fistHold).toBeLessThan(DEFAULT_GESTURES.fistHold);
    expect(withSensitivity(DEFAULT_GESTURES, 0).fistHold).toBeGreaterThan(DEFAULT_GESTURES.fistHold);
  });
});

describe('ghost hand demos are recognised by the real tracker', () => {
  /** Play `loops` loops of a demo through a fresh tracker; collect events and total roll. */
  function play(g: DemoGesture, loops = 2) {
    const t = new HandTracker('right');
    const events: GestureEvent[] = [];
    let roll = 0, maxRoll = 0;
    const frames = Math.round((DEMO_LOOP * loops) / DT);
    for (let i = 0; i < frames; i++) {
      const u = ((i * DT) % DEMO_LOOP) / DEMO_LOOP;
      events.push(...t.update(synthHand(demoHand(g, u)), DT));
      roll += t.state.roll;
      maxRoll = Math.max(maxRoll, Math.abs(roll));
    }
    return { events, maxRoll };
  }

  it('the spread demo fires one Hadamard per loop and nothing else', () => {
    expect(play('spread').events).toEqual(['spread', 'spread']);
  });

  it('the fist demo fires one measurement per loop and nothing else', () => {
    expect(play('fist').events).toEqual(['fist', 'fist']);
  });

  it('the twist demo holds a pinch and turns the wrist by a visible amount', () => {
    const { events, maxRoll } = play('twist');
    expect(events).toEqual(['pinch-start']);
    expect(maxRoll).toBeGreaterThan(0.4);
  });
});
