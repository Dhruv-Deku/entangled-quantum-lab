import { describe, expect, it } from 'vitest';
import { History } from './history';
import type { Op } from './circuit';
import { mulberry32 } from './measure';
import { cityHighlights, entanglementMap, entanglementSummary, nextView, pureDensity, qsphere } from './state-views';

function stateOf(n: number, ops: Op[]) {
  const h = new History(n);
  const rng = mulberry32(1);
  for (const op of ops) h.push(op, rng);
  return h.state;
}
const H = (target: number): Op => ({ kind: 'gate', gate: 'h', target });
const CX = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });
const Z = (target: number): Op => ({ kind: 'gate', gate: 'z', target });

describe('big-state views', () => {
  it('Q-sphere: |0..0> at the north pole, |1..1> at the south, phases relative to the largest amplitude', () => {
    const s = stateOf(3, [H(0), CX(0, 1), CX(1, 2), Z(0)]); // (|000> - |111>)/sqrt2
    const pts = qsphere(s);
    expect(pts).toHaveLength(8);
    const north = pts.find((p) => p.label === '000')!, south = pts.find((p) => p.label === '111')!;
    expect(north.pos[1]).toBeCloseTo(1, 9);
    expect(south.pos[1]).toBeCloseTo(-1, 9);
    expect(north.p).toBeCloseTo(0.5, 9);
    expect(Math.abs(north.phase)).toBeCloseTo(0, 9);
    expect(Math.abs(south.phase)).toBeCloseTo(Math.PI, 9);
    // the three one-1 states share a latitude and spread around it
    const ring = pts.filter((p) => p.weight === 1);
    expect(new Set(ring.map((p) => p.pos[1].toFixed(6))).size).toBe(1);
    for (const p of pts) expect(Math.hypot(...p.pos)).toBeCloseTo(1, 9);
  });

  it('state city: a Bell pair has four towers of 1/2, and they are what the caption lists', () => {
    const s = stateOf(2, [H(0), CX(0, 1)]);
    const rho = pureDensity(s);
    expect(rho.re[0]).toBeCloseTo(0.5, 9);
    expect(rho.re[3]).toBeCloseTo(0.5, 9);
    expect(rho.re[3 * 4 + 3]).toBeCloseTo(0.5, 9);
    expect(rho.re[1 * 4 + 1]).toBeCloseTo(0, 9);
    const top = cityHighlights(rho, 2);
    expect(top.map((t) => t.label)).toEqual(['|00><00|', '|00><11|', '|11><11|']);
    // a phase shows up in the imaginary part: (|0> + i|1>)/sqrt2
    const y = pureDensity(stateOf(1, [H(0), { kind: 'gate', gate: 's', target: 0 }]));
    expect(y.im[0 * 2 + 1]).toBeCloseTo(-0.5, 9);
    expect(y.im[1 * 2 + 0]).toBeCloseTo(0.5, 9);
  });

  it('entanglement map: a Bell pair beside a loner, and GHZ shared by the whole group', () => {
    const bell = entanglementMap(stateOf(3, [H(0), CX(0, 1), H(2)]));
    expect(bell.pair[0][1]).toBeCloseTo(1, 6);
    expect(bell.pair[1][2]).toBeCloseTo(0, 6);
    expect(bell.rest[2]).toBeCloseTo(0, 6);
    expect(entanglementSummary(bell)).toEqual(['Entangled pairs: q0-q1 1.00.', 'q2 is not entangled with anything.']);
    const ghz = entanglementMap(stateOf(3, [H(0), CX(0, 1), CX(1, 2)]));
    expect(Math.max(ghz.pair[0][1], ghz.pair[0][2], ghz.pair[1][2])).toBeLessThan(0.05);
    expect(ghz.rest.every((v) => v > 0.99)).toBe(true);
    expect(entanglementSummary(ghz)[0]).toMatch(/shared by the whole group/);
    expect(entanglementSummary(entanglementMap(stateOf(2, [H(0)])))).toEqual(['No entanglement: every qubit has a state of its own.']);
  });

  it('entanglement map matches theory for a partly entangled pair: RY(t) then CX gives strength sin t', () => {
    for (const t of [0.3, 1.0, 2.2]) {
      const m = entanglementMap(stateOf(2, [{ kind: 'gate', gate: 'ry', target: 0, params: [t] }, CX(0, 1)]));
      expect(m.pair[0][1]).toBeCloseTo(Math.abs(Math.sin(t)), 6);
      expect(m.rest[0]).toBeCloseTo(Math.sin(t) ** 2, 6);
    }
  });

  it('the View button cycles Q-sphere, city, map, off', () => {
    expect(nextView(null)).toBe('qsphere');
    expect(nextView('qsphere')).toBe('city');
    expect(nextView('city')).toBe('heatmap');
    expect(nextView('heatmap')).toBe(null);
  });
});
