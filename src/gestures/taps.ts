import { distance, fingerCurl, J, joint, type JointPositions } from './hand';

/**
 * Finger taps: touch the tip of your thumb to the tip of your middle, ring or
 * little finger to apply a gate, no panel needed (the index pinch stays for
 * grabbing). Small enough for an airplane seat, quick once learned. A tap
 * counts only with the index finger out straight (so a fist or a grab never
 * fires one), with the thumb clear of the index, held a moment; then the
 * fingers must part before the next.
 */

export type TapFinger = 'middle' | 'ring' | 'pinky';
export const TAP_FINGERS: TapFinger[] = ['middle', 'ring', 'pinky'];
const TIP = { middle: J.middleTip, ring: J.ringTip, pinky: J.pinkyTip } as const;

export interface TapConfig {
  /** Thumb-to-fingertip distance (m) that starts a touch, and the distance that ends it. */
  on: number;
  off: number;
  /** Seconds a touch must last to count. */
  hold: number;
  /** Seconds after a tap before the next can fire. */
  cooldown: number;
  /** The thumb must stay at least this far from the index tip (m), and clearly nearer the tapped tip: an index pinch is a grab, not a tap. */
  indexClear: number;
  /** The tapped tip must be this much closer to the thumb than the index tip is (ratio). */
  clearRatio: number;
  /** Index curl must stay below this (0 straight, 1 curled): a straight index means a deliberate tap. */
  indexStraight: number;
}

export const DEFAULT_TAPS: TapConfig = { on: 0.016, off: 0.03, hold: 0.06, cooldown: 0.45, indexClear: 0.016, clearRatio: 0.6, indexStraight: 0.45 };

export class TapDetector {
  private touching: TapFinger | null = null;
  private held = 0;
  private fired = false;
  private cool = 0;

  constructor(private readonly config: TapConfig = DEFAULT_TAPS) {}

  /** Feed one frame (null when the hand is not tracked); returns the finger tapped this frame, if any. */
  update(p: JointPositions | null, dt: number): TapFinger | null {
    const c = this.config;
    this.cool = Math.max(0, this.cool - dt);
    if (!p) {
      this.touching = null;
      this.fired = false;
      return null;
    }
    const thumb = joint(p, J.thumbTip);
    const toIndex = distance(thumb, joint(p, J.indexTip));
    const straight = toIndex > c.indexClear && fingerCurl(p, 'index') < c.indexStraight;
    // the finger the thumb is on: keep the current one until it parts past `off`
    let finger: TapFinger | null = null;
    if (this.touching && distance(thumb, joint(p, TIP[this.touching])) < c.off) finger = this.touching;
    else {
      let best = c.on;
      for (const f of TAP_FINGERS) {
        const d = distance(thumb, joint(p, TIP[f]));
        if (d < best) {
          best = d;
          finger = f;
        }
      }
    }
    if (finger !== this.touching) {
      this.touching = finger;
      this.held = 0;
      this.fired = false;
    }
    const deliberate = straight && !!finger && distance(thumb, joint(p, TIP[finger])) < toIndex * c.clearRatio;
    if (!finger || !deliberate) {
      if (!finger) this.fired = false;
      this.held = 0;
      return null;
    }
    this.held += dt;
    if (!this.fired && this.held >= c.hold && this.cool <= 0) {
      this.fired = true;
      this.cool = c.cooldown;
      return finger;
    }
    return null;
  }
}
