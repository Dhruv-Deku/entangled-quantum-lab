import { run, type Op } from '../quantum/circuit';
import type { QState } from '../quantum/state';

/**
 * The State Album: fifteen famous quantum states to collect. Making one on the
 * orbs (any way you like, up to a global phase) adds it to the album, like a
 * sticker book of quantum computing's greatest hits.
 */

export interface AlbumEntry {
  id: string;
  name: string;
  /** How it is usually written. */
  ket: string;
  /** A nudge for the empty slot. */
  hint: string;
  qubits: number;
  /** One recipe (it defines the target). */
  ops: Op[];
}

const g = (gate: 'h' | 'x' | 'y' | 'z' | 's' | 't' | 'sdg', target: number): Op => ({ kind: 'gate', gate, target });
const cx = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });
const ghz = (n: number): Op[] => [g('h', 0), ...Array.from({ length: n - 1 }, (_, i) => cx(i, i + 1))];

export const ALBUM: AlbumEntry[] = [
  { id: 'one', name: 'One', ket: '|1>', hint: 'flip a single qubit', qubits: 1, ops: [g('x', 0)] },
  { id: 'plus', name: 'Plus', ket: '|0> + |1>', hint: 'one qubit, half and half', qubits: 1, ops: [g('h', 0)] },
  { id: 'minus', name: 'Minus', ket: '|0> - |1>', hint: 'half and half, with a minus', qubits: 1, ops: [g('x', 0), g('h', 0)] },
  { id: 'plus-i', name: 'Plus i', ket: '|0> + i|1>', hint: 'the right-hand pole', qubits: 1, ops: [g('h', 0), g('s', 0)] },
  { id: 'minus-i', name: 'Minus i', ket: '|0> - i|1>', hint: 'the left-hand pole', qubits: 1, ops: [g('h', 0), g('s', 0), g('z', 0)] },
  { id: 'magic', name: 'Magic T', ket: '|0> + e^(i pi/4)|1>', hint: 'an eighth of a turn of phase', qubits: 1, ops: [g('h', 0), g('t', 0)] },
  { id: 'phi-plus', name: 'Phi plus', ket: '|00> + |11>', hint: 'the classic Bell pair', qubits: 2, ops: ghz(2) },
  { id: 'phi-minus', name: 'Phi minus', ket: '|00> - |11>', hint: 'a Bell pair with a hidden sign', qubits: 2, ops: [g('h', 0), g('z', 0), cx(0, 1)] },
  { id: 'psi-plus', name: 'Psi plus', ket: '|01> + |10>', hint: 'always disagree', qubits: 2, ops: [g('h', 0), g('x', 1), cx(0, 1)] },
  { id: 'psi-minus', name: 'Singlet', ket: '|01> - |10>', hint: 'disagree, with a minus', qubits: 2, ops: [g('h', 0), g('z', 0), g('x', 1), cx(0, 1)] },
  { id: 'plus-plus', name: 'Plus plus', ket: '|00> + |01> + |10> + |11>', hint: 'two qubits, all four answers', qubits: 2, ops: [g('h', 0), g('h', 1)] },
  { id: 'ghz3', name: 'GHZ', ket: '|000> + |111>', hint: 'three that always agree', qubits: 3, ops: ghz(3) },
  { id: 'all8', name: 'All eight', ket: 'every |abc>', hint: 'three qubits, every answer', qubits: 3, ops: [g('h', 0), g('h', 1), g('h', 2)] },
  { id: 'ghz4', name: 'GHZ four', ket: '|0000> + |1111>', hint: 'four that always agree', qubits: 4, ops: ghz(4) },
  { id: 'ghz5', name: 'GHZ five', ket: '|00000> + |11111>', hint: 'all five orbs at once', qubits: 5, ops: ghz(5) },
];

const targets = new Map<string, QState>();
const targetOf = (e: AlbumEntry) => targets.get(e.id) ?? (targets.set(e.id, run(e.qubits, e.ops, () => 0.5).state), targets.get(e.id)!);

/** Album entries this state matches (same number of qubits, equal up to a global phase). */
export function albumMatches(s: QState): AlbumEntry[] {
  return ALBUM.filter((e) => e.qubits === s.n && s.fidelity(targetOf(e)) > 0.999);
}
