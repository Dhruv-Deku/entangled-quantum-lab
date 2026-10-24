import { blochVector } from '../quantum/bloch';
import type { Op } from '../quantum/circuit';
import { mixedness, pairStrength } from '../quantum/entanglement';
import { gateName, qubitsOf, toAscii } from '../quantum/matrix';
import type { QState } from '../quantum/state';

/**
 * The step debugger's "why did this change?": compare the state before and
 * after one step and say what happened in plain words: which probabilities
 * moved, which qubits became (or stopped being) entangled, and when a step
 * changed only phases, which no measurement can see yet.
 */

const EPS = 1e-6;
const pct = (p: number) => (p < 0.005 && p > 0 ? '<0.01' : p.toFixed(2));
const ket = (k: number, n: number) => `|${k.toString(2).padStart(n, '0')}>`;

export function explainStep(op: Op, before: QState, after: QState): string[] {
  const n = after.n;
  const lines: string[] = [];
  const qs = qubitsOf(op);
  if (op.kind === 'measure') {
    lines.push(`Measured q${op.qubit} = ${op.outcome ?? '?'}: the state collapsed onto the outcomes that agree with it.`);
  }
  const pb = before.probabilities(), pa = after.probabilities();
  const moves = [...pa.keys()].map((k) => ({ k, d: pa[k] - pb[k] })).filter((m) => Math.abs(m.d) > 1e-4).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  let phase = false;
  for (let i = 0; i < before.dim; i++) if (Math.abs(before.re[i] - after.re[i]) > EPS || Math.abs(before.im[i] - after.im[i]) > EPS) phase = true;
  if (!moves.length) {
    if (op.kind !== 'measure') lines.push(phase ? 'The probabilities did not change: this step only shifted phases, which show up later through interference.' : 'Nothing changed: this state was already left alone by the gate.');
  } else {
    lines.push(
      moves
        .slice(0, 3)
        .map((m) => `P${ket(m.k, n)} ${pct(pb[m.k])} -> ${pct(pa[m.k])}`)
        .join(',  ') + (moves.length > 3 ? `,  and ${moves.length - 3} more` : ''),
    );
  }
  // entanglement between the qubits the step touched and everything else
  const changes: string[] = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      if (!qs.includes(a) && !qs.includes(b)) continue;
      const s0 = pairStrength(before, a, b), s1 = pairStrength(after, a, b);
      if (s0 < 0.05 && s1 >= 0.05) changes.push(`q${a} and q${b} became entangled (strength ${s1.toFixed(2)})`);
      else if (s0 >= 0.05 && s1 < 0.05)
        changes.push(
          mixedness(after, a) > 0.5 && mixedness(after, b) > 0.5
            ? `q${a} and q${b} are no longer entangled as a pair: the entanglement now spans the whole group`
            : `q${a} and q${b} are no longer entangled`,
        );
    }
  if (changes.length) lines.push(changes.slice(0, 2).join('; ') + '.');
  else {
    // otherwise, how each touched qubit's arrow moved
    const arrows = qs
      .map((q) => {
        const [x0, y0, z0] = blochVector(before, q), [x1, y1, z1] = blochVector(after, q);
        const l0 = Math.hypot(x0, y0, z0), l1 = Math.hypot(x1, y1, z1);
        if (Math.abs(l1 - l0) > 0.05) return `q${q}'s arrow ${l1 < l0 ? 'shrank' : 'grew'} to ${l1.toFixed(2)}`;
        const dot = (x0 * x1 + y0 * y1 + z0 * z1) / Math.max(EPS, l0 * l1);
        return dot < 0.999 ? `q${q}'s arrow turned ${Math.round((Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI)} degrees` : '';
      })
      .filter(Boolean);
    if (arrows.length) lines.push(arrows.join('; ') + '.');
  }
  return lines;
}

/** The headline for a step: "Step 3 of 7: CX on q0, q1". */
export const stepTitle = (op: Op | null, k: number, total: number) =>
  op ? `Step ${k} of ${total}: ${toAscii(gateName(op))} on ${qubitsOf(op).map((q) => `q${q}`).join(', ')}` : `Start (0 of ${total} steps)`;

/** Bars for the histogram: every outcome for up to 3 qubits, otherwise the 8 most likely (in order). */
export function histogram(s: QState): { label: string; p: number }[] {
  const p = s.probabilities();
  const all = [...p.keys()].map((k) => ({ k, p: p[k] }));
  const shown = s.n <= 3 ? all : all.sort((a, b) => b.p - a.p).slice(0, 8).sort((a, b) => a.k - b.k);
  return shown.map(({ k, p }) => ({ label: k.toString(2).padStart(s.n, '0'), p }));
}

/** The next breakpoint after step k (or the end). */
export const nextStop = (k: number, total: number, breakpoints: ReadonlySet<number>) => {
  for (let s = k + 1; s <= total; s++) if (breakpoints.has(s)) return s;
  return total;
};
