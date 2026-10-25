import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../quantum/measure';
import { HuntGame } from './hunt';

describe('Quantum Hunt', () => {
  it('catching one qubit collapses its partner: equal for |00>+|11>, opposite for |01>+|10>', () => {
    const rng = mulberry32(4);
    for (let trial = 0; trial < 50; trial++) {
      const g = new HuntGame(['same', 'opposite']);
      const a = g.catch(0, rng)!;
      expect(a.collapsedNow).toBe(true);
      expect(a.partnerValue).toBe(a.value);
      const b = g.catch(3, rng)!;
      expect(b.partnerValue).toBe(1 - b.value);
      // the partner was decided before it was caught, and catching it changes nothing
      const c = g.catch(1, rng)!;
      expect(c.collapsedNow).toBe(false);
      expect(c.value).toBe(a.value);
      expect(c.pairDone).toBe(true);
    }
  });

  it('outcomes are fair coin tosses, but the pairs always agree', () => {
    const rng = mulberry32(9);
    let ones = 0;
    for (let i = 0; i < 2000; i++) {
      const g = new HuntGame(['same']);
      const r = g.catch(i % 2, rng)!;
      ones += r.value;
      expect(r.partnerValue).toBe(r.value);
    }
    expect(ones / 2000).toBeGreaterThan(0.45);
    expect(ones / 2000).toBeLessThan(0.55);
  });

  it('counts pairs, finishes, and points at the partner of a half-caught pair first', () => {
    const rng = mulberry32(1);
    const g = new HuntGame();
    expect(g.qubits).toHaveLength(6);
    g.catch(2, rng);
    expect(g.nextTarget()).toBe(3);
    expect(g.catch(2, rng)).toBeNull();
    for (const i of [3, 0, 1, 4, 5]) g.catch(i, rng);
    expect(g.caughtPairs).toBe(3);
    expect(g.done).toBe(true);
    expect(g.nextTarget()).toBeNull();
  });
});
