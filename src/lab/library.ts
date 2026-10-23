import type { Op } from '../quantum/circuit';
import { gateName } from '../quantum/matrix';

/**
 * My circuits and my gates: saved in the browser (localStorage), so they stay
 * on this device between sessions. A custom gate is a saved circuit that can be
 * dropped onto other qubits as one block; it is stored as the ops it expands to.
 */

export interface LibraryItem {
  id: string;
  kind: 'circuit' | 'gate';
  name: string;
  n: number;
  ops: Op[];
  savedAt: number;
}

const KEY = 'entangled.library.v1';
export const MAX_ITEMS = 40;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Basic shape check on stored data (it comes from this app, but storage can be edited or corrupted). */
function valid(x: unknown): x is LibraryItem {
  const i = x as LibraryItem;
  return !!i && typeof i.id === 'string' && (i.kind === 'circuit' || i.kind === 'gate') && typeof i.name === 'string' && Number.isInteger(i.n) && i.n >= 1 && i.n <= 5 && Array.isArray(i.ops);
}

/** A short descriptive name: the first few gates, e.g. "H, CX, CX". */
export function autoName(ops: readonly Op[]): string {
  const names = ops.filter((o) => o.kind !== 'measure').slice(0, 3).map((o) => gateName(o).replace('†', 'dg').replace('√', 'S').replace(/[^\x20-\x7E]/g, ''));
  const more = ops.length > 3 ? ' ...' : '';
  return names.length ? names.join(', ') + more : 'Empty';
}

/** Ops a gate block may contain: unitary only (no measurement, reset or classical condition). */
export const gateable = (ops: readonly Op[]) => ops.length > 0 && ops.every((o) => (o.kind === 'gate' && !o.condition) || o.kind === 'swap' || o.kind === 'iswap');

export class Library {
  items: LibraryItem[] = [];
  private listeners = new Set<() => void>();

  constructor(private store: Store | null = defaultStore()) {
    try {
      const raw = this.store?.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      this.items = Array.isArray(parsed) ? parsed.filter(valid) : [];
    } catch {
      this.items = [];
    }
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist(): void {
    try {
      this.store?.setItem(KEY, JSON.stringify(this.items));
    } catch {
      // storage full or blocked: the library still works for this session
    }
    for (const fn of this.listeners) fn();
  }

  get circuits(): LibraryItem[] {
    return this.items.filter((i) => i.kind === 'circuit');
  }

  get gates(): LibraryItem[] {
    return this.items.filter((i) => i.kind === 'gate');
  }

  /** Save a circuit or a gate; the newest comes first, the oldest drops off past MAX_ITEMS. */
  add(kind: LibraryItem['kind'], n: number, ops: readonly Op[], name?: string): LibraryItem {
    if (kind === 'gate' && !gateable(ops)) throw new Error('A gate can only hold gates: no measurements, resets or conditions.');
    const nextGate = this.gates.length + 1;
    const item: LibraryItem = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kind,
      name: name ?? (kind === 'gate' ? `G${nextGate}` : autoName(ops)),
      n,
      ops: JSON.parse(JSON.stringify(ops)),
      savedAt: Date.now(),
    };
    this.items = [item, ...this.items].slice(0, MAX_ITEMS);
    this.persist();
    return item;
  }

  rename(id: string, name: string): void {
    const it = this.items.find((i) => i.id === id);
    if (!it) return;
    it.name = name.replace(/[^\x20-\x7E]/g, '').slice(0, 24) || it.name;
    this.persist();
  }

  remove(id: string): void {
    this.items = this.items.filter((i) => i.id !== id);
    this.persist();
  }
}

/** A gate's ops moved onto other qubits: gate qubit k goes to qubits[k]. */
export function placeGate(gate: LibraryItem, qubits: readonly number[]): Op[] {
  const m = (q: number) => qubits[q];
  return gate.ops.map((op): Op => {
    if (op.kind === 'gate') return { ...op, target: m(op.target), ...(op.controls?.length ? { controls: op.controls.map(m) } : {}) };
    if (op.kind === 'swap') return { ...op, a: m(op.a), b: m(op.b), ...(op.controls?.length ? { controls: op.controls.map(m) } : {}) };
    if (op.kind === 'iswap') return { ...op, a: m(op.a), b: m(op.b) };
    return op;
  });
}
export const library = new Library();
