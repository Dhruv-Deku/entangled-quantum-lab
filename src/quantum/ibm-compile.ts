import type { Op } from './circuit';
import { gateMatrix, type GateName } from './gates';
import { zyz, type C } from './matrix';
import { route, type Chip } from './routing';

/**
 * Compile a circuit for an IBM Quantum backend, the way Qiskit's transpiler
 * does at its simplest: pick a small, well-connected region of the chip, route
 * the circuit onto it (SWAPs where qubits are not wired together), and rewrite
 * every gate in the chip's native set. Current IBM Heron chips run RZ, SX, X
 * and CZ; any one-qubit gate becomes RZ SX RZ SX RZ (its Euler angles), a
 * controlled gate becomes CNOTs and one-qubit gates (the A-B-C construction),
 * and a CNOT is a CZ between Hadamards.
 *
 * The result is OpenQASM 3 on the chip's physical qubits ($n), ready for the
 * Sampler primitive, with every logical qubit measured at the end.
 */

export class IbmCompileError extends Error {}

export interface BackendShape {
  name: string;
  nQubits: number;
  /** Directed or undirected pairs; both directions are treated as wired. */
  couplingMap: [number, number][];
  basisGates: string[];
}

export interface IbmCompiled {
  qasm: string;
  /** Physical qubits used, in local order. */
  region: number[];
  /** Ops on local qubits 0..region.length-1 in the native gate set (for checking and noise simulation). */
  native: Op[];
  /** Local qubit holding logical qubit i at the start / end. */
  initial: number[];
  final: number[];
  swaps: number;
  twoQubit: number;
}

const rz = (q: number, a: number): Op => ({ kind: 'gate', gate: 'rz', target: q, params: [a] });
const sx = (q: number): Op => ({ kind: 'gate', gate: 'sx', target: q });
const cz = (c: number, t: number): Op => ({ kind: 'gate', gate: 'z', target: t, controls: [c] });

const wrap = (a: number) => {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x <= -Math.PI) x += 2 * Math.PI;
  return x;
};
const zero = (a: number) => Math.abs(wrap(a)) < 1e-10;

/** Any one-qubit matrix as RZ / SX gates (up to a global phase): Rz(phi+pi) SX Rz(theta+pi) SX Rz(lambda). */
export function oneQubitNative(q: number, m: C[][]): Op[] {
  const { theta, phi, lambda } = zyz(m);
  if (Math.abs(theta) < 1e-10) return zero(phi + lambda) ? [] : [rz(q, wrap(phi + lambda))];
  const out: Op[] = [];
  const push = (a: number) => {
    if (!zero(a)) out.push(rz(q, wrap(a)));
  };
  push(lambda);
  out.push(sx(q));
  push(theta + Math.PI);
  out.push(sx(q));
  push(phi + Math.PI);
  return out;
}

const matOf = (gate: GateName, params?: number[]): C[][] => {
  const m = gateMatrix(gate, params);
  return [[[m.re[0], m.im[0]], [m.re[1], m.im[1]]], [[m.re[2], m.im[2]], [m.re[3], m.im[3]]]];
};
const ry = (a: number) => matOf('ry', [a]);
const rzm = (a: number) => matOf('rz', [a]);
const mul = (a: C[][], b: C[][]): C[][] =>
  [0, 1].map((i) => [0, 1].map((j) => {
    let re = 0, im = 0;
    for (let k = 0; k < 2; k++) {
      re += a[i][k][0] * b[k][j][0] - a[i][k][1] * b[k][j][1];
      im += a[i][k][0] * b[k][j][1] + a[i][k][1] * b[k][j][0];
    }
    return [re, im] as C;
  }));

/** A CNOT as CZ between Hadamards on the target. */
function cnotNative(c: number, t: number): Op[] {
  const h = oneQubitNative(t, matOf('h'));
  return [...h, cz(c, t), ...h];
}

/**
 * Controlled-U from CNOTs and one-qubit gates (Nielsen and Chuang, section 4.3):
 * U = e^{i a} A X B X C with A B C = I, so C-U = P(a) on the control, then
 * C, CNOT, B, CNOT, A on the target.
 */
function controlledNative(c: number, t: number, gate: GateName, params?: number[]): Op[] {
  if (gate === 'x') return cnotNative(c, t);
  if (gate === 'z') return [cz(c, t)];
  const { alpha, theta, phi, lambda } = zyz(matOf(gate, params));
  const A = mul(rzm(phi), ry(theta / 2));
  const B = mul(ry(-theta / 2), rzm(-(phi + lambda) / 2));
  const Cm = rzm((lambda - phi) / 2);
  // the global phase e^{i alpha} becomes a real phase on the control: P(alpha) = e^{i alpha/2} Rz(alpha)
  const phase = zero(alpha) ? [] : [rz(c, wrap(alpha))];
  return [...oneQubitNative(t, Cm), ...cnotNative(c, t), ...oneQubitNative(t, B), ...cnotNative(c, t), ...oneQubitNative(t, A), ...phase];
}

