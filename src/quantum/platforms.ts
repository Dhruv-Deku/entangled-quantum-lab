import { applyOp, type Op } from './circuit';
import { agreement, TYPICAL_NOISE, type ChipRun, type NoiseModel } from './hardware';
import { measureQubit, type Rng } from './measure';
import { depolarize } from './noise';
import { schedule, SUPERCONDUCTING_TIMING, type Schedule, type Timing } from './pulses';
import { route, T5, type Chip, type Routed } from './routing';
import { QState } from './state';

/**
 * Three kinds of quantum computer, each running the same circuit its own way:
 *
 * - superconducting circuits (IBM, Google): fast microwave gates, but each
 *   qubit only talks to its neighbours, so the compiler adds SWAPs;
 * - trapped ions (Quantinuum, IonQ): every ion talks to every other through
 *   the chain's shared motion; slow laser gates, very low error;
 * - neutral atoms (QuEra, Pasqal, Atom Computing): atoms in optical tweezers;
 *   two atoms interact when one is moved next to the other (Rydberg blockade).
 *
 * Error rates and timings are typical published figures, rounded.
 */

export type PlatformId = 'superconducting' | 'ions' | 'atoms';

export interface Platform {
  id: PlatformId;
  name: string;
  /** The word for the machine's qubits. */
  qubit: string;
  examples: string;
  noise: NoiseModel;
  /** Extra depolarizing error on an atom each time it is moved. */
  moveError: number;
  timing: Timing;
  facts: string[];
}

/** Neutral atoms sit in a row; neighbours are close enough to interact, anything further is moved over and back. */
const ATOM_RYDBERG_NS = 400;
export const ATOM_MOVE_NS = 150_000;
const atomTwo = (a: number, b: number) => ATOM_RYDBERG_NS + (Math.abs(a - b) > 1 ? 2 * ATOM_MOVE_NS : 0);

export const PLATFORMS: Record<PlatformId, Platform> = {
  superconducting: {
    id: 'superconducting',
    name: 'Superconducting chip',
    qubit: 'qubit',
    examples: 'IBM, Google, Rigetti',
    noise: TYPICAL_NOISE,
    moveError: 0,
    timing: SUPERCONDUCTING_TIMING,
    facts: [
      'Qubits: aluminium circuits on silicon, cooled to 15 mK.',
      'Gates: microwave pulses, 36 ns and 280 ns.',
      'Wiring: neighbours only. The compiler adds SWAPs.',
    ],
  },
  ions: {
    id: 'ions',
    name: 'Trapped ions',
    qubit: 'ion',
    examples: 'Quantinuum, IonQ',
    noise: { p1: 0.0002, p2: 0.003, readout: 0.003 },
    moveError: 0,
    timing: { drive: 10_000, two: () => 200_000, readout: 150_000, swapPulses: 3 },
    facts: [
      'Qubits: single ytterbium ions held by electric fields in a vacuum.',
      'Gates: laser pulses. Two ions interact through their shared motion.',
      'Wiring: every ion can talk to every other. No SWAPs, but slow gates.',
    ],
  },
  atoms: {
    id: 'atoms',
    name: 'Neutral atoms',
    qubit: 'atom',
    examples: 'QuEra, Pasqal, Atom Computing',
    noise: { p1: 0.002, p2: 0.006, readout: 0.01 },
    moveError: 0.002,
    timing: { drive: 2_000, two: atomTwo, readout: 10_000_000, swapPulses: 3 },
    facts: [
      'Qubits: rubidium atoms held in beams of laser light (optical tweezers).',
      'Gates: lasers. Two atoms interact when excited to big Rydberg states.',
      'Wiring: atoms are moved next to each other. Reading them takes a camera.',
    ],
  },
};

export const PLATFORM_ORDER: PlatformId[] = ['superconducting', 'ions', 'atoms'];

/** n qubits, every pair connected. */
export function allToAll(n: number): Chip {
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) edges.push([a, b]);
  return { name: `${n} all-to-all`, qubits: n, edges, pads: Array.from({ length: n }, (_, i) => [i, 0] as [number, number]) };
}

/** Physical qubits the machine uses for n logical ones. */
export const machineQubits = (p: PlatformId, n: number) => (p === 'superconducting' ? T5.qubits : n);

/** Compile for the machine: route onto T5, or (all-to-all) keep the qubits where they are. */
export function compileFor(p: PlatformId, n: number, ops: readonly Op[]): Routed {
  if (p === 'superconducting') return route(T5, n, ops);
  const r = route(allToAll(n), n, ops);
  // all-to-all: no SWAPs ever; keep the natural layout so ion i (or atom i) is qubit i
  return r;
}

