import { run, type Op } from '../quantum/circuit';
import type { Rng } from '../quantum/measure';
import type { QState } from '../quantum/state';

/**
 * The Quantum Hunt: entangled pairs escape into your room. Each pair is a real
 * two-qubit state; catching one qubit measures it, and its partner, metres
 * away, collapses at that moment to the matching value (the opposite value,
 * for an anti-correlated pair). Pure game logic: the 3D side places the qubits
 * on real surfaces and animates the collapse.
 */

export type PairKind = 'same' | 'opposite';

/** The chapter that runs the hunt. */
export const HUNT_TITLE = 'Quantum Hunt';

/** Shared between the hunt in the room and the chapter card (set by the 3D side). */
export const huntStatus = {
  active: false,
  caught: 0,
  done: false,
  /** Show me: catch the next qubit. */
  catchNext: null as null | (() => boolean),
};

export interface HuntQubit {
  pair: number;
  /** 0 or 1 within the pair. */
  side: 0 | 1;
  caught: boolean;
  /** Measured value once its pair has collapsed (null while still in superposition). */
  value: 0 | 1 | null;
}

export interface HuntPair {
  kind: PairKind;
  state: QState;
  collapsed: boolean;
}

export interface CatchResult {
  qubit: number;
  value: 0 | 1;
  /** The partner, and whether this catch was the one that collapsed the pair. */
  partner: number;
  partnerValue: 0 | 1;
  collapsedNow: boolean;
  /** Both qubits of the pair are now caught. */
  pairDone: boolean;
}

/** |00> + |11> (they agree) or |01> + |10> (they disagree), as circuits. */
const PAIR_OPS: Record<PairKind, Op[]> = {
  same: [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 1, controls: [0] }],
  opposite: [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 1, controls: [0] }, { kind: 'gate', gate: 'x', target: 1 }],
};

export class HuntGame {
  readonly pairs: HuntPair[];
  readonly qubits: HuntQubit[];

  constructor(kinds: PairKind[] = ['same', 'same', 'opposite']) {
    this.pairs = kinds.map((kind) => ({ kind, state: run(2, PAIR_OPS[kind], () => 0.5).state, collapsed: false }));
    this.qubits = kinds.flatMap((_, p) => [0, 1].map((side) => ({ pair: p, side: side as 0 | 1, caught: false, value: null })));
  }

  partnerOf(i: number): number {
    return i % 2 === 0 ? i + 1 : i - 1;
  }

  /** Catch a qubit: measure it if its pair is still in superposition (the partner collapses too). */
  catch(i: number, rng: Rng): CatchResult | null {
    const q = this.qubits[i];
    if (!q || q.caught) return null;
    const pair = this.pairs[q.pair];
    const partner = this.partnerOf(i);
    let collapsedNow = false;
    if (!pair.collapsed) {
      // measure this side of the real two-qubit state; the other side is then fixed
      const measured = run(2, [{ kind: 'measure', qubit: q.side }], rng, pair.state);
      const v = measured.bits[q.side] as 0 | 1;
      pair.state = measured.state;
      const p1 = pair.state.prob1(1 - q.side);
      q.value = v;
      this.qubits[partner].value = p1 > 0.5 ? 1 : 0;
      pair.collapsed = true;
      collapsedNow = true;
    }
    q.caught = true;
    return { qubit: i, value: q.value!, partner, partnerValue: this.qubits[partner].value!, collapsedNow, pairDone: this.qubits[partner].caught };
  }

  get caughtPairs(): number {
    return this.pairs.filter((_, p) => this.qubits[2 * p].caught && this.qubits[2 * p + 1].caught).length;
  }

  get done(): boolean {
    return this.caughtPairs === this.pairs.length;
  }

  /** The next qubit to go for: the partner of a half-caught pair first, otherwise any free one (nearest is up to the caller). */
  nextTarget(): number | null {
    const half = this.qubits.findIndex((q, i) => !q.caught && this.qubits[this.partnerOf(i)].caught);
    if (half >= 0) return half;
    const free = this.qubits.findIndex((q) => !q.caught);
    return free >= 0 ? free : null;
  }
}
