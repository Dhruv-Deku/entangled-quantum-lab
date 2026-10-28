import { Euler, Vector3 } from '@iwsdk/core';

/**
 * Field-of-view aware layout. The panels stand around the desk at up to about
 * 50 degrees either side of straight ahead, which a Quest shows at a glance
 * but a narrower headset (Meta VR Glasses: about 37 degrees each side) does
 * not. The compact layout swings every panel that sits wider than 25 degrees
 * in toward the middle, around the seated head, keeping its distance and the
 * way it faces you, so the essentials fit a 62 degree view.
 */

/** Where a seated head is, relative to the desk workspace. */
export const SEATED_HEAD = new Vector3(0, 0.42, 0.4);
/** Panels inside this many degrees of straight ahead stay where they are. */
export const COMFORT_DEG = 25;
const SQUEEZE = 0.25;

/** The bearing (degrees from straight ahead, + to the right) a panel at `deg` moves to. */
export function compactBearing(deg: number): number {
  const a = Math.abs(deg);
  return a <= COMFORT_DEG ? deg : Math.sign(deg) * (COMFORT_DEG + (a - COMFORT_DEG) * SQUEEZE);
}

/** Bearing of a workspace point from the seated head, degrees. */
export function bearingOf(pos: Vector3): number {
  return (Math.atan2(pos.x - SEATED_HEAD.x, -(pos.z - SEATED_HEAD.z)) * 180) / Math.PI;
}

/** A panel placement moved in for a narrow field of view (rotated about the head's vertical axis). */
export function compactPlacement(pos: Vector3, rot: Euler): { pos: Vector3; rot: Euler } {
  const v = pos.clone().sub(SEATED_HEAD);
  const bearing = bearingOf(pos);
  const phi = ((bearing - compactBearing(bearing)) * Math.PI) / 180;
  const c = Math.cos(phi), s = Math.sin(phi);
  const out = new Vector3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c).add(SEATED_HEAD);
  return { pos: out, rot: new Euler(rot.x, rot.y + phi, rot.z, rot.order) };
}
