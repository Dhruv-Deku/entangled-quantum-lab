import { run, type Op } from './circuit';
import { angleText, exact, type Exact } from './exact';
import type { GateName } from './gates';
import type { QState } from './state';

/**
 * The maths behind one step: the gate as a matrix on the qubits it touches,
 * its formula, how it sits in the whole register as a tensor product, and the
 * state in Dirac notation. Qubit 0 is the lowest bit, as in Qiskit, so a ket
 * |q2 q1 q0> lists qubit 0 last.
 *
 * Text uses a little markup the board understands: ^{...} superscript, _{...}
 * subscript. toAscii() turns any of it into plain text for the panels.
 */

export type C = [number, number];

/** Qubits an op touches, lowest first. */
export function qubitsOf(op: Op): number[] {
  const qs = op.kind === 'gate' ? [...(op.controls ?? []), op.target] : op.kind === 'swap' ? [...(op.controls ?? []), op.a, op.b] : op.kind === 'iswap' ? [op.a, op.b] : [op.qubit];
  return [...new Set(qs)].sort((a, b) => a - b);
}

function remap(op: Op, m: Map<number, number>): Op {
  const f = (q: number) => m.get(q)!;
  switch (op.kind) {
    case 'gate':
      return { ...op, condition: undefined, target: f(op.target), ...(op.controls?.length ? { controls: op.controls.map(f) } : {}) };
    case 'swap':
      return { ...op, a: f(op.a), b: f(op.b), ...(op.controls?.length ? { controls: op.controls.map(f) } : {}) };
    case 'iswap':
      return { ...op, a: f(op.a), b: f(op.b) };
    default:
      return { ...op, qubit: f(op.qubit) };
  }
}

/**
 * The op as a 2^k x 2^k matrix on the k qubits it touches (rows and columns
 * indexed with the lowest touched qubit as bit 0). A measurement gives the
 * projector onto its recorded outcome.
 */
export function localMatrix(op: Op): { qubits: number[]; m: C[][] } {
  const qubits = qubitsOf(op);
  const k = qubits.length;
  const dim = 1 << k;
  if (op.kind === 'measure' || op.kind === 'reset') {
    const o = op.outcome ?? 0;
    const m: C[][] = [[[o === 0 ? 1 : 0, 0], [0, 0]], [[0, 0], [o === 1 ? 1 : 0, 0]]];
    return { qubits, m };
  }
  const local = remap(op, new Map(qubits.map((q, i) => [q, i])));
  const m: C[][] = Array.from({ length: dim }, () => Array.from({ length: dim }, () => [0, 0] as C));
  for (let col = 0; col < dim; col++) {
    const out = run(k, [local], () => 0.5, basis(k, col)).state;
    for (let row = 0; row < dim; row++) m[row][col] = [out.re[row], out.im[row]];
  }
  return { qubits, m };
}

function basis(n: number, k: number) {
  const s = run(n, [], () => 0.5).state;
  s.re[0] = 0;
  s.re[k] = 1;
  return s;
}

/** If every non-zero entry has the same size (1/√2 for H), pull it out so the entries are simple. */
export function factor(values: C[]): { scale: number; label: Exact } | null {
  const mags = values.map(([re, im]) => Math.hypot(re, im)).filter((r) => r > 1e-9);
  if (mags.length < 2 || mags.some((r) => Math.abs(r - mags[0]) > 1e-9) || Math.abs(mags[0] - 1) < 1e-9) return null;
  const label = exact(mags[0], 0);
  return label.exact ? { scale: mags[0], label } : null;
}

const NAMES: Record<GateName, string> = {
  h: 'H', x: 'X', y: 'Y', z: 'Z', s: 'S', sdg: 'S†', t: 'T', tdg: 'T†', sx: '√X', sxdg: '√X†', rx: 'Rx', ry: 'Ry', rz: 'Rz', p: 'P', u: 'U',
};

