import { describe, expect, it } from 'vitest';
import { contrastColor, contrastRatio } from './contrast';

/** Text and background pairs the panels use (dim labels, body text, buttons). */
const PAIRS: [string, string][] = [
  ['#8a8d93', '#1b1c1f'],
  ['#8a8d93', '#242528'],
  ['#6b6e75', '#2d2f33'],
  ['#b8bbc1', '#1b1c1f'],
  ['#e4e6eb', '#34363b'],
  ['#ffffff', '#2d7ff9'],
  ['#3ddc97', '#1f3a30'],
  ['#7fa9f5', '#1b1c1f'],
  ['#ff8a7a', '#3a2523'],
];

describe('high contrast', () => {
  it('lifts every text and background pair the panels use to WCAG AA (4.5:1)', () => {
    for (const [fg, bg] of PAIRS) {
      const f = contrastColor(fg, 'color') as string, b = contrastColor(bg, 'backgroundColor') as string;
      expect(contrastRatio(f, b), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('never makes a pair worse, and leaves non-colours alone', () => {
    for (const [fg, bg] of PAIRS) expect(contrastRatio(contrastColor(fg, 'color') as string, contrastColor(bg, 'backgroundColor') as string)).toBeGreaterThanOrEqual(contrastRatio(fg, bg));
    expect(contrastColor('transparent', 'color')).toBe('transparent');
    expect(contrastColor(undefined, 'backgroundColor')).toBeUndefined();
    expect(contrastColor('#34363b', 'borderColor')).toBe('#d6d8dc');
  });
});