/** Rewrite routed ops (at most two qubits each) in RZ, SX, X, CZ. */
export function toNative(ops: readonly Op[]): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    if (op.kind === 'gate') {
      if (op.condition) throw new IbmCompileError('Classically controlled gates are not supported on hardware runs yet.');
      const controls = op.controls ?? [];
      if (controls.length === 0) out.push(...oneQubitNative(op.target, matOf(op.gate, op.params)));
      else if (controls.length === 1) out.push(...controlledNative(controls[0], op.target, op.gate, op.params));
      else throw new IbmCompileError('Gates with two or more controls must be decomposed first.');
    } else if (op.kind === 'swap') {
      if (op.controls?.length) throw new IbmCompileError('A controlled SWAP must be decomposed first.');
      out.push(...cnotNative(op.a, op.b), ...cnotNative(op.b, op.a), ...cnotNative(op.a, op.b));
    } else if (op.kind === 'iswap') {
      // iSWAP = CZ (S x S) SWAP
      out.push(...cnotNative(op.a, op.b), ...cnotNative(op.b, op.a), ...cnotNative(op.a, op.b));
      out.push(rz(op.a, Math.PI / 2), rz(op.b, Math.PI / 2), cz(op.a, op.b));
    } else {
      throw new IbmCompileError('Measurements and resets are added at the end automatically; remove them from the circuit to run it on hardware.');
    }
  }
  return out;
}

/**
 * A connected region of `size` qubits: breadth-first from the best-scoring
 * qubit (lowest error when calibration data is given), skipping bad qubits.
 */
export function chooseRegion(b: BackendShape, size: number, score: (q: number) => number = () => 0, usable: (q: number) => boolean = () => true): number[] {
  const adj: number[][] = Array.from({ length: b.nQubits }, () => []);
  for (const [x, y] of b.couplingMap) {
    if (!adj[x].includes(y)) adj[x].push(y);
    if (!adj[y].includes(x)) adj[y].push(x);
  }
  const starts = [...Array(b.nQubits).keys()].filter(usable).sort((p, q) => score(p) - score(q));
  for (const s of starts) {
    const region = [s];
    const queue = [s];
    while (queue.length && region.length < size) {
      const u = queue.shift()!;
      for (const v of adj[u].filter(usable).sort((p, q) => score(p) - score(q))) {
        if (region.includes(v) || region.length >= size) continue;
        region.push(v);
        queue.push(v);
      }
    }
    if (region.length === size) return region;
  }
  throw new IbmCompileError(`No connected group of ${size} working qubits on ${b.name}.`);
}

/** Compile n logical qubits' ops for a backend. */
export function compileForIbm(n: number, ops: readonly Op[], b: BackendShape, score?: (q: number) => number, usable?: (q: number) => boolean): IbmCompiled {
  const basis = new Set(b.basisGates.map((g) => g.toLowerCase()));
  if (!basis.has('cz')) throw new IbmCompileError(`${b.name} uses ${basis.has('ecr') ? 'ECR' : 'another two-qubit gate'}; pick a backend with CZ (IBM Heron).`);
  for (const g of ['rz', 'sx']) if (!basis.has(g)) throw new IbmCompileError(`${b.name} has no ${g.toUpperCase()} gate.`);
  if (ops.some((o) => o.kind === 'measure' || o.kind === 'reset')) throw new IbmCompileError('Remove measurements from the circuit: every qubit is measured at the end of a hardware run.');
  // a little room beyond n lets the router choose a good placement
  const size = Math.min(b.nQubits, n + 2);
  const region = chooseRegion(b, size, score, usable);
  const local = new Map(region.map((p, i) => [p, i]));
  const edges: [number, number][] = [];
  for (const [x, y] of b.couplingMap) {
    const a = local.get(x), c = local.get(y);
    if (a === undefined || c === undefined) continue;
    if (!edges.some(([p, q]) => (p === a && q === c) || (p === c && q === a))) edges.push([a, c]);
  }
  const chip: Chip = { name: b.name, qubits: region.length, edges, pads: region.map(() => [0, 0] as const) };
  const routed = route(chip, n, ops);
  const native = toNative(routed.ops);
  const phys = (q: number) => `$${region[q]}`;
  const lines = ['OPENQASM 3.0;', 'include "stdgates.inc";', `bit[${n}] c;`];
  const f = (x: number) => Number(x.toPrecision(15)).toString();
  for (const op of native) {
    if (op.kind !== 'gate') continue;
    if (op.gate === 'rz') lines.push(`rz(${f(op.params![0])}) ${phys(op.target)};`);
    else if (op.gate === 'sx') lines.push(`sx ${phys(op.target)};`);
    else if (op.gate === 'z' && op.controls?.length === 1) lines.push(`cz ${phys(op.controls[0])}, ${phys(op.target)};`);
    else throw new IbmCompileError(`internal: ${op.gate} left after translation`);
  }
  for (let i = 0; i < n; i++) lines.push(`c[${i}] = measure ${phys(routed.final[i])};`);
  return {
    qasm: lines.join('\n') + '\n',
    region,
    native,
    initial: routed.initial,
    final: routed.final,
    swaps: routed.swaps,
    twoQubit: native.filter((o) => o.kind === 'gate' && (o.controls?.length ?? 0) > 0).length,
  };
}

/** Sampler results: hex samples (bit i = logical qubit i) to counts over 2^n outcomes. */
export function samplesToCounts(samples: readonly string[], n: number): Uint32Array {
  const counts = new Uint32Array(1 << n);
  for (const s of samples) {
    const v = parseInt(s, 16);
    if (Number.isFinite(v) && v >= 0 && v < counts.length) counts[v]++;
  }
  return counts;
}
