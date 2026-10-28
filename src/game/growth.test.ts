import { describe, expect, it } from 'vitest';
import { growthOf, grewSince, heightFor, ringDays, tintOf } from './growth';
import { addDays, DECK, emptyMemory, finishSession, planSession, review, type MemoryState } from './today';

const day = '2026-11-02';

function study(st: MemoryState, d: string, right = true): MemoryState {
  const plan = planSession(st, d);
  for (const c of plan) st = review(st, c.id, right, d);
  return finishSession(st, d, plan.length, right ? plan.length : 0);
}

describe('your crystal', () => {
  it('starts bare, and grows a shard for each idea you meet', () => {
    expect(growthOf(emptyMemory(), day).shards).toEqual([]);
    const st = study(emptyMemory(), day);
    const g = growthOf(st, day);
    expect(g.shards.map((s) => s.id)).toEqual(['plus', 'measure-plus', 'one']);
    expect(g.todayDone).toBe(true);
    expect(g.days).toEqual([day]);
  });

  it('keeps every shard in its own spot as it grows, inside a small base', () => {
    let st = emptyMemory();
    let d = day;
    const spots = new Map<string, string>();
    for (let i = 0; i < 12; i++) {
      st = study(st, d);
      for (const s of growthOf(st, d).shards) {
        const key = `${s.x.toFixed(6)},${s.z.toFixed(6)}`;
        expect(spots.get(s.id) ?? key).toBe(key);
        spots.set(s.id, key);
        expect(Math.hypot(s.x, s.z)).toBeLessThan(0.045);
      }
      d = addDays(d, 1);
    }
    const g = growthOf(st, d);
    // no two shards share a spot
    const keys = g.shards.map((s) => `${s.x.toFixed(4)},${s.z.toFixed(4)}`);
    expect(new Set(keys).size).toBe(keys.length);
    // new ideas join while reviews leave room: most of the deck in twelve days
    expect(g.shards.length).toBeGreaterThan(DECK.length / 2);
  });

  it('shards rise as you learn them, and say what grew', () => {
    const a = study(emptyMemory(), day);
    const b = study(a, addDays(day, 1));
    const ga = growthOf(a, addDays(day, 1)), gb = growthOf(b, addDays(day, 1));
    const grew = grewSince(ga, gb);
    expect(grew.fresh.length).toBeGreaterThan(0);
    expect(grew.rose).toEqual(expect.arrayContaining(['plus', 'measure-plus', 'one']));
    expect(gb.shards.find((s) => s.id === 'plus')!.height).toBeCloseTo(heightFor(2), 9);
    expect(gb.streak).toBe(2);
    expect(ga.todayDone).toBe(false);
  });

  it('tints entanglement gold, as the lab does, and marks the days you came', () => {
    expect(tintOf('Entanglement')).toBe('#e2b04a');
    expect(tintOf('Phase')).toBe('#9b87f5');
    const st = study(study(emptyMemory(), day), addDays(day, 2));
    const rings = ringDays(growthOf(st, addDays(day, 2)), addDays(day, 2), 5);
    expect(rings).toEqual([false, false, true, false, true]);
  });
});
