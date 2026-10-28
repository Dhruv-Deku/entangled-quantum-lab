import { describe, expect, it } from 'vitest';
import { run } from '../quantum/circuit';
import { addDays, DECK, emptyMemory, finishSession, mastery, parseMemory, planSession, review, sessionStreak, SESSION_SIZE, shuffledChoices, tomorrow, type MemoryState } from './today';

const day = '2026-11-02';

describe('Today: five minutes of spaced repetition', () => {
  it('counts days across months and years', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays(day, 16)).toBe('2026-11-18');
  });

  it('moves a card up a box when right first time, back to tomorrow when missed', () => {
    let st = review(emptyMemory(), 'plus', true, day);
    expect(st.cards.plus).toEqual({ box: 1, due: '2026-11-03', seen: 1, right: 1 });
    st = review(st, 'plus', true, '2026-11-03');
    expect(st.cards.plus.box).toBe(2);
    expect(st.cards.plus.due).toBe('2026-11-05');
    st = review(st, 'plus', false, '2026-11-05');
    expect(st.cards.plus).toEqual({ box: 1, due: '2026-11-06', seen: 3, right: 2 });
  });

  it('starts with three new cards, one of them to make with your hands', () => {
    const plan = planSession(emptyMemory(), day);
    expect(plan.map((c) => c.id)).toEqual(['plus', 'measure-plus', 'one']);
    expect(plan.some((c) => c.kind === 'make')).toBe(true);
  });

  it('puts due cards first, never more than five, and always one to make', () => {
    let st = emptyMemory();
    // four quiz cards seen yesterday, all due today
    for (const id of ['measure-plus', 'hh', 'z-odds', 'cnot']) st = review(st, id, false, addDays(day, -1));
    const plan = planSession(st, day);
    expect(plan.length).toBe(SESSION_SIZE);
    expect(plan.slice(0, 4).map((c) => c.id).sort()).toEqual(['cnot', 'hh', 'measure-plus', 'z-odds']);
    expect(plan[4].kind).toBe('make');
  });

  it('a month of daily sessions meets every card and moves most of them to solid ground', () => {
    let st: MemoryState = emptyMemory();
    let d = day;
    for (let i = 0; i < 40; i++) {
      const plan = planSession(st, d);
      expect(plan.length).toBeLessThanOrEqual(SESSION_SIZE);
      expect(plan.length).toBeGreaterThan(0);
      for (const c of plan) st = review(st, c.id, true, d);
      st = finishSession(st, d, plan.length, plan.length);
      d = addDays(d, 1);
    }
    const m = mastery(st);
    expect(m.unseen).toBe(0);
    expect(m.solid).toBeGreaterThan(DECK.length / 2);
    expect(sessionStreak(st, d)).toBe(40);
    expect(sessionStreak(st, addDays(d, 2))).toBe(0);
  });

  it('knows what tomorrow brings', () => {
    let st = emptyMemory();
    for (const c of planSession(st, day)) st = review(st, c.id, true, day);
    expect(tomorrow(st, day)).toEqual({ due: 3, fresh: 3 });
  });

  it('shuffles answers the same way all day, and knows where the right one went', () => {
    for (const c of DECK.filter((x) => x.kind === 'quiz')) {
      const a = shuffledChoices(c, day), b = shuffledChoices(c, day);
      expect(a).toEqual(b);
      expect(a.labels[a.right]).toBe(c.choices![0]);
      expect([...a.labels].sort()).toEqual([...c.choices!].sort());
    }
  });

  it('every make card is solvable by its own solution, on the stated qubits', () => {
    for (const c of DECK.filter((x) => x.kind === 'make')) {
      expect(c.qubits).toBeGreaterThan(0);
      const s = run(c.qubits!, c.solution!, () => 0.5).state;
      expect(s.n).toBe(c.qubits);
    }
  });

  it('reads stored memory carefully', () => {
    expect(parseMemory(null)).toEqual(emptyMemory());
    expect(parseMemory('nope')).toEqual(emptyMemory());
    const st = parseMemory(JSON.stringify({ cards: { plus: { box: 9, due: '2026-11-03', seen: 2, right: 1 }, bad: { box: 1, due: 'soon' } }, sessions: { '2026-11-02': { cards: 5, right: 4 }, nope: {} } }));
    expect(st.cards.plus.box).toBe(5);
    expect(st.cards.bad).toBeUndefined();
    expect(Object.keys(st.sessions)).toEqual(['2026-11-02']);
  });
});
