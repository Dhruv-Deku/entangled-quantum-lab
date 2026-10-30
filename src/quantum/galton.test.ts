import { describe, expect, it } from 'vitest';
import { classicalBoard, marblePath, quantumBoard, spreadOf, walkerLanding } from './galton';
import { mulberry32 } from './measure';
import { classicalWalk, spread, WALK_SETUP, walkDistribution, walkStepOps } from './advanced';
import { run } from './circuit';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('Galton board, classical and quantum', () => {
  it('both are probability distributions, symmetric about the middle', () => {
    for (const t of [1, 5, 12]) {
      for (const d of [classicalBoard(t), quantumBoard(t)]) {
        expect(sum(d)).toBeCloseTo(1, 12);
        d.forEach((p, i) => expect(p).toBeCloseTo(d[d.length - 1 - i], 12));
      }
    }
  });

  it('the marble spreads like sqrt t, the walker like t', () => {
    for (const t of [4, 9, 16]) expect(spreadOf(classicalBoard(t))).toBeCloseTo(Math.sqrt(t), 10);
    const q = [10, 20, 40].map((t) => spreadOf(quantumBoard(t)) / t);
    // the Hadamard walk's spread per step tends to sqrt(1 - 1/sqrt 2) ~ 0.541
    q.forEach((v) => expect(v).toBeGreaterThan(0.5));
    expect(Math.abs(q[2] - Math.sqrt(1 - Math.SQRT1_2))).toBeLessThan(0.02);
  });

  it('the walker piles up away from the middle; the marble in it', () => {
    const t = 12;
    const c = classicalBoard(t), q = quantumBoard(t);
    expect(c.indexOf(Math.max(...c))).toBe(t);
    const peak = q.indexOf(Math.max(...q));
    expect(Math.abs(peak - t)).toBeGreaterThan(t / 2);
  });

  it('agrees with the circuit walk of the quantum-walk chapter', () => {
    for (let steps = 1; steps <= 6; steps++) {
      const ops = [...WALK_SETUP];
      for (let s = 0; s < steps; s++) ops.push(...walkStepOps());
      const circuit = walkDistribution(run(5, ops, () => 0.5).state);
      const ours = quantumBoard(steps);
      // the circuit's sites 0..15 with the walker starting at 8
      ours.forEach((p, i) => expect(circuit[8 + i - steps]).toBeCloseTo(p, 9));
      expect(spread(circuit)).toBeCloseTo(spreadOf(ours), 9);
      expect(spread(classicalWalk(steps))).toBeCloseTo(Math.sqrt(steps), 9);
    }
  });

  it('marbles and measured walkers land by those distributions', () => {
    const rng = mulberry32(2);
    const t = 10, N = 20000;
    const hits = new Array(2 * t + 1).fill(0);
    for (let k = 0; k < N; k++) hits[t + sum(marblePath(t, rng))]++;
    classicalBoard(t).forEach((p, i) => expect(Math.abs(hits[i] / N - p)).toBeLessThan(0.012));
    const q = quantumBoard(t);
    const land = new Array(2 * t + 1).fill(0);
    for (let k = 0; k < N; k++) land[walkerLanding(q, rng)]++;
    q.forEach((p, i) => expect(Math.abs(land[i] / N - p)).toBeLessThan(0.012));
  });
});
