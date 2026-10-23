import type { Op } from './circuit';
import type { GateName } from './gates';

/**
 * What a routed circuit looks like to the chip's control electronics: every
 * gate becomes a timed microwave pulse on a qubit's drive line. Durations are
 * typical of superconducting chips:
 *
 * - single-qubit rotations: one shaped (Gaussian) pulse, 36 ns;
 * - Z rotations (Z, S, T, Rz, phase): no pulse at all, the electronics just
 *   shift the phase of later pulses ("virtual Z"), so they take 0 ns;
 * - two-qubit gates: a cross-resonance pulse, about 280 ns, the control
 *   qubit driven at the target's frequency;
 * - a SWAP: three of those;
 * - readout: a long tone on the qubit's resonator, about 1.2 us.
 *
 * Gates are placed as early as possible, each qubit busy until its last pulse ends.
 */

export type PulseKind = 'drive' | 'virtual' | 'cross' | 'readout';

export interface Pulse {
  kind: PulseKind;
  /** Physical qubit whose line carries it (for a cross-resonance pulse: the control). */
  qubit: number;
  /** The other qubit of a two-qubit pulse. */
  partner?: number;
  /** Start and duration in nanoseconds. */
  start: number;
  duration: number;
  /** Relative amplitude of a drive pulse (a pi pulse is 1), or the gate name of a virtual Z. */
  amplitude: number;
  label: string;
  /** The last pulse of a SWAP: the two qubits have traded states once it ends. */
  last?: boolean;
}

export const DRIVE_NS = 36;
export const CROSS_NS = 280;
export const READOUT_NS = 1200;

const VIRTUAL = new Set<GateName>(['z', 's', 'sdg', 't', 'tdg', 'p', 'rz']);

/** How hard a single-qubit gate drives (rotation angle / pi). */
function amplitudeOf(gate: GateName, params: readonly number[] = []): number {
  switch (gate) {
    case 'sx':
    case 'sxdg':
    case 'h':
      return 0.5;
    case 'rx':
    case 'ry':
      return Math.min(1, Math.abs(params[0] ?? 0) / Math.PI);
    case 'u':
      return Math.min(1, Math.abs(params[0] ?? 0) / Math.PI);
    default:
      return 1;
  }
}

export interface Schedule {
  pulses: Pulse[];
  /** Total time in nanoseconds. */
  duration: number;
}

export function schedule(ops: readonly Op[], qubits: number): Schedule {
  const free = new Array<number>(qubits).fill(0);
  const pulses: Pulse[] = [];
  const at = (qs: number[]) => Math.max(...qs.map((q) => free[q]));
  const busy = (qs: number[], end: number) => qs.forEach((q) => (free[q] = end));
  for (const op of ops) {
    if (op.kind === 'gate') {
      const controls = op.controls ?? [];
      if (controls.length === 0) {
        if (VIRTUAL.has(op.gate)) {
          pulses.push({ kind: 'virtual', qubit: op.target, start: free[op.target], duration: 0, amplitude: 0, label: op.gate.toUpperCase() });
          continue;
        }
        const t = free[op.target];
        pulses.push({ kind: 'drive', qubit: op.target, start: t, duration: DRIVE_NS, amplitude: amplitudeOf(op.gate, op.params), label: op.gate.toUpperCase() });
        busy([op.target], t + DRIVE_NS);
      } else {
        const qs = [...controls, op.target];
        const t = at(qs);
        pulses.push({ kind: 'cross', qubit: controls[0], partner: op.target, start: t, duration: CROSS_NS, amplitude: 1, label: `C${op.gate.toUpperCase()}` });
        busy(qs, t + CROSS_NS);
      }
    } else if (op.kind === 'swap' || op.kind === 'iswap') {
      const qs = [op.a, op.b];
      const t = at(qs);
      const n = op.kind === 'swap' ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const [c, tg] = k % 2 === 0 ? [op.a, op.b] : [op.b, op.a];
        pulses.push({ kind: 'cross', qubit: c, partner: tg, start: t + k * CROSS_NS, duration: CROSS_NS, amplitude: 1, label: op.kind === 'swap' ? 'SWAP' : 'iSWAP', last: op.kind === 'swap' && k === n - 1 });
      }
      busy(qs, t + n * CROSS_NS);
    } else {
      const t = free[op.qubit];
      pulses.push({ kind: 'readout', qubit: op.qubit, start: t, duration: READOUT_NS, amplitude: 1, label: op.kind === 'reset' ? 'RESET' : 'M' });
      busy([op.qubit], t + READOUT_NS + (op.kind === 'reset' ? DRIVE_NS : 0));
    }
  }
  return { pulses, duration: Math.max(0, ...free) };
}
