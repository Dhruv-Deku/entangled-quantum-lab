import { Vector3 } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import { fringeSpacing, patternHalfWidth, pickDesk, pickWall, type Surface } from './room';

const rect = (label: string, cx: number, y: number, cz: number, w: number, d: number, ny = 1): Surface => ({
  label,
  horizontal: true,
  center: new Vector3(cx, y, cz),
  normal: new Vector3(0, ny, 0),
  size: [w, d],
  corners: [new Vector3(cx - w / 2, y, cz - d / 2), new Vector3(cx + w / 2, y, cz - d / 2), new Vector3(cx + w / 2, y, cz + d / 2), new Vector3(cx - w / 2, y, cz + d / 2)],
});

/** A wall facing +z (or -z with flip) at depth z, spanning x0..x1 and floor to 2.6 m. */
const wallZ = (label: string, z: number, x0: number, x1: number, flip = false): Surface => ({
  label,
  horizontal: false,
  center: new Vector3((x0 + x1) / 2, 1.3, z),
  normal: new Vector3(0, 0, flip ? -1 : 1),
  size: [x1 - x0, 2.6],
  corners: [new Vector3(x0, 0, z), new Vector3(x1, 0, z), new Vector3(x1, 2.6, z), new Vector3(x0, 2.6, z)],
});

// the emulator's room: floor and table planes report their normals pointing down
const room = [rect('floor', 0, 0.05, 0.18, 2.46, 2.42, -1), rect('ceiling', 0, 2.77, 0.18, 2.46, 2.42), rect('table', 0.06, 0.75, -0.65, 1.6, 0.75, -1), rect('plant', -0.99, 0.79, -0.51, 0.39, 0.4), wallZ('wall', -1.05, -1.23, 1.23)];
const head = new Vector3(0, 1.2, 0.2);
const ahead = new Vector3(0, 0, -1);

describe('the real room, seated', () => {
  it('puts the desk on the table in front, where the hands are, within reach', () => {
    const d = pickDesk(room, head, ahead)!;
    expect(d.surface.label).toBe('table');
    expect(d.spot.y).toBeCloseTo(0.75, 9);
    // 40 cm ahead would be just off the table: 12 cm in from its near edge (z = -0.275)
    expect(d.spot.z).toBeCloseTo(-0.395, 6);
    expect(d.spot.x).toBeCloseTo(0, 6);
    // sitting at the table, the lab is exactly where it would float
    const close = pickDesk(room, new Vector3(0.1, 1.2, 0), ahead)!;
    expect(close.spot.z).toBeCloseTo(-0.4, 6);
    expect(close.spot.x).toBeCloseTo(0.1, 6);
  });

  it('ignores a table behind the player, across the room, or no table at all', () => {
    expect(pickDesk(room, head, new Vector3(0, 0, 1))).toBeNull();
    expect(pickDesk(room, new Vector3(0, 1.2, 2.5), ahead)).toBeNull();
    // the emulator's standing-back pose: the table is out of seated reach
    expect(pickDesk(room, new Vector3(0, 1.2, 0.35), ahead)).toBeNull();
    expect(pickDesk([room[0], room[1]], head, ahead)).toBeNull();
  });

  it('never picks the floor, a tiny shelf or a surface above the eyes', () => {
    const odd = [rect('floor', 0, 0.02, -0.4, 3, 3), rect('shelf', 0, 0.9, -0.4, 0.15, 0.15), rect('table', 0, 1.3, -0.4, 1, 1)];
    expect(pickDesk(odd, head, ahead)).toBeNull();
  });

  it('finds the wall straight ahead whichever way its normal points', () => {
    for (const flip of [false, true]) {
      const w = pickWall([...room.slice(0, 4), wallZ('wall', -1.05, -1.23, 1.23, flip)], new Vector3(0, 0.8, 0.2), ahead)!;
      expect(w.distance).toBeCloseTo(1.25, 6);
      expect(w.normal.z).toBeCloseTo(1, 6);
    }
  });

  it('ignores walls too close, off to the side, or behind; prefers a wall over a door', () => {
    const origin = new Vector3(0, 0.8, 0.2);
    const near = pickWall([wallZ('wall', 0, -1, 1)], origin, ahead);
    expect(near).toBeNull();
    expect(pickWall([wallZ('wall', -2, 0.5, 2)], origin, ahead)).toBeNull();
    expect(pickWall([wallZ('wall', 2, -1, 1)], origin, ahead)).toBeNull();
    const w = pickWall([wallZ('door', -1.5, -0.5, 0.5), wallZ('wall', -2.5, -2, 2)], origin, ahead)!;
    expect(w.label).toBe('wall');
    expect(w.distance).toBeCloseTo(2.7, 6);
    expect(w.normal.z).toBeCloseTo(1, 6);
    expect(w.point.z).toBeCloseTo(-2.5, 6);
  });

  it('spreads the stripes with distance: lambda L / d', () => {
    expect(fringeSpacing(1)).toBeCloseTo(0.040625, 9);
    expect(fringeSpacing(3) / fringeSpacing(1.5)).toBeCloseTo(2, 9);
    expect(patternHalfWidth(2.5)).toBeCloseTo(5 * fringeSpacing(2.5), 9);
  });
});
