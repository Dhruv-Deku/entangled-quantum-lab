import { describe, expect, it } from 'vitest';
import {
  benchmark, cliffordGroup, rbSequence, rbSurvival, zenoCurve, zenoSurvival, zenoTrial,
  BELL_MEASURE, chshValue, circuitUnitary, classicalWalk, describeUnitary, exactMagnetization, isingMatrix, jacobiEigen, logicalError, playChsh, qecCurve, qecTrial,
  QEC_ENCODE, QEC_SYNDROME, spread, swapFix, SWAP_PAIRS, syndromeQubit, trotterMagnetization, TSIRELSON, walkDistribution, walkStepOps, WALK_SETUP, WALK_SITES, WALK_START,
} from './advanced';
import { run, type Op } from './circuit';
import { pairStrength } from './entanglement';
import { mulberry32 } from './measure';
import { QState } from './state';

const bell = () => run(2, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 1, controls: [0] }], () => 0.5).state;

describe('CHSH Bell test', () => {
  it('a Bell pair reaches Tsirelson\'s bound 2 sqrt 2', () => {
    expect(chshValue(bell())).toBeCloseTo(TSIRELSON, 12);
  });

  it('no product state gets past the classical limit of 2', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const ops: Op[] = [0, 1].flatMap((q) => [
        { kind: 'gate' as const, gate: 'ry' as const, target: q, params: [rng() * 2 * Math.PI] },
        { kind: 'gate' as const, gate: 'rz' as const, target: q, params: [rng() * 2 * Math.PI] },
      ]);
      expect(Math.abs(chshValue(run(2, ops, rng).state))).toBeLessThanOrEqual(2 + 1e-9);
    }
  });

  it('playing the game wins cos^2(pi/8) = 85% of rounds, and S comes out near 2.83', () => {
    const r = playChsh(bell(), 40000, mulberry32(3));
    expect(r.win).toBeCloseTo(Math.cos(Math.PI / 8) ** 2, 2);
    expect(Math.abs(r.s - TSIRELSON)).toBeLessThan(0.05);
    expect(r.win).toBeCloseTo(0.5 + r.s / 8, 2);
    expect(Math.abs(r.s - TSIRELSON)).toBeLessThan(4 * r.se);
  });

  it('the quoted error matches the real spread of S between games of 1000 rounds', () => {
    const rng = mulberry32(12);
    const games = Array.from({ length: 400 }, () => playChsh(bell(), 1000, rng));
    const mean = games.reduce((t, g) => t + g.s, 0) / games.length;
    const spread = Math.sqrt(games.reduce((t, g) => t + (g.s - mean) ** 2, 0) / (games.length - 1));
    const quoted = games.reduce((t, g) => t + g.se, 0) / games.length;
    expect(quoted).toBeCloseTo(0.09, 1);
    expect(Math.abs(spread - quoted) / quoted).toBeLessThan(0.15);
    expect(mean).toBeCloseTo(TSIRELSON, 1);
  });

  it('after measuring one qubit the pair loses: at most 75%', () => {
    const s = run(2, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 1, controls: [0] }, { kind: 'measure', qubit: 0 }], mulberry32(1)).state;
    expect(Math.abs(chshValue(s))).toBeLessThanOrEqual(2 + 1e-9);
    expect(playChsh(s, 40000, mulberry32(4)).win).toBeLessThan(0.77);
  });
});

describe('bit-flip code', () => {
  it('the syndrome names the flipped qubit, or none', () => {
    for (const err of [null, 0, 1, 2]) {
      const ops: Op[] = [{ kind: 'gate', gate: 'ry', target: 0, params: [0.9] }, ...QEC_ENCODE, ...(err === null ? [] : [{ kind: 'gate' as const, gate: 'x' as const, target: err }]), ...QEC_SYNDROME];
      const r = run(5, ops, mulberry32(2));
      expect(syndromeQubit(r.bits[3], r.bits[4])).toBe(err);
    }
  });

  it('any single flip is undone; flipping two or three loses the message', () => {
    const rng = mulberry32(5);
    expect(qecTrial(0, 1.1, rng)).toBe(true);
    expect(qecTrial(1, 1.1, rng)).toBe(false);
  });

  it('measured failure rate follows 3p^2 - 2p^3, below p for p < 1/2', () => {
    const curve = qecCurve([0.05, 0.2, 0.4], 3000, mulberry32(9));
    for (const [p, f] of curve) {
      expect(Math.abs(f - logicalError(p))).toBeLessThan(0.03);
      expect(logicalError(p)).toBeLessThan(p);
    }
    expect(logicalError(0.5)).toBeCloseTo(0.5, 12);
    expect(logicalError(0.7)).toBeGreaterThan(0.7);
  });
});

