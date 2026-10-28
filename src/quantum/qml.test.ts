import { describe, expect, it } from 'vitest';
import { mulberry32 } from './measure';
import { accuracy, field, gradient, initialWeights, loss, predict, trainStep, xorData } from './qml';

describe('Quantum AI: a quantum neural network', () => {
  it('reads a point as a product of the two coordinates, once entangled', () => {
    // with a = b = pi/2 and c = 0 the output is sin(pi x) sin(pi y): exactly the XOR pattern
    const w = [Math.PI / 2, Math.PI / 2, 0];
    expect(predict(0.5, 0.5, w, true)).toBeCloseTo(1, 9);
    expect(predict(0.5, -0.5, w, true)).toBeCloseTo(-1, 9);
    expect(predict(0.3, 0.7, w, true)).toBeCloseTo(Math.sin(Math.PI * 0.3) * Math.sin(Math.PI * 0.7), 9);
    // without the CNOT, qubit 1 never hears about x
    expect(predict(0.5, 0.5, w, false)).toBeCloseTo(predict(-0.5, 0.5, w, false), 9);
  });

  it('takes exact gradients by the parameter-shift rule', () => {
    const data = xorData(20, mulberry32(3));
    const w = [0.3, -0.2, 0.1];
    const g = gradient(data, w, true);
    const h = 1e-5;
    g.forEach((gj, j) => {
      const up = [...w], down = [...w];
      up[j] += h;
      down[j] -= h;
      expect(gj).toBeCloseTo((loss(data, up, true) - loss(data, down, true)) / (2 * h), 5);
    });
  });

  it('learns XOR with entanglement, and cannot without it', () => {
    const data = xorData(40, mulberry32(7));
    let w = initialWeights(mulberry32(11));
    const start = accuracy(data, w, true);
    for (let i = 0; i < 80; i++) w = trainStep(data, w, true);
    expect(accuracy(data, w, true)).toBeGreaterThanOrEqual(0.95);
    expect(loss(data, w, true)).toBeLessThan(0.5);
    expect(start).toBeLessThan(0.9);
    let v = initialWeights(mulberry32(11));
    for (let i = 0; i < 80; i++) v = trainStep(data, v, false);
    expect(accuracy(data, v, false)).toBeLessThan(0.8);
  });

  it('gives a field over the square for the picture', () => {
    const f = field([Math.PI / 2, Math.PI / 2, 0], true, 9);
    expect(f.length).toBe(81);
    expect(f[0]).toBeCloseTo(0, 9); // sin(-pi) sin(-pi) at the corner
    expect(Math.max(...f)).toBeLessThanOrEqual(1 + 1e-9);
  });
});
