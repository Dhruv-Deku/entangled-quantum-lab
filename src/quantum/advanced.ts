import { run, type Op } from './circuit';
import { runNoisy } from './density';
import { gateMatrix } from './gates';
import type { Rng } from './measure';
import { QState } from './state';

/**
 * The physics behind chapters 19 to 23 and the unitary view: the CHSH Bell
 * test, the three-qubit bit-flip code, entanglement swapping, a discrete
 * quantum walk, Trotterised time evolution of an Ising chain, the matrix of a
 * whole circuit, the quantum Zeno effect and randomized benchmarking. Pure TypeScript, no rendering.
 */

const cx = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });
const g1 = (gate: 'h' | 'x' | 'z' | 's', target: number): Op => ({ kind: 'gate', gate, target });
const m = (qubit: number): Op => ({ kind: 'measure', qubit });

// ---------------------------------------------------------------- CHSH

/** Measurement directions in the X-Z plane (angle from Z toward X) that win the CHSH game most often. */
export const CHSH_ALICE = [0, Math.PI / 2] as const;
export const CHSH_BOB = [Math.PI / 4, -Math.PI / 4] as const;
export const TSIRELSON = 2 * Math.SQRT2;

/** Rotate qubit q so that a measurement along angle a (in the X-Z plane) becomes a plain Z measurement. */
function turnTo(s: QState, q: number, a: number): void {
  s.apply1(q, gateMatrix('ry', [-a]));
}

/** <A(a) x B(b)>: the correlation of +-1 outcomes measured along angles a on qubit qa and b on qubit qb. */
export function correlation(s: QState, qa: number, qb: number, a: number, b: number): number {
  const t = s.clone();
  turnTo(t, qa, a);
  turnTo(t, qb, b);
  const p = t.probabilities();
  let e = 0;
  for (let k = 0; k < p.length; k++) e += ((k >> qa) ^ (k >> qb)) & 1 ? -p[k] : p[k];
  return e;
}

/** S = E(a0,b0) + E(a0,b1) + E(a1,b0) - E(a1,b1). Any classical strategy keeps |S| <= 2; quantum reaches 2 sqrt 2. */
export function chshValue(s: QState, qa = 0, qb = 1): number {
  const e = (i: number, j: number) => correlation(s, qa, qb, CHSH_ALICE[i], CHSH_BOB[j]);
  return e(0, 0) + e(0, 1) + e(1, 0) - e(1, 1);
}

export interface ChshResult {
  rounds: number;
  /** Measured correlations, [alice setting][bob setting]. */
  e: number[][];
  s: number;
  /** Standard error of s from the finite number of rounds. */
  se: number;
  /** Fraction of rounds won: the outputs differ exactly when both questions are 1. */
  win: number;
  exact: number;
}

/**
 * Play the CHSH game for real: each round the referee asks Alice and Bob a
 * random bit, they measure their qubit along the matching angle, and they win
 * when (a xor b) = (x and y). Outcomes are sampled from the state.
 */
export function playChsh(s: QState, rounds: number, rng: Rng, qa = 0, qb = 1): ChshResult {
  // the joint outcome distribution for each pair of settings
  const dist = [0, 1].map((x) =>
    [0, 1].map((y) => {
      const t = s.clone();
      turnTo(t, qa, CHSH_ALICE[x]);
      turnTo(t, qb, CHSH_BOB[y]);
      const p = t.probabilities();
      const joint = [0, 0, 0, 0];
      for (let k = 0; k < p.length; k++) joint[((k >> qa) & 1) | (((k >> qb) & 1) << 1)] += p[k];
      return joint;
    }),
  );
  const sum = [[0, 0], [0, 0]], count = [[0, 0], [0, 0]];
  let wins = 0;
  for (let r = 0; r < rounds; r++) {
    const x = rng() < 0.5 ? 0 : 1, y = rng() < 0.5 ? 0 : 1;
    const j = dist[x][y];
    let u = rng(), o = 0;
    while (o < 3 && u >= j[o]) u -= j[o++];
    const a = o & 1, b = o >> 1;
    sum[x][y] += a === b ? 1 : -1;
    count[x][y]++;
    if ((a ^ b) === (x & y)) wins++;
  }
  const e = [0, 1].map((x) => [0, 1].map((y) => (count[x][y] ? sum[x][y] / count[x][y] : 0)));
  // each E is a mean of +-1 values: variance (1 - E^2) / rounds at that setting
  let v = 0;
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) v += count[x][y] ? (1 - e[x][y] ** 2) / count[x][y] : 0;
  return { rounds, e, s: e[0][0] + e[0][1] + e[1][0] - e[1][1], se: Math.sqrt(v), win: wins / rounds, exact: chshValue(s, qa, qb) };
}

