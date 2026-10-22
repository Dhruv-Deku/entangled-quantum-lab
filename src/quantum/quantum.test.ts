import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bb84, bellPair, ghz, grover2, teleportFidelity } from './algorithms';
import { blochLength, blochVector } from './bloch';
import { run, type Op } from './circuit';
import { mixedness, pairStrength } from './entanglement';
import { toPennyLane, toQiskit } from './export';
import { decompose, fractional, gateMatrix, H, multiply, Ry, X } from './gates';
import { History } from './history';
import { measureAll, measureQubit, mulberry32, sample } from './measure';
import { amplitudeDamping } from './noise';
import { QState } from './state';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('required physics tests', () => {
  it('H|0> gives 50/50 over many shots', () => {
    const s = new QState(1);
    s.apply1(0, H);
    const counts = sample(s, 20000, mulberry32(1));
    expect(Math.abs(counts[0] / 20000 - 0.5)).toBeLessThan(0.015);
    expect(counts[0] + counts[1]).toBe(20000);
  });

  it('H·H = identity: interference returns to |0>', () => {
    const s = new QState(1);
    s.apply1(0, H);
    s.apply1(0, H);
    close(s.probabilities()[0], 1);
  });

  it('H then CNOT makes a Bell state whose measurements always agree', () => {
    const rng = mulberry32(2);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const { state } = run(2, bellPair(), rng);
      const k = measureAll(state, rng);
      expect(k === 0 || k === 3).toBe(true); // |00> or |11>, never mixed
      seen.add(k);
    }
    expect(seen.size).toBe(2);
  });

  it('single-qubit Bloch vectors of a Bell state have length ~0', () => {
    const { state } = run(2, bellPair(), mulberry32(3));
    close(blochLength(state, 0), 0);
    close(blochLength(state, 1), 0);
  });

  it('teleportation transfers arbitrary states with fidelity ~1', () => {
    const rng = mulberry32(4);
    for (let i = 0; i < 200; i++) {
      const theta = rng() * Math.PI, phi = rng() * 2 * Math.PI, lambda = rng() * 2 * Math.PI;
      expect(teleportFidelity(theta, phi, lambda, rng)).toBeGreaterThan(1 - 1e-9);
    }
  });

  it('2-qubit Grover finds the marked item with probability 1 after one iteration', () => {
    for (let marked = 0; marked < 4; marked++) {
      const { state } = run(2, grover2(marked), mulberry32(5));
      close(state.probabilities()[marked], 1);
    }
  });

  it('BB84: ~25% errors with an eavesdropper, ~0% without', () => {
    const withEve = bb84(40000, true, mulberry32(6));
    const clean = bb84(40000, false, mulberry32(7));
    expect(Math.abs(withEve.qber - 0.25)).toBeLessThan(0.015);
    expect(clean.qber).toBe(0);
    expect(Math.abs(clean.sifted / clean.sent - 0.5)).toBeLessThan(0.02);
  });

  const python = spawnSync('python', ['--version']).status === 0 ? 'python' : null;
  it.skipIf(!python)('exported Qiskit and PennyLane code is valid Python', () => {
    const ops: Op[] = [
      { kind: 'gate', gate: 'h', target: 0 },
      { kind: 'gate', gate: 'x', target: 1, controls: [0] },
      { kind: 'gate', gate: 'ry', target: 2, params: [Math.PI / 4] },
      { kind: 'gate', gate: 'rz', target: 2, params: [0.123] },
      { kind: 'gate', gate: 'u', target: 1, params: [1, 2, 3] },
      { kind: 'gate', gate: 'h', target: 2, controls: [0, 1] },
      { kind: 'gate', gate: 'x', target: 2, controls: [0, 1] },
      { kind: 'swap', a: 0, b: 1, controls: [2] },
      { kind: 'iswap', a: 0, b: 2 },
      { kind: 'measure', qubit: 0 },
      { kind: 'gate', gate: 'x', target: 2, condition: { bit: 0, value: 1 } },
      { kind: 'reset', qubit: 1 },
    ];
    const dir = mkdtempSync(join(tmpdir(), 'entangled-'));
    for (const [name, code] of [['qiskit.py', toQiskit(3, ops)], ['pennylane.py', toPennyLane(3, ops)]]) {
      const file = join(dir, name);
      writeFileSync(file, code);
      const r = spawnSync(python!, ['-c', 'import ast,sys; ast.parse(open(sys.argv[1]).read())', file]);
      expect(r.stderr.toString()).toBe('');
      expect(r.status).toBe(0);
    }
  });
});

describe('measurement', () => {
  it('follows the Born rule: Ry(theta) gives P(1) = sin^2(theta/2)', () => {
    const theta = 1.1;
    const s = new QState(1);
    s.apply1(0, Ry(theta));
    close(s.prob1(0), Math.sin(theta / 2) ** 2);
    const counts = sample(s, 50000, mulberry32(8));
    expect(Math.abs(counts[1] / 50000 - Math.sin(theta / 2) ** 2)).toBeLessThan(0.01);
  });

  it('measuring one half of a Bell pair collapses the other half', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 200; i++) {
      const { state } = run(2, bellPair(), rng);
      const a = measureQubit(state, 0, rng);
      close(state.prob1(1), a);
      close(blochLength(state, 1), 1); // partner is pure again after collapse
    }
  });

  it('sampling shots does not change the state', () => {
    const { state } = run(2, bellPair(), mulberry32(10));
    const before = state.clone();
    sample(state, 100, mulberry32(11));
    close(state.fidelity(before), 1);
  });
});

