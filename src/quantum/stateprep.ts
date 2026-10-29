import type { Op } from './circuit';

/**
 * State preparation: any probability distribution you can draw, turned into a
 * quantum program that loads it. This is how quantum computers take in data
 * (amplitude encoding, used in quantum machine learning and finance).
 *
 * The method (Grover and Rudolph, then Mottonen et al.): split the probability
 * between the two halves of the outcomes, qubit by qubit from the most
 * significant, each split a Ry rotation controlled by the qubits above it; and
 * build each of those "uniformly controlled" rotations from plain Ry gates and
 * CNOTs, walking the controls in Gray-code order. The result uses only Ry and
 * CNOT, so it runs on any real quantum computer: 2^n - 1 rotations and at most
 * 2^n - 2 CNOTs for n qubits, fewer once zero angles and paired CNOTs drop out.
 *
 * Index k of the distribution is the basis state |k>, qubit 0 the lowest bit.
 */

const popcount = (x: number) => {
  let n = 0;
  for (; x; x &= x - 1) n++;
  return n;
};
export const gray = (i: number) => i ^ (i >> 1);

/**
 * The plain Ry angles for a rotation of `theta[c]` on the target whenever the
 * controls read c: alpha_i = 2^-k sum_c (-1)^(c . gray(i)) theta_c.
 */
export function ucryAngles(theta: readonly number[]): number[] {
  const n = theta.length;
  return theta.map((_, i) => {
    let s = 0;
    for (let c = 0; c < n; c++) s += (popcount(c & gray(i)) % 2 ? -1 : 1) * theta[c];
    return s / n;
  });
}

/** A uniformly controlled Ry as Ry and CNOT gates; bit m of the control value is qubit `controls[m]`. */
export function ucry(theta: readonly number[], controls: readonly number[], target: number): Op[] {
  if (!controls.length) return [{ kind: 'gate', gate: 'ry', target, params: [theta[0]] }];
  const n = theta.length;
  const alpha = ucryAngles(theta);
  const ops: Op[] = [];
  for (let i = 0; i < n; i++) {
    ops.push({ kind: 'gate', gate: 'ry', target, params: [alpha[i]] });
    // the control whose Gray-code bit flips next
    const flip = gray(i) ^ gray((i + 1) % n);
    const m = Math.round(Math.log2(flip));
    ops.push({ kind: 'gate', gate: 'x', target, controls: [controls[m]] });
  }
  return ops;
}

/**
 * Drop rotations by zero; then in every run of CNOTs onto the same target
 * (they all commute) a control used an even number of times cancels out.
 * Repeat until nothing changes.
 */
export function simplifyPrep(ops: readonly Op[]): Op[] {
  const isCnot = (o: Op | undefined): o is Extract<Op, { kind: 'gate' }> => !!o && o.kind === 'gate' && o.gate === 'x' && o.controls?.length === 1;
  let out = ops.filter((o) => !(o.kind === 'gate' && o.gate === 'ry' && Math.abs(o.params?.[0] ?? 0) < 1e-12));
  for (let changed = true; changed; ) {
    changed = false;
    const next: Op[] = [];
    for (let i = 0; i < out.length; ) {
      const o = out[i];
      if (!isCnot(o)) {
        next.push(o);
        i++;
        continue;
      }
      // a run of CNOTs onto this target
      let j = i;
      const odd = new Map<number, boolean>();
      while (j < out.length && isCnot(out[j]) && (out[j] as Extract<Op, { kind: 'gate' }>).target === o.target) {
        const c = (out[j] as Extract<Op, { kind: 'gate' }>).controls![0];
        odd.set(c, !odd.get(c));
        j++;
      }
      const kept = [...odd].filter(([, v]) => v).map(([c]) => c);
      if (kept.length !== j - i) changed = true;
      for (const c of kept) next.push({ kind: 'gate', gate: 'x', target: o.target, controls: [c] });
      i = j;
    }
    out = next;
  }
  return out;
}

/** The program that prepares sum_k sqrt(p_k) |k> from |0...0>. `probs` has 2^n entries (normalised here). */
export function prepare(probs: readonly number[]): Op[] {
  const N = probs.length;
  const n = Math.round(Math.log2(N));
  if (2 ** n !== N || n < 1) throw new Error('need 2^n probabilities');
  const total = probs.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const p = probs.map((v) => Math.max(0, v) / total);
  const ops: Op[] = [];
  for (let level = 0; level < n; level++) {
    const target = n - 1 - level;
    // the qubits above the target, most significant first: control bit m is qubit n-1-m
    const controls = Array.from({ length: level }, (_, m) => n - 1 - m);
    const theta: number[] = [];
    const reachable: boolean[] = [];
    for (let c = 0; c < 2 ** level; c++) {
      let p0 = 0, p1 = 0;
      for (let k = 0; k < N; k++) {
        let match = true;
        for (let m = 0; m < level && match; m++) if (((k >> (n - 1 - m)) & 1) !== ((c >> m) & 1)) match = false;
        if (!match) continue;
        if ((k >> target) & 1) p1 += p[k];
        else p0 += p[k];
      }
      reachable.push(p0 + p1 > 0);
      theta.push(p0 + p1 > 0 ? 2 * Math.atan2(Math.sqrt(p1), Math.sqrt(p0)) : 0);
    }
    // a branch with no probability never happens: its angle is free, so copy a real one (often making the rotation uniform, with no CNOTs)
    const fill = theta[reachable.indexOf(true)] ?? 0;
    reachable.forEach((r, c) => {
      if (!r) theta[c] = fill;
    });
    ops.push(...ucry(theta, controls, target));
  }
  return simplifyPrep(ops);
}

/** How many of each gate a program uses. */
export function gateCounts(ops: readonly Op[]): { rotations: number; cnots: number } {
  let rotations = 0, cnots = 0;
  for (const o of ops) {
    if (o.kind !== 'gate') continue;
    if (o.controls?.length) cnots++;
    else rotations++;
  }
  return { rotations, cnots };
}

export type Shape = 'bell' | 'uniform' | 'twin' | 'ramp' | 'wave' | 'ghz' | 'one';
export const SHAPES: { id: Shape; name: string }[] = [
  { id: 'bell', name: 'Bell curve' },
  { id: 'twin', name: 'Two peaks' },
  { id: 'wave', name: 'Wave' },
  { id: 'ramp', name: 'Ramp' },
  { id: 'uniform', name: 'Flat' },
  { id: 'ghz', name: 'All or nothing' },
  { id: 'one', name: 'One answer' },
];

/** A ready-made shape over 2^n outcomes (not normalised). */
export function shape(id: Shape, n: number): number[] {
  const N = 2 ** n;
  const x = (k: number) => (k + 0.5) / N; // 0..1
  return Array.from({ length: N }, (_, k) => {
    switch (id) {
      case 'bell':
        return Math.exp(-(((x(k) - 0.5) / 0.18) ** 2));
      case 'twin':
        return Math.exp(-(((x(k) - 0.25) / 0.1) ** 2)) + 0.7 * Math.exp(-(((x(k) - 0.75) / 0.1) ** 2));
      case 'wave':
        return 0.15 + Math.sin(Math.PI * 2 * x(k)) ** 2;
      case 'ramp':
        return k + 1;
      case 'uniform':
        return 1;
      case 'ghz':
        return k === 0 || k === N - 1 ? 1 : 0;
      case 'one':
        return k === Math.floor(N / 3) ? 1 : 0;
    }
  });
}
