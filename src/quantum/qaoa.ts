import { run, type Op } from './circuit';

/**
 * QAOA for MaxCut, the textbook variational algorithm.
 *
 * Split a graph's nodes into two groups so that as many edges as possible run
 * between the groups. As a cost Hamiltonian (PennyLane's convention):
 *
 *   H_C = sum over edges (i, j) of 1/2 (Z_i Z_j - 1)
 *
 * Each basis state is one split, and its energy is minus the number of edges it
 * cuts, so the lowest eigenvalue is minus the maximum cut. QAOA prepares
 *
 *   |gamma, beta> = prod over layers of exp(-i beta H_M) exp(-i gamma H_C) |+>^n,   H_M = sum of X_i
 *
 * and a classical optimizer tunes gamma and beta to make <H_C> as low as it can.
 * On the qubits: each exp(-i gamma/2 Z_i Z_j) is CNOT, Rz(gamma), CNOT; each
 * exp(-i beta X) is Rx(2 beta). The approximation ratio <H_C> / min(H_C) says
 * how close the average result is to the best cut (1 is perfect).
 */

export interface Graph {
  n: number;
  edges: [number, number][];
  name: string;
}

/** Four nodes in a ring: the best cut takes all four edges (0101 or 1010). */
export const SQUARE: Graph = { n: 4, edges: [[0, 1], [1, 2], [2, 3], [3, 0]], name: 'square' };
/** A square with one diagonal: the best cut is 4 of 5 edges. */
export const KITE: Graph = { n: 4, edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]], name: 'kite' };

/** Energy of one split (basis state k): minus the edges it cuts. */
export function cost(k: number, g: Graph): number {
  let cut = 0;
  for (const [i, j] of g.edges) if (((k >> i) & 1) !== ((k >> j) & 1)) cut++;
  return cut ? -cut : 0;
}

/** The best cut by trying every split: its energy (the lowest eigenvalue of H_C) and the splits that reach it. */
export function bestCut(g: Graph): { energy: number; states: number[] } {
  let energy = 0;
  let states: number[] = [];
  for (let k = 0; k < 1 << g.n; k++) {
    const e = cost(k, g);
    if (e < energy) {
      energy = e;
      states = [k];
    } else if (e === energy) states.push(k);
  }
  return { energy, states };
}

/** The QAOA circuit as lab ops: Hadamards, then p layers of cost and mixer. */
export function qaoaOps(g: Graph, gammas: readonly number[], betas: readonly number[]): Op[] {
  const ops: Op[] = [];
  for (let q = 0; q < g.n; q++) ops.push({ kind: 'gate', gate: 'h', target: q });
  for (let l = 0; l < gammas.length; l++) {
    for (const [i, j] of g.edges) {
      ops.push({ kind: 'gate', gate: 'x', target: j, controls: [i] });
      ops.push({ kind: 'gate', gate: 'rz', target: j, params: [gammas[l]] });
      ops.push({ kind: 'gate', gate: 'x', target: j, controls: [i] });
    }
    for (let q = 0; q < g.n; q++) ops.push({ kind: 'gate', gate: 'rx', target: q, params: [2 * betas[l]] });
  }
  return ops;
}

/** <H_C> for the given parameters, exactly, from the statevector. */
export function expectation(g: Graph, gammas: readonly number[], betas: readonly number[]): number {
  const probs = run(g.n, qaoaOps(g, gammas, betas), () => 0.5).state.probabilities();
  let e = 0;
  for (let k = 0; k < probs.length; k++) e += probs[k] * cost(k, g);
  return e;
}

export const GAMMA_MAX = Math.PI;
export const BETA_MAX = Math.PI / 2;

/** <H_C> over a res x res grid of (gamma, beta) for one layer: row r is beta, column c is gamma. */
export function landscape(g: Graph, res: number): Float32Array {
  const out = new Float32Array(res * res);
  for (let r = 0; r < res; r++)
    for (let c = 0; c < res; c++) out[r * res + c] = expectation(g, [((c + 0.5) / res) * GAMMA_MAX], [((r + 0.5) / res) * BETA_MAX]);
  return out;
}

export interface OptStep {
  gammas: number[];
  betas: number[];
  energy: number;
}

