import { describe, expect, it } from 'vitest';
import { run } from '../quantum/circuit';
import { mulberry32 } from '../quantum/measure';
import { QState } from '../quantum/state';
import { ket, makeTarget, nextTarget, points, RUSH_SECONDS, RushSession, tierFor } from './rush';

describe('Quantum Rush', () => {
  it('targets climb from one gate to entangled states, with true minimum par', () => {
    expect([0, 2, 3, 5, 6, 8, 9, 20].map(tierFor)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    const bell = makeTarget({ name: 'Bell', ops: [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 1, controls: [0] }] }, 3);
    expect(bell.par).toBe(2);
    // a longer recipe for a short state still gets the short par
    const flip = makeTarget({ name: 'X twice and once', ops: [{ kind: 'gate', gate: 'x', target: 0 }, { kind: 'gate', gate: 'x', target: 0 }, { kind: 'gate', gate: 'x', target: 0 }] }, 1);
    expect(flip.par).toBe(1);
    const rng = mulberry32(4);
    const seen = new Set<string>();
    for (let solved = 0; solved < 14; solved++) {
      const t = nextTarget(solved, seen, rng);
      seen.add(t.name);
      expect(t.tier).toBe(tierFor(solved));
      expect(t.par).toBeGreaterThanOrEqual(1);
      expect(t.state.probabilities()[0]).toBeLessThan(0.999);
    }
  });

  it('scores par, speed and combo', () => {
    expect(points(2, 0, 1)).toBe(400);
    expect(points(2, 12, 1)).toBe(200);
    expect(points(2, 30, 1)).toBe(200);
    expect(points(1, 3, 3)).toBe(450);
  });

  it('a round: solves extend the clock and build a combo, a skip breaks it', () => {
    const r = new RushSession(0, mulberry32(9));
    expect(r.timeLeft(0)).toBe(RUSH_SECONDS);
    // make the first target with its own recipe
    expect(r.matches(run(2, r.target.ops, () => 0.5).state)).toBe(true);
    expect(r.matches(new QState(2))).toBe(false);
    const a = r.solve(4);
    expect(a.combo).toBe(1);
    const b = r.solve(8);
    expect(b.combo).toBe(2);
    expect(r.timeLeft(8)).toBe(RUSH_SECONDS - 8 + 6);
    r.skip(10);
    expect(r.combo).toBe(1);
    expect(r.solve(30).combo).toBe(1);
    expect(r.solved).toBe(3);
    expect(r.score).toBe(a.points + b.points + r.results[2].points);
    expect(r.over(200)).toBe(true);
  });

  it('writes states as kets', () => {
    const bell = run(2, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 1, controls: [0] }], () => 0.5).state;
    expect(ket(bell)).toBe('|00> + |11>');
    const iState = run(1, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 's', target: 0 }], () => 0.5).state;
    expect(ket(iState)).toBe('|0> + i|1>');
    const minus = run(1, [{ kind: 'gate', gate: 'x', target: 0 }, { kind: 'gate', gate: 'h', target: 0 }], () => 0.5).state;
    expect(ket(minus)).toBe('|0> - |1>');
    expect(ket(new QState(2))).toBe('|00>');
  });
});

describe('Quantum Rush leaderboard', () => {
  it('keeps the five best rounds, best first, and reports a new best', async () => {
    const { Profile } = await import('./profile');
    const p = new Profile();
    const scores = [800, 2400, 300, 1500, 5100, 900, 1200];
    const bests = scores.map((s, i) => p.onRush(s, 2, `2026-10-${10 + i}`));
    expect(bests).toEqual([true, true, false, false, true, false, false]);
    expect(p.data.stats.rushTop.map((t) => t.score)).toEqual([5100, 2400, 1500, 1200, 900]);
    expect(p.data.stats.rushBest).toBe(5100);
  });
});
