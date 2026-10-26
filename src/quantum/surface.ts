import type { Rng } from './measure';

/**
 * The rotated surface code: the error-correcting code Google ran on its Willow
 * chip in 2024, and the leading plan for every superconducting machine.
 *
 * d x d data qubits hold one logical qubit. Between them sit d^2 - 1 measure
 * qubits, each checking the parity of its two or four neighbours: Z checks
 * catch bit flips (X errors), X checks catch phase flips (Z errors). An error
 * lights the checks around it (the syndrome) without revealing the logical
 * state. A decoder pairs up the lit checks along the shortest paths and flips
 * those qubits back. It fails only when the errors it guessed and the real
 * ones together stretch right across the grid: a logical error. Below a
 * threshold error rate, a bigger grid makes that exponentially rarer.
 *
 * Layout: data qubit (r, c) for r, c in 0..d-1. Check (r, c) sits at the
 * centre of data (r..r+1, c..c+1), for r, c in -1..d-1, of type X when r + c
 * is even and Z when odd. All interior checks are kept; on the top and bottom
 * edges only X checks, on the left and right only Z checks.
 */

export type CheckType = 'X' | 'Z';
export type ErrorType = 'X' | 'Z';

export interface Check {
  type: CheckType;
  /** Top-left data corner (r, c); its centre is at (r + 0.5, c + 0.5). */
  r: number;
  c: number;
  /** Data qubits it measures (index r * d + c). */
  data: number[];
}

export interface Decoded {
  /** Data qubits the decoder flips back. */
  correction: number[];
  /** One path of data qubits per matched pair (or defect to boundary), for drawing. */
  chains: number[][];
  /** The lit checks, in pairs (-1: matched to the boundary). */
  pairs: [number, number][];
}

/** One round of noise and correction, as the 3D lattice shows it. */
export interface SurfaceRound {
  d: number;
  /** Data qubits hit by bit flips and by phase flips. */
  xErrors: number[];
  zErrors: number[];
  /** Lit checks (indices into checks). */
  defects: number[];
  /** Correction chains, bit-flip ones then phase-flip ones. */
  xChains: number[][];
  zChains: number[][];
  /** The correction failed: the logical qubit was flipped. */
  logical: boolean;
}

/** Which checks detect an error type: Z checks see bit flips, X checks see phase flips. */
const detects = (e: ErrorType): CheckType => (e === 'X' ? 'Z' : 'X');

export class SurfaceCode {
  readonly d: number;
  readonly checks: Check[] = [];
  /** For each error type: the decoding graph (checks that see it plus one boundary node). */
  private graphs: Record<ErrorType, { nodes: number[]; adj: { to: number; q: number }[][]; dist: number[][]; via: { prev: number; q: number }[][] }>;