// ---------------------------------------------------------------- bit-flip code

/** q0 carries the message; q1 and q2 hold the redundancy; q3 and q4 read the syndrome. */
export const QEC_ENCODE: Op[] = [cx(0, 1), cx(0, 2)];
export const QEC_SYNDROME: Op[] = [cx(0, 3), cx(1, 3), cx(1, 4), cx(2, 4), m(3), m(4)];
export const QEC_DECODE: Op[] = [cx(0, 2), cx(0, 1)];

/** Which data qubit flipped, from the two parity checks q0 xor q1 (s0) and q1 xor q2 (s1); null: none. */
export function syndromeQubit(s0: number, s1: number): number | null {
  if (!s0 && !s1) return null;
  if (s0 && !s1) return 0;
  if (s0 && s1) return 1;
  return 2;
}

/** Chance the code fails at physical flip rate p: two or three of the three qubits flipped. */
export const logicalError = (p: number) => 3 * p * p - 2 * p * p * p;

/**
 * One full run of the code: encode a message (Ry(theta) on q0), flip each data
 * qubit with probability p, read the syndrome, correct, decode. True when the
 * message survives.
 */
export function qecTrial(p: number, theta: number, rng: Rng): boolean {
  const ops: Op[] = [{ kind: 'gate', gate: 'ry', target: 0, params: [theta] }, ...QEC_ENCODE];
  for (let q = 0; q < 3; q++) if (rng() < p) ops.push(g1('x', q));
  const r = run(5, [...ops, ...QEC_SYNDROME], rng);
  const fix = syndromeQubit(r.bits[3], r.bits[4]);
  const end = run(5, [...(fix === null ? [] : [g1('x', fix)]), ...QEC_DECODE], rng, r.state).state;
  // after decoding the other qubits hold plain bits, so q0 alone must match the message
  const want = run(1, [{ kind: 'gate', gate: 'ry', target: 0, params: [theta] }], rng).state;
  return overlapOnQ0(end, want) > 1 - 1e-9;
}

/** |<want|q0>|^2 when the other qubits are in basis states. */
function overlapOnQ0(s: QState, want: QState): number {
  let best = 0;
  for (let rest = 0; rest < s.dim; rest += 2) {
    const r0 = s.re[rest], i0 = s.im[rest], r1 = s.re[rest + 1], i1 = s.im[rest + 1];
    const re = want.re[0] * r0 + want.im[0] * i0 + want.re[1] * r1 + want.im[1] * i1;
    const im = want.re[0] * i0 - want.im[0] * r0 + want.re[1] * i1 - want.im[1] * r1;
    best += re * re + im * im;
  }
  return best;
}

/** The code's failure rate measured by simulation at each p (trials each), against the formula. */
export function qecCurve(ps: number[], trials: number, rng: Rng): [number, number][] {
  return ps.map((p) => {
    let fail = 0;
    for (let t = 0; t < trials; t++) if (!qecTrial(p, 1.1, rng)) fail++;
    return [p, fail / trials];
  });
}

// ---------------------------------------------------------------- entanglement swapping