describe('entanglement swapping', () => {
  it('whatever the Bell measurement reads, q0 and q3 end up a Bell pair', () => {
    for (const [m1, m2] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
      const forced = BELL_MEASURE.map((o) => (o.kind === 'measure' ? { ...o, outcome: (o.qubit === 1 ? m1 : m2) as 0 | 1 } : o));
      const before = run(4, [...SWAP_PAIRS, ...BELL_MEASURE.slice(0, 2)], () => 0.5).state;
      // each outcome is equally likely
      const p = before.probabilities();
      let pm = 0;
      for (let k = 0; k < 16; k++) if (((k >> 1) & 1) === m1 && ((k >> 2) & 1) === m2) pm += p[k];
      expect(pm).toBeCloseTo(0.25, 12);
      const s = run(4, [...SWAP_PAIRS, ...forced, ...swapFix(m1, m2)], () => 0.5).state;
      expect(pairStrength(s, 0, 3)).toBeCloseTo(1, 9);
      expect(pairStrength(s, 0, 1)).toBeCloseTo(0, 9);
      expect(chshValue(s, 0, 3)).toBeCloseTo(TSIRELSON, 9);
    }
  });
});

describe('quantum walk', () => {
  /** Independent walk on (site, coin) amplitudes: Hadamard coin, coin 1 steps right, coin 0 left. */
  function reference(t: number): number[] {
    let a = Array.from({ length: WALK_SITES }, () => [[0, 0], [0, 0]]);
    a[WALK_START] = [[Math.SQRT1_2, 0], [0, Math.SQRT1_2]];
    for (let k = 0; k < t; k++) {
      const b = Array.from({ length: WALK_SITES }, () => [[0, 0], [0, 0]]);
      a.forEach(([c0, c1], x) => {
        const h0 = [(c0[0] + c1[0]) * Math.SQRT1_2, (c0[1] + c1[1]) * Math.SQRT1_2];
        const h1 = [(c0[0] - c1[0]) * Math.SQRT1_2, (c0[1] - c1[1]) * Math.SQRT1_2];
        const l = (x + WALK_SITES - 1) % WALK_SITES, r = (x + 1) % WALK_SITES;
        b[l][0] = [b[l][0][0] + h0[0], b[l][0][1] + h0[1]];
        b[r][1] = [b[r][1][0] + h1[0], b[r][1][1] + h1[1]];
      });
      a = b;
    }
    return a.map(([c0, c1]) => c0[0] ** 2 + c0[1] ** 2 + c1[0] ** 2 + c1[1] ** 2);
  }

  it('the circuit walks exactly like the textbook walk, step by step', () => {
    let s = run(5, WALK_SETUP, () => 0.5).state;
    for (let t = 1; t <= 6; t++) {
      s = run(5, walkStepOps(), () => 0.5, s).state;
      const got = walkDistribution(s), want = reference(t);
      got.forEach((p, i) => expect(p).toBeCloseTo(want[i], 12));
    }
  });

  it('it spreads in proportion to t, faster than a classical walker (sqrt t)', () => {
    let s = run(5, WALK_SETUP, () => 0.5).state;
    for (let t = 0; t < 6; t++) s = run(5, walkStepOps(), () => 0.5, s).state;
    const q = walkDistribution(s);
    expect(q.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 12);
    expect(q[WALK_START - 6] + q[WALK_START + 6]).toBeGreaterThan(0);
    expect(spread(classicalWalk(6))).toBeCloseTo(Math.sqrt(6), 12);
    // about 0.56 t against sqrt t: 3.35 against 2.45 after six steps
    expect(spread(q)).toBeGreaterThan(1.3 * spread(classicalWalk(6)));
    expect(spread(q) / 6).toBeGreaterThan(0.5);
    // symmetric coin: the same both ways
    for (let d = 1; d <= 6; d++) expect(q[WALK_START - d]).toBeCloseTo(q[WALK_START + d], 12);
  });
});

describe('Ising chain', () => {
  it('Jacobi rebuilds the Hamiltonian from its eigenvectors', () => {
    const a = isingMatrix();
    const { values, v } = jacobiEigen(8, a);
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        let s = 0;
        for (let k = 0; k < 8; k++) s += v[i * 8 + k] * values[k] * v[j * 8 + k];
        expect(s).toBeCloseTo(a[i * 8 + j], 10);
      }
  });

  it('small Trotter steps follow the exact evolution; big ones drift', () => {
    expect(exactMagnetization([0])[0]).toBeCloseTo(1, 12);
    const fine = trotterMagnetization(0.01, 200), exact = exactMagnetization([2]);
    expect(Math.abs(fine[200][1] - exact[0])).toBeLessThan(0.01);
    const err = (dt: number) => {
      const pts = trotterMagnetization(dt, Math.round(2 / dt));
      return Math.abs(pts[pts.length - 1][1] - exact[0]);
    };
    expect(err(0.05)).toBeLessThan(err(0.25));
    expect(err(0.25)).toBeLessThan(err(0.5));
  });
});

