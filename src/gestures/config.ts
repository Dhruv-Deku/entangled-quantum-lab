/**
 * Every gesture threshold in one place. Each on/off pair is a hysteresis band:
 * a gesture turns on past the first value and only turns off past the second,
 * so noisy tracking near a threshold does not flicker.
 */
export interface GestureConfig {
  /** Thumb-index distance (m) to start and to end a pinch. */
  pinchOn: number;
  pinchOff: number;
  /** Finger curl (0..1, all four fingers) to enter and to leave a fist. */
  fistOn: number;
  fistOff: number;
  /** Seconds a fist must be held before it counts as "measure". */
  fistHold: number;
  /** Max finger curl for an open hand, and the curl that ends "open". */
  openOn: number;
  openOff: number;
  /** Mean angle between neighbouring fingers (radians) for a spread hand, and the angle that ends it. */
  spreadOn: number;
  spreadOff: number;
  /** Seconds a spread must be held before it counts as "Hadamard". */
  spreadHold: number;
  /** Seconds after any discrete gesture during which no other discrete gesture fires. */
  cooldown: number;
  /** Ignore wrist roll smaller than this per frame (radians), to hide tracking jitter. */
  rollDeadzone: number;
  /** Smoothing for the hand frame used for roll, 0..1 (higher = snappier). */
  rollSmoothing: number;
}

export const DEFAULT_GESTURES: GestureConfig = {
  pinchOn: 0.015,
  pinchOff: 0.03,
  fistOn: 0.72,
  fistOff: 0.55,
  fistHold: 0.2,
  openOn: 0.22,
  openOff: 0.35,
  spreadOn: (11 * Math.PI) / 180,
  spreadOff: (7 * Math.PI) / 180,
  spreadHold: 0.15,
  cooldown: 0.45,
  rollDeadzone: 0.0015,
  rollSmoothing: 0.5,
};

/**
 * Sensitivity 0..1 from the settings menu (0.5 = default). Higher sensitivity
 * makes gestures easier to trigger: shorter holds and looser thresholds.
 */
export function withSensitivity(base: GestureConfig, sensitivity: number): GestureConfig {
  const s = Math.max(0, Math.min(1, sensitivity));
  const k = 1 + (0.5 - s) * 0.6; // 0.7 (sensitive) .. 1.3 (strict)
  return {
    ...base,
    fistOn: Math.min(0.9, base.fistOn * k),
    fistHold: base.fistHold * k,
    spreadOn: base.spreadOn * k,
    spreadHold: base.spreadHold * k,
    pinchOn: base.pinchOn / k,
  };
}
