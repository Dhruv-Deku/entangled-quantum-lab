import { describe, expect, it } from 'vitest';
import { Lab } from '../lab/lab';
import { mulberry32 } from '../quantum/measure';
import { blochVector } from '../quantum/bloch';
import { Campaign } from './campaign';
import { LESSONS } from './lessons';
import { PRESETS } from './presets';

function settle(c: Campaign, seconds = 3): void {
  for (let i = 0; i < seconds * 60; i++) c.update(1 / 60);
}

/** The moves a player makes for each lesson, using the same calls as gestures and keys. */
const SOLUTIONS: Record<string, (lab: Lab) => void> = {
  H: (lab) => lab.gate('h', 0),
  X: (lab) => lab.gate('x', 0),
  Y: (lab) => lab.gate('y', 0),
  Z: (lab) => lab.gate('z', 0),
  S: (lab) => lab.gate('s', 0),
  T: (lab) => {
    lab.gate('t', 0);
    lab.gate('t', 0);
  },
  Ry: (lab) => lab.rotate(0, Math.PI / 3), // a wrist turn, still held
  Measure: (lab) => lab.measure(0),
  CNOT: (lab) => {
    lab.select(0);
    lab.gate('x', 0);
    lab.entangleSelected();
  },
  SWAP: (lab) => lab.apply({ kind: 'swap', a: 0, b: 1 }),
  Kickback: (lab) => {
    lab.select(0);
    lab.gate('h', 0);
    lab.entangleSelected();
  },
  Clone: (lab) => {
    lab.select(0);
    lab.gate('h', 0);
    lab.entangleSelected();
  },
  Phase: (lab) => {
    lab.gate('z', 0);
    lab.gate('h', 0);
  },
  Bell: (lab) => {
    lab.gate('x', 1);
    lab.select(0);
    lab.gate('h', 0);
    lab.entangleSelected();
  },
  GHZ: (lab) => {
    lab.select(0);
    lab.gate('h', 0);
    lab.entangleSelected();
    lab.select(1);
    lab.entangleSelected();
  },
};

describe('learn: every lesson', () => {
  it('has a solution in this test', () => {
    expect(LESSONS.map((l) => l.chip).sort()).toEqual(Object.keys(SOLUTIONS).sort());
  });

  for (const [i, lesson] of LESSONS.entries()) {
    it(`${lesson.chip}: is not already solved, and is solved by its moves`, () => {
      const lab = new Lab(1, mulberry32(5));
      const c = new Campaign(lab);
      c.startLesson(i);
      expect(lab.n).toBe(lesson.qubits);
      settle(c);
      expect(c.stepDone).toBe(false);
      SOLUTIONS[lesson.chip!](lab);
      settle(c);
      expect(c.chapterDone).toBe(true);
      expect(c.view.learned).toContain(i);
    });
  }

  it('the target arrow is where the solved state actually points', () => {
    for (const [i, lesson] of LESSONS.entries()) {
      const target = lesson.steps[0].target;
      if (!target || typeof target === 'function') continue;
      const lab = new Lab(1, mulberry32(5));
      const c = new Campaign(lab);
      c.startLesson(i);
      SOLUTIONS[lesson.chip!](lab);
      target.forEach((t, q) => {
        if (!t) return;
        const r = blochVector(lab.state, q);
        expect(r[0] * t[0] + r[1] * t[1] + r[2] * t[2], `${lesson.chip} q${q}`).toBeGreaterThan(0.99);
      });
    }
  });

  it('the T lesson does not accept a shortcut through S', () => {
    const lab = new Lab(1);
    const c = new Campaign(lab);
    c.startLesson(LESSONS.findIndex((l) => l.chip === 'T'));
    lab.gate('s', 0);
    settle(c);
    expect(c.stepDone).toBe(false);
  });

  it('Continue after a lesson moves to the next one, and wraps after the last', () => {
    const lab = new Lab(1);
    const c = new Campaign(lab);
    c.startLesson(LESSONS.length - 1);
    c.chapterDone = true;
    c.next();
    expect(c.mode).toBe('learn');
    expect(c.lessonIndex).toBe(0);
  });

  it('lesson progress survives save and restore, separately from chapters', () => {
    const lab = new Lab(1);
    const c = new Campaign(lab);
    c.startLesson(0);
    lab.gate('h', 0);
    settle(c);
    const c2 = new Campaign(new Lab(1));
    c2.restore(JSON.parse(JSON.stringify(c.toJSON())));
    expect(c2.view.learned).toEqual([0]);
    expect(c2.view.completed).toEqual([]);
    expect(c2.mode).toBe('learn');
  });
});

describe('sandbox presets', () => {
  it('every preset loads with its qubit count, and [ ] cycle through them', () => {
    const lab = new Lab(1, mulberry32(2));
    const c = new Campaign(lab);
    PRESETS.forEach((p, i) => {
      c.loadPreset(i);
      expect(c.mode).toBe('sandbox');
      expect(c.preset).toBe(i);
      expect(lab.n).toBe(p.qubits);
    });
    c.step(1);
    expect(c.preset).toBe(0);
    c.step(-1);
    expect(c.preset).toBe(PRESETS.length - 1);
  });

  it('the circuits do what their notes say', () => {
    const lab = new Lab(1, mulberry32(2));
    const c = new Campaign(lab);
    const load = (label: string) => {
      c.loadPreset(PRESETS.findIndex((p) => p.label === label));
      return lab.state.probabilities();
    };
    expect(load('Grover')[3]).toBeCloseTo(1, 9);
    const g = load('GHZ x5');
    expect(g[0]).toBeCloseTo(0.5, 9);
    expect(g[31]).toBeCloseTo(0.5, 9);
    expect(load('Even x4').every((p) => Math.abs(p - 1 / 16) < 1e-9)).toBe(true);
  });
});

