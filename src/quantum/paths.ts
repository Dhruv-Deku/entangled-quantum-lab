import { applyOp, type Op } from './circuit';
import type { Rng } from './measure';
import { QState } from './state';

/**
 * Many worlds: every path a computation takes through the basis states.
 *
 * A gate sends each basis state to a few others, each with a complex weight
 * (a column of its matrix). Follow every basis state with weight through every
 * gate and you get a branching tree of paths. Where paths meet, their weights
 * add as complex numbers: in phase they reinforce, out of phase they cancel.
 * That cancellation (destructive interference) is what makes quantum
 * algorithms work, and this is where it can be seen: a basis state that paths
 * reach but where nothing is left.
 *
 * A measurement keeps the worlds that agree with its outcome and drops the rest.
 */

export interface WorldNode {
  /** Basis state index (its label is k in binary, as everywhere in the app). */
  k: number;
  re: number;
  im: number;
  /** Probability: |amplitude|^2. */
  p: number;
}

export interface WorldEdge {
  from: number;
  to: number;
  /** The complex weight this path carries into `to`. */
  re: number;
  im: number;
  /** |weight|^2, for its thickness. */
  w: number;
}

export interface WorldLayer {
  /** The op that made this layer (null for the starting state). */
  op: Op | null;
  /** Basis states with weight after this op. */
  nodes: WorldNode[];
  /** Paths from the previous layer's nodes into this one. */
  edges: WorldEdge[];
  /** Basis states that paths reached, but whose contributions cancelled out. */
  cancelled: number[];
  /** Basis states where two or more paths arrived in phase and added up. */
  reinforced: number[];
  /** Previous-layer states whose world a measurement ended (they disagreed with the outcome). */
  pruned: number[];
}

export interface Worlds {
  n: number;
  layers: WorldLayer[];
  /** Ops before the first layer shown (long circuits show their last steps). */
  skipped: number;
  /** Total paths drawn, and how many basis states saw paths cancel. */
  paths: number;
  cancellations: number;
}

const EPS = 1e-6;
const noRandom: Rng = () => {
  throw new Error('a recorded circuit needs no randomness');
};

function nodesOf(s: QState): WorldNode[] {
  const out: WorldNode[] = [];
  for (let k = 0; k < s.dim; k++) {
    const p = s.re[k] * s.re[k] + s.im[k] * s.im[k];
    if (p > EPS * EPS) out.push({ k, re: s.re[k], im: s.im[k], p });
  }
  return out;
}

/** The paths through `ops` (as recorded, with measurement outcomes) from |0...0>, the last `maxLayers` of them. */
export function manyWorlds(n: number, ops: readonly Op[], maxLayers = 12): Worlds {
  const state = new QState(n);
  const bits: number[] = new Array(n).fill(0);
  const skipped = Math.max(0, ops.length - maxLayers);
  for (let i = 0; i < skipped; i++) applyOp(state, ops[i], bits, noRandom);
  const layers: WorldLayer[] = [{ op: null, nodes: nodesOf(state), edges: [], cancelled: [], reinforced: [], pruned: [] }];
  let paths = 0, cancellations = 0;
  for (let i = skipped; i < ops.length; i++) {
    const op = ops[i];
    const before = nodesOf(state);
    const edges: WorldEdge[] = [];
    const pruned: number[] = [];
    if (op.kind === 'measure' || op.kind === 'reset') {
      applyOp(state, op, bits, noRandom);
      // each world either agrees with the outcome (and carries on, renormalised) or ends here
      for (const a of before) {
        const to = op.kind === 'reset' && op.outcome === 1 ? a.k ^ (1 << op.qubit) : a.k;
        const re = state.re[to], im = state.im[to];
        if (re * re + im * im > EPS * EPS && bitOf(a.k, op.qubit) === (op.outcome ?? 0)) edges.push({ from: a.k, to, re, im, w: re * re + im * im });
        else pruned.push(a.k);
      }
    } else {
      // each basis state goes where the gate's matrix column sends it
      for (const a of before) {
        const col = new QState(n);
        col.re[0] = 0;
        col.re[a.k] = 1;
        applyOp(col, op, bits.slice(), noRandom);
        for (let j = 0; j < col.dim; j++) {
          const cr = col.re[j], ci = col.im[j];
          if (cr * cr + ci * ci < EPS * EPS) continue;
          const re = cr * a.re - ci * a.im, im = cr * a.im + ci * a.re;
          if (re * re + im * im < EPS * EPS) continue;
          edges.push({ from: a.k, to: j, re, im, w: re * re + im * im });
        }
      }
      applyOp(state, op, bits, noRandom);
    }
    // compare what arrived at each state with what is left there
    const arrived = new Map<number, { mag: number; count: number }>();
    for (const e of edges) {
      const m = arrived.get(e.to) ?? { mag: 0, count: 0 };
      m.mag += Math.sqrt(e.w);
      m.count++;
      arrived.set(e.to, m);
    }
    const cancelled: number[] = [], reinforced: number[] = [];
    for (const [k, m] of arrived) {
      const left = Math.hypot(state.re[k], state.im[k]);
      if (m.count >= 2 && m.mag > 0.05 && left < 0.1 * m.mag) cancelled.push(k);
      else if (m.count >= 2 && left > 0.05 && left > 0.98 * m.mag) reinforced.push(k);
    }
    paths += edges.length;
    cancellations += cancelled.length;
    layers.push({ op, nodes: nodesOf(state), edges, cancelled: cancelled.sort((a, b) => a - b), reinforced: reinforced.sort((a, b) => a - b), pruned });
  }
  return { n, layers, skipped, paths, cancellations };
}

/** Qubit q's bit in basis state k (qubit 0 is the lowest bit: the rightmost digit of the label, as in Qiskit). */
export const bitOf = (k: number, q: number) => (k >> q) & 1;

/** A short name for an op, for the column headers. */
export function opName(op: Op | null): string {
  if (!op) return 'start';
  switch (op.kind) {
    case 'gate': {
      const g = op.gate.toUpperCase();
      if (op.controls?.length) return `C${op.controls.length > 1 ? 'C' : ''}${g} ${op.controls.join('')}>${op.target}`;
      return `${g} ${op.target}`;
    }
    case 'swap':
      return `SWAP ${op.a}${op.b}`;
    case 'iswap':
      return `iSWAP ${op.a}${op.b}`;
    case 'measure':
      return `M ${op.qubit}=${op.outcome ?? '?'}`;
    case 'reset':
      return `R ${op.qubit}`;
  }
}
