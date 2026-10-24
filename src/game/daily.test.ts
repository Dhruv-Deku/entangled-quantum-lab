import { describe, expect, it } from 'vitest';
import { Lab } from '../lab/lab';
import { run } from '../quantum/circuit';
import { mulberry32 } from '../quantum/measure';
import { Campaign } from './campaign';
import { CHAPTERS } from './chapters';
import { COURSE } from './course';
import { bestStreak, dailyChapter, dailyNumber, dailyPuzzle, emptyDaily, recordDaily, shareText, shortestPath, streak } from './daily';
import { LESSONS } from './lessons';
import { PUZZLES } from './puzzles';

const days = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date(`${from}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

describe('daily challenge', () => {
  it('is the same puzzle all day for everyone, and changes from day to day', () => {
    const a = dailyPuzzle('2026-10-25'), b = dailyPuzzle('2026-10-25'), c = dailyPuzzle('2026-10-26');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.solution)).not.toBe(JSON.stringify(c.solution));
    expect(dailyNumber('2026-10-01')).toBe(1);
    expect(dailyNumber('2026-10-25')).toBe(25);
    expect(dailyNumber('2026-11-17')).toBe(48);
  });

  it('par is the true minimum: no shorter sequence of moves makes the target', () => {
    for (const key of days('2026-10-20', 20)) {
      const d = dailyPuzzle(key);
      expect(d.solution.length).toBeGreaterThanOrEqual(2);
      expect(d.solution.length).toBeLessThanOrEqual(4);
      const used = new Set(d.solution.flatMap((o) => (o.kind === 'gate' ? [o.target, ...(o.controls ?? [])] : o.kind === 'swap' ? [o.a, o.b] : [])));
      expect(used.size).toBe(d.n);
      const target = run(d.n, d.solution, () => 0.5).state;
      expect(shortestPath(d.n, target, d.solution.length - 1)).toBeNull();
    }
  });

  it('makes a puzzle quickly enough to build at startup', () => {
    const t0 = performance.now();
    for (const key of days('2026-12-01', 10)) dailyPuzzle(key);
    expect((performance.now() - t0) / 10).toBeLessThan(400);
  });

  it('solving it records the day for the streak, not puzzle stars', () => {
    const lab = new Lab(1, mulberry32(1));
    const daily = dailyChapter('2026-10-25');
    const c = new Campaign(lab, CHAPTERS, LESSONS, [...PUZZLES, daily], COURSE);
    c.startPuzzle(PUZZLES.length);
    c.next();
    for (const op of daily.solution!) lab.apply(op);
    for (let i = 0; i < 300; i++) c.update(1 / 60);
    expect(c.chapterDone).toBe(true);
    expect(c.lastDaily).toEqual({ key: '2026-10-25', moves: daily.par, par: daily.par });
    expect(c.view.stars[PUZZLES.length]).toBe(0);
  });

  it('counts streaks, keeps the best result, and writes a line to share', () => {
    let r = emptyDaily();
    for (const key of ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-24', '2026-10-25']) r = recordDaily(r, key, 4, 3);
    expect(streak(r, '2026-10-25')).toBe(2);
    expect(streak(r, '2026-10-26')).toBe(2); // today still open: yesterday's run counts
    expect(streak(r, '2026-10-27')).toBe(0);
    expect(bestStreak(r)).toBe(3);
    r = recordDaily(r, '2026-10-25', 3, 3);
    expect(r.days['2026-10-25'].moves).toBe(3);
    expect(recordDaily(r, '2026-10-25', 5, 3)).toBe(r);
    expect(shareText(r, '2026-10-25', 'https://x/#daily')).toBe('Entangled daily #25: 3 moves (par 3), 3 of 3 stars. Streak: 2 days. https://x/#daily');
  });
});
