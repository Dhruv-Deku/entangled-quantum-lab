import { describe, expect, it } from 'vitest';
import { bitLabel, levelsFor, match, MAX_LEVEL, probsOf, resample, sampleShots, tapLevel } from './sculpt';
import { prepare } from '../quantum/stateprep';
import { run } from '../quantum/circuit';
import { mulberry32 } from '../quantum/measure';

describe('state sculptor', () => {
  it('a tap climbs one step and wraps to empty past the top', () => {
    const seen = [0];
    for (let i = 0; i < MAX_LEVEL + 1; i++) seen.push(tapLevel(seen[seen.length - 1]));
    expect(seen).toEqual([0, 1, 2, 3, 4, 0]);
    expect(tapLevel(2.7)).toBe(3);
    expect(tapLevel(MAX_LEVEL)).toBe(0);
  });

  it('ready-made shapes put their tallest bar at the top step', () => {
    for (const n of [2, 3, 4]) {
      const l = levelsFor('bell', n);
      expect(l).toHaveLength(2 ** n);
      expect(Math.max(...l)).toBeCloseTo(MAX_LEVEL, 12);
    }
  });

  it('bars read as a distribution, and empty bars as none', () => {
    expect(probsOf([1, 1, 2, 0])).toEqual([0.25, 0.25, 0.5, 0]);
    expect(probsOf([0, 0, 0, 0])).toBeNull();
  });

  it('shots from the prepared state match what was drawn', () => {
    const levels = [4, 0, 1, 3, 2, 0, 0, 4];
    const target = probsOf(levels)!;
    const probs = Array.from(run(3, prepare(target), () => 0.5).state.probabilities());
    target.forEach((p, k) => expect(probs[k]).toBeCloseTo(p, 9));
    const counts = sampleShots(probs, 4000, mulberry32(3));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4000);
    expect(counts[1]).toBe(0);
    expect(match(target, counts)).toBeGreaterThan(0.99);
    // far from a different shape
    expect(match([0, 1, 0, 0, 0, 0, 0, 0], counts)).toBeLessThan(0.1);
  });

  it('keeps the shape when the qubit count changes', () => {
    expect(resample([1, 2, 3, 4], 8)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(resample([1, 1, 2, 2, 3, 3, 4, 4], 4)).toEqual([1, 2, 3, 4]);
  });

  it('labels outcomes with qubit n-1 first', () => {
    expect(bitLabel(6, 4)).toBe('0110');
    expect(bitLabel(1, 2)).toBe('01');
  });
});
