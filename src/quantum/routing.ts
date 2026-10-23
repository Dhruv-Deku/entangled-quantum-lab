import type { Op } from './circuit';

/**
 * Mapping a circuit onto a chip. Real quantum chips only couple neighbouring
 * qubits, so a two-qubit gate between qubits that are not wired together needs
 * SWAPs first. This is what a compiler's layout and routing passes do:
 *
 * 1. decompose: gates with two or more controls become one- and two-qubit
 *    gates (the textbook Toffoli circuit, with Fredkin and CCZ built from it);
 * 2. layout: try every placement of the logical qubits on the chip;
 * 3. route: walk the circuit, and when a two-qubit gate's qubits are not
 *    neighbours, SWAP one of them along the shortest path until they are.
 *
 * A SWAP in your own circuit costs nothing on the chip: the compiler just
 * relabels which physical qubit holds which logical one.
 */

export interface Chip {
  name: string;
  qubits: number;
  /** Coupled pairs (undirected). */
  edges: readonly (readonly [number, number])[];
  /** Positions on the die, in die units (for drawing). */
  pads: readonly (readonly [number, number])[];
}

/** Five qubits in a T, the layout of many early cloud quantum computers. */
export const T5: Chip = {
  name: 'T5',
  qubits: 5,
  edges: [[0, 1], [1, 2], [1, 3], [3, 4]],
  pads: [[-1, 1], [0, 1], [1, 1], [0, 0], [0, -1]],
};

export interface Routed {
  /** Ops on the chip's physical qubits. Measurements keep their logical classical bit. */
  ops: Op[];
  /** Physical qubit holding logical qubit i, at the start and at the end. */
  initial: number[];
  final: number[];
  /** SWAPs the router added. */
  swaps: number;
  /** Two-qubit gates (each added SWAP counts as three CNOTs), before and after. */
  twoQubitBefore: number;
  twoQubitAfter: number;
}

export class RoutingError extends Error {}

const g = (gate: 'h' | 't' | 'tdg', target: number): Op => ({ kind: 'gate', gate, target });
const cx = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });

/** The standard exact Toffoli: six CNOTs, Hadamards and T gates (Nielsen and Chuang, fig. 4.9). */
function toffoli(a: number, b: number, t: number): Op[] {
  return [
    g('h', t), cx(b, t), g('tdg', t), cx(a, t), g('t', t), cx(b, t), g('tdg', t), cx(a, t),
    g('t', b), g('t', t), g('h', t), cx(a, b), g('t', a), g('tdg', b), cx(a, b),
  ];
}

/** Split every op into ones that touch at most two qubits. Classically controlled multi-qubit gates are refused. */
export function decompose(ops: readonly Op[]): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    if (op.kind === 'gate' && (op.controls?.length ?? 0) >= 2) {
      const c = op.controls!;
      if (op.condition || c.length > 2) throw new RoutingError('Gates with three or more controls (or a classical condition) cannot be routed yet.');
      if (op.gate === 'x') out.push(...toffoli(c[0], c[1], op.target));
      else if (op.gate === 'z') out.push(g('h', op.target), ...toffoli(c[0], c[1], op.target), g('h', op.target));
      else throw new RoutingError(`A doubly controlled ${op.gate.toUpperCase()} cannot be routed yet; build it from a Toffoli.`);
    } else if (op.kind === 'swap' && op.controls?.length) {
      if (op.controls.length > 1) throw new RoutingError('A SWAP with two or more controls cannot be routed yet.');
      // Fredkin = CX(b, a) Toffoli(c, a, b) CX(b, a)
      out.push(cx(op.b, op.a), ...toffoli(op.controls[0], op.a, op.b), cx(op.b, op.a));
    } else {
      out.push(op);
    }
  }
  return out;
}

function qubitsOf(op: Op): number[] {
  switch (op.kind) {
    case 'gate':
      return [...(op.controls ?? []), op.target];
    case 'swap':
    case 'iswap':
      return [op.a, op.b];
    case 'measure':
    case 'reset':
      return [op.qubit];
  }
}

const twoQubit = (ops: readonly Op[]) => ops.filter((op) => qubitsOf(op).length === 2 && !(op.kind === 'swap' && !op.controls?.length)).length;

