import { run, type Op } from './circuit';
import type { Rng } from './measure';

/**
 * Quantum AI: a quantum neural network you can watch learn. Two qubits read
 * a point (x, y): each coordinate turns one qubit (Ry(pi x + a) and
 * Ry(pi y + b)); a CNOT entangles them; a last Ry(c) on qubit 1; and the
 * prediction is <Z> of qubit 1, from -1 to +1. Training nudges a, b, c by
 * gradient descent, with gradients from the parameter-shift rule (run the
 * circuit at each weight plus and minus a quarter turn), as on real quantum
 * hardware. XOR data (the label is the sign of x times y) needs both
 * coordinates at once: with the CNOT it learns, without it it cannot.
 */

export interface Point {
  x: number;
  y: number;
  label: 1 | -1;
}

/** XOR: four clusters, opposite corners alike, kept clear of the axes. */
export function xorData(count: number, rng: Rng): Point[] {
  const out: Point[] = [];
  while (out.length < count) {
    const x = (rng() * 2 - 1) * 0.9, y = (rng() * 2 - 1) * 0.9;
    if (Math.abs(x) < 0.15 || Math.abs(y) < 0.15) continue;
    out.push({ x, y, label: x * y > 0 ? 1 : -1 });
  }
  return out;
}

/** The circuit for one point, with weights w = [a, b, c]. */
export function circuitFor(x: number, y: number, w: readonly number[], entangle: boolean): Op[] {
  const ops: Op[] = [
    { kind: 'gate', gate: 'ry', target: 0, params: [Math.PI * x + w[0]] },
    { kind: 'gate', gate: 'ry', target: 1, params: [Math.PI * y + w[1]] },
  ];
  if (entangle) ops.push({ kind: 'gate', gate: 'x', target: 1, controls: [0] });
  ops.push({ kind: 'gate', gate: 'ry', target: 1, params: [w[2]] });
  return ops;
}

/** The network's output for a point: <Z> of qubit 1, from -1 to 1. */
export function predict(x: number, y: number, w: readonly number[], entangle: boolean): number {
  const s = run(2, circuitFor(x, y, w, entangle), () => 0.5).state;
  return 1 - 2 * s.prob1(1);
}

/** Mean squared error over the data. */
export function loss(data: readonly Point[], w: readonly number[], entangle: boolean): number {
  let sum = 0;
  for (const p of data) sum += (predict(p.x, p.y, w, entangle) - p.label) ** 2;
  return sum / data.length;
}

/** The share of points on the right side of zero. */
export function accuracy(data: readonly Point[], w: readonly number[], entangle: boolean): number {
  let right = 0;
  for (const p of data) if (Math.sign(predict(p.x, p.y, w, entangle)) === p.label) right++;
  return right / data.length;
}

/**
 * The gradient of the loss, weight by weight, by the parameter-shift rule:
 * d<Z>/dw = (<Z>(w + pi/2) - <Z>(w - pi/2)) / 2, exact for rotation gates.
 */
export function gradient(data: readonly Point[], w: readonly number[], entangle: boolean): number[] {
  return w.map((_, j) => {
    let g = 0;
    for (const p of data) {
      const up = [...w], down = [...w];
      up[j] += Math.PI / 2;
      down[j] -= Math.PI / 2;
      const df = (predict(p.x, p.y, up, entangle) - predict(p.x, p.y, down, entangle)) / 2;
      g += 2 * (predict(p.x, p.y, w, entangle) - p.label) * df;
    }
    return g / data.length;
  });
}

/** One step of gradient descent. */
export function trainStep(data: readonly Point[], w: readonly number[], entangle: boolean, rate = 0.35): number[] {
  const g = gradient(data, w, entangle);
  return w.map((v, j) => v - rate * g[j]);
}

/** Starting weights: small and random, so it begins knowing nothing. */
export function initialWeights(rng: Rng): number[] {
  return [0, 0, 0].map(() => (rng() * 2 - 1) * 0.6);
}

/** The prediction on a grid over the square (-1..1 in x and y), row by row from y = -1. */
export function field(w: readonly number[], entangle: boolean, n: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.push(predict(-1 + (2 * i) / (n - 1), -1 + (2 * j) / (n - 1), w, entangle));
  return out;
}
