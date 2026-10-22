import { describe, expect, it } from 'vitest';
import { PRESETS } from '../game/presets';
import { PUZZLES } from '../game/puzzles';
import { run, type Op } from './circuit';
import { mulberry32 } from './measure';
import { decodeCircuit, encodeCircuit } from './share';

describe('share links', () => {
  it('round-trips every preset and puzzle solution exactly', () => {
    for (const p of PRESETS) expect(decodeCircuit(encodeCircuit(p.qubits, p.ops))).toEqual({ n: p.qubits, ops: p.ops });
    for (const p of PUZZLES) {
      const ops = [...(p.setup ?? []), ...p.solution!];
      expect(decodeCircuit(encodeCircuit(p.qubits, ops))).toEqual({ n: p.qubits, ops });
    }
  });

  it('keeps recorded measurement outcomes, so a shared circuit replays the same', () => {
    const { ops } = run(2, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'measure', qubit: 0 }], mulberry32(3));
    const back = decodeCircuit(encodeCircuit(2, ops))!;
    expect(back.ops[1]).toEqual(ops[1]);
    expect((back.ops[1] as { outcome?: number }).outcome).toBeDefined();
  });

  it('is short and readable', () => {
    const ops: Op[] = [
      { kind: 'gate', gate: 'h', target: 0 },
      { kind: 'gate', gate: 'x', target: 1, controls: [0] },
      { kind: 'gate', gate: 'ry', target: 2, params: [Math.PI / 4] },
      { kind: 'swap', a: 0, b: 1 },
      { kind: 'measure', qubit: 0, outcome: 1 },
    ];
    expect(encodeCircuit(3, ops)).toBe('3_h0/x1c0/ry2p0.7854/S0,1/M0=1');
  });

  it('rejects anything malformed or out of range', () => {
    for (const bad of ['', 'x', '0_', '6_h0', '2_h2', '2_q0', '2_x0c0', '2_ry0', '2_h0p1', '2_S0,0', '2_M5', '2_h0//x1', '2_h0;alert(1)']) {
      expect(decodeCircuit(bad), bad).toBeNull();
    }
    expect(decodeCircuit('1_')).toEqual({ n: 1, ops: [] });
  });
});
