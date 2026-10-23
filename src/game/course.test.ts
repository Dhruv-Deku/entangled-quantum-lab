import { describe, expect, it } from 'vitest';
import { Lab } from '../lab/lab';
import { mulberry32 } from '../quantum/measure';
import { Campaign } from './campaign';
import { CHAPTERS } from './chapters';
import { COURSE } from './course';

function settle(c: Campaign, seconds = 3): void {
  for (let i = 0; i < seconds * 60; i++) c.update(1 / 60);
}

/** Play a module the way a learner would: Next on pages, the right answer on quizzes, Show me on tasks. */
function playThrough(c: Campaign): void {
  for (let guard = 0; guard < 40 && !c.chapterDone; guard++) {
    const step = c.view.step!;
    if (step.choices) c.answer(step.answer!);
    else if (step.action) c.next();
    else expect(c.showMe(), step.goal as string).toBe(true);
    c.update(0);
    // held payoffs wait for Continue
    if (c.stepDone) c.next();
    settle(c);
  }
}

describe('the Course', () => {
  it('every module can be finished, in order, start to end', () => {
    const lab = new Lab(1, mulberry32(3));
    const c = new Campaign(lab);
    c.startCourse(0);
    for (let m = 0; m < COURSE.length; m++) {
      expect(c.courseIndex).toBe(m);
      playThrough(c);
      expect(c.chapterDone, COURSE[m].title).toBe(true);
      expect(c.view.coursed).toContain(m);
      c.next();
    }
  });

  it('a wrong answer turns red and waits; the right one explains and waits for Continue', () => {
    const lab = new Lab(1, mulberry32(4));
    const c = new Campaign(lab);
    c.startCourse(0);
    while (!c.view.step?.choices) {
      c.showMe() || c.next();
      settle(c);
    }
    const step = c.view.step!;
    const wrong = (step.answer! + 1) % 3;
    expect(c.answer(wrong)).toBe(false);
    expect(c.view.wrong).toBe(wrong);
    settle(c);
    expect(c.stepDone).toBe(false);
    expect(c.answer(step.answer!)).toBe(true);
    expect(c.view.wrong).toBeNull();
    expect(c.payoff).toMatch(/^Right\./);
    settle(c, 6);
    expect(c.chapterDone || c.stepDone).toBe(true);
  });

  it('teaches with a quiz in every module but the last, and only text the panel font can draw, short enough for the card', () => {
    for (const m of COURSE.slice(0, -1)) expect(m.steps.some((s) => s.choices), m.title).toBe(true);
    for (const m of COURSE)
      for (const s of m.steps) {
        const texts = [typeof s.text === 'string' ? s.text : '', ...(s.choices ?? []), typeof s.payoff === 'string' ? s.payoff : ''];
        for (const t of texts) {
          expect(/^[\x20-\x7E]*$/.test(t), `${m.title}: "${t.slice(0, 30)}"`).toBe(true);
          expect(t.length, `${m.title}: "${t.slice(0, 30)}"`).toBeLessThanOrEqual(230);
        }
        if (s.choices) expect(s.answer).toBeGreaterThanOrEqual(0);
      }
  });

  it('remembers which modules are finished', () => {
    const lab = new Lab(1, mulberry32(5));
    const c = new Campaign(lab);
    c.startCourse(0);
    playThrough(c);
    const saved = c.toJSON();
    const c2 = new Campaign(new Lab(1, mulberry32(6)));
    c2.restore(saved);
    expect(c2.view.coursed).toEqual([0]);
  });
});

describe('Chapter 12: Max Cut', () => {
  it('optimizes one layer to a ratio of 0.75, then two layers higher, and the shots favour the best cuts', () => {
    const lab = new Lab(1, mulberry32(7));
    const c = new Campaign(lab);
    c.startChapter(CHAPTERS.findIndex((ch) => ch.title === 'Max Cut'));
    expect(lab.n).toBe(4);
    for (const q of [0, 1, 2, 3]) lab.gate('h', q);
    settle(c);
    c.next(); // Optimize
    expect(c.qaoa?.ratio).toBeCloseTo(0.75, 2);
    c.next(); // read the held payoff
    settle(c);
    const counts = lab.shots(100);
    const best = counts[0b0101] + counts[0b1010];
    expect(best).toBeGreaterThan(30);
    settle(c);
    c.next();
    settle(c);
    c.next(); // Deeper
    expect(c.qaoa!.ratio).toBeGreaterThan(0.8);
    settle(c);
    lab.shots(100);
    settle(c);
    c.next();
    settle(c);
    expect(c.chapterDone).toBe(true);
  });
});
