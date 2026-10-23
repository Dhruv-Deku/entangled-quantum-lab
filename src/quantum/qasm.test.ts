import { describe, expect, it } from 'vitest';
import type { Op } from './circuit';
import { toQasm } from './export';

// The output was checked against Qiskit 2.5 (qiskit.qasm3.loads plus Operator) on random
// circuits with every gate, 1 and 2 controls, swaps and iSWAP; these pin the format.
describe('OpenQASM 3 export', () => {
  it('writes a header, registers and one line per op', () => {
    const ops: Op[] = [
      { kind: 'gate', gate: 'h', target: 0 },
      { kind: 'gate', gate: 'x', target: 1, controls: [0] },
      { kind: 'measure', qubit: 0 },
      { kind: 'gate', gate: 'x', target: 2, condition: { bit: 0, value: 1 } },
      { kind: 'reset', qubit: 1 },
    ];
    expect(toQasm(3, ops)).toBe(
      [
        '// Exported from Entangled',
        'OPENQASM 3.0;',
        'include "stdgates.inc";',
        'qubit[3] q;',
        'bit[3] c;',
        'h q[0];',
        'ctrl @ x q[0], q[1];',
        'c[0] = measure q[0];',
        'if (c[0] == true) x q[2];',
        'reset q[1];',
        '',
      ].join('\n'),
    );
  });

  it('controls any gate with ctrl @, and writes angles in pi', () => {
    const q = toQasm(3, [
      { kind: 'gate', gate: 'ry', target: 2, params: [Math.PI / 4], controls: [0, 1] },
      { kind: 'gate', gate: 'sxdg', target: 0 },
      { kind: 'swap', a: 1, b: 2, controls: [0] },
    ]);
    expect(q).toContain('ctrl(2) @ ry(pi/4) q[0], q[1], q[2];');
    expect(q).toContain('inv @ sx q[0];');
    expect(q).toContain('ctrl @ swap q[0], q[1], q[2];');
  });

  it('defines iswap only when it is used', () => {
    expect(toQasm(2, [{ kind: 'iswap', a: 0, b: 1 }])).toContain('gate iswap a, b');
    expect(toQasm(2, [{ kind: 'gate', gate: 'h', target: 0 }])).not.toContain('gate iswap');
  });
});
