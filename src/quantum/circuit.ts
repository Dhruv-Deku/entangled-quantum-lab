import { gateMatrix, type GateName } from './gates';
import { collapse, measureQubit, type Rng } from './measure';
import { QState } from './state';

/** One step of a circuit. Classical bits are written by `measure` and read by `condition`. */
export type Op =
  | {
      kind: 'gate';
      gate: GateName;
      target: number;
      controls?: number[];
      params?: number[];
      /** Apply only if classical bit `bit` equals `value` (mid-circuit feed-forward). */
      condition?: { bit: number; value: 0 | 1 };
    }
  | { kind: 'swap'; a: number; b: number; controls?: number[] }
  | { kind: 'iswap'; a: number; b: number }
  /** `outcome` is filled in when the measurement happens, so replays are exact. */
  | { kind: 'measure'; qubit: number; bit?: number; outcome?: 0 | 1 }
  /** Reset to |0> (a measurement underneath; its outcome is recorded like `measure`). */
  | { kind: 'reset'; qubit: number; outcome?: 0 | 1 };

/** Apply one op in place. Returns the op as executed (with any measurement outcome recorded). */
export function applyOp(s: QState, op: Op, bits: number[], rng: Rng): Op {
  switch (op.kind) {
    case 'gate': {
      if (op.condition && (bits[op.condition.bit] ?? 0) !== op.condition.value) return op;
      s.apply1(op.target, gateMatrix(op.gate, op.params), op.controls);
      return op;
    }
    case 'swap':
      s.swap(op.a, op.b, op.controls);
      return op;
    case 'iswap':
      s.iswap(op.a, op.b);
      return op;
    case 'measure': {
      let outcome: 0 | 1;
      if (op.outcome === undefined) outcome = measureQubit(s, op.qubit, rng);
      else {
        outcome = op.outcome;
        collapse(s, op.qubit, outcome);
      }
      bits[op.bit ?? op.qubit] = outcome;
      return { ...op, outcome };
    }
    case 'reset': {
      // measure, then flip to |0> if needed
      let outcome: 0 | 1;
      if (op.outcome === undefined) outcome = measureQubit(s, op.qubit, rng);
      else {
        outcome = op.outcome;
        collapse(s, op.qubit, outcome);
      }
      if (outcome === 1) s.apply1(op.qubit, gateMatrix('x'));
      return { ...op, outcome };
    }
  }
}

export interface RunResult {
  state: QState;
  bits: number[];
  /** The ops as executed, with measurement outcomes filled in. */
  ops: Op[];
}

export function run(n: number, ops: readonly Op[], rng: Rng, initial?: QState): RunResult {
  const state = initial ? initial.clone() : new QState(n);
  const bits: number[] = new Array(n).fill(0);
  const done = ops.map((op) => applyOp(state, op, bits, rng));
  return { state, bits, ops: done };
}
