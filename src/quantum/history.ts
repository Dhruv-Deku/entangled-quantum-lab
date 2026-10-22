import { applyOp, type Op } from './circuit';
import type { Rng } from './measure';
import { QState } from './state';

/**
 * Operation timeline for undo, redo and scrubbing the timeline ribbon.
 * Measurements store their outcome, so replaying any prefix is deterministic.
 */
export class History {
  readonly n: number;
  private readonly initial: QState;
  private all: Op[] = [];
  private cursorIndex = 0;
  private current: QState;
  private currentBits: number[];

  constructor(n: number, initial?: QState) {
    this.n = n;
    this.initial = initial ? initial.clone() : new QState(n);
    this.current = this.initial.clone();
    this.currentBits = new Array(n).fill(0);
  }

  /** Ops currently applied (up to the cursor). */
  get ops(): readonly Op[] {
    return this.all.slice(0, this.cursorIndex);
  }

  get length(): number {
    return this.all.length;
  }

  get cursor(): number {
    return this.cursorIndex;
  }

  get state(): QState {
    return this.current;
  }

  get bits(): readonly number[] {
    return this.currentBits;
  }

  /** Apply a new op at the cursor; anything after the cursor is discarded. */
  push(op: Op, rng: Rng): Op {
    this.all.length = this.cursorIndex;
    const done = applyOp(this.current, op, this.currentBits, rng);
    this.all.push(done);
    this.cursorIndex++;
    return done;
  }

  canUndo(): boolean {
    return this.cursorIndex > 0;
  }

  canRedo(): boolean {
    return this.cursorIndex < this.all.length;
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    this.seek(this.cursorIndex - 1);
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    this.seek(this.cursorIndex + 1);
    return true;
  }

  /** Move the cursor to step k (0 = before any op) by replaying from the start. */
  seek(k: number): void {
    const target = Math.max(0, Math.min(this.all.length, Math.round(k)));
    const s = this.initial.clone();
    const bits: number[] = new Array(this.n).fill(0);
    const noRandom: Rng = () => {
      throw new Error('replay needs no randomness');
    };
    for (let i = 0; i < target; i++) applyOp(s, this.all[i], bits, noRandom);
    this.current = s;
    this.currentBits = bits;
    this.cursorIndex = target;
  }

  /** State after the first k ops, without moving the cursor. */
  stateAt(k: number): QState {
    const saved = { s: this.current, b: this.currentBits, c: this.cursorIndex };
    this.seek(k);
    const out = this.current;
    this.current = saved.s;
    this.currentBits = saved.b;
    this.cursorIndex = saved.c;
    return out;
  }

  clear(): void {
    this.all = [];
    this.seek(0);
  }

  toJSON(): { n: number; ops: Op[]; cursor: number } {
    return { n: this.n, ops: this.all.slice(), cursor: this.cursorIndex };
  }

  static fromJSON(data: { n: number; ops: Op[]; cursor: number }): History {
    const h = new History(data.n);
    h.all = data.ops.slice();
    h.seek(data.cursor);
    return h;
  }
}
