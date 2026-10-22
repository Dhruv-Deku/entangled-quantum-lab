/**
 * Hand joint layout (WebXR Hand Input order) and geometric features computed
 * from joint positions. Pure math, no rendering, so it is unit tested.
 */

export const JOINTS = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
] as const;

export const J = {
  wrist: 0,
  thumbTip: 4,
  indexMeta: 5, indexProx: 6, indexTip: 9,
  middleMeta: 10, middleProx: 11, middleTip: 14,
  ringMeta: 15, ringProx: 16, ringTip: 19,
  pinkyMeta: 20, pinkyProx: 21, pinkyTip: 24,
} as const;

/** First joint (metacarpal) of each long finger; the next four joints follow it. */
export const FINGER_BASE = { index: 5, middle: 10, ring: 15, pinky: 20 } as const;
export type Finger = keyof typeof FINGER_BASE;
export const FINGERS: Finger[] = ['index', 'middle', 'ring', 'pinky'];

/** 25 joints x (x, y, z), meters, in one shared space. */
export type JointPositions = Float32Array;

export type V3 = [number, number, number];

export function joint(p: JointPositions, i: number): V3 {
  return [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
}

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: V3): V3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const distance = (a: V3, b: V3): number => length(sub(a, b));

function angleBetween(a: V3, b: V3): number {
  const d = dot(normalize(a), normalize(b));
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

/** Distance between thumb tip and index tip, meters. */
export function pinchDistance(p: JointPositions): number {
  return distance(joint(p, J.thumbTip), joint(p, J.indexTip));
}

/**
 * Curl of one finger, 0 = straight, 1 = fully curled.
 * Sum of the bend angles at the three finger joints, which does not depend on hand size.
 */
export function fingerCurl(p: JointPositions, finger: Finger): number {
  const b = FINGER_BASE[finger];
  let bend = 0;
  for (let k = 0; k < 3; k++) {
    const a = joint(p, b + k), m = joint(p, b + k + 1), c = joint(p, b + k + 2);
    bend += angleBetween(sub(m, a), sub(c, m));
  }
  // a tight fist bends about 220 degrees across the three joints
  return Math.min(1, bend / ((220 * Math.PI) / 180));
}

/** Mean angle (radians) between neighbouring fingers' proximal segments: how far the fingers fan out. */
export function fingerSpread(p: JointPositions): number {
  const dirs = FINGERS.map((f) => {
    const b = FINGER_BASE[f];
    return normalize(sub(joint(p, b + 2), joint(p, b + 1)));
  });
  let total = 0;
  for (let i = 0; i < 3; i++) total += angleBetween(dirs[i], dirs[i + 1]);
  return total / 3;
}

export interface HandFrame {
  /** Center of the palm. */
  center: V3;
  /** Unit vector out of the palm (the side you hold things with). */
  normal: V3;
  /** Unit vector from wrist toward the middle knuckle. */
  forward: V3;
  /** Unit vector across the knuckles, pinky to index. */
  side: V3;
}

export function handFrame(p: JointPositions, handedness: 'left' | 'right'): HandFrame {
  const wrist = joint(p, J.wrist);
  const index = joint(p, J.indexProx), middle = joint(p, J.middleProx), pinky = joint(p, J.pinkyProx);
  const forward = normalize(sub(middle, wrist));
  const across = normalize(sub(index, pinky));
  // for a right hand, side x forward points out of the palm; mirrored for the left
  let normal = normalize(cross(across, forward));
  if (handedness === 'left') normal = scale(normal, -1);
  const side = normalize(sub(across, scale(forward, dot(across, forward))));
  const center = scale(add(add(wrist, middle), add(index, pinky)), 0.25);
  return { center, normal, forward, side };
}

/** Signed rotation (radians) of the hand about its forward axis between two frames. */
export function rollDelta(prev: HandFrame, next: HandFrame): number {
  const axis = next.forward;
  const a = normalize(sub(prev.side, scale(axis, dot(prev.side, axis))));
  const b = next.side;
  return Math.atan2(dot(cross(a, b), axis), dot(a, b));
}