const qubitsOf = (op: Op): number[] =>
  op.kind === 'gate' ? [...(op.controls ?? []), op.target] : op.kind === 'swap' || op.kind === 'iswap' ? [op.a, op.b] : [op.qubit];

/** Two-qubit gates whose atoms are not neighbours in the row: each needs a move over and back. */
export function atomMoves(routed: Routed): number {
  return routed.ops.filter((op) => {
    const qs = qubitsOf(op);
    return qs.length === 2 && op.kind !== 'measure' && Math.abs(qs[0] - qs[1]) > 1;
  }).length;
}

export function platformSchedule(p: PlatformId, routed: Routed, n: number): Schedule {
  return schedule(routed.ops, machineQubits(p, n), PLATFORMS[p].timing);
}

/** Shots on the machine's noise model (like runOnChip, plus the cost of moving atoms). */
export function runPlatform(p: PlatformId, routed: Routed, n: number, shots: number, rng: Rng): ChipRun {
  const plat = PLATFORMS[p];
  const m = machineQubits(p, n);
  const counts = new Uint32Array(1 << n);
  for (let s = 0; s < shots; s++) {
    const state = new QState(m);
    const bits: number[] = new Array(Math.max(n, m)).fill(0);
    for (const op of routed.ops) {
      const fresh: Op = op.kind === 'measure' || op.kind === 'reset' ? { ...op, outcome: undefined } : op;
      applyOp(state, fresh, bits, rng);
      if (op.kind === 'measure' && rng() < plat.noise.readout) bits[op.bit ?? op.qubit] ^= 1;
      if (op.kind === 'measure' || op.kind === 'reset') continue;
      const qs = qubitsOf(op);
      if (qs.length === 1) depolarize(state, qs[0], plat.noise.p1, rng);
      else {
        for (let k = 0; k < (op.kind === 'swap' && !op.controls?.length ? 3 : 1); k++) for (const q of qs) depolarize(state, q, plat.noise.p2, rng);
        // the moved atom (the target) pays for the trip over and back
        if (plat.moveError && Math.abs(qs[0] - qs[1]) > 1) for (let k = 0; k < 2; k++) depolarize(state, qs[1], plat.moveError, rng);
      }
    }
    let outcome = 0;
    for (let i = 0; i < n; i++) {
      let b = measureQubit(state, routed.final[i], rng);
      if (rng() < plat.noise.readout) b = (b ^ 1) as 0 | 1;
      if (b) outcome |= 1 << i;
    }
    counts[outcome]++;
  }
  return { counts, shots };
}

export interface PlatformResult {
  id: PlatformId;
  name: string;
  counts: Uint32Array;
  /** 1 - total variation distance from the ideal distribution. */
  agreement: number;
  /** Wall-clock time of one shot, microseconds. */
  micros: number;
  twoQubit: number;
  /** What the machine's wiring cost: SWAPs, atom moves, or nothing. */
  overhead: string;
}

/** Run the same circuit on all three machines. */
export function comparePlatforms(n: number, ops: readonly Op[], ideal: ArrayLike<number>, shots: number, rng: Rng): PlatformResult[] {
  return PLATFORM_ORDER.map((id) => {
    const routed = compileFor(id, n, ops);
    const run = runPlatform(id, routed, n, shots, rng);
    const moves = id === 'atoms' ? atomMoves(routed) : 0;
    return {
      id,
      name: PLATFORMS[id].name,
      counts: run.counts,
      agreement: agreement(run.counts, ideal),
      // every shot ends by reading all the qubits
      micros: (platformSchedule(id, routed, n).duration + PLATFORMS[id].timing.readout) / 1000,
      twoQubit: routed.twoQubitAfter,
      overhead: id === 'superconducting' ? (routed.swaps ? `${routed.swaps} SWAP${routed.swaps === 1 ? '' : 's'} added` : 'no SWAPs needed') : id === 'ions' ? 'all-to-all: no SWAPs' : moves ? `${moves} atom move${moves === 1 ? '' : 's'}` : 'neighbours only: no moves',
    };
  });
}

/** Human time: 280 ns, 12.4 us, 3.2 ms. */
export function formatTime(micros: number): string {
  if (micros < 1) return `${Math.round(micros * 1000)} ns`;
  if (micros < 1000) return `${micros < 10 ? micros.toFixed(1) : Math.round(micros)} us`;
  return `${(micros / 1000).toFixed(micros < 10_000 ? 1 : 0)} ms`;
}