/** Short name with its angle: H, Ry(π/4), CX, CCX, SWAP, CSWAP, M. */
export function gateName(op: Op): string {
  switch (op.kind) {
    case 'gate': {
      const c = 'C'.repeat(op.controls?.length ?? 0);
      const params = op.params?.length ? `(${op.params.map((p) => angleText(p).text).join(', ')})` : '';
      return `${c}${c && NAMES[op.gate].length > 1 ? '-' : ''}${NAMES[op.gate]}${params}`;
    }
    case 'swap':
      return `${'C'.repeat(op.controls?.length ?? 0)}SWAP`;
    case 'iswap':
      return 'iSWAP';
    case 'measure':
      return 'M';
    case 'reset':
      return 'Reset';
  }
}

/** Where the op sits in the whole register, as a tensor product written from the top qubit down: I ⊗ H ⊗ I. */
export function kronLabel(n: number, op: Op): string {
  const qs = qubitsOf(op);
  const name = op.kind === 'measure' ? `P_{${op.outcome ?? 0}}` : gateName(op);
  const lo = qs[0], hi = qs[qs.length - 1];
  if (hi - lo + 1 !== qs.length) return `${name} on ${qs.map((q) => `q${q}`).join(', ')}, I on the rest`;
  const factors: string[] = [];
  for (let q = n - 1; q >= 0; q--) {
    if (q > hi || q < lo) factors.push('I');
    else if (q === hi) factors.push(name);
  }
  return factors.join(' ⊗ ');
}

/** The textbook identity for the gate (with its angle filled in). */
export function gateFormula(op: Op): string {
  if (op.kind === 'measure') {
    const o = op.outcome ?? 0;
    return `P_{${o}} = |${o}⟩⟨${o}|,   |ψ⟩ → P_{${o}}|ψ⟩ / ‖P_{${o}}|ψ⟩‖   with probability ‖P_{${o}}|ψ⟩‖²`;
  }
  if (op.kind === 'reset') return 'Reset: measure, then flip with X if the result was 1. Not reversible.';
  if (op.kind === 'swap') return op.controls?.length ? 'Fredkin: SWAP the two targets only when the control is 1' : 'SWAP|ab⟩ = |ba⟩,   three CNOTs in a row';
  if (op.kind === 'iswap') return 'iSWAP|01⟩ = i|10⟩,   iSWAP|10⟩ = i|01⟩';
  const g = op.gate;
  const th = op.params?.[0];
  const at = th === undefined ? '' : `,   θ = ${angleText(th).text}`;
  const one: Partial<Record<GateName, string>> = {
    h: 'H = (X + Z)/√2,   H|0⟩ = |+⟩,   H|1⟩ = |−⟩',
    x: 'X = |0⟩⟨1| + |1⟩⟨0|,   a bit flip',
    y: 'Y = iXZ,   a bit flip and a phase flip',
    z: 'Z = |0⟩⟨0| − |1⟩⟨1|,   a phase flip',
    s: 'S = diag(1, i) = √Z',
    sdg: 'S† = diag(1, −i)',
    t: 'T = diag(1, e^{iπ/4}) = √S',
    tdg: 'T† = diag(1, e^{−iπ/4})',
    sx: '√X = ½(1+i) I + ½(1−i) X,   (√X)² = X',
    sxdg: '√X† = ½(1−i) I + ½(1+i) X',
    rx: `Rx(θ) = e^{−iθX/2} = cos(θ/2) I − i sin(θ/2) X${at}`,
    ry: `Ry(θ) = e^{−iθY/2} = cos(θ/2) I − i sin(θ/2) Y${at}`,
    rz: `Rz(θ) = e^{−iθZ/2} = diag(e^{−iθ/2}, e^{iθ/2})${at}`,
    p: `P(φ) = diag(1, e^{iφ}),   φ = ${angleText(th ?? 0).text}`,
    u: 'U(θ, φ, λ) = Rz(φ) Ry(θ) Rz(λ), up to a global phase',
  };
  const controls = op.controls?.length ?? 0;
  if (controls === 0) return one[g] ?? '';
  if (controls === 1) return `C-U = |0⟩⟨0|_{c} ⊗ I + |1⟩⟨1|_{c} ⊗ U,   U = ${NAMES[g]}${th === undefined ? '' : `(${angleText(th).text})`}`;
  return g === 'x' ? 'Toffoli: flip the target only when both controls are 1' : `${NAMES[g]} on the target only when every control is 1`;
}

/** The ket for basis index k on n qubits: |q_{n-1} ... q0⟩. */
export const ket = (k: number, n: number) => `|${k.toString(2).padStart(n, '0')}⟩`;