describe('entanglement visuals', () => {
  it('pairStrength: 1 for a Bell pair, 0 for a product state', () => {
    close(pairStrength(run(2, bellPair(), mulberry32(12)).state, 0, 1), 1, 1e-6);
    const s = new QState(2);
    s.apply1(0, H);
    s.apply1(1, Ry(0.7));
    expect(pairStrength(s, 0, 1)).toBe(0);
  });

  it('GHZ: no single pair is entangled, but every qubit is fully mixed', () => {
    const { state } = run(3, ghz(3), mulberry32(13));
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) expect(pairStrength(state, a, b)).toBe(0);
    for (let q = 0; q < 3; q++) close(mixedness(state, q), 1);
  });

  it('Bloch vector of |+i> points along +y', () => {
    const s = new QState(1);
    s.apply1(0, H);
    s.apply1(0, gateMatrix('s'));
    const [x, y, z] = blochVector(s, 0);
    close(x, 0);
    close(y, 1);
    close(z, 0);
  });
});

describe('gates as rotations', () => {
  it('H is a half turn about the X+Z diagonal', () => {
    const { axis, angle } = decompose(H);
    close(angle, Math.PI);
    close(axis[0], Math.SQRT1_2);
    close(axis[1], 0);
    close(axis[2], Math.SQRT1_2);
  });

  it('T is an eighth turn about Z', () => {
    const { axis, angle } = decompose(gateMatrix('t'));
    close(angle, Math.PI / 4);
    close(axis[2], 1);
  });

  it('fractional(X, 1/2) squared equals X, including phase', () => {
    const half = fractional(X, 0.5);
    const full = multiply(half, half);
    for (let k = 0; k < 4; k++) {
      close(full.re[k], X.re[k]);
      close(full.im[k], X.im[k]);
    }
  });

  it('10,000 tiny rotations add up exactly (no drift)', () => {
    const s = new QState(1);
    const step = Ry(Math.PI / 10000);
    for (let i = 0; i < 10000; i++) s.apply1(0, step);
    close(s.prob1(0), 1, 1e-9);
    close(s.norm2(), 1, 1e-9);
  });
});

describe('qubit order matches Qiskit (little-endian)', () => {
  it('X on qubit 0 gives basis index 1, and exports as qc.x(0)', () => {
    const s = new QState(3);
    s.apply1(0, X);
    close(s.probabilities()[1], 1);
    expect(toQiskit(3, [{ kind: 'gate', gate: 'x', target: 0 }])).toContain('qc.x(0)');
  });

  it('CNOT 0 -> 1 on |01> (q0 = 1) gives |11>', () => {
    const { state } = run(2, [
      { kind: 'gate', gate: 'x', target: 0 },
      { kind: 'gate', gate: 'x', target: 1, controls: [0] },
    ], mulberry32(14));
    close(state.probabilities()[3], 1);
  });

  it('writes simple angles as fractions of pi', () => {
    expect(toQiskit(1, [{ kind: 'gate', gate: 'ry', target: 0, params: [Math.PI / 4] }])).toContain('qc.ry(pi/4, 0)');
  });
});

describe('history', () => {
  it('undo, redo and replay are exact, including measurements', () => {
    const rng = mulberry32(15);
    const h = new History(2);
    for (const op of bellPair()) h.push(op, rng);
    const bell = h.state.clone();
    h.push({ kind: 'measure', qubit: 0 }, rng);
    const measured = h.state.clone();
    expect(h.undo()).toBe(true);
    close(h.state.fidelity(bell), 1);
    expect(h.redo()).toBe(true);
    close(h.state.fidelity(measured), 1); // same recorded outcome, no new randomness
    const restored = History.fromJSON(JSON.parse(JSON.stringify(h.toJSON())));
    close(restored.state.fidelity(measured), 1);
    expect(restored.cursor).toBe(3);
  });

  it('pushing after undo discards the redo branch', () => {
    const rng = mulberry32(16);
    const h = new History(1);
    h.push({ kind: 'gate', gate: 'h', target: 0 }, rng);
    h.push({ kind: 'gate', gate: 'z', target: 0 }, rng);
    h.undo();
    h.push({ kind: 'gate', gate: 'h', target: 0 }, rng);
    expect(h.length).toBe(2);
    close(h.state.probabilities()[0], 1);
  });
});

describe('noise', () => {
  it('full amplitude damping takes |1> to |0>', () => {
    const s = new QState(1);
    s.apply1(0, X);
    amplitudeDamping(s, 0, 1, mulberry32(17));
    close(s.probabilities()[0], 1);
  });
});
