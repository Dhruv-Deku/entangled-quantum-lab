import { describe, expect, it } from 'vitest';
import { Lab } from '../lab/lab';
import { mulberry32 } from '../quantum/measure';
import type { VqeMemory } from './algorithm-chapters';
import { Campaign } from './campaign';
import { CHAPTERS } from './chapters';

function settle(c: Campaign, seconds = 3): void {
  for (let i = 0; i < seconds * 60; i++) c.update(1 / 60);
}

/** Play a chapter with the card buttons and Show me, collecting every payoff on the way. */
function play(title: string, seed = 1): { c: Campaign; lab: Lab; payoffs: string[] } {
  const lab = new Lab(1, mulberry32(seed));
  const c = new Campaign(lab);
  c.startChapter(CHAPTERS.findIndex((ch) => ch.title === title));
  const payoffs: string[] = [];
  for (let guard = 0; guard < 30 && !c.chapterDone; guard++) {
    if (c.view.step!.action) c.next();
    else expect(c.showMe(), `${title}: ${c.view.goal}`).toBe(true);
    c.update(0);
    if (c.payoff) payoffs.push(c.payoff);
    if (c.stepDone) c.next();
    settle(c);
  }
  expect(c.chapterDone, title).toBe(true);
  return { c, lab, payoffs };
}

describe('algorithm chapters', () => {
  it('there are 18 chapters, with the six new ones at the end', () => {
    expect(CHAPTERS).toHaveLength(18);
    expect(CHAPTERS.slice(12).map((c) => c.title)).toEqual(['Phase Wheel', 'Phase Estimation', 'Factoring 15', 'The H2 Molecule', 'Search 8 Boxes', "Simon's Secret"]);
  });

  it('Phase Wheel: QFT and back to 101', () => {
    const { lab } = play('Phase Wheel');
    expect(lab.state.probabilities()[5]).toBeCloseTo(1, 9);
  });

  it('Phase Estimation reads the secret angle', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { c, payoffs } = play('Phase Estimation', seed);
      const k = c.memoryValue('k') as number;
      expect(payoffs[payoffs.length - 1]).toContain(`reads ${k.toString(2).padStart(3, '0')}`);
    }
  });

  it('Factoring 15 finds period 4 and the factors 3 and 5', () => {
    const { payoffs } = play('Factoring 15');
    expect(payoffs[payoffs.length - 1]).toMatch(/period is 4/);
    expect(payoffs[payoffs.length - 1]).toMatch(/15 = 3 x 5/);
  });

  it('The H2 Molecule: Hartree-Fock, then VQE to the exact energy, then the whole curve', () => {
    const { c } = play('The H2 Molecule');
    const v = c.memoryValue('vqe') as VqeMemory;
    expect(v.energy).toBeCloseTo(v.fci, 4);
    expect(v.hf - v.energy).toBeGreaterThan(0.02);
    expect(v.curve).toHaveLength(24);
    const lowest = v.curve!.reduce((a, b) => (b[1] < a[1] ? b : a));
    expect(lowest[0]).toBeGreaterThan(0.69);
    expect(lowest[0]).toBeLessThan(0.81);
  });

  it('Search 8 Boxes: two rounds, the prize dominates the shots', () => {
    for (const seed of [1, 5, 9]) {
      const { c, lab } = play('Search 8 Boxes', seed);
      const secret = c.memoryValue('secret') as number;
      expect(lab.state.probabilities()[secret]).toBeCloseTo(0.9453, 3);
    }
  });

  it("Simon's Secret: the readings name the secret", () => {
    for (const seed of [1, 2, 3, 4, 6]) {
      const { c, payoffs } = play("Simon's Secret", seed);
      const s = c.memoryValue('s') as number;
      expect(payoffs[payoffs.length - 1]).toContain(`s = ${s.toString(2).padStart(2, '0')}`);
    }
  });
});
