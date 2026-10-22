import { blochVector } from './bloch';
import { run, type Op } from './circuit';
import { gateMatrix } from './gates';
import { measureQubit, type Rng } from './measure';
import { QState } from './state';

/** Circuits and protocols used by the campaign chapters (and their tests). */

export const bellPair = (a = 0, b = 1): Op[] => [
  { kind: 'gate', gate: 'h', target: a },
  { kind: 'gate', gate: 'x', target: b, controls: [a] },
];

export const ghz = (n: number): Op[] => [
  { kind: 'gate', gate: 'h', target: 0 },
  ...Array.from({ length: n - 1 }, (_, i): Op => ({ kind: 'gate', gate: 'x', target: i + 1, controls: [i] })),
];

/**
 * Teleport the state U(theta, phi, lambda)|0> from qubit 0 to qubit 2.
 * Qubits 1 and 2 share a Bell pair; two measurements and two classical bits move the state.
 */
export function teleportation(theta: number, phi: number, lambda: number): Op[] {
  return [
    { kind: 'gate', gate: 'u', target: 0, params: [theta, phi, lambda] },
    ...bellPair(1, 2),
    { kind: 'gate', gate: 'x', target: 1, controls: [0] },
    { kind: 'gate', gate: 'h', target: 0 },
    { kind: 'measure', qubit: 0, bit: 0 },
    { kind: 'measure', qubit: 1, bit: 1 },
    { kind: 'gate', gate: 'x', target: 2, condition: { bit: 1, value: 1 } },
    { kind: 'gate', gate: 'z', target: 2, condition: { bit: 0, value: 1 } },
  ];
}

/** Fidelity of the teleported qubit 2 with the intended single-qubit state. */
export function teleportFidelity(theta: number, phi: number, lambda: number, rng: Rng): number {
  const { state } = run(3, teleportation(theta, phi, lambda), rng);
  const target = new QState(1);
  target.apply1(0, gateMatrix('u', [theta, phi, lambda]));
  // F = (1 + r_target . r_received) / 2 for a pure target state
  const a = blochVector(target, 0), b = blochVector(state, 2);
  return (1 + a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / 2;
}

/** One Grover iteration on 2 qubits; finds `marked` (0..3) with certainty. */
export function grover2(marked: number): Op[] {
  const flipZeros: Op[] = [0, 1]
    .filter((q) => !((marked >> q) & 1))
    .map((q): Op => ({ kind: 'gate', gate: 'x', target: q }));
  const hh: Op[] = [0, 1].map((q): Op => ({ kind: 'gate', gate: 'h', target: q }));
  const xx: Op[] = [0, 1].map((q): Op => ({ kind: 'gate', gate: 'x', target: q }));
  const cz: Op = { kind: 'gate', gate: 'z', target: 1, controls: [0] };
  return [...hh, ...flipZeros, cz, ...flipZeros, ...hh, ...xx, cz, ...xx, ...hh];
}

export interface BB84Result {
  sent: number;
  sifted: number;
  errors: number;
  /** Error rate on the sifted key. */
  qber: number;
}

/**
 * BB84 key exchange. Alice sends random bits in random bases; Bob measures in
 * random bases; they keep the bits where the bases matched. An intercept-resend
 * eavesdropper raises the error rate on the kept bits to about 25%.
 */
export function bb84(count: number, eavesdropper: boolean, rng: Rng): BB84Result {
  const H = gateMatrix('h'), X = gateMatrix('x');
  let sifted = 0, errors = 0;
  for (let i = 0; i < count; i++) {
    const bit = rng() < 0.5 ? 1 : 0;
    const aliceBasis = rng() < 0.5; // false = Z basis, true = X basis
    const q = new QState(1);
    if (bit) q.apply1(0, X);
    if (aliceBasis) q.apply1(0, H);
    if (eavesdropper) {
      const eveBasis = rng() < 0.5;
      if (eveBasis) q.apply1(0, H);
      const seen = measureQubit(q, 0, rng);
      q.reset();
      if (seen) q.apply1(0, X);
      if (eveBasis) q.apply1(0, H);
    }
    const bobBasis = rng() < 0.5;
    if (bobBasis) q.apply1(0, H);
    const got = measureQubit(q, 0, rng);
    if (bobBasis === aliceBasis) {
      sifted++;
      if (got !== bit) errors++;
    }
  }
  return { sent: count, sifted, errors, qber: sifted ? errors / sifted : 0 };
}