export const SWAP_PAIRS: Op[] = [g1('h', 0), cx(0, 1), g1('h', 2), cx(2, 3)];
/** The Bell measurement on the middle qubits q1 and q2. */
export const BELL_MEASURE: Op[] = [cx(1, 2), g1('h', 1), m(1), m(2)];
/** Corrections on q3 from the two outcomes: X if q2 read 1, Z if q1 read 1. Then q0 and q3 hold (|00> + |11>)/sqrt 2. */
export function swapFix(m1: number, m2: number): Op[] {
  return [...(m2 ? [g1('x', 3)] : []), ...(m1 ? [g1('z', 3)] : [])];
}

// ---------------------------------------------------------------- quantum walk

/** Positions 0..15 on q0..q3 (q0 the low bit); the coin is q4. The walker starts in the middle. */
export const WALK_SITES = 16;
export const WALK_START = 8;
export const WALK_COIN = 4;
export const WALK_MAX_STEPS = 6;
/** Walker at 8, coin in (|0> + i|1>)/sqrt 2 so it spreads evenly both ways. */
export const WALK_SETUP: Op[] = [g1('x', 3), g1('h', WALK_COIN), g1('s', WALK_COIN)];

/** One step: toss the coin (H), then move +1 if it shows 1, -1 if it shows 0 (mod 16). */
export function walkStepOps(): Op[] {
  const c = WALK_COIN;
  const x = (t: number, ctrl: number[]): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c, ...ctrl] });
  // +1: flip each bit when all lower bits are 1, highest first
  const inc = [x(3, [0, 1, 2]), x(2, [0, 1]), x(1, [0]), x(0, [])];
  // -1: the same in reverse order
  const dec = [x(0, []), x(1, [0]), x(2, [0, 1]), x(3, [0, 1, 2])];
  return [g1('h', c), ...inc, g1('x', c), ...dec, g1('x', c)];
}

/** Where the walker is: the probability of each site, summed over the coin. */
export function walkDistribution(s: QState): number[] {
  const p = s.probabilities();
  const out = new Array<number>(WALK_SITES).fill(0);
  for (let k = 0; k < p.length; k++) out[k & (WALK_SITES - 1)] += p[k];
  return out;
}

/** A classical random walker after t fair coin tosses from the start (binomial). */
export function classicalWalk(t: number): number[] {
  const out = new Array<number>(WALK_SITES).fill(0);
  let c = 1;
  for (let k = 0; k <= t; k++) {
    out[(((WALK_START + 2 * k - t) % WALK_SITES) + WALK_SITES) % WALK_SITES] += c / 2 ** t;
    c = (c * (t - k)) / (k + 1);
  }
  return out;
}

/** Standard deviation of a distribution over the sites, measured from the start. */
export function spread(dist: number[]): number {
  let mean = 0, sq = 0;
  dist.forEach((p, i) => {
    mean += p * (i - WALK_START);
    sq += p * (i - WALK_START) ** 2;
  });
  return Math.sqrt(Math.max(0, sq - mean * mean));
}

// ---------------------------------------------------------------- Ising chain

/** H = -J (Z0 Z1 + Z1 Z2) - h (X0 + X1 + X2) on three qubits, starting in |000>. */
export const ISING = { n: 3, j: 1, h: 1 };
export const TROTTER_DT = 0.25;
export const TROTTER_STEPS = 24;
/** Steps taken one tap at a time before the rest run together. */
export const TROTTER_MANUAL = 4;

/** One first-order Trotter step of length dt: the ZZ couplings (CX, RZ, CX), then the field (RX). */
export function trotterStepOps(dt: number): Op[] {
  const { n, j, h } = ISING;
  const ops: Op[] = [];
  for (let a = 0; a + 1 < n; a++) ops.push(cx(a, a + 1), { kind: 'gate', gate: 'rz', target: a + 1, params: [-2 * j * dt] }, cx(a, a + 1));
  for (let q = 0; q < n; q++) ops.push({ kind: 'gate', gate: 'rx', target: q, params: [-2 * h * dt] });
  return ops;
}

/** Average magnetisation (1/n) sum <Z_i>. */
export function magnetization(s: QState): number {
  const p = s.probabilities();
  let total = 0;
  for (let k = 0; k < p.length; k++) {
    let z = 0;
    for (let q = 0; q < s.n; q++) z += (k >> q) & 1 ? -1 : 1;
    total += (p[k] * z) / s.n;
  }
  return total;
}

