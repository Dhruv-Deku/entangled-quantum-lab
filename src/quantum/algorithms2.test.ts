import { describe, expect, it } from 'vitest';
import { blochVector } from './bloch';
import { run, type Op } from './circuit';
import {
  controlledPowers, energy, groverDiffuser, groverOracle, h2At, pauliExpectation, qftOps, shorFactors, shorModExp, simonOracle, simonSecret, vqeAnsatz, vqeOptimize,
} from './algorithms2';
import { H2 } from './h2-data';
import { mulberry32 } from './measure';
import { QState } from './state';

const basis = (n: number, k: number) => {
  const s = new QState(n);
  s.re[0] = 0;
  s.re[k] = 1;
  return s;
};
const runOps = (n: number, ops: Op[], init?: QState) => run(n, ops, () => 0.5, init).state;
const h = (q: number): Op => ({ kind: 'gate', gate: 'h', target: q });
const xg = (q: number): Op => ({ kind: 'gate', gate: 'x', target: q });

describe('the quantum Fourier transform', () => {
  it('is the discrete Fourier transform on 3 qubits', () => {
    for (let xv = 0; xv < 8; xv++) {
      const s = runOps(3, qftOps([0, 1, 2]), basis(3, xv));
      for (let y = 0; y < 8; y++) {
        const ang = (2 * Math.PI * xv * y) / 8;
        expect(s.re[y]).toBeCloseTo(Math.cos(ang) / Math.sqrt(8), 9);
        expect(s.im[y]).toBeCloseTo(Math.sin(ang) / Math.sqrt(8), 9);
      }
    }
  });

  it('turns 5 into angles: qubit k turns by 5 * 2^k / 8 of a full turn', () => {
    const s = runOps(3, [xg(0), xg(2), ...qftOps([0, 1, 2])]);
    for (let k = 0; k < 3; k++) {
      const [bx, by] = blochVector(s, k);
      const turn = (((Math.atan2(by, bx) / (2 * Math.PI)) % 1) + 1) % 1;
      expect(turn).toBeCloseTo(((5 * 2 ** k) / 8) % 1, 6);
    }
  });

  it('the inverse undoes it', () => {
    const s = runOps(3, [xg(0), xg(2), ...qftOps([0, 1, 2]), ...qftOps([0, 1, 2], true)]);
    expect(s.probabilities()[5]).toBeCloseTo(1, 9);
  });
});

describe('phase estimation and Shor', () => {
  it('reads a phase k/8 exactly with three counting qubits', () => {
    for (let k = 1; k < 8; k++) {
      const ops = [xg(3), h(0), h(1), h(2), ...controlledPowers([0, 1, 2], 3, k / 8), ...qftOps([0, 1, 2], true)];
      expect(runOps(4, ops).probabilities()[k | 8]).toBeCloseTo(1, 9);
    }
  });

  it('factors 15: the readings are multiples of 2, so the period is 4, and 15 = 3 x 5', () => {
    const ops = [h(0), h(1), h(2), ...shorModExp([0, 1, 2], [3, 4]), ...qftOps([0, 1, 2], true)];
    const p = runOps(5, ops).probabilities();
    const counting = new Array(8).fill(0);
    p.forEach((v, i) => (counting[i & 7] += v));
    for (const c of [0, 2, 4, 6]) expect(counting[c]).toBeCloseTo(0.25, 9);
    expect(shorFactors([0, 2, 4, 6])).toEqual({ r: 4, factors: [3, 5] });
    expect(shorFactors([4, 2]).r).toBe(4);
  });
});

describe('Grover on three qubits and Simon', () => {
  it('two rounds find any of the 8 boxes with probability about 0.945', () => {
    for (let secret = 0; secret < 8; secret++) {
      const ops = [h(0), h(1), h(2), ...groverOracle(secret), ...groverDiffuser(), ...groverOracle(secret), ...groverDiffuser()];
      expect(runOps(3, ops).probabilities()[secret]).toBeCloseTo(0.9453, 3);
    }
  });

  it('Simon: every reading is orthogonal to the secret, which the readings pin down', () => {
    for (const s of [1, 2, 3]) {
      const ops = [h(0), h(1), ...simonOracle(s), h(0), h(1)];
      const p = runOps(4, ops).probabilities();
      const seen = new Set<number>();
      p.forEach((v, i) => {
        if (v > 1e-9) {
          const y = i & 3;
          expect(((y & s).toString(2).split('1').length - 1) % 2).toBe(0);
          seen.add(y);
        }
      });
      expect(simonSecret([...seen])).toBe(s);
    }
  });
});

describe('VQE for H2 (Hamiltonians from PennyLane qchem)', () => {
  it('Pauli expectations: <Z> on |1> is -1, <X> on |+> is 1, <Y> on |+i> is 1', () => {
    expect(pauliExpectation(runOps(1, [xg(0)]), 'Z')).toBeCloseTo(-1, 9);
    expect(pauliExpectation(runOps(1, [h(0)]), 'X')).toBeCloseTo(1, 9);
    expect(pauliExpectation(runOps(1, [h(0), { kind: 'gate', gate: 's', target: 0 }]), 'Y')).toBeCloseTo(1, 9);
  });

  it('the ansatz at theta = pi is Hartree-Fock, and optimizing reaches the exact ground energy at every bond length', () => {
    const r = (ops: Op[]) => runOps(4, ops);
    for (const point of H2) {
      expect(energy(point, r(vqeAnsatz(Math.PI)))).toBeCloseTo(point.hf, 6);
      const best = vqeOptimize(point, r, Math.PI, 80);
      expect(best.energy).toBeCloseTo(point.fci, 4);
    }
    // the minimum of the curve is the H2 bond length, about 0.74 Angstrom
    const eq = H2.reduce((a, b) => (b.fci < a.fci ? b : a));
    expect(eq.r).toBeGreaterThan(0.69);
    expect(eq.r).toBeLessThan(0.81);
    expect(h2At(0.74).fci).toBeCloseTo(-1.13728, 4);
  });
});

it('random check: QFT then inverse is the identity on any state', () => {
  const rnd = mulberry32(2);
  const ops: Op[] = [];
  for (let i = 0; i < 6; i++) ops.push({ kind: 'gate', gate: 'ry', target: Math.floor(rnd() * 3), params: [rnd() * 3] });
  const a = runOps(3, ops);
  const b = runOps(3, [...ops, ...qftOps([0, 1, 2]), ...qftOps([0, 1, 2], true)]);
  for (let i = 0; i < 8; i++) {
    expect(b.re[i]).toBeCloseTo(a.re[i], 9);
    expect(b.im[i]).toBeCloseTo(a.im[i], 9);
  }
});
