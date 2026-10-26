import { describe, expect, it } from 'vitest';
import { run, type Op } from '../quantum/circuit';
import { ACHIEVEMENTS, levelFor, Profile, xpFor, xpForLevel, type ProgressContext } from './profile';

const ctx = (o: Partial<ProgressContext> = {}): ProgressContext => ({
  chaptersDone: [],
  chapterCount: 25,
  lessonsDone: 0,
  lessonCount: 15,
  courseDone: 0,
  courseCount: 14,
  stars: new Array(12).fill(0),
  dailyDays: 0,
  streak: 0,
  ...o,
});

/** Play ops one at a time, telling the profile about each. */
function play(p: Profile, n: number, ops: Op[]): void {
  const done: Op[] = [];
  for (const op of ops) {
    done.push(op);
    p.onOp(op, run(n, done, () => 0.5).state);
  }
}

const h = (q: number): Op => ({ kind: 'gate', gate: 'h', target: q });
const cx = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });

describe('achievements', () => {
  it('have unique ids and every one can be reached', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20);
  });

  it('unlock from what happens on the orbs, once each', () => {
    const p = new Profile();
    play(p, 2, [h(0)]);
    expect(p.check(ctx()).map((a) => a.id).sort()).toEqual(['first-gate', 'superposition']);
    play(p, 2, [h(0), cx(0, 1)]);
    expect(p.check(ctx()).map((a) => a.id)).toEqual(['bell']);
    expect(p.check(ctx())).toEqual([]);
    play(p, 5, [h(0), cx(0, 1), cx(1, 2), cx(2, 3), cx(3, 4)]);
    expect(p.check(ctx()).map((a) => a.id)).toEqual(['ghz5']);
  });

  it('counters show progress and unlock at the goal', () => {
    const p = new Profile();
    const shots = ACHIEVEMENTS.find((a) => a.id === 'shots')!;
    p.onShots(100);
    expect(shots.progress!(p.data.stats, ctx())).toEqual([100, 1000]);
    for (let i = 0; i < 9; i++) p.onShots(100);
    expect(p.check(ctx()).map((a) => a.id)).toContain('shots');
    const views = ACHIEVEMENTS.find((a) => a.id === 'views')!;
    p.use('view:qsphere');
    p.use('view:qsphere');
    p.use('view:city');
    expect(views.progress!(p.data.stats, ctx())).toEqual([2, 5]);
  });

  it('progress elsewhere counts too: chapters, puzzles, daily streaks', () => {
    const p = new Profile();
    const got = p.check(ctx({ chaptersDone: ['Superposition', 'Bell Test', 'A', 'B', 'C'], stars: new Array(12).fill(3), dailyDays: 3, streak: 3 })).map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['chapters5', 'puzzles', 'daily', 'streak3', 'bell-test']));
    expect(got).not.toContain('streak7');
    expect(got).not.toContain('chapters-all');
  });

  it('survives a save and load', () => {
    const p = new Profile();
    p.use('voice');
    p.onShots(40);
    p.check(ctx());
    const q = new Profile(JSON.parse(JSON.stringify(p.toJSON())));
    expect(q.data.stats.shots).toBe(40);
    expect(q.data.unlocked.voice).toBeDefined();
    expect(q.check(ctx())).toEqual([]);
  });
});

describe('XP and levels', () => {
  it('levels need 0, 100, 300, 600 ... XP', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
    expect(levelFor(0)).toMatchObject({ level: 1, title: 'Newcomer', into: 0, span: 100 });
    expect(levelFor(350)).toMatchObject({ level: 3, title: 'Apprentice', into: 50, span: 300 });
  });

  it('XP adds up progress and achievements', () => {
    const p = new Profile();
    p.data.unlocked = { a: 1, b: 2 };
    expect(xpFor(p.data, ctx({ chaptersDone: ['x'], lessonsDone: 2, stars: [3, 2, 0], dailyDays: 1 }))).toBe(50 + 40 + 75 + 30 + 50);
  });
});
