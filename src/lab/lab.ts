import { applyOp, type Op } from '../quantum/circuit';
import { fractional, gateMatrix, type GateName, type Mat2 } from '../quantum/gates';
import { History } from '../quantum/history';
import { sample, type Rng } from '../quantum/measure';
import { QState } from '../quantum/state';

export type LabEvent =
  /** `live`: the change was already shown as it happened (a wrist turn), so do not replay it. */
  | { type: 'op'; op: Op; before: QState; live?: boolean }
  | { type: 'shots'; counts: Uint32Array; shots: number }
  | { type: 'reset' }
  | { type: 'seek' }
  | { type: 'select'; qubit: number }
  /** Something outside the player's control hit a qubit (The Storm). */
  | { type: 'hit'; qubit: number }
  | { type: 'rejected'; reason: string };

type Listener = (e: LabEvent) => void;

export const MAX_ORBS = 5;

/**
 * The player's quantum lab: a register of qubits with full history, plus a live
 * wrist rotation that is previewed every frame and committed as one gate.
 */
export class Lab {
  history: History;
  selected = 0;
  /** When set (by a chapter step), touching this qubit to another makes it the CNOT control. */
  preferredControl: number | null = null;
  private listeners = new Set<Listener>();
  private rng: Rng;
  /** Uncommitted wrist rotation on one qubit (radians about Y). */
  private pending: { qubit: number; angle: number } | null = null;
  private display: QState;
  private displayDirty = true;

  constructor(n: number, rng: Rng = Math.random) {
    this.rng = rng;
    this.history = new History(n);
    this.display = this.history.state.clone();
  }

  get n(): number {
    return this.history.n;
  }

  /** Committed state plus any live wrist rotation. Visuals read this. */
  get state(): QState {
    if (this.displayDirty) {
      this.display = this.history.state.clone();
      if (this.pending) this.display.apply1(this.pending.qubit, gateMatrix('ry', [this.pending.angle]));
      this.displayDirty = false;
    }
    return this.display;
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: LabEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /** Start over with n qubits, all |0>. */
  reset(n = this.n): void {
    this.history = new History(n);
    this.pending = null;
    this.selected = Math.min(this.selected, n - 1);
    this.displayDirty = true;
    this.emit({ type: 'reset' });
  }

  select(q: number): void {
    if (q < 0 || q >= this.n) return;
    this.selected = q;
    this.emit({ type: 'select', qubit: q });
  }

  apply(op: Op): Op | null {
    this.commitRotation();
    const refused = this.guard?.(op);
    if (refused) {
      this.emit({ type: 'rejected', reason: refused });
      return null;
    }
    const before = this.history.state.clone();
    try {
      const done = this.history.push(op, this.rng);
      this.displayDirty = true;
      this.emit({ type: 'op', op: done, before });
      return done;
    } catch (err) {
      this.emit({ type: 'rejected', reason: (err as Error).message });
      return null;
    }
  }

  gate(gate: GateName, target = this.selected, params?: number[], controls?: number[]): Op | null {
    return this.apply({ kind: 'gate', gate, target, params, controls });
  }

  measure(q = this.selected): 0 | 1 | null {
    const op = this.apply({ kind: 'measure', qubit: q });
    return op && op.kind === 'measure' ? (op.outcome ?? null) : null;
  }

  entangle(control: number, target: number): Op | null {
    if (control === target) return null;
    return this.gate('x', target, undefined, [control]);
  }

  /**
   * The button and key version of touching two orbs: the chapter's control
   * qubit acts on the selected one, otherwise the selected qubit acts on the next.
   */
  entangleSelected(): Op | null {
    if (this.n < 2) return null;
    const c = this.preferredControl;
    if (c !== null && c < this.n && c !== this.selected) return this.entangle(c, this.selected);
    const control = c !== null && c < this.n ? c : this.selected;
    return this.entangle(control, (control + 1) % this.n);
  }

  /** A random number from the lab's generator (seeded in tests). */
  random(): number {
    return this.rng();
  }

  /** Apply a gate the player did not choose (noise), and tell the visuals. */
  strike(q: number): Op | null {
    const op = this.gate('x', q);
    if (op) this.emit({ type: 'hit', qubit: q });
    return op;
  }

  /** When set (a shared lab), ops it gives a reason for are refused: someone else's qubit. */
  guard: ((op: Op) => string | null) | null = null;
  private blockedTurn: number | null = null;

  /** When set (the noise lab), shots come from here instead of the ideal state. */
  sampler: ((count: number) => Uint32Array) | null = null;

  /** 100 shots of the current state, without collapsing it. */
  shots(count = 100): Uint32Array {
    this.commitRotation();
    const counts = this.sampler ? this.sampler(count) : sample(this.history.state, count, this.rng);
    this.emit({ type: 'shots', counts, shots: count });
    return counts;
  }

  /** Put shots that came from outside the register (copies of a sealed qubit) on the rain. */
  showShots(counts: Uint32Array): void {
    this.emit({ type: 'shots', counts, shots: counts.reduce((a, b) => a + b, 0) });
  }

  /** Add wrist rotation to qubit q; previewed live until committed. */
  rotate(q: number, delta: number): void {
    if (this.pending && this.pending.qubit !== q) this.commitRotation();
    if (!this.pending && this.guard) {
      const refused = this.guard({ kind: 'gate', gate: 'ry', target: q, params: [delta] });
      if (refused) {
        // say it once per turn, not every frame
        if (this.blockedTurn !== q) this.emit({ type: 'rejected', reason: refused });
        this.blockedTurn = q;
        return;
      }
    }
    this.blockedTurn = null;
    this.pending ??= { qubit: q, angle: 0 };
    this.pending.angle += delta;
    this.displayDirty = true;
  }

  /** Turn the live rotation into one history step (a single Ry gate). */
  commitRotation(): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.displayDirty = true;
    if (Math.abs(p.angle) < 1e-3) return;
    const before = this.history.state.clone();
    const done = this.history.push({ kind: 'gate', gate: 'ry', target: p.qubit, params: [p.angle] }, this.rng);
    this.emit({ type: 'op', op: done, before, live: true });
  }