/** The Ising Hamiltonian as a real symmetric matrix (row-major, 2^n x 2^n). */
export function isingMatrix(): Float64Array {
  const { n, j, h } = ISING;
  const d = 1 << n;
  const a = new Float64Array(d * d);
  for (let k = 0; k < d; k++) {
    let zz = 0;
    for (let q = 0; q + 1 < n; q++) zz += ((k >> q) ^ (k >> (q + 1))) & 1 ? -1 : 1;
    a[k * d + k] = -j * zz;
    for (let q = 0; q < n; q++) a[k * d + (k ^ (1 << q))] += -h;
  }
  return a;
}

/** Eigenvalues and eigenvectors (columns of v) of a real symmetric matrix, by cyclic Jacobi. */
export function jacobiEigen(d: number, input: Float64Array): { values: number[]; v: Float64Array } {
  const a = Float64Array.from(input);
  const v = new Float64Array(d * d);
  for (let i = 0; i < d; i++) v[i * d + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < d; p++) for (let q = p + 1; q < d; q++) off += a[p * d + q] ** 2;
    if (off < 1e-26) break;
    for (let p = 0; p < d; p++)
      for (let q = p + 1; q < d; q++) {
        const apq = a[p * d + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q * d + q] - a[p * d + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < d; k++) {
          const akp = a[k * d + p], akq = a[k * d + q];
          a[k * d + p] = c * akp - s * akq;
          a[k * d + q] = s * akp + c * akq;
        }
        for (let k = 0; k < d; k++) {
          const apk = a[p * d + k], aqk = a[q * d + k];
          a[p * d + k] = c * apk - s * aqk;
          a[q * d + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < d; k++) {
          const vkp = v[k * d + p], vkq = v[k * d + q];
          v[k * d + p] = c * vkp - s * vkq;
          v[k * d + q] = s * vkp + c * vkq;
        }
      }
  }
  return { values: Array.from({ length: d }, (_, i) => a[i * d + i]), v };
}

/** Exact magnetisation at each time: |psi(t)> = e^{-iHt}|000>, from the eigen-decomposition. */
export function exactMagnetization(times: number[]): number[] {
  const d = 1 << ISING.n;
  const { values, v } = jacobiEigen(d, isingMatrix());
  return times.map((t) => {
    const s = new QState(ISING.n);
    s.re.fill(0);
    // <e_k|000> = v[0][k]; psi = sum_k e^{-i E_k t} v[0][k] |e_k>
    for (let k = 0; k < d; k++) {
      const c = v[0 * d + k], cr = Math.cos(-values[k] * t) * c, ci = Math.sin(-values[k] * t) * c;
      for (let i = 0; i < d; i++) {
        s.re[i] += cr * v[i * d + k];
        s.im[i] += ci * v[i * d + k];
      }
    }
    return magnetization(s);
  });
}

/** Magnetisation after each of `steps` Trotter steps of length dt (index 0 is t = 0). */
export function trotterMagnetization(dt: number, steps: number): [number, number][] {
  let s = new QState(ISING.n);
  const out: [number, number][] = [[0, magnetization(s)]];
  for (let k = 1; k <= steps; k++) {
    s = run(ISING.n, trotterStepOps(dt), () => 0.5, s).state;
    out.push([k * dt, magnetization(s)]);
  }
  return out;
}

// ---------------------------------------------------------------- the whole circuit as a matrix

export interface Unitary {
  n: number;
  /** Row-major: entry (row r, column c) at r * 2^n + c. Column c is what |c> becomes. */
  re: Float64Array;
  im: Float64Array;
}

