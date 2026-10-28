import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, horizontalFov, layoutFor, parseSettings } from './settings';

describe('settings', () => {
  it('falls back to the defaults for missing, broken or odd data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings(JSON.stringify({ contrast: true, fov: 'tiny', dwell: 'fast', pinned: 42, wristHand: 'right', extra: 1 }));
    expect(s.contrast).toBe(true);
    expect(s.fov).toBe('auto');
    expect(s.dwell).toBe('fast');
    expect(s.pinned).toBeNull();
    expect(s.wristHand).toBe('right');
    expect('extra' in s).toBe(false);
  });

  it('reads the field of view from a projection matrix and picks a layout', () => {
    // a symmetric 100 degree frustum: m0 = 1 / tan(50 degrees)
    const t = Math.tan((50 * Math.PI) / 180);
    const p = [1 / t, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -0.02, 0];
    expect(horizontalFov(p)).toBeCloseTo(100, 6);
    // asymmetric (an eye's frustum is skewed toward the nose): 40 degrees out, 55 in
    const l = Math.tan((40 * Math.PI) / 180), r = Math.tan((55 * Math.PI) / 180);
    const q = [2 / (l + r), 0, 0, 0, 0, 1, 0, 0, (r - l) / (l + r), 0, -1, -1, 0, 0, -0.02, 0];
    expect(horizontalFov(q)).toBeCloseTo(95, 6);
    expect(layoutFor('auto', 100)).toBe('wide');
    expect(layoutFor('auto', 70)).toBe('compact');
    expect(layoutFor('auto', null)).toBe('wide');
    expect(layoutFor('compact', 120)).toBe('compact');
  });
});
