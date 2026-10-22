import { describe, expect, it } from 'vitest';
import { Lab } from '../lab/lab';
import { mulberry32 } from '../quantum/measure';
import { Campaign } from './campaign';
import { countMoves, PUZZLES, puzzleTarget, starsFor } from './puzzles';

function settle(c: Campaign, seconds = 3): void {
  for (let i = 0; i < seconds * 60; i++) c.update(1 / 60);
}

function start(i: number) {
  const lab = new Lab(1, mulberry32(4));
  const c = new Campaign(lab);
  c.startPuzzle(i);
  return { lab, c };
}

describe('puzzles', () => {
  for (const [i, p] of PUZZLES.entries()) {
    it(`${p.title}: not solved at the start, solved at par by its reference solution`, () => {
      const { lab, c } = start(i);
      settle(c);
      expect(c.stepDone).toBe(false);
      for (const op of p.solution!) lab.apply(op);
      settle(c);
      expect(c.chapterDone).toBe(true);
      expect(c.view.stars[i]).toBe(3);
      expect(countMoves(p.solution!)).toBe(p.par);
    });
  }

  it('another route to the same state also counts (Minus: H then Z)', () => {
    const { lab, c } = start(PUZZLES.findIndex((p) => p.title === 'Minus'));
    lab.gate('h', 0);
    lab.gate('z', 0);
    settle(c);
    expect(c.chapterDone).toBe(true);
  });

  it('a global phase does not matter, but a relative one does', () => {
    const minusPair = PUZZLES.findIndex((p) => p.title === 'Minus pair');
    const { lab, c } = start(minusPair);
    lab.gate('h', 0);
    lab.entangle(0, 1);
    settle(c);
    expect(c.stepDone).toBe(false); // 00 + 11 is not 00 - 11
    lab.gate('z', 1); // the sign can go on either qubit
    settle(c);
    expect(c.chapterDone).toBe(true);
  });

  it('extra moves cost stars, and the best result is kept', () => {
    const i = PUZZLES.findIndex((p) => p.title === 'Upside down');
    const { lab, c } = start(i);
    for (const gate of ['h', 'h', 'z', 'x'] as const) lab.gate(gate, 0);
    settle(c);
    expect(c.view.stars[i]).toBe(1);
    c.startPuzzle(i);
    lab.gate('x', 0);
    settle(c);
    expect(c.view.stars[i]).toBe(3);
    c.startPuzzle(i);
    lab.gate('y', 0);
    lab.gate('z', 0);
    settle(c);
    expect(c.view.stars[i]).toBe(3);
  });

  it('stars: 3 at or under par, 2 within two, 1 otherwise', () => {
    expect([starsFor(2, 2), starsFor(1, 2), starsFor(4, 2), starsFor(5, 2)]).toEqual([3, 3, 2, 1]);
  });

  it('targets are normalised states with the right qubit count', () => {
    for (const p of PUZZLES) {
      const t = puzzleTarget(p);
      expect(t.n).toBe(p.qubits);
      expect(t.probabilities().reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
  });

  it('stars survive save and restore', () => {
    const { lab, c } = start(0);
    lab.gate('x', 0);
    settle(c);
    const c2 = new Campaign(new Lab(1));
    c2.restore(JSON.parse(JSON.stringify(c.toJSON())));
    expect(c2.view.stars[0]).toBe(3);
    expect(c2.mode).toBe('puzzle');
  });
});
