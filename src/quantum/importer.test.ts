import { describe, expect, it } from 'vitest';
import { sameUnitary } from '../game/builder';
import type { Op } from './circuit';
import { toQasm, toQiskit } from './export';
import type { GateName } from './gates';
import { angle, ImportError, parseCircuit, parseQasm, parseQiskit } from './importer';
import { mulberry32 } from './measure';

const GATES: GateName[] = ['h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg', 'sx', 'sxdg', 'rx', 'ry', 'rz', 'p', 'u'];

function randomCircuit(n: number, len: number, rnd: () => number): Op[] {
  const ops: Op[] = [];
  for (let i = 0; i < len; i++) {
    const t = Math.floor(rnd() * n);
    const others = [...Array(n).keys()].filter((q) => q !== t);
    const r = rnd();
    if (n > 1 && r < 0.1) {
      ops.push({ kind: 'swap', a: t, b: others[0], ...(n > 2 && rnd() < 0.5 ? { controls: [others[1]] } : {}) });
      continue;
    }
    const gate = GATES[Math.floor(rnd() * GATES.length)];
    const params = gate === 'u' ? [0.3, 1.1, -0.7] : ['rx', 'ry', 'rz', 'p'].includes(gate) ? [[Math.PI / 4, -Math.PI / 2, 0.37][Math.floor(rnd() * 3)]] : undefined;
    const nc = n > 1 && r < 0.5 ? (n > 2 && rnd() < 0.3 ? 2 : 1) : 0;
    ops.push({ kind: 'gate', gate, target: t, ...(params ? { params } : {}), ...(nc ? { controls: others.slice(0, nc) } : {}) });
  }
  return ops;
}

describe('importing circuits', () => {
  it('reads angles: pi/4, -3*pi/2, 2*pi/3+0.1, 0.5e-1', () => {
    expect(angle('pi/4')).toBeCloseTo(Math.PI / 4, 12);
    expect(angle('-3*pi/2')).toBeCloseTo((-3 * Math.PI) / 2, 12);
    expect(angle('2*pi/3 + 0.1')).toBeCloseTo((2 * Math.PI) / 3 + 0.1, 12);
    expect(angle('0.5e-1')).toBeCloseTo(0.05, 12);
    expect(() => angle('pie')).toThrow(ImportError);
  });

  it('round trip: every exported OpenQASM 3 and Qiskit program reads back as the same circuit', () => {
    const rnd = mulberry32(17);
    for (let k = 0; k < 120; k++) {
      const n = 1 + Math.floor(rnd() * 3);
      const ops = randomCircuit(n, 2 + Math.floor(rnd() * 12), rnd);
      for (const [name, text] of [['qasm', toQasm(n, ops)], ['qiskit', toQiskit(n, ops)]] as const) {
        const got = parseCircuit(text);
        expect(got.format, name).toBe(name);
        expect(got.n).toBeLessThanOrEqual(n);
        expect(sameUnitary(n, ops, got.ops), `${name}\n${text}`).toBe(true);
      }
    }
  });

  it('reads OpenQASM 2 and hand-written forms', () => {
    const q2 = parseQasm(`OPENQASM 2.0;
include "qelib1.inc";
qreg q[3];
creg c[3];
h q[0];
cx q[0],q[1];
ccx q[0],q[1],q[2];
u1(pi/2) q[2];
cu1(pi/4) q[1],q[2];
measure q[0] -> c[0];
if(c==1) x q[1];`);
    expect(q2.n).toBe(3);
    expect(q2.ops.map((o) => o.kind)).toEqual(['gate', 'gate', 'gate', 'gate', 'gate', 'measure', 'gate']);
    expect(q2.ops[2]).toMatchObject({ gate: 'x', target: 2, controls: [0, 1] });
    expect(q2.ops[4]).toMatchObject({ gate: 'p', controls: [1], target: 2 });
    expect(q2.ops[6]).toMatchObject({ condition: { bit: 0, value: 1 } });
  });

  it('reads a measurement and a condition, and keeps classical bits', () => {
    const q = parseQasm('OPENQASM 3.0; qubit[2] q; bit[2] c; h q[0]; c[1] = measure q[0]; if (c[1] == true) x q[1];');
    expect(q.ops[1]).toEqual({ kind: 'measure', qubit: 0, bit: 1 });
    expect(q.ops[2]).toMatchObject({ condition: { bit: 1, value: 1 } });
    const k = parseQiskit('qc = QuantumCircuit(2, 2)\nqc.h(0)\nqc.measure(0, 1)\nwith qc.if_test((qc.clbits[1], 1)):\n    qc.x(1)\nqc.h(0)');
    expect(k.ops[2]).toMatchObject({ gate: 'x', condition: { bit: 1, value: 1 } });
    expect(k.ops[3]).not.toHaveProperty('condition');
  });

  it('reports what it cannot read, with the line', () => {
    expect(() => parseQasm('qubit[2] q; foo q[0];')).toThrow(/unknown gate "foo"/);
    expect(() => parseQasm('qubit[2] q; h q[0], q[1];')).toThrow(/needs 1 qubit/);
    expect(() => parseQasm('qubit[7] q; h q[6];')).toThrow(/at most 5/);
    expect(() => parseQiskit('qc = QuantumCircuit(1)\nqc.rx(0)')).toThrow(ImportError);
  });
});
