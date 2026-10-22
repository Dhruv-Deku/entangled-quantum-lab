import { DEFAULT_GESTURES, type GestureConfig } from './config';
import {
  fingerCurl,
  fingerSpread,
  FINGERS,
  handFrame,
  pinchDistance,
  rollDelta,
  type HandFrame,
  type JointPositions,
} from './hand';

export type GestureEvent = 'pinch-start' | 'pinch-end' | 'fist' | 'spread';

export interface HandState {
  tracked: boolean;
  pinching: boolean;
  /** 0 (apart) .. 1 (touching). */
  pinchStrength: number;
  fist: boolean;
  open: boolean;
  spread: boolean;
  /** Wrist roll this frame (radians, smoothed, deadzoned). */
  roll: number;
  frame: HandFrame | null;
}

/**
 * Turns one hand's joint positions into gesture state and discrete events.
 * Fist and spread need a short hold and share a cooldown, so they cannot
 * trigger each other, and neither fires while pinching.
 */
export class HandTracker {
  readonly handedness: 'left' | 'right';
  config: GestureConfig;
  readonly state: HandState = {
    tracked: false, pinching: false, pinchStrength: 0, fist: false, open: false, spread: false, roll: 0, frame: null,
  };
  private fistTime = 0;
  private spreadTime = 0;
  private fistFired = false;
  private spreadFired = false;
  private cooldown = 0;
  private smoothed: HandFrame | null = null;
  /** Frame the last reported roll was measured from; slow turns accumulate against it. */
  private rollRef: HandFrame | null = null;

  constructor(handedness: 'left' | 'right', config: GestureConfig = DEFAULT_GESTURES) {
    this.handedness = handedness;
    this.config = config;
  }

  /** Feed one frame. Pass null when the hand is not tracked. Returns events that fired this frame. */
  update(joints: JointPositions | null, dt: number): GestureEvent[] {
    const c = this.config, s = this.state, events: GestureEvent[] = [];
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (!joints) {
      if (s.pinching) events.push('pinch-end');
      Object.assign(s, { tracked: false, pinching: false, pinchStrength: 0, fist: false, open: false, spread: false, roll: 0, frame: null });
      this.fistTime = this.spreadTime = 0;
      this.fistFired = this.spreadFired = false;
      this.smoothed = null;
      this.rollRef = null;
      return events;
    }
    s.tracked = true;

    // pinch
    const pd = pinchDistance(joints);
    s.pinchStrength = Math.max(0, Math.min(1, 1 - (pd - c.pinchOn) / (c.pinchOff * 2 - c.pinchOn)));
    if (!s.pinching && pd < c.pinchOn) {
      s.pinching = true;
      events.push('pinch-start');
    } else if (s.pinching && pd > c.pinchOff) {
      s.pinching = false;
      events.push('pinch-end');
    }

    // curl-based poses (fingers only; the thumb is too noisy to trust)
    let minCurl = 1, maxCurl = 0;
    for (const f of FINGERS) {
      const k = fingerCurl(joints, f);
      minCurl = Math.min(minCurl, k);
      maxCurl = Math.max(maxCurl, k);
    }
    s.fist = s.fist ? minCurl > c.fistOff : minCurl > c.fistOn;
    s.open = s.open ? maxCurl < c.openOff : maxCurl < c.openOn;
    const spreadAngle = fingerSpread(joints);
    const spreadNow = s.open && !s.pinching && (s.spread ? spreadAngle > c.spreadOff : spreadAngle > c.spreadOn);
    s.spread = spreadNow;

    // fist -> measure, once per closure, after a hold
    if (s.fist && !s.pinching) {
      this.fistTime += dt;
      if (!this.fistFired && this.fistTime >= c.fistHold && this.cooldown === 0) {
        this.fistFired = true;
        this.cooldown = c.cooldown;
        events.push('fist');
      }
    } else {
      this.fistTime = 0;
      this.fistFired = false;
    }

    // spread -> Hadamard, once per opening, after a hold
    if (s.spread) {
      this.spreadTime += dt;
      if (!this.spreadFired && this.spreadTime >= c.spreadHold && this.cooldown === 0) {
        this.spreadFired = true;
        this.cooldown = c.cooldown;
        events.push('spread');
      }
    } else {
      this.spreadTime = 0;
      this.spreadFired = false;
    }

    // wrist roll from a smoothed hand frame
    const raw = handFrame(joints, this.handedness);
    if (!this.smoothed || !this.rollRef) {
      this.smoothed = raw;
      this.rollRef = raw;
      s.roll = 0;
    } else {
      const a = c.rollSmoothing;
      const lerp = (p: number[], q: number[]) => p.map((v, i) => v + (q[i] - v) * a) as [number, number, number];
      const next: HandFrame = {
        center: lerp(this.smoothed.center, raw.center),
        normal: lerp(this.smoothed.normal, raw.normal),
        forward: lerp(this.smoothed.forward, raw.forward),
        side: lerp(this.smoothed.side, raw.side),
      };
      const nf = Math.hypot(...next.forward) || 1;
      next.forward = next.forward.map((v) => v / nf) as [number, number, number];
      const ns = Math.hypot(...next.side) || 1;
      next.side = next.side.map((v) => v / ns) as [number, number, number];
      this.smoothed = next;
      const d = rollDelta(this.rollRef, next);
      if (Math.abs(d) < c.rollDeadzone) s.roll = 0;
      else {
        s.roll = d;
        this.rollRef = next;
      }
    }
    s.frame = raw;
    return events;
  }
}