/** All-pairs shortest paths on the chip (next hop from a toward b). */
function nextHops(chip: Chip): number[][] {
  const n = chip.qubits;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of chip.edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const next = Array.from({ length: n }, () => new Array<number>(n).fill(-1));
  for (let s = 0; s < n; s++) {
    // BFS from s; the first hop on the way to each node
    const first = new Array<number>(n).fill(-1);
    const seen = new Array<boolean>(n).fill(false);
    seen[s] = true;
    const queue: number[] = [];
    for (const v of adj[s]) {
      seen[v] = true;
      first[v] = v;
      queue.push(v);
    }
    while (queue.length) {
      const u = queue.shift()!;
      for (const v of adj[u]) {
        if (seen[v]) continue;
        seen[v] = true;
        first[v] = first[u];
        queue.push(v);
      }
    }
    next[s] = first;
  }
  return next;
}

export const adjacent = (chip: Chip, a: number, b: number) => chip.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

function mapOp(op: Op, L: readonly number[]): Op {
  switch (op.kind) {
    case 'gate':
      return { ...op, target: L[op.target], ...(op.controls?.length ? { controls: op.controls.map((c) => L[c]) } : {}) };
    case 'swap':
    case 'iswap':
      return { ...op, a: L[op.a], b: L[op.b] };
    case 'measure':
      return { ...op, qubit: L[op.qubit], bit: op.bit ?? op.qubit };
    case 'reset':
      return { ...op, qubit: L[op.qubit] };
  }
}

/** Route already-decomposed ops from one starting layout. */
function routeFrom(chip: Chip, n: number, ops: readonly Op[], start: number[], next: number[][]): { ops: Op[]; final: number[]; swaps: number } {
  const L = start.slice();
  const P = new Array<number>(chip.qubits).fill(-1);
  L.forEach((p, i) => (P[p] = i));
  const out: Op[] = [];
  let swaps = 0;
  const physicalSwap = (p: number, q: number) => {
    out.push({ kind: 'swap', a: p, b: q });
    swaps++;
    const lp = P[p], lq = P[q];
    P[p] = lq;
    P[q] = lp;
    if (lp >= 0) L[lp] = q;
    if (lq >= 0) L[lq] = p;
  };
  for (const op of ops) {
    if (op.kind === 'swap' && !op.controls?.length) {
      // a SWAP in the circuit is free: relabel which physical qubit holds which logical one
      const pa = L[op.a], pb = L[op.b];
      L[op.a] = pb;
      L[op.b] = pa;
      P[pa] = op.b;
      P[pb] = op.a;
      continue;
    }
    const qs = qubitsOf(op);
    if (qs.length === 2) {
      // walk the first qubit toward the second until they are neighbours
      while (!adjacent(chip, L[qs[0]], L[qs[1]])) physicalSwap(L[qs[0]], next[L[qs[0]]][L[qs[1]]]);
    }
    out.push(mapOp(op, L));
  }
  return { ops: out, final: L.slice(), swaps };
}

/** Every way to place n logical qubits on m physical ones. */
function placements(n: number, m: number): number[][] {
  const out: number[][] = [];
  const pick = (cur: number[]) => {
    if (cur.length === n) return void out.push(cur.slice());
    for (let p = 0; p < m; p++) if (!cur.includes(p)) pick([...cur, p]);
  };
  pick([]);
  return out;
}

/** Decompose, choose the layout that needs the fewest SWAPs, and route. */
export function route(chip: Chip, n: number, ops: readonly Op[]): Routed {
  if (n > chip.qubits) throw new RoutingError(`${n} qubits do not fit on the ${chip.qubits}-qubit chip.`);
  const flat = decompose(ops);
  const next = nextHops(chip);
  let best: { ops: Op[]; final: number[]; swaps: number; initial: number[] } | null = null;
  for (const start of placements(n, chip.qubits)) {
    const r = routeFrom(chip, n, flat, start, next);
    if (!best || r.swaps < best.swaps || (r.swaps === best.swaps && r.ops.length < best.ops.length)) best = { ...r, initial: start };
  }
  return {
    ops: best!.ops,
    initial: best!.initial,
    final: best!.final,
    swaps: best!.swaps,
    twoQubitBefore: twoQubit(flat),
    twoQubitAfter: twoQubit(best!.ops) + 3 * best!.swaps,
  };
}
