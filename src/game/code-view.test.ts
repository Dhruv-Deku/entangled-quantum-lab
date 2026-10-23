import { describe, expect, it } from 'vitest';
import type { Op } from '../quantum/circuit';
import { codeLines, mathsText, pages, program, splitLine } from './code-view';

const bell: Op[] = [
  { kind: 'gate', gate: 'h', target: 0 },
  { kind: 'gate', gate: 'x', target: 1, controls: [0] },
  { kind: 'measure', qubit: 0 },
];

describe('code window', () => {
  it('colours the call or gate name in every language', () => {
    expect(splitLine('qc.cx(0, 1)', 'qiskit')).toEqual({ head: 'qc.cx', rest: '(0, 1)', comment: false });
    expect(splitLine('ctrl @ x q[0], q[1];', 'qasm')).toEqual({ head: 'ctrl @ x', rest: ' q[0], q[1];', comment: false });
    expect(splitLine('ctrl(2) @ ry(pi/4) q[0], q[1], q[2];', 'qasm').head).toBe('ctrl(2) @ ry(pi/4)');
    expect(splitLine('inv @ sx q[0];', 'qasm').head).toBe('inv @ sx');
    expect(splitLine('c[0] = measure q[0];', 'qasm').head).toBe('c[0] = measure');
    expect(splitLine('if (c[0] == true) x q[2];', 'qasm').head).toBe('if (c[0] == true) x');
    expect(splitLine('    qml.CNOT(wires=[0, 1])', 'pennylane').head).toBe('qml.CNOT');
    expect(splitLine('    m0 = qml.measure(0)', 'pennylane').head).toBe('m0 = qml.measure');
  });

  it('dims comments', () => {
    expect(splitLine('# Exported from Entangled', 'qiskit').comment).toBe(true);
    expect(splitLine('// Exported from Entangled', 'qasm').comment).toBe(true);
  });

  it('head plus rest is the original line, so nothing is lost on screen', () => {
    for (const f of ['qiskit', 'qasm', 'pennylane'] as const) {
      const shown = codeLines(f, 2, bell).map((l) => l.head + l.rest);
      const real = program(f, 2, bell).split('\n').map((l) => l.trim()).filter(Boolean);
      expect(shown, f).toEqual(real);
    }
  });

  it('PennyLane that cannot be written becomes a comment, not a crash', () => {
    const bad: Op[] = [{ kind: 'gate', gate: 'x', target: 0, condition: { bit: 1, value: 1 } }];
    expect(program('pennylane', 2, bad)).toMatch(/^# PennyLane cannot express/);
  });

  it('pages', () => {
    expect(pages(0, 14)).toBe(1);
    expect(pages(14, 14)).toBe(1);
    expect(pages(15, 14)).toBe(2);
  });

  it('the Maths tab: the last step as plain text the panel font can draw', () => {
    const text = mathsText(2, bell.slice(0, 2));
    expect(text).toContain('Step 2: CX on q0, q1');
    expect(text).toContain('U = CX');
    expect(text).toContain('|psi> = 1/sqrt2 (|00> + |11>)');
    expect(text.split('\n').filter((l) => l.startsWith('['))).toHaveLength(4);
    expect(/^[\x20-\x7E\n]+$/.test(text)).toBe(true);
    expect(mathsText(1, [{ kind: 'gate', gate: 'h', target: 0 }])).toContain('Matrix = 1/sqrt2 *');
  });
});
