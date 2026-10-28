import { Euler, Vector3 } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import { bearingOf, compactBearing, compactPlacement, SEATED_HEAD } from './fov-layout';

describe('field of view layout', () => {
  it('leaves the middle alone and squeezes the sides', () => {
    expect(compactBearing(10)).toBe(10);
    expect(compactBearing(-25)).toBe(-25);
    expect(compactBearing(47.5)).toBeCloseTo(30.625, 9);
    expect(compactBearing(-60)).toBeCloseTo(-33.75, 9);
  });

  it('moves the chapter card and the dock inside a narrow view, same distance, still facing you', () => {
    for (const [pos, yaw] of [
      [new Vector3(-0.47, 0.2, -0.03), 32],
      [new Vector3(0.4, 0.09, 0.07), -36],
      [new Vector3(0.47, 0.26, -0.06), -32],
    ] as const) {
      const before = bearingOf(pos);
      const rot = new Euler(-0.1, (yaw * Math.PI) / 180, 0, 'YXZ');
      const c = compactPlacement(pos, rot);
      expect(Math.abs(bearingOf(c.pos))).toBeLessThan(31.5);
      expect(Math.abs(bearingOf(c.pos))).toBeGreaterThan(25);
      expect(c.pos.distanceTo(SEATED_HEAD)).toBeCloseTo(pos.distanceTo(SEATED_HEAD), 9);
      expect(c.pos.y).toBeCloseTo(pos.y, 9);
      // turned by as much as it moved round, so it faces the head as before
      const moved = before - bearingOf(c.pos);
      expect((((c.rot.y - rot.y) * 180) / Math.PI)).toBeCloseTo(moved, 6);
      expect(c.rot.x).toBe(rot.x);
    }
  });
});
