import { bellPair, ghz, grover2, teleportation } from '../quantum/algorithms';
import type { Op } from '../quantum/circuit';

/** Ready-made starting points for the sandbox, on the navigator's Sandbox tab. */
export interface Preset {
  label: string;
  qubits: number;
  ops: Op[];
  /** One line for the card. */
  note: string;
}

const allH = (n: number): Op[] => Array.from({ length: n }, (_, q): Op => ({ kind: 'gate', gate: 'h', target: q }));

export const PRESETS: Preset[] = [
  { label: '1 qubit', qubits: 1, ops: [], note: 'One qubit at 0.' },
  { label: '2 qubits', qubits: 2, ops: [], note: 'Two qubits at 0.' },
  { label: '3 qubits', qubits: 3, ops: [], note: 'Three qubits at 0.' },
  { label: '4 qubits', qubits: 4, ops: [], note: 'Four qubits at 0.' },
  { label: '5 qubits', qubits: 5, ops: [], note: 'Five qubits: 32 outcomes at once.' },
  { label: 'Bell pair', qubits: 2, ops: bellPair(0, 1), note: 'A Bell pair: always 00 or 11.' },
  { label: 'GHZ x3', qubits: 3, ops: ghz(3), note: 'Three qubits that always agree. Note the gold ring.' },
  { label: 'GHZ x5', qubits: 5, ops: ghz(5), note: 'Five qubits, one shared coin: 00000 or 11111.' },
  { label: 'Even x4', qubits: 4, ops: allH(4), note: 'Four Hadamards: all 16 outcomes equally likely.' },
  { label: 'Teleport', qubits: 3, ops: teleportation(1.1, 0.6, 0), note: 'A finished teleportation. Scrub the timeline to replay it.' },
  { label: 'Grover', qubits: 2, ops: grover2(3), note: "One round of Grover's search, prize in box 11." },
];