  get rotating(): boolean {
    return this.pending !== null;
  }

  undo(): boolean {
    this.commitRotation();
    const ok = this.history.undo();
    if (ok) this.afterSeek();
    return ok;
  }

  redo(): boolean {
    const ok = this.history.redo();
    if (ok) this.afterSeek();
    return ok;
  }

  seek(k: number): void {
    this.commitRotation();
    this.history.seek(k);
    this.afterSeek();
  }

  private afterSeek(): void {
    this.displayDirty = true;
    this.emit({ type: 'seek' });
  }

  /** Apply ops without recording them one by one in the UI (used by chapter setup). */
  load(n: number, ops: Op[]): void {
    this.reset(n);
    for (const op of ops) this.history.push(op, this.rng);
    this.displayDirty = true;
    this.emit({ type: 'seek' });
  }

  /** Committed history only; an unreleased wrist turn is not saved (and not committed by saving). */
  toJSON() {
    return { history: this.history.toJSON(), selected: this.selected };
  }

  restore(data: ReturnType<Lab['toJSON']>): void {
    this.history = History.fromJSON(data.history);
    this.selected = Math.min(data.selected ?? 0, this.n - 1);
    this.pending = null;
    this.displayDirty = true;
    this.emit({ type: 'seek' });
  }
}

/** Fractional replay of a gate op on a copy of `before`, for animation (t in 0..1). */
export function partialState(before: QState, op: Op, t: number, out?: QState): QState | null {
  const s = out ?? before.clone();
  if (out) s.copyFrom(before);
  if (op.kind !== 'gate' || op.condition) {
    if (t < 1) return s;
    applyOp(s, op, [], () => 0.5);
    return s;
  }
  // gate along its own rotation path; the controlled part uses the same fractional power
  const u = gateMatrix(op.gate, op.params);
  s.apply1(op.target, fractionalCached(u, t), op.controls);
  return s;
}

function fractionalCached(u: Mat2, t: number): Mat2 {
  return t >= 1 ? u : fractional(u, Math.max(0, t));
}