/**
 * Gradient descent on <H_C>, with gradients from central differences on the
 * exact simulator (gamma appears in every edge's Rz, so the one-gate
 * parameter-shift rule would need a shift per occurrence).
 */
export function optimize(g: Graph, gammas: number[], betas: number[], steps = 60, rate = 0.08): OptStep[] {
  const path: OptStep[] = [{ gammas: gammas.slice(), betas: betas.slice(), energy: expectation(g, gammas, betas) }];
  const h = 1e-4;
  let gs = gammas.slice(), bs = betas.slice();
  for (let s = 0; s < steps; s++) {
    const grad = (vec: number[], i: number, isGamma: boolean) => {
      const plus = vec.slice(), minus = vec.slice();
      plus[i] += h;
      minus[i] -= h;
      const ep = isGamma ? expectation(g, plus, bs) : expectation(g, gs, plus);
      const em = isGamma ? expectation(g, minus, bs) : expectation(g, gs, minus);
      return (ep - em) / (2 * h);
    };
    const dg = gs.map((_, i) => grad(gs, i, true));
    const db = bs.map((_, i) => grad(bs, i, false));
    gs = gs.map((v, i) => v - rate * dg[i]);
    bs = bs.map((v, i) => v - rate * db[i]);
    path.push({ gammas: gs.slice(), betas: bs.slice(), energy: expectation(g, gs, bs) });
  }
  return path;
}

/** <H_C> / min(H_C): 1 means every shot would be a best cut. */
export const approximationRatio = (g: Graph, energy: number) => energy / bestCut(g).energy;

/** The run as a PennyLane program, in the shape of the usual QAOA exercise. */
export function toPennyLaneQaoa(g: Graph, gammas: readonly number[], betas: readonly number[]): string {
  const f = (x: number) => Number(x.toFixed(6)).toString();
  return [
    '# Exported from Entangled: QAOA for MaxCut',
    'import pennylane as qml',
    'from pennylane import numpy as np',
    '',
    `edges = [${g.edges.map(([i, j]) => `(${i}, ${j})`).join(', ')}]`,
    `n_wires = ${g.n}`,
    'dev = qml.device("default.qubit", wires=n_wires)',
    '',
    '',
    'def cost_hamiltonian(edges):',
    '    # 1/2 (Z_i Z_j - 1) per edge: each split costs minus the edges it cuts',
    '    coeffs = [0.5] * len(edges) + [-0.5 * len(edges)]',
    '    ops = [qml.Z(i) @ qml.Z(j) for i, j in edges] + [qml.Identity(0)]',
    '    return qml.Hamiltonian(coeffs, ops)',
    '',
    '',
    'def qaoa_circuit(params, edges):',
    '    for w in range(n_wires):',
    '        qml.Hadamard(wires=w)',
    '    for gamma, beta in zip(params[0], params[1]):',
    '        qml.qaoa.cost_layer(gamma, cost_hamiltonian(edges))',
    '        qml.qaoa.mixer_layer(beta, qml.qaoa.x_mixer(range(n_wires)))',
    '',
    '',
    '@qml.qnode(dev)',
    'def qaoa_expval(params, edges):',
    '    qaoa_circuit(params, edges)',
    '    return qml.expval(cost_hamiltonian(edges))',
    '',
    '',
    '@qml.qnode(dev)',
    'def qaoa_probs(params, edges):',
    '    qaoa_circuit(params, edges)',
    '    return qml.probs()',
    '',
    '',
    'def approximation_ratio(params, edges):',
    '    true_min = np.min(qml.eigvals(cost_hamiltonian(edges)))',
    '    return qaoa_expval(params, edges) / true_min',
    '',
    '',
    `# the parameters Entangled found (gammas, then betas)`,
    `params = np.array([[${gammas.map(f).join(', ')}], [${betas.map(f).join(', ')}]], requires_grad=True)`,
    'print("<H_C> =", qaoa_expval(params, edges))',
    'print("approximation ratio =", approximation_ratio(params, edges))',
    '',
    '# or optimize from here:',
    '# opt = qml.GradientDescentOptimizer(stepsize=0.1)',
    '# for _ in range(100):',
    '#     params = opt.step(lambda p: qaoa_expval(p, edges), params)',
    '',
  ].join('\n');
}
