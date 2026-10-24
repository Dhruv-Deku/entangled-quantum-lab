import { describe, expect, it } from 'vitest';
import { Lab } from '../lab/lab';
import { unitaryFigure, type ChshRun, type Figure, type QecView, type ZenoView } from '../lab/figures';
import { circuitUnitary, describeUnitary, exactMagnetization, TROTTER_STEPS, WALK_MAX_STEPS, type RbResult } from '../quantum/advanced';
import { blochVector } from '../quantum/bloch';
import { pairStrength } from '../quantum/entanglement';
import { mulberry32 } from '../quantum/measure';
import { Campaign } from './campaign';
import { CHAPTERS } from './chapters';

function settle(c: Campaign, seconds = 3): void {
  for (let i = 0; i < seconds * 60; i++) c.update(1 / 60);
}

/** A 2D context that accepts every call, so figures can be drawn in tests. */
function stubContext(calls: { n: number }): CanvasRenderingContext2D {
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => {
      if (prop === 'measureText') return (s: string) => ({ width: s.length * 12 });
      return (..._args: unknown[]) => void calls.n++;
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
}

function drawn(f: Figure | null): number {
  expect(f).not.toBeNull();
  const calls = { n: 0 };
  f!.draw(stubContext(calls), 1600, 640);
  return calls.n;
}

/** Play a chapter with the card buttons and Show me; every step's figure is drawn on the way. */
function play(title: string, seed = 1): { c: Campaign; lab: Lab; payoffs: string[]; keys: Set<string> } {
  const lab = new Lab(1, mulberry32(seed));
  const c = new Campaign(lab);
  c.startChapter(CHAPTERS.findIndex((ch) => ch.title === title));
  const payoffs: string[] = [];
  const keys = new Set<string>();
  const look = () => {
    const f = c.figure();
    expect(drawn(f), title).toBeGreaterThan(20);
    keys.add(f!.key);
  };
  for (let guard = 0; guard < 40 && !c.chapterDone; guard++) {
    look();
    if (c.view.step!.action) c.next();
    else expect(c.showMe(), `${title}: ${c.view.goal}`).toBe(true);
    c.update(0);
    if (c.payoff) payoffs.push(c.payoff);
    look();
    if (c.stepDone) c.next();
    settle(c);
  }
  expect(c.chapterDone, title).toBe(true);
  return { c, lab, payoffs, keys };
}

describe('advanced chapters', () => {
  it('seven more chapters close the list', () => {
    expect(CHAPTERS).toHaveLength(25);
    expect(CHAPTERS.slice(18).map((c) => c.title)).toEqual(['Bell Test', 'Error Correction', 'Entanglement Swapping', 'Quantum Walk', 'Time Evolution', 'Quantum Zeno', 'Benchmarking']);
  });

  it('Quantum Zeno: unwatched it reaches |1>; watched often, it stays', () => {
    for (const seed of [1, 2, 3]) {
      const { c, lab } = play('Quantum Zeno', seed);
      const v = c.memoryValue('zeno') as ZenoView;
      expect(v.free).toBe(true);
      expect(v.trial).toHaveLength(10);
      expect(lab.history.ops.filter((o) => o.kind === 'measure')).toHaveLength(10);
      expect(v.curve![0][1]).toBe(0);
      expect(v.curve![v.curve!.length - 1][1]).toBeGreaterThan(0.9);
    }
  });

  it('Benchmarking: a sequence undoes itself; the fit finds about 0.1% error per gate', () => {
    const { c, lab } = play('Benchmarking');
    expect(lab.state.probabilities()[0]).toBeCloseTo(1, 9);
    const r = c.memoryValue('rb') as RbResult;
    expect(r.perGate).toBeGreaterThan(0.0005);
    expect(r.perGate).toBeLessThan(0.0015);
    expect(r.points[0][1]).toBeGreaterThan(r.points[r.points.length - 1][1]);
  });

  it('Bell Test: the pair beats the classical limit; measured bits do not', () => {
    for (const seed of [1, 2, 3]) {
      const { c, keys } = play('Bell Test', seed);
      const [pair, bits] = c.memoryValue('chsh') as ChshRun[];
      expect(pair.result.s).toBeGreaterThan(2.5);
      expect(pair.result.win).toBeGreaterThan(0.8);
      expect(pair.result.exact).toBeCloseTo(2 * Math.SQRT2, 9);
      expect(bits.result.exact).toBeLessThanOrEqual(2 + 1e-9);
      expect(bits.result.win).toBeLessThan(0.8);
      expect(keys.size).toBeGreaterThanOrEqual(3);
    }
  });

  it('Error Correction finds and undoes the flip, whichever qubit it hit, and the message comes back', () => {
    const hit = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { c, lab, payoffs } = play('Error Correction', seed);
      const v = c.memoryValue('qec') as QecView;
      hit.add(v.flipped!);
      const named = v.syndrome!.join('');
      expect({ '10': 0, '11': 1, '01': 2 }[named]).toBe(v.flipped);
      expect(v.corrected).toBe(true);
      // decoded: q0 alone, tilted as Show me set it (Ry 1.1)
      const [x, , z] = blochVector(lab.state, 0);
      expect(z).toBeCloseTo(Math.cos(1.1), 9);
      expect(x).toBeCloseTo(Math.sin(1.1), 9);
      expect(v.curve).toHaveLength(7);
      expect(v.curve![1][1]).toBeLessThan(0.1);
      expect(payoffs.some((p) => p.includes(`q${v.flipped} is the odd one out`))).toBe(true);
    }
    expect([...hit].sort()).toEqual([0, 1, 2]);
  });

  it('Entanglement Swapping links q0 and q3, and every shot agrees', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { lab, payoffs } = play('Entanglement Swapping', seed);
      expect(pairStrength(lab.state, 0, 3)).toBeCloseTo(1, 9);
      expect(payoffs[payoffs.length - 1]).toMatch(/agreed in 100 of 100 shots/);
    }
  });

  it('Quantum Walk takes six steps and spreads faster than a coin-flipping walker', () => {
    const { c, payoffs } = play('Quantum Walk');
    const w = c.memoryValue('walk') as { t: number; spreads: { q: number; c: number }[] };
    expect(w.t).toBe(WALK_MAX_STEPS);
    const last = w.spreads[w.spreads.length - 1];
    expect(last.q).toBeGreaterThan(1.3 * last.c);
    expect(payoffs[payoffs.length - 1]).toMatch(/of 100 shots found it 4 or more sites out/);
  });

  it('Time Evolution: small Trotter steps stay near the exact curve; big ones drift more', () => {
    const { c } = play('Time Evolution');
    const fine = c.memoryValue('trotter') as [number, number][];
    const coarse = c.memoryValue('coarse') as [number, number][];
    expect(fine).toHaveLength(TROTTER_STEPS + 1);
    expect(coarse).toHaveLength(TROTTER_STEPS / 3 + 1);
    const t = fine[fine.length - 1][0];
    expect(coarse[coarse.length - 1][0]).toBeCloseTo(t, 12);
    const exact = exactMagnetization([t])[0];
    expect(Math.abs(fine[fine.length - 1][1] - exact)).toBeLessThan(Math.abs(coarse[coarse.length - 1][1] - exact));
    // the card says it overshoots to about -0.8 near t = 4
    const [tLow, mLow] = fine.reduce((lo, p) => (p[1] < lo[1] ? p : lo));
    expect(mLow).toBeLessThan(-0.7);
    expect(Math.abs(tLow - 4)).toBeLessThan(0.6);
  });

  it('the unitary view draws a matrix, or explains why there is none', () => {
    const u = circuitUnitary(3, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 1, controls: [0] }])!;
    expect(drawn(unitaryFigure(3, 2, u, describeUnitary(u)))).toBeGreaterThan(64);
    expect(drawn(unitaryFigure(5, 40, circuitUnitary(5, Array.from({ length: 40 }, (_, i) => ({ kind: 'gate' as const, gate: 'h' as const, target: i % 5 })))!, 'dense'))).toBeGreaterThan(100);
    expect(drawn(unitaryFigure(2, 1, null, 'This circuit measures.'))).toBeGreaterThan(3);
  });
});