  constructor(d: number) {
    if (d < 2 || d > 11) throw new Error('distance must be 2..11');
    this.d = d;
    for (let r = -1; r < d; r++)
      for (let c = -1; c < d; c++) {
        const type: CheckType = (r + c) % 2 === 0 ? 'X' : 'Z';
        const rowEdge = r === -1 || r === d - 1, colEdge = c === -1 || c === d - 1;
        if (rowEdge && colEdge) continue;
        if (rowEdge && type !== 'X') continue;
        if (colEdge && type !== 'Z') continue;
        const data: number[] = [];
        for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < d && cc >= 0 && cc < d) data.push(rr * d + cc);
        }
        this.checks.push({ type, r, c, data });
      }
    this.graphs = { X: this.graph('X'), Z: this.graph('Z') };
  }

  get dataCount(): number {
    return this.d * this.d;
  }

  /** The decoding graph for one error type: each data qubit is an edge between the (one or two) checks that see it. */
  private graph(e: ErrorType) {
    const t = detects(e);
    const nodes = this.checks.map((c, i) => (c.type === t ? i : -1)).filter((i) => i >= 0);
    const local = new Map(nodes.map((ci, i) => [ci, i]));
    const B = nodes.length;
    const adj: { to: number; q: number }[][] = Array.from({ length: B + 1 }, () => []);
    for (let q = 0; q < this.dataCount; q++) {
      const ends = nodes.filter((ci) => this.checks[ci].data.includes(q)).map((ci) => local.get(ci)!);
      const [a, b] = ends.length === 2 ? ends : [ends[0], B];
      adj[a].push({ to: b, q });
      adj[b].push({ to: a, q });
    }
    // shortest paths (every edge weighs the same), with the way back for drawing chains
    const dist: number[][] = [], via: { prev: number; q: number }[][] = [];
    for (let s = 0; s <= B; s++) {
      const dd = new Array(B + 1).fill(Infinity), vv = new Array(B + 1).fill(null).map(() => ({ prev: -1, q: -1 }));
      dd[s] = 0;
      const queue = [s];
      while (queue.length) {
        const u = queue.shift()!;
        for (const { to, q } of adj[u]) {
          if (dd[to] !== Infinity) continue;
          dd[to] = dd[u] + 1;
          vv[to] = { prev: u, q };
          // the boundary is a sink: paths may end there but not pass through it
          if (to !== B) queue.push(to);
        }
      }
      dist.push(dd);
      via.push(vv);
    }
    return { nodes, adj, dist, via };
  }

  /** Checks lit by a set of errors of one type. */
  syndrome(errors: readonly number[], e: ErrorType): number[] {
    const t = detects(e);
    const hit = new Set(errors);
    const out: number[] = [];
    this.checks.forEach((c, i) => {
      if (c.type !== t) return;
      let parity = 0;
      for (const q of c.data) if (hit.has(q)) parity ^= 1;
      if (parity) out.push(i);
    });
    return out;
  }

  /**
   * Minimum-weight matching: pair the lit checks, or send one to the edge,
   * so the total path length is as small as possible. Exact for up to 16 lit
   * checks (a bitmask search), greedy beyond.
   */
  decode(defects: readonly number[], e: ErrorType): Decoded {
    const g = this.graphs[e];
    const local = new Map(g.nodes.map((ci, i) => [ci, i]));
    const ds = defects.map((ci) => local.get(ci)!).filter((x) => x !== undefined);
    const B = g.nodes.length, m = ds.length;
    const pairsLocal: [number, number][] = [];
    if (m <= 16) {
      const size = 1 << m;
      const cost = new Float64Array(size).fill(Infinity);
      const choice = new Int32Array(size).fill(-2);
      cost[0] = 0;
      for (let mask = 1; mask < size; mask++) {
        let i = 0;
        while (!(mask & (1 << i))) i++;
        const rest = mask & ~(1 << i);
        // the lowest lit check goes to the boundary, or pairs with another
        let best = cost[rest] + g.dist[ds[i]][B], pick = -1;
        for (let j = i + 1; j < m; j++) {
          if (!(rest & (1 << j))) continue;
          const c = cost[rest & ~(1 << j)] + g.dist[ds[i]][ds[j]];
          if (c < best) {
            best = c;
            pick = j;
          }
        }
        cost[mask] = best;
        choice[mask] = pick;
      }
      let mask = size - 1;
      while (mask) {
        let i = 0;
        while (!(mask & (1 << i))) i++;
        const j = choice[mask];
        pairsLocal.push([ds[i], j < 0 ? B : ds[j]]);
        mask &= ~(1 << i);
        if (j >= 0) mask &= ~(1 << j);
      }
    } else {
      const left = new Set(ds);
      while (left.size) {
        let best = Infinity, pa = -1, pb = -1;
        for (const a of left) {
          if (g.dist[a][B] < best) [best, pa, pb] = [g.dist[a][B], a, B];
          for (const b of left) if (b > a && g.dist[a][b] < best) [best, pa, pb] = [g.dist[a][b], a, b];
        }
        pairsLocal.push([pa, pb]);
        left.delete(pa);
        left.delete(pb);
      }
    }
    const flip = new Set<number>();
    const chains: number[][] = [];
    for (const [a, b] of pairsLocal) {
      const chain: number[] = [];
      for (let at = b; at !== a; ) {
        const step = g.via[a][at];
        if (step.prev < 0) break;
        chain.push(step.q);
        at = step.prev;
      }
      chain.reverse();
      chains.push(chain);
      for (const q of chain) flip.has(q) ? flip.delete(q) : flip.add(q);
    }
    return { correction: [...flip].sort((x, y) => x - y), chains, pairs: pairsLocal.map(([a, b]) => [g.nodes[a], b === B ? -1 : g.nodes[b]]) };
  }

  /**
   * After correction, is the logical qubit flipped? The leftover errors
   * (errors xor correction) are a closed loop or a chain across the grid; a
   * bit-flip chain across crosses a full row (the logical Z) an odd number of
   * times, a phase-flip chain across crosses a full column.
   */
  logicalFlip(errors: readonly number[], correction: readonly number[], e: ErrorType): boolean {
    const left = new Set<number>();
    for (const q of [...errors, ...correction]) left.has(q) ? left.delete(q) : left.add(q);
    let crossings = 0;
    for (let k = 0; k < this.d; k++) if (left.has(e === 'X' ? k : k * this.d)) crossings++;
    return crossings % 2 === 1;
  }

  /** One round at physical error rate p: random bit and phase flips, the syndrome, the decoder's fix, and whether it failed. */
  round(p: number, rng: Rng, atLeastOne = false): SurfaceRound {
    const pick = () => {
      const out: number[] = [];
      for (let q = 0; q < this.dataCount; q++) if (rng() < p) out.push(q);
      return out;
    };
    let xErrors = pick(), zErrors = pick();
    if (atLeastOne && !xErrors.length && !zErrors.length) xErrors = [Math.floor(rng() * this.dataCount)];
    const xs = this.syndrome(xErrors, 'X'), zs = this.syndrome(zErrors, 'Z');
    const xd = this.decode(xs, 'X'), zd = this.decode(zs, 'Z');
    return {
      d: this.d,
      xErrors,
      zErrors,
      defects: [...xs, ...zs],
      xChains: xd.chains,
      zChains: zd.chains,
      logical: this.logicalFlip(xErrors, xd.correction, 'X') || this.logicalFlip(zErrors, zd.correction, 'Z'),
    };
  }

  /** How often the decoder fails at bit-flip rate p, over `trials` rounds (bit flips only, as threshold plots usually show). */
  logicalRate(p: number, trials: number, rng: Rng): number {
    let fails = 0;
    for (let t = 0; t < trials; t++) {
      const errors: number[] = [];
      for (let q = 0; q < this.dataCount; q++) if (rng() < p) errors.push(q);
      const fix = this.decode(this.syndrome(errors, 'X'), 'X');
      if (this.logicalFlip(errors, fix.correction, 'X')) fails++;
    }
    return fails / trials;
  }
}

/** Logical error rate against physical error rate for several distances: the threshold plot. */
export function thresholdCurves(distances: readonly number[], ps: readonly number[], trials: number, rng: Rng): { d: number; points: [number, number][] }[] {
  return distances.map((d) => {
    const code = new SurfaceCode(d);
    return { d, points: ps.map((p): [number, number] => [p, code.logicalRate(p, trials, rng)]) };
  });
}
