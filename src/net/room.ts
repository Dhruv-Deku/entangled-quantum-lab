import type { Op } from '../quantum/circuit';
import { qubitsOf } from '../quantum/matrix';

/**
 * Shared rooms. Everyone with the same room code is connected through a small
 * relay (server/relay-core.mjs). Two kinds, told apart by the code's first letter:
 *
 *  - L... a shared lab: one circuit for everyone. Each change sends the whole
 *    history (a few hundred bytes), stamped with a version; the newest wins,
 *    ties going to the higher peer id, so every copy ends up the same. A
 *    player can claim qubits: then only they (or a teacher) can turn them, so
 *    two people can each hold half of a Bell pair and measure their own half.
 *  - C... a classroom: everyone works on their own, the teacher assigns course
 *    modules and sees each student's progress as it happens.
 */

export type Role = 'teacher' | 'student';
export type RoomKind = 'lab' | 'class';

export interface HistoryJSON {
  n: number;
  ops: Op[];
  cursor: number;
}

export interface Progress {
  mode: string;
  /** course module being worked on, and the step within it */
  module: number;
  step: number;
  steps: number;
  /** course modules finished */
  done: number[];
}

export interface Peer {
  id: string;
  name: string;
  role: Role;
  owns: number[];
  selected: number;
}

export type Msg =
  | { t: 'join'; room: string; from: string }
  | { t: 'welcome'; room: string; peers: string[]; last: string | null; lastClass: string | null }
  | { t: 'full'; room: string }
  | { t: 'left'; from: string }
  | ({ t: 'hello'; from: string; reply?: boolean; to?: string } & Omit<Peer, 'id'>)
  | { t: 'sync'; from: string; v: number; history: HistoryJSON }
  | { t: 'shots'; from: string; counts: number[] }
  | { t: 'class'; from: string; assigned: number[] }
  | { t: 'progress'; from: string; report: Progress; to?: string };

export interface Transport {
  send(msg: Msg): void;
  /** Messages from the relay; `opened` runs on every (re)connection. */
  listen(onMessage: (m: Msg) => void, opened: () => void): void;
  close(): void;
}

export interface RoomHost {
  snapshot(): HistoryJSON;
  restore(h: HistoryJSON): void;
  showShots(counts: Uint32Array): void;
  /** The teacher assigned these course modules. */
  assigned(modules: number[]): void;
  /** Presence, ownership, assignments or progress changed: redraw. */
  changed(): void;
  notify(text: string): void;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(kind: RoomKind, rnd: () => number = Math.random): string {
  let s = kind === 'lab' ? 'L' : 'C';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
  return s;
}

export const kindOf = (code: string): RoomKind | null => (/^L[A-Z0-9]{4}$/.test(code) ? 'lab' : /^C[A-Z0-9]{4}$/.test(code) ? 'class' : null);

/** Tidy what someone typed or said into a room code (null if it is not one). */
export function parseCode(text: string): string | null {
  const c = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return kindOf(c) ? c : null;
}

export class SharedRoom {
  readonly peers = new Map<string, Peer>();
  readonly progress = new Map<string, Progress>();
  readonly kind: RoomKind;
  assigned: number[] = [];
  /** Version of the circuit this copy holds (lab rooms). */
  version: number;
  private applying = false;
  private closed = false;

  constructor(
    readonly code: string,
    readonly me: Peer,
    private readonly tx: Transport,
    private readonly host: RoomHost,
    /** The person who opened the room starts the circuit; people joining take theirs. */
    readonly creator: boolean,
  ) {
    this.kind = kindOf(code) ?? 'lab';
    this.version = creator ? 1 : 0;
    tx.listen(
      (m) => this.receive(m),
      () => {
        tx.send({ t: 'join', room: code, from: me.id });
        this.hello(false);
        if (this.kind === 'lab' && this.version > 0) this.sendSync();
        if (this.kind === 'class' && me.role === 'teacher' && this.assigned.length) this.tx.send({ t: 'class', from: me.id, assigned: this.assigned });
      },
    );
  }

  private hello(reply: boolean, to?: string): void {
    const { name, role, owns, selected } = this.me;
    this.tx.send({ t: 'hello', from: this.me.id, name, role, owns: [...owns], selected, reply, ...(to ? { to } : {}) });
  }

  private sendSync(): void {
    this.tx.send({ t: 'sync', from: this.me.id, v: this.version, history: this.host.snapshot() });
  }

  /** The local circuit changed (lab rooms): send it, unless the change came from the room. */
  localChange(): void {
    if (this.applying || this.closed || this.kind !== 'lab') return;
    this.version++;
    this.sendSync();
  }

  /** Shots taken here rain for everyone (lab rooms). */
  localShots(counts: Uint32Array): void {
    if (this.applying || this.closed || this.kind !== 'lab') return;
    this.tx.send({ t: 'shots', from: this.me.id, counts: [...counts] });
  }

  /** Classroom: the teacher assigns modules (sent to every student, and kept for late joiners). */
  assign(modules: number[]): void {
    if (this.kind !== 'class' || this.me.role !== 'teacher') return;
    this.assigned = [...new Set(modules)].sort((a, b) => a - b);
    this.tx.send({ t: 'class', from: this.me.id, assigned: this.assigned });
    this.host.changed();
  }

