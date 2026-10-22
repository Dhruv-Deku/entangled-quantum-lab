import type { Op } from './circuit';
import type { GateName } from './gates';

/**
 * Export a circuit as Python for Qiskit or PennyLane.
 * Qubit k here is qubit k in Qiskit (both little-endian). PennyLane lists wire 0
 * first in its probabilities, so its output order is reversed; the code says so.
 */

/** Write angles as multiples of pi when they are simple fractions. */
function angle(x: number): string {
  for (const d of [1, 2, 3, 4, 6, 8, 12, 16]) {
    const k = (x / Math.PI) * d;
    if (Math.abs(k - Math.round(k)) < 1e-9) {
      const n = Math.round(k);
      if (n === 0) return '0';
      const num = n === 1 ? 'pi' : n === -1 ? '-pi' : `${n}*pi`;
      return d === 1 ? num : `${num}/${d}`;
    }
  }
  return Number(x.toPrecision(12)).toString();
}

const QISKIT_CLASS: Record<GateName, string> = {
  x: 'XGate', y: 'YGate', z: 'ZGate', h: 'HGate', s: 'SGate', sdg: 'SdgGate',
  t: 'TGate', tdg: 'TdgGate', sx: 'SXGate', sxdg: 'SXdgGate', rx: 'RXGate', ry: 'RYGate',
  rz: 'RZGate', p: 'PhaseGate', u: 'UGate',
};

/** Single-control gates Qiskit has a direct method for. */
const QISKIT_ONE_CONTROL = new Set<GateName>(['x', 'y', 'z', 'h', 's', 'sdg', 'sx', 'rx', 'ry', 'rz', 'p']);

function qiskitLine(op: Op): string {
  switch (op.kind) {
    case 'gate': {
      const params = (op.params ?? []).map(angle);
      const controls = op.controls ?? [];
      if (controls.length === 0) return `qc.${op.gate}(${[...params, op.target].join(', ')})`;
      if (controls.length === 1 && QISKIT_ONE_CONTROL.has(op.gate)) {
        return `qc.c${op.gate}(${[...params, controls[0], op.target].join(', ')})`;
      }
      if (op.gate === 'x' && controls.length === 2) return `qc.ccx(${controls[0]}, ${controls[1]}, ${op.target})`;
      if (op.gate === 'z' && controls.length === 2) return `qc.ccz(${controls[0]}, ${controls[1]}, ${op.target})`;
      if (op.gate === 'x') return `qc.mcx([${controls.join(', ')}], ${op.target})`;
      return `qc.append(library.${QISKIT_CLASS[op.gate]}(${params.join(', ')}).control(${controls.length}), [${[...controls, op.target].join(', ')}])`;
    }
    case 'swap':
      if (!op.controls?.length) return `qc.swap(${op.a}, ${op.b})`;
      if (op.controls.length === 1) return `qc.cswap(${op.controls[0]}, ${op.a}, ${op.b})`;
      return `qc.append(library.SwapGate().control(${op.controls.length}), [${[...op.controls, op.a, op.b].join(', ')}])`;
    case 'iswap':
      return `qc.iswap(${op.a}, ${op.b})`;
    case 'measure':
      return `qc.measure(${op.qubit}, ${op.bit ?? op.qubit})`;
    case 'reset':
      return `qc.reset(${op.qubit})`;
  }
}

export function toQiskit(n: number, ops: readonly Op[]): string {
  const lines = [
    '# Exported from Entangled',
    'from math import pi',
    'from qiskit import QuantumCircuit',
    'from qiskit.circuit import library',
    '',
    `qc = QuantumCircuit(${n}, ${n})`,
  ];
  for (const op of ops) {
    if (op.kind === 'gate' && op.condition) {
      lines.push(`with qc.if_test((qc.clbits[${op.condition.bit}], ${op.condition.value})):`);
      lines.push(`    ${qiskitLine(op)}`);
    } else {
      lines.push(qiskitLine(op));
    }
  }
  lines.push('', 'print(qc.draw())', '');
  return lines.join('\n');
}

const PL_GATE: Record<GateName, string> = {
  x: 'qml.PauliX', y: 'qml.PauliY', z: 'qml.PauliZ', h: 'qml.Hadamard',
  s: 'qml.S', sdg: 'qml.adjoint(qml.S)', t: 'qml.T', tdg: 'qml.adjoint(qml.T)',
  sx: 'qml.SX', sxdg: 'qml.adjoint(qml.SX)', rx: 'qml.RX', ry: 'qml.RY', rz: 'qml.RZ', p: 'qml.PhaseShift', u: 'qml.U3',
};

export function toPennyLane(n: number, ops: readonly Op[]): string {
  const body: string[] = [];
  const bitVar = new Map<number, string>();
  let m = 0;
  for (const op of ops) {
    switch (op.kind) {
      case 'gate': {
        const params = (op.params ?? []).map(angle);
        const controls = op.controls ?? [];
        let fn = PL_GATE[op.gate];
        let wires = `wires=${op.target}`;
        if (op.gate === 'x' && controls.length === 1) { fn = 'qml.CNOT'; wires = `wires=[${controls[0]}, ${op.target}]`; }
        else if (op.gate === 'z' && controls.length === 1) { fn = 'qml.CZ'; wires = `wires=[${controls[0]}, ${op.target}]`; }
        else if (op.gate === 'x' && controls.length === 2) { fn = 'qml.Toffoli'; wires = `wires=[${controls[0]}, ${controls[1]}, ${op.target}]`; }
        else if (controls.length > 0) fn = `qml.ctrl(${fn}, control=[${controls.join(', ')}])`;
        const args = [...params, wires].join(', ');
        if (op.condition) {
          const v = bitVar.get(op.condition.bit);
          if (!v) throw new Error(`condition reads classical bit ${op.condition.bit} before it is measured`);
          body.push(`qml.cond(${v} == ${op.condition.value}, ${fn})(${args})`);
        } else {
          body.push(`${fn}(${args})`);
        }
        break;
      }
      case 'swap':
        if (!op.controls?.length) body.push(`qml.SWAP(wires=[${op.a}, ${op.b}])`);
        else if (op.controls.length === 1) body.push(`qml.CSWAP(wires=[${op.controls[0]}, ${op.a}, ${op.b}])`);
        else body.push(`qml.ctrl(qml.SWAP, control=[${op.controls.join(', ')}])(wires=[${op.a}, ${op.b}])`);
        break;
      case 'iswap':
        body.push(`qml.ISWAP(wires=[${op.a}, ${op.b}])`);
        break;
      case 'measure': {
        const v = `m${m++}`;
        bitVar.set(op.bit ?? op.qubit, v);
        body.push(`${v} = qml.measure(${op.qubit})`);
        break;
      }
      case 'reset':
        body.push(`qml.measure(${op.qubit}, reset=True)`);
        break;
    }
  }
  return [
    '# Exported from Entangled',
    '# PennyLane orders probabilities with wire 0 first (Entangled and Qiskit put qubit 0 last).',
    'from math import pi',
    'import pennylane as qml',
    '',
    `dev = qml.device("default.qubit", wires=${n})`,
    '',
    '',
    '@qml.qnode(dev)',
    'def circuit():',
    ...body.map((l) => `    ${l}`),
    `    return qml.probs(wires=range(${n}))`,
    '',
    '',
    'print(circuit())',
    '',
  ].join('\n');
}
