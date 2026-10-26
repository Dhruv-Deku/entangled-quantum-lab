import { describe, expect, it } from 'vitest';
import type { Op } from './circuit';
import { manyWorlds, opName } from './paths';

const h = (q: number): Op => ({ kind: 'gate', gate: 'h', target: q });
const cx = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });

describe('many worlds', () => {
  it('H splits one world into two; a second H brings them back together, cancelling the |1> paths', () => {
    const w = manyWorlds(1, [h(0), h(0)]);
    expect(w.layers.length).toBe(3);
    expect(w.layers[1].nodes.map((n) => n.k)).toEqual([0, 1]);
    expect(w.layers[1].edges.length).toBe(2);
    // four paths into the last layer: two reach |0> in phase, two reach |1> and cancel
    expect(w.layers[2].edges.length).toBe(4);
    expect(w.layers[2].nodes.map((n) => n.k)).toEqual([0]);
    expect(w.layers[2].cancelled).toEqual([1]);
    expect(w.layers[2].reinforced).toEqual([0]);
    expect(w.cancellations).toBe(1);
  });

  it('a Bell pair: H then CNOT leaves two worlds, |00> and |11>, half each', () => {
    const w = manyWorlds(2, [h(0), cx(0, 1)]);
    const last = w.layers[2];
    expect(last.nodes.map((n) => n.k)).toEqual([0, 3]);
    for (const n of last.nodes) expect(n.p).toBeCloseTo(0.5, 9);
    expect(last.cancelled).toEqual([]);
  });

  it('a measurement keeps the worlds that agree and ends the others', () => {
    const w = manyWorlds(2, [h(0), cx(0, 1), { kind: 'measure', qubit: 0, outcome: 1 }]);
    const last = w.layers[3];
    expect(last.nodes.map((n) => n.k)).toEqual([3]);
    expect(last.nodes[0].p).toBeCloseTo(1, 9);
    expect(last.pruned).toEqual([0]);
  });

  it('long circuits show their last steps', () => {
    const ops = Array.from({ length: 20 }, () => h(0));
    const w = manyWorlds(1, ops, 12);
    expect(w.skipped).toBe(8);
    expect(w.layers.length).toBe(13);
    expect(opName(cx(0, 1))).toBe('CX 0>1');
  });
});
