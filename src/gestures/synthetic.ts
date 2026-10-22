import type { JointPositions } from './hand';

/**
 * A parametric hand for tests and the desktop debug mode. Wrist at the origin,
 * fingers along +Y, palm facing +Z. Real tracking data is noisier; `noise` adds jitter.
 */
export interface SynthHandOptions {
  /** Curl of the four fingers, 0..1 (one value, or one per finger). */
  curl?: number | [number, number, number, number];
  /** Fan-out between neighbouring fingers, radians. */
  spread?: number;
  /** 0 = thumb relaxed, 1 = thumb tip touching the index tip. */
  pinch?: number;
  /** Rotation about the forearm axis (+Y), radians. */
  roll?: number;
  handedness?: 'left' | 'right';
  /** Uniform jitter per coordinate, meters. */
  noise?: number;
  rng?: () => number;
  offset?: [number, number, number];
}

type V = [number, number, number];

const KNUCKLE_X = [0.024, 0.004, -0.015, -0.032];
const KNUCKLE_Y = [0.092, 0.095, 0.09, 0.082];
const META_X = [0.015, 0.003, -0.009, -0.019];
const SEGMENTS = [
  [0.045, 0.026, 0.022],
  [0.05, 0.031, 0.024],
  [0.047, 0.029, 0.023],
  [0.037, 0.021, 0.02],
];
const BEND = [Math.PI / 2, (5 * Math.PI) / 9, Math.PI / 3]; // full-curl angle per joint
const FAN = [1.5, 0.5, -0.5, -1.5];

export function synthHand(o: SynthHandOptions = {}): JointPositions {
  const curls = Array.isArray(o.curl) ? o.curl : [0, 0, 0, 0].map(() => (o.curl as number | undefined) ?? 0);
  const spread = o.spread ?? (2 * Math.PI) / 180;
  const pts: V[] = new Array(25);
  pts[0] = [0, 0, 0];

  for (let f = 0; f < 4; f++) {
    const base = 5 + f * 5;
    pts[base] = [META_X[f], 0.025, 0];
    let p: V = [KNUCKLE_X[f], KNUCKLE_Y[f], 0];
    pts[base + 1] = p;
    const fan = FAN[f] * spread;
    let bend = 0;
    for (let k = 0; k < 3; k++) {
      bend += BEND[k] * curls[f];
      // direction in the finger's plane: start along +Y (tilted by the fan), bend toward +Z (the palm side)
      const dir: V = [Math.sin(fan) * Math.cos(bend), Math.cos(fan) * Math.cos(bend), Math.sin(bend)];
      p = [p[0] + dir[0] * SEGMENTS[f][k], p[1] + dir[1] * SEGMENTS[f][k], p[2] + dir[2] * SEGMENTS[f][k]];
      pts[base + 2 + k] = p;
    }
  }

  // thumb: relaxed off to the index side, or reaching for the index tip
  const relaxed: V[] = [[0.022, 0.022, 0.012], [0.045, 0.042, 0.024], [0.062, 0.06, 0.032], [0.074, 0.075, 0.036]];
  const target = pts[9];
  const t = o.pinch ?? 0;
  for (let k = 0; k < 4; k++) {
    const w = t * (k / 3); // joints nearer the tip move more
    const goal: V = k === 3 ? [target[0], target[1], target[2] + 0.004] : relaxed[k];
    pts[1 + k] = [
      relaxed[k][0] + (goal[0] - relaxed[k][0]) * (k === 3 ? t : w),
      relaxed[k][1] + (goal[1] - relaxed[k][1]) * (k === 3 ? t : w),
      relaxed[k][2] + (goal[2] - relaxed[k][2]) * (k === 3 ? t : w),
    ];
  }

  const roll = o.roll ?? 0, cr = Math.cos(roll), sr = Math.sin(roll);
  const mirror = o.handedness === 'left' ? -1 : 1;
  const [ox, oy, oz] = o.offset ?? [0, 0, 0];
  const out = new Float32Array(75);
  for (let i = 0; i < 25; i++) {
    let [x, y, z] = pts[i];
    x *= mirror;
    // roll about +Y
    const rx = x * cr + z * sr, rz = -x * sr + z * cr;
    const n = o.noise ?? 0, r = o.rng ?? Math.random;
    out[i * 3] = rx + ox + (r() * 2 - 1) * n;
    out[i * 3 + 1] = y + oy + (r() * 2 - 1) * n;
    out[i * 3 + 2] = rz + oz + (r() * 2 - 1) * n;
  }
  return out;
}