/** The circuit's unitary, or null when it measures or resets (then it is not one matrix). */
export function circuitUnitary(n: number, ops: readonly Op[]): Unitary | null {
  if (ops.some((o) => o.kind === 'measure' || o.kind === 'reset' || (o.kind === 'gate' && o.condition))) return null;
  const d = 1 << n;
  const re = new Float64Array(d * d), im = new Float64Array(d * d);
  for (let c = 0; c < d; c++) {
    const s = new QState(n);
    s.re[0] = 0;
    s.re[c] = 1;
    const out = run(n, ops, () => 0.5, s).state;
    for (let r = 0; r < d; r++) {
      re[r * d + c] = out.re[r];
      im[r * d + c] = out.im[r];
    }
  }
  return { n, re, im };
}

/** What kind of matrix it is, in words a learner can use. */
export function describeUnitary(u: Unitary): string {
  const d = 1 << u.n;
  const mag = (r: number, c: number) => Math.hypot(u.re[r * d + c], u.im[r * d + c]);
  let nonzero = 0, offDiagonal = 0, permutation = true;
  for (let r = 0; r < d; r++)
    for (let c = 0; c < d; c++) {
      const a = mag(r, c);
      if (a > 1e-9) {
        nonzero++;
        if (r !== c) offDiagonal++;
        if (Math.abs(a - 1) > 1e-9) permutation = false;
      }
    }
  if (nonzero === d && offDiagonal === 0) {
    let plain = true;
    for (let r = 0; r < d; r++) if (Math.abs(u.re[r * d + r] - u.re[0]) > 1e-9 || Math.abs(u.im[r * d + r] - u.im[0]) > 1e-9) plain = false;
    return plain ? 'The identity (up to a global phase): this circuit does nothing measurable.' : 'Diagonal: it only changes phases. Every basis state stays put; measuring right after shows nothing.';
  }
  if (permutation) return 'A permutation: each basis state goes to exactly one other, like a classical reversible circuit (with phases).';
  const fill = nonzero / (d * d);
  return fill > 0.99 ? 'Dense: every input reaches every output. This is where interference has room to work.' : `${Math.round(fill * 100)}% of the entries are non-zero: some inputs mix, others pass straight through.`;
}

// ---------------------------------------------------------------- quantum Zeno

/** Chance q0 is still |0> after N looks, each after a turn of pi/N (a half turn in total): cos^2(pi/2N)^N. */
export const zenoSurvival = (looks: number) => Math.cos(Math.PI / (2 * looks)) ** (2 * looks);

/** The half turn in N slices with a look after each; the outcomes in order. */
export function zenoTrial(looks: number, rng: Rng): (0 | 1)[] {
  const ops: Op[] = [];
  for (let k = 0; k < looks; k++) ops.push({ kind: 'gate', gate: 'ry', target: 0, params: [Math.PI / looks] }, { kind: 'measure', qubit: 0 });
  return run(1, ops, rng).ops.filter((o): o is Extract<Op, { kind: 'measure' }> => o.kind === 'measure').map((o) => o.outcome ?? 0);
}

/** Fraction of trials in which every look found |0>, for each number of looks. */
export function zenoCurve(looks: number[], trials: number, rng: Rng): [number, number][] {
  return looks.map((n) => {
    let kept = 0;
    for (let t = 0; t < trials; t++) if (zenoTrial(n, rng).every((o) => o === 0)) kept++;
    return [n, kept / trials];
  });
}

// ---------------------------------------------------------------- randomized benchmarking

type C2 = { re: [number, number, number, number]; im: [number, number, number, number] };
const mul2 = (a: C2, b: C2): C2 => {
  const re: C2['re'] = [0, 0, 0, 0], im: C2['im'] = [0, 0, 0, 0];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 2; c++)
      for (let k = 0; k < 2; k++) {
        const ar = a.re[r * 2 + k], ai = a.im[r * 2 + k], br = b.re[k * 2 + c], bi = b.im[k * 2 + c];
        re[r * 2 + c] += ar * br - ai * bi;
        im[r * 2 + c] += ar * bi + ai * br;
      }
  return { re, im };
};
/** A matrix up to global phase, as a string key. */
function phaseKey(u: C2): string {
  let k = 0;
  while (Math.hypot(u.re[k], u.im[k]) < 1e-9) k++;
  const pr = u.re[k], pi = u.im[k], m = Math.hypot(pr, pi);
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    // divide by the phase of the first non-zero entry
    const re = (u.re[i] * pr + u.im[i] * pi) / m, im = (u.im[i] * pr - u.re[i] * pi) / m;
    out.push(`${Math.round(re * 1e6)},${Math.round(im * 1e6)}`);
  }
  return out.join(';');
}