/**
 * A state in Dirac notation, biggest terms first when there are too many:
 * 1/√2 (|00⟩ + |11⟩) when the amplitudes share a size, otherwise term by term.
 */
export function dirac(state: QState, maxTerms = 6): string {
  const n = state.n;
  const terms: { k: number; c: C }[] = [];
  for (let k = 0; k < state.dim; k++) if (Math.hypot(state.re[k], state.im[k]) > 1e-6) terms.push({ k, c: [state.re[k], state.im[k]] });
  const shown = terms.length > maxTerms ? terms.slice().sort((a, b) => Math.hypot(...b.c) - Math.hypot(...a.c)).slice(0, maxTerms).sort((a, b) => a.k - b.k) : terms;
  const f = factor(terms.map((t) => t.c));
  const parts = shown.map(({ k, c }, i) => {
    const v = f ? exact(c[0] / f.scale, c[1] / f.scale).text : exact(c[0], c[1]).text;
    const coef = v === '1' ? '' : v === '-1' ? '−' : v;
    const neg = coef.startsWith('-') || coef.startsWith('−');
    const body = `${neg ? coef.slice(1) : coef}${ket(k, n)}`;
    return i === 0 ? `${neg ? '−' : ''}${body}` : `${neg ? '−' : '+'} ${body}`;
  });
  const more = terms.length > shown.length ? ` + … (${terms.length - shown.length} more)` : '';
  const sum = parts.join(' ') + more;
  return f ? `${f.label.text} (${sum})` : sum;
}

/** Plain-text version of any of the above, for the panels (their font has no maths symbols). */
export function toAscii(s: string): string {
  return s
    .replace(/\^\{([^}]*)\}/g, '^($1)')
    .replace(/_\{([^}]*)\}/g, '_$1')
    .replace(/√/g, 'sqrt')
    .replace(/⟩/g, '>')
    .replace(/⟨/g, '<')
    .replace(/⊗/g, '(x)')
    .replace(/π/g, 'pi')
    .replace(/θ/g, 'theta')
    .replace(/φ/g, 'phi')
    .replace(/λ/g, 'lambda')
    .replace(/ψ/g, 'psi')
    .replace(/½/g, '1/2')
    .replace(/[−–]/g, '-')
    .replace(/†/g, 'dg')
    .replace(/‖/g, '||')
    .replace(/²/g, '^2')
    .replace(/→/g, '->')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, '?');
}

/**
 * Euler (ZYZ) decomposition of any single-qubit gate:
 * U = e^{i alpha} Rz(phi) Ry(theta) Rz(lambda). Every one-qubit gate is three
 * rotations about two axes; this is how compilers turn any gate into the few a
 * chip can run.
 */
export function zyz(m: C[][]): { alpha: number; theta: number; phi: number; lambda: number } {
  const [[a, b], [c, d]] = m;
  // det U = e^{2 i alpha}
  const detRe = a[0] * d[0] - a[1] * d[1] - (b[0] * c[0] - b[1] * c[1]);
  const detIm = a[0] * d[1] + a[1] * d[0] - (b[0] * c[1] + b[1] * c[0]);
  const alpha = Math.atan2(detIm, detRe) / 2;
  const ca = Math.cos(-alpha), sa = Math.sin(-alpha);
  // V = e^{-i alpha} U is in SU(2): V = [[e^{-i(phi+lambda)/2} cos, -e^{-i(phi-lambda)/2} sin], [e^{i(phi-lambda)/2} sin, e^{i(phi+lambda)/2} cos]]
  const rot = ([re, im]: C): C => [re * ca - im * sa, re * sa + im * ca];
  const v10 = rot(c), v11 = rot(d);
  const theta = 2 * Math.atan2(Math.hypot(...v10), Math.hypot(...v11));
  const sum = Math.hypot(...v11) > 1e-9 ? 2 * Math.atan2(v11[1], v11[0]) : 0;
  const diff = Math.hypot(...v10) > 1e-9 ? 2 * Math.atan2(v10[1], v10[0]) : 0;
  return { alpha, theta, phi: (sum + diff) / 2, lambda: (sum - diff) / 2 };
}
