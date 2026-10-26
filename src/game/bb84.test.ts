import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../quantum/measure';
import { bb84Round, groverRounds } from './bb84';
import { bump, emptyQuests, QUEST_POOL, questsFor } from './quests';

describe('BB84', () => {
  it('without Eve, the kept bits always agree', () => {
    const rng = mulberry32(3);
    for (let k = 0; k < 50; k++) {
      const r = bb84Round(16, false, rng);
      expect(r.errors).toBe(0);
      for (const p of r.photons) if (p.kept) expect(p.bobBit).toBe(p.bit);
    }
  });

  it('with Eve, about a quarter of the kept bits are wrong', () => {
    const rng = mulberry32(8);
    let kept = 0, wrong = 0;
    for (let k = 0; k < 400; k++) {
      const r = bb84Round(16, true, rng);
      for (const p of r.photons) if (p.kept) {
        kept++;
        if (p.bobBit !== p.bit) wrong++;
      }
    }
    expect(wrong / kept).toBeGreaterThan(0.21);
    expect(wrong / kept).toBeLessThan(0.29);
  });

  it('about half the photons are kept; half of those are checked, the rest is the key', () => {
    const r = bb84Round(400, false, mulberry32(1));
    expect(r.kept).toBeGreaterThan(160);
    expect(r.kept).toBeLessThan(240);
    expect(r.checked + r.key.length).toBe(r.kept);
  });

  it('Grover needs about (pi/4) sqrt(N) rounds', () => {
    expect([4, 8, 16, 1024].map(groverRounds)).toEqual([2, 2, 3, 25]);
  });
});

describe('daily quests', () => {
  it('three a day, the same for everyone, each counting something different', () => {
    for (const day of ['2026-10-27', '2026-10-28', '2026-11-01']) {
      const q = questsFor(day);
      expect(q).toHaveLength(3);
      expect(new Set(q.map((x) => x.counter)).size).toBe(3);
      expect(questsFor(day)).toEqual(q);
    }
    expect(QUEST_POOL.length).toBeGreaterThanOrEqual(12);
  });

  it('counting finishes a quest once, a Rush score is a best not a sum, and a new day starts over', () => {
    const s = emptyQuests();
    const day = '2026-10-27';
    const qs = questsFor(day);
    const q = qs[0];
    const step = q.max ? q.goal : 1;
    let finished: string[] = [];
    for (let i = 0; i < q.goal + 3; i++) finished = [...finished, ...bump(s, day, q.counter, step).map((x) => x.id)];
    expect(finished).toEqual([q.id]);
    expect(s.total).toBe(1);
    bump(s, '2026-10-28', 'gates', 1);
    expect(s.done).not.toContain(q.id);
    const rush = emptyQuests();
    // a Rush quest only completes on a big enough single score
    const dayWithRush = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].find((d) => questsFor(d).some((x) => x.counter === 'rush'));
    if (dayWithRush) {
      expect(bump(rush, dayWithRush, 'rush', 600)).toEqual([]);
      expect(bump(rush, dayWithRush, 'rush', 600)).toEqual([]);
      expect(bump(rush, dayWithRush, 'rush', 1200).map((x) => x.id)).toEqual(['rush1000']);
    }
  });
});