  /** Classroom: a student reports where they are. */
  report(p: Progress): void {
    if (this.kind !== 'class' || this.me.role !== 'student' || this.closed) return;
    this.tx.send({ t: 'progress', from: this.me.id, report: p });
  }

  /** Where I am, as the selected qubit changes (shown to the others). */
  select(q: number): void {
    if (q === this.me.selected) return;
    this.me.selected = q;
    this.hello(true);
  }

  ownerOf(q: number): Peer | null {
    if (this.me.owns.includes(q)) return this.me;
    for (const p of this.peers.values()) if (p.owns.includes(q)) return p;
    return null;
  }

  /** Claim a qubit, or let it go if it is already mine. Returns false if someone else holds it. */
  claim(q: number): boolean {
    const owner = this.ownerOf(q);
    if (owner && owner !== this.me) {
      this.host.notify(`q${q} belongs to ${owner.name}.`);
      return false;
    }
    this.me.owns = owner ? this.me.owns.filter((x) => x !== q) : [...this.me.owns, q].sort((a, b) => a - b);
    this.hello(true);
    this.host.changed();
    return true;
  }

  /**
   * May I do this op? A teacher may do anything. Anyone may act on free
   * qubits and their own; a one-qubit op on someone else's qubit is refused,
   * while a two-qubit gate needs at least one of its qubits to be free or mine
   * (that is how the people holding a pair entangle it). Returns the reason, or null.
   */
  guard(op: Op): string | null {
    if (this.kind !== 'lab' || this.me.role === 'teacher' || this.applying) return null;
    const qs = qubitsOf(op);
    const others = qs.map((q) => ({ q, owner: this.ownerOf(q) })).filter((x) => x.owner && x.owner !== this.me);
    if (!others.length) return null;
    if (qs.length === 1 || others.length === qs.length) return `q${others[0].q} belongs to ${others[0].owner!.name}: ask them to turn it.`;
    return null;
  }

  receive(m: Msg): void {
    if (this.closed) return;
    switch (m.t) {
      case 'welcome':
        if (m.last && this.kind === 'lab') this.receive(JSON.parse(m.last) as Msg);
        if (m.lastClass && this.kind === 'class') this.receive(JSON.parse(m.lastClass) as Msg);
        return;
      case 'full':
        this.host.notify(`Room ${this.code} is full.`);
        return;
      case 'hello': {
        const known = this.peers.has(m.from);
        this.peers.set(m.from, { id: m.from, name: m.name.slice(0, 16) || 'Guest', role: m.role === 'teacher' ? 'teacher' : 'student', owns: m.owns ?? [], selected: m.selected ?? 0 });
        // two people cannot hold one qubit: if both claimed it at once, the higher id keeps it
        const mine = this.me.owns.length;
        this.me.owns = this.me.owns.filter((q) => !(m.owns ?? []).includes(q) || this.me.id > m.from);
        if (this.me.owns.length !== mine) this.hello(true);
        if (!m.reply) {
          // a newcomer: introduce myself to them, and catch them up
          this.hello(true, m.from);
          if (this.kind === 'lab' && this.version > 0) this.sendSync();
          if (this.kind === 'class' && this.me.role === 'teacher') this.tx.send({ t: 'class', from: this.me.id, assigned: this.assigned });
        }
        if (!known) this.host.notify(`${this.peers.get(m.from)!.name} joined${m.role === 'teacher' ? ' as the teacher' : ''}.`);
        this.host.changed();
        return;
      }
      case 'left': {
        const p = this.peers.get(m.from);
        this.peers.delete(m.from);
        if (p) this.host.notify(`${p.name} left.`);
        this.host.changed();
        return;
      }
      case 'sync':
        if (this.kind !== 'lab') return;
        if (m.v > this.version || (m.v === this.version && m.from > this.me.id)) {
          this.version = m.v;
          this.applying = true;
          try {
            this.host.restore(m.history);
          } finally {
            this.applying = false;
          }
        }
        return;
      case 'shots':
        if (this.kind !== 'lab') return;
        this.applying = true;
        try {
          this.host.showShots(Uint32Array.from(m.counts));
        } finally {
          this.applying = false;
        }
        return;
      case 'class':
        if (this.kind !== 'class') return;
        this.assigned = [...m.assigned];
        if (this.me.role === 'student') this.host.assigned(this.assigned);
        this.host.changed();
        return;
      case 'progress':
        if (this.kind !== 'class') return;
        this.progress.set(m.from, m.report);
        this.host.changed();
        return;
    }
  }

  close(): void {
    this.closed = true;
    this.tx.close();
  }
}

/** A student's progress through the teacher's assignment: 0..1, and whether it is all done. */
export function assignmentProgress(assigned: readonly number[], p: Progress | undefined, stepsOf: (module: number) => number): { fraction: number; complete: boolean } {
  if (!assigned.length || !p) return { fraction: 0, complete: false };
  let got = 0;
  for (const m of assigned) {
    if (p.done.includes(m)) got += 1;
    else if (p.mode === 'course' && p.module === m && p.steps > 0) got += Math.min(p.step, stepsOf(m)) / stepsOf(m);
  }
  const fraction = got / assigned.length;
  return { fraction, complete: assigned.every((m) => p.done.includes(m)) };
}