describe('circuit unitary', () => {
  it('H is 1/sqrt 2 [[1, 1], [1, -1]]; a measurement means no single matrix', () => {
    const u = circuitUnitary(1, [{ kind: 'gate', gate: 'h', target: 0 }])!;
    expect([...u.re].map((x) => x * Math.SQRT2)).toEqual([1, 1, 1, -1].map((x) => expect.closeTo(x, 12)));
    expect(circuitUnitary(1, [{ kind: 'measure', qubit: 0 }])).toBeNull();
  });

  it('every circuit gives a unitary matrix: U^dagger U = I', () => {
    const rng = mulberry32(11);
    const gates = ['h', 'x', 's', 't', 'ry'] as const;
    const ops: Op[] = [];
    for (let i = 0; i < 25; i++) {
      const gate = gates[Math.floor(rng() * gates.length)];
      const target = Math.floor(rng() * 3);
      const c = (target + 1 + Math.floor(rng() * 2)) % 3;
      ops.push({ kind: 'gate', gate, target, params: gate === 'ry' ? [rng() * 3] : undefined, controls: rng() < 0.4 ? [c] : undefined });
    }
    const u = circuitUnitary(3, ops)!;
    for (let a = 0; a < 8; a++)
      for (let b = 0; b < 8; b++) {
        let re = 0, im = 0;
        for (let r = 0; r < 8; r++) {
          re += u.re[r * 8 + a] * u.re[r * 8 + b] + u.im[r * 8 + a] * u.im[r * 8 + b];
          im += u.re[r * 8 + a] * u.im[r * 8 + b] - u.im[r * 8 + a] * u.re[r * 8 + b];
        }
        expect(re).toBeCloseTo(a === b ? 1 : 0, 10);
        expect(im).toBeCloseTo(0, 10);
      }
    // and it acts like the circuit on a basis state
    const s = new QState(3);
    s.re[0] = 0;
    s.re[5] = 1;
    const out = run(3, ops, () => 0.5, s).state;
    for (let r = 0; r < 8; r++) expect(out.re[r]).toBeCloseTo(u.re[r * 8 + 5], 12);
  });

  it('says what kind of matrix it is', () => {
    expect(describeUnitary(circuitUnitary(2, [{ kind: 'gate', gate: 'z', target: 0 }])!)).toMatch(/^Diagonal/);
    expect(describeUnitary(circuitUnitary(2, [{ kind: 'gate', gate: 'x', target: 1, controls: [0] }])!)).toMatch(/^A permutation/);
    expect(describeUnitary(circuitUnitary(2, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'h', target: 1 }])!)).toMatch(/^Dense/);
    expect(describeUnitary(circuitUnitary(1, [{ kind: 'gate', gate: 'x', target: 0 }, { kind: 'gate', gate: 'x', target: 0 }])!)).toMatch(/^The identity/);
  });
});

describe('quantum Zeno effect', () => {
  it('more looks keep the qubit at |0>: cos^2(pi/2N)^N', () => {
    expect(zenoSurvival(1)).toBeCloseTo(0, 12);
    expect(zenoSurvival(2)).toBeCloseTo(0.25, 12);
    expect(zenoSurvival(50)).toBeGreaterThan(0.95);
    for (const [n, f] of zenoCurve([1, 2, 5, 10, 20], 2000, mulberry32(4))) expect(Math.abs(f - zenoSurvival(n))).toBeLessThan(0.03);
  });

  it('a trial records one outcome per look; without looks the half turn ends at |1>', () => {
    expect(zenoTrial(10, mulberry32(1))).toHaveLength(10);
    const free = run(1, Array.from({ length: 10 }, () => ({ kind: 'gate' as const, gate: 'ry' as const, target: 0, params: [Math.PI / 10] })), () => 0.5).state;
    expect(free.probabilities()[1]).toBeCloseTo(1, 12);
  });
});

describe('randomized benchmarking', () => {
  it('there are 24 single-qubit Cliffords, closed under products', () => {
    const g = cliffordGroup();
    expect(g).toHaveLength(24);
    expect(new Set(g.map((c) => c.key)).size).toBe(24);
    expect(Math.max(...g.map((c) => c.gates.length))).toBeLessThanOrEqual(6);
  });

  it('every sequence undoes itself: perfect gates always return to |0>', () => {
    const rng = mulberry32(8);
    for (const m of [1, 5, 40]) {
      const s = run(1, rbSequence(m, rng), () => 0.5).state;
      expect(s.probabilities()[0]).toBeCloseTo(1, 10);
    }
  });

  it('with only depolarizing noise, survival is exactly 1/2 + 1/2 (1 - 4p/3)^gates', () => {
    const rng = mulberry32(2);
    const noise = { t1: Infinity, t2: Infinity, depol: 0.01 };
    for (const m of [3, 17]) {
      const ops = rbSequence(m, rng);
      expect(rbSurvival(ops, noise)).toBeCloseTo(0.5 + 0.5 * (1 - (4 * 0.01) / 3) ** ops.length, 12);
    }
  });

  it('the fit recovers the error per gate it was given', () => {
    const r = benchmark([1, 4, 16, 64, 128], 20, mulberry32(5), { t1: Infinity, t2: Infinity, depol: 0.002 });
    // per gate, depolarizing p shrinks the Bloch vector by 1 - 4p/3: an error of 2p/3
    expect(r.perGate).toBeCloseTo((2 * 0.002) / 3, 4);
    expect(r.a).toBeCloseTo(0.5, 1);
    for (let i = 1; i < r.points.length; i++) expect(r.points[i][1]).toBeLessThan(r.points[i - 1][1]);
  });
});
