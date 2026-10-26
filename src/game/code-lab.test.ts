import { describe, expect, it } from 'vitest';
import { run } from '../quantum/circuit';
import { CodeProgram, EXAMPLES, fromOps } from './code-lab';

describe('the Code Lab', () => {
  it('builds statements from taps, and writes real OpenQASM 3', () => {
    const p = new CodeProgram();
    p.gate('h');
    p.qubit(0);
    p.gate('cx');
    p.qubit(0);
    expect(p.lines().text.slice(-1)[0]).toBe('cx q[0], _');
    p.qubit(1);
    p.gate('ry');
    p.angle('pi/2');
    p.qubit(2);
    p.gate('measure');
    p.qubit(2);
    const { text, first } = p.lines();
    expect(text.slice(0, first)).toEqual(['OPENQASM 3.0;', 'include "stdgates.inc";', 'qubit[3] q;', 'bit[3] c;']);
    expect(text.slice(first)).toEqual(['h q[0];', 'cx q[0], q[1];', 'ry(pi/2) q[2];', 'c[2] = measure q[2];']);
  });

  it('a qubit on a finished one-qubit line repeats the gate; mistakes are explained', () => {
    const p = new CodeProgram();
    expect(p.qubit(0)).toBe('Pick a gate first.');
    p.gate('h');
    p.qubit(0);
    p.qubit(1);
    expect(p.lines().text.slice(-2)).toEqual(['h q[0];', 'h q[1];']);
    p.gate('cx');
    p.qubit(0);
    expect(p.qubit(0)).toBe('q0 is already on this line.');
    expect(p.angle('pi')).toBe('Angles go with rx, ry and rz.');
    const r = p.ops();
    expect('error' in r && r.line).toBe(2);
  });

  it('backspace takes back the last tap, then the line', () => {
    const p = new CodeProgram();
    p.gate('cx');
    p.qubit(0);
    p.qubit(1);
    p.backspace();
    expect(p.lines().text.slice(-1)[0]).toBe('cx q[0], _');
    p.backspace();
    p.backspace();
    expect(p.stmts).toEqual([]);
  });

  it('the examples run: the Bell pair gives 00 or 11, Grover finds 11', () => {
    for (const ex of EXAMPLES) {
      const p = new CodeProgram();
      p.load(ex.n, ex.stmts);
      const r = p.ops();
      expect('ops' in r, ex.name).toBe(true);
    }
    const bell = new CodeProgram();
    bell.load(EXAMPLES[0].n, EXAMPLES[0].stmts);
    const s = run(2, (bell.ops() as { ops: never[] }).ops, () => 0.5).state.probabilities();
    expect(s[0]).toBeCloseTo(0.5, 9);
    expect(s[3]).toBeCloseTo(0.5, 9);
    const grover = new CodeProgram();
    grover.load(EXAMPLES[2].n, EXAMPLES[2].stmts);
    expect(run(2, (grover.ops() as { ops: never[] }).ops, () => 0.5).state.probabilities()[3]).toBeCloseTo(1, 9);
  });

  it('reads a circuit back from the orbs', () => {
    const { stmts, skipped } = fromOps([
      { kind: 'gate', gate: 'h', target: 0 },
      { kind: 'gate', gate: 'x', target: 1, controls: [0] },
      { kind: 'gate', gate: 'ry', target: 0, params: [Math.PI / 2] },
      { kind: 'gate', gate: 'ry', target: 0, params: [0.3] },
      { kind: 'measure', qubit: 1, outcome: 1 },
    ]);
    expect(stmts.map((s) => s.gate)).toEqual(['h', 'cx', 'ry', 'measure']);
    expect(skipped).toBe(1);
  });
});
