import { Vector3 } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../quantum/measure';
import { pickDesk, pickHidingSpots, type Surface } from './room';

const rect = (label: string, cx: number, y: number, cz: number, w: number, d: number, ny = 1): Surface => ({
  label,
  horizontal: true,
  center: new Vector3(cx, y, cz),
  normal: new Vector3(0, ny, 0),
  size: [w, d],
  corners: [new Vector3(cx - w / 2, y, cz - d / 2), new Vector3(cx + w / 2, y, cz - d / 2), new Vector3(cx + w / 2, y, cz + d / 2), new Vector3(cx - w / 2, y, cz + d / 2)],
});
// the emulator's room: floor and table planes report their normals pointing down
const room = [rect('floor', 0, 0.05, 0.18, 2.46, 2.42, -1), rect('ceiling', 0, 2.77, 0.18, 2.46, 2.42), rect('table', 0.06, 0.75, -0.65, 1.6, 0.75, -1), rect('plant', -0.99, 0.79, -0.51, 0.39, 0.4)];

describe('the real room', () => {
  it('finds the desk, and a spot on its near side', () => {
    const d = pickDesk(room, new Vector3(0, 1.2, 0.2))!;
    expect(d.surface.label).toBe('table');
    expect(d.spot.y).toBeCloseTo(0.75, 9);
    expect(d.spot.z).toBeGreaterThan(-0.65);
    expect(pickDesk([room[0], room[1]], new Vector3(0, 1.6, 0))).toBeNull();
  });

  it('hides qubits on the floor and furniture, spread out, inside the room, never on the ceiling', () => {
    for (let seed = 1; seed <= 20; seed++) {
    const spots = pickHidingSpots(room, new Vector3(0, 1.6, 0), 6, mulberry32(seed));
    expect(spots).toHaveLength(6);
    for (const p of spots) {
      expect(p.x).toBeGreaterThan(-1.25);
      expect(p.x).toBeLessThan(1.25);
      expect(p.z).toBeGreaterThan(-1.05);
      expect(p.z).toBeLessThan(1.4);
      expect(p.y).toBeLessThan(1);
    }
    expect(spots.filter((p) => p.y < 0.3).length).toBeGreaterThanOrEqual(2);
    let closest = Infinity;
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) closest = Math.min(closest, spots[i].distanceTo(spots[j]));
    expect(closest).toBeGreaterThan(0.4);
    }
  });
});