export interface Clifford {
  /** Gates on one qubit, applied in order (H and S only). */
  gates: ('h' | 's')[];
  key: string;
  u: C2;
}

let cliffords: Clifford[] | null = null;
/** The 24 single-qubit Clifford gates, each as the shortest word in H and S (breadth-first search). */
export function cliffordGroup(): Clifford[] {
  if (cliffords) return cliffords;
  const id: C2 = { re: [1, 0, 0, 1], im: [0, 0, 0, 0] };
  const gen = { h: gateMatrix('h') as unknown as C2, s: gateMatrix('s') as unknown as C2 };
  const found = new Map<string, Clifford>([[phaseKey(id), { gates: [], key: phaseKey(id), u: id }]]);
  let frontier = [...found.values()];
  while (frontier.length) {
    const next: Clifford[] = [];
    for (const c of frontier)
      for (const g of ['h', 's'] as const) {
        const u = mul2(gen[g], c.u);
        const key = phaseKey(u);
        if (!found.has(key)) {
          const e = { gates: [...c.gates, g], key, u };
          found.set(key, e);
          next.push(e);
        }
      }
    frontier = next;
  }
  cliffords = [...found.values()];
  return cliffords;
}

/** m random Cliffords and the one Clifford that undoes them all, as gate ops on q0. */
export function rbSequence(m: number, rng: Rng): Op[] {
  const group = cliffordGroup();
  let total: C2 = { re: [1, 0, 0, 1], im: [0, 0, 0, 0] };
  const gates: ('h' | 's')[] = [];
  for (let i = 0; i < m; i++) {
    const c = group[Math.floor(rng() * group.length)];
    gates.push(...c.gates);
    total = mul2(c.u, total);
  }
  // the inverse: the Clifford whose product with the total is the identity
  const idKey = phaseKey({ re: [1, 0, 0, 1], im: [0, 0, 0, 0] });
  const inv = group.find((c) => phaseKey(mul2(c.u, total)) === idKey)!;
  gates.push(...inv.gates);
  return gates.map((gate) => ({ kind: 'gate', gate, target: 0 }));
}

/** A typical transmon: T1 100 us, T2 80 us, 0.1% depolarizing error per gate. */
export const RB_NOISE = { t1: 100, t2: 80, depol: 0.001 };

/** How often the noisy qubit comes back to |0> after the sequence. */
export function rbSurvival(ops: readonly Op[], noise = RB_NOISE): number {
  return runNoisy(1, ops, noise).probabilities()[0];
}

export interface RbResult {
  points: [number, number][];
  /** Survival = a p^m + 1/2. */
  a: number;
  p: number;
  /** Average error per Clifford, (1 - p) / 2, and per physical gate. */
  perClifford: number;
  perGate: number;
}

/** Average survival over `seqs` random sequences at each length, and the fitted decay. */
export function benchmark(lengths: number[], seqs: number, rng: Rng, noise = RB_NOISE): RbResult {
  let gates = 0, cliffordsRun = 0;
  const points = lengths.map((m): [number, number] => {
    let sum = 0;
    for (let k = 0; k < seqs; k++) {
      const ops = rbSequence(m, rng);
      gates += ops.length;
      cliffordsRun += m + 1;
      sum += rbSurvival(ops, noise);
    }
    return [m, sum / seqs];
  });
  // least squares on log(survival - 1/2) = log a + m log p
  const xs = points.map(([m]) => m), ys = points.map(([, f]) => Math.log(Math.max(1e-9, f - 0.5)));
  const n = xs.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const p = Math.exp(slope), a = Math.exp(my - slope * mx);
  const perClifford = (1 - p) / 2;
  return { points, a, p, perClifford, perGate: perClifford / (gates / cliffordsRun) };
}
