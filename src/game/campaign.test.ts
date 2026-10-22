import { describe, expect, it } from 'vitest';
import { Lab } from '../lab/lab';
import { mulberry32 } from '../quantum/measure';
import { Campaign } from './campaign';

/** Advance the campaign until the current step's goal is met and the next step starts. */
function settle(c: Campaign, seconds = 3): void {
  for (let i = 0; i < seconds * 60; i++) c.update(1 / 60);
}

function setup(seed = 1) {
  const lab = new Lab(1, mulberry32(seed));
  const c = new Campaign(lab);
  c.startChapter(0);
  return { lab, c };
}

describe('campaign: every chapter is completable with the same actions the gestures produce', () => {
  it('Chapter 1: rotate, Hadamard, measure', () => {
    const { lab, c } = setup();
    expect(c.view.step?.goal).toBe('Tilt the arrow away from 0');
    lab.rotate(0, 1.2);
    settle(c);
    expect(c.stepIndex).toBe(1);
    expect(lab.state.prob1(0)).toBeCloseTo(0, 9); // step 2 resets to |0>
    lab.gate('h', 0);
    settle(c);
    expect(c.stepIndex).toBe(2);
    lab.measure(0);
    settle(c);
    expect(c.chapterDone).toBe(true);
  });

  it('Chapter 2: two Hadamards return to 0, and 100 shots confirm it', () => {
    const { lab, c } = setup();
    c.startChapter(1);
    lab.gate('h', 0);
    settle(c);
    lab.gate('h', 0);
    settle(c);
    expect(c.stepIndex).toBe(2);
    lab.shots(100);
    settle(c);
    expect(c.chapterDone).toBe(true);
  });

  it('Chapter 3: Hadamard, entangle (control from the step), shots, measure', () => {
    const { lab, c } = setup();
    c.startChapter(2);
    lab.gate('h', 0);
    settle(c);
    expect(lab.preferredControl).toBe(0);
    lab.entangle(0, 1);
    settle(c);
    lab.shots(100);
    settle(c);
    lab.measure(1);
    settle(c);
    expect(c.chapterDone).toBe(true);
  });

  it('Chapter 4: teleportation delivers the message to q2 for every measurement outcome', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { lab, c } = setup(seed);
      c.startChapter(3);
      lab.rotate(0, 1.1);
      settle(c);
      lab.gate('h', 1);
      lab.entangle(1, 2);
      settle(c);
      lab.entangle(0, 1);
      settle(c);
      lab.gate('h', 0);
      settle(c);
      lab.measure(0);
      lab.measure(1);
      c.update(1 / 60); // goal met: corrections applied, payoff computed
      expect(c.payoff).toContain('fidelity 1.000');
      settle(c);
      expect(c.chapterDone).toBe(true);
    }
  });

  it('Continue moves to the next chapter, and after the last one into the sandbox', () => {
    const { lab, c } = setup();
    c.startChapter(c.chapters.length - 1);
    c.chapterDone = true;
    c.next();
    expect(c.mode).toBe('sandbox');
    expect(lab.n).toBe(3);
  });

  it('a goal is not met by accident: a measurement does not finish the Hadamard step', () => {
    const { lab, c } = setup();
    lab.rotate(0, 1.2);
    settle(c);
    lab.measure(0);
    settle(c);
    expect(c.stepIndex).toBe(1);
    expect(c.stepDone).toBe(false);
  });

  it('save and restore resumes at the same chapter and step', () => {
    const { lab, c } = setup();
    c.startChapter(2);
    lab.gate('h', 0);
    settle(c);
    const saved = { lab: JSON.parse(JSON.stringify(lab.toJSON())), campaign: JSON.parse(JSON.stringify(c.toJSON())) };
    const lab2 = new Lab(1, mulberry32(9));
    lab2.restore(saved.lab);
    const c2 = new Campaign(lab2);
    c2.restore(saved.campaign);
    expect(c2.chapterIndex).toBe(2);
    expect(c2.stepIndex).toBe(1);
    lab2.entangle(0, 1);
    settle(c2);
    expect(c2.stepIndex).toBe(2);
  });

  it('Chapter 5: the spy raises the error rate, the clean channel has none', () => {
    const { lab, c } = setup(3);
    c.startChapter(4);
    lab.gate('h', 0);
    settle(c);
    lab.gate('h', 0);
    lab.shots(100);
    settle(c);
    expect(c.stepIndex).toBe(2);
    expect(lab.state.prob1(0)).toBeCloseTo(0.5, 9); // replay starts from Alice's diagonal state
    lab.measure(0);
    settle(c);
    lab.gate('h', 0);
    lab.shots(100);
    settle(c);
    expect(c.stepIndex).toBe(4);
    expect(c.view.action).toBe('Send 400');
    c.next();
    expect(c.payoff).toMatch(/Without Eve: 0% errors/);
    const spied = Number(/With Eve: (\d+)%/.exec(c.payoff!)![1]);
    expect(spied).toBeGreaterThan(15);
    expect(spied).toBeLessThan(35);
    settle(c);
    expect(c.chapterDone).toBe(true);
  });

  it('Chapter 6: one Grover iteration finds the marked box every time', () => {
    const found = new Set<number>();
    for (let seed = 1; seed <= 16; seed++) {
      const { lab, c } = setup(seed);
      c.startChapter(5);
      lab.gate('h', 0);
      lab.gate('h', 1);
      settle(c);
      c.next(); // Oracle
      settle(c);
      // the oracle changes phases, not odds
      for (let k = 0; k < 4; k++) expect(lab.state.probabilities()[k]).toBeCloseTo(0.25, 9);
      lab.shots(100);
      settle(c);
      c.next(); // Amplify
      settle(c);
      const probs = lab.state.probabilities();
      const marked = probs.findIndex((p) => p > 0.999);
      expect(marked).toBeGreaterThanOrEqual(0);
      found.add(marked);
      lab.shots(100);
      settle(c);
      expect(c.chapterDone).toBe(true);
    }
    expect(found.size).toBe(4); // the prize moves between runs
  });

  it('Chapter 7: the bit-flip code restores the message wherever the storm hits', () => {
    const hits = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) {
      const { lab, c } = setup(seed);
      c.startChapter(6);
      lab.select(0);
      lab.rotate(0, 1.3);
      settle(c);
      lab.select(0);
      lab.entangleSelected();
      lab.select(2);
      lab.entangleSelected(); // the step's control (q0) acts on the selected qubit
      settle(c);
      expect(c.stepIndex).toBe(2);
      c.next(); // Storm
      settle(c);
      lab.select(0);
      lab.entangleSelected();
      lab.select(2);
      lab.entangleSelected();
      c.update(1 / 60);
      const m = /storm hit (q\d)/.exec(c.payoff ?? '');
      expect(m).not.toBeNull();
      hits.add(m![1]);
      settle(c);
      c.next(); // Repair
      expect(c.payoff).toContain('fidelity 1.000');
      settle(c);
      expect(c.chapterDone).toBe(true);
      expect(c.completed.has(6)).toBe(true);
    }
    expect(hits).toEqual(new Set(['q0', 'q1', 'q2']));
  });

  it('a step with a card action ignores Continue until it is pressed, and has no action once done', () => {
    const { lab, c } = setup(2);
    c.startChapter(5);
    expect(c.view.action).toBeNull();
    c.next(); // nothing to continue yet
    expect(c.stepIndex).toBe(0);
    lab.gate('h', 0);
    lab.gate('h', 1);
    settle(c);
    expect(c.view.action).toBe('Oracle');
    c.next();
    expect(c.view.action).toBeNull();
  });

  it('finished chapters are remembered across save and restore', () => {
    const { lab, c } = setup();
    c.startChapter(1);
    lab.gate('h', 0);
    settle(c);
    lab.gate('h', 0);
    settle(c);
    lab.shots(100);
    settle(c);
    expect(c.view.completed).toEqual([1]);
    const c2 = new Campaign(new Lab(1));
    c2.restore(JSON.parse(JSON.stringify(c.toJSON())));
    expect(c2.view.completed).toEqual([1]);
  });

  it('the welcome card goes away on Continue or on the first action, without skipping a step', () => {
    const { lab, c } = setup();
    c.intro = true;
    c.next();
    expect(c.intro).toBe(false);
    expect(c.stepIndex).toBe(0);
    c.intro = true;
    lab.rotate(0, 1.2);
    c.update(1 / 60);
    expect(c.intro).toBe(false);
    expect(c.stepDone).toBe(true);
  });

  it('Chapter 8: superdense coding delivers every two-bit message', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const { lab, c } = setup(seed);
      c.startChapter(7);
      lab.select(0);
      lab.gate('h', 0);
      lab.entangleSelected();
      settle(c);
      c.next(); // Message
      settle(c);
      const msg = (c.toJSON().memory as { msg: number }).msg;
      seen.add(msg);
      expect(c.view.text).toContain(`Message ${msg.toString(2).padStart(2, '0')}`);
      if (msg & 2) lab.gate('x', 0);
      if (msg & 1) lab.gate('z', 0);
      c.next(); // Send
      settle(c);
      lab.select(0);
      lab.entangleSelected();
      lab.gate('h', 0);
      settle(c);
      const counts = lab.shots(100);
      expect(counts[msg]).toBe(100);
      c.update(1 / 60);
      expect(c.payoff).toContain('two bits arrived');
      settle(c);
      expect(c.chapterDone).toBe(true);
    }
    expect(seen.size).toBe(4);
  });

  it('Chapter 9: one question tells constant from balanced, for all four boxes', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const { lab, c } = setup(seed);
      c.startChapter(8);
      lab.gate('x', 1);
      lab.gate('h', 1);
      lab.gate('h', 0);
      settle(c);
      c.next(); // Ask
      settle(c);
      const f = (c.toJSON().memory as { f: number }).f;
      seen.add(f);
      lab.gate('h', 0);
      const out = lab.measure(0);
      expect(out).toBe(f >= 2 ? 1 : 0); // never wrong: no randomness left in q0
      c.update(1 / 60);
      expect(c.payoff).toContain(f >= 2 ? 'balanced' : 'constant');
      settle(c);
      expect(c.chapterDone).toBe(true);
    }
    expect(seen.size).toBe(4);
  });

  it('Chapter 10: Bernstein-Vazirani reads the whole hidden number in one question', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 24; seed++) {
      const { lab, c } = setup(seed);
      c.startChapter(9);
      expect(lab.n).toBe(4);
      lab.gate('x', 3);
      lab.gate('h', 3);
      settle(c);
      for (const q of [0, 1, 2]) lab.gate('h', q);
      settle(c);
      c.next(); // Ask
      settle(c);
      const secret = (c.toJSON().memory as { secret: number }).secret;
      seen.add(secret);
      for (const q of [0, 1, 2, 3]) lab.gate('h', q);
      settle(c);
      const counts = lab.shots(100);
      expect(counts[secret | 8]).toBe(100);
      c.update(1 / 60);
      expect(c.payoff).toContain(`reads ${secret.toString(2).padStart(3, '0')}`);
      settle(c);
      expect(c.chapterDone).toBe(true);
    }
    expect(seen.size).toBe(7);
  });
});

