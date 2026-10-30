import { describe, expect, it } from 'vitest';
import { H2 } from './h2-data';
import { element, moleculeAt, R_EQ } from './molecule';

describe('pulling H2 apart', () => {
  it('Pauli matrix elements follow the definitions', () => {
    expect(element('ZIII', 0b0011, 0b0011)).toEqual([-1, 0]);
    expect(element('XIII', 0b0001, 0b0000)).toEqual([1, 0]);
    expect(element('YIII', 0b0000, 0b0001)).toEqual([0, -1]);
    expect(element('YIII', 0b0001, 0b0000)).toEqual([0, 1]);
    expect(element('XXYY', 0b0011, 0b1100)[1]).toBe(0);
  });

  it('the two-configuration problem gives the exact (FCI) and mean-field energies at every computed bond length', () => {
    for (const p of H2) {
      const m = moleculeAt(p.r);
      expect(m.energy).toBeCloseTo(p.fci, 8);
      expect(m.hf).toBeCloseTo(p.hf, 8);
      expect(m.cHF ** 2 + m.cD ** 2).toBeCloseTo(1, 12);
    }
  });

  it('the bond is shortest-energy near 0.74 A', () => {
    const best = H2.reduce((a, b) => (b.fci < a.fci ? b : a));
    expect(best.r).toBe(R_EQ);
    expect(moleculeAt(0.7).energy).toBeGreaterThan(moleculeAt(R_EQ).energy);
    expect(moleculeAt(0.8).energy).toBeGreaterThan(moleculeAt(R_EQ).energy);
  });

  it('stretched, the electrons go one to each atom, and mean-field fails', () => {
    const eq = moleculeAt(R_EQ), far = moleculeAt(2.5);
    expect(eq.cHF).toBeGreaterThan(0.99);
    expect(eq.covalent).toBeLessThan(0.65);
    expect(far.covalent).toBeGreaterThan(0.95);
    let last = 0;
    for (let r = 0.5; r <= 2.5; r += 0.1) {
      const c = moleculeAt(r).covalent;
      expect(c).toBeGreaterThanOrEqual(last - 1e-9);
      last = c;
    }
    expect(far.hf - far.energy).toBeGreaterThan(10 * (eq.hf - eq.energy));
  });
});
