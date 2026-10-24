import { mixedness, pairStrength } from './entanglement';
import type { QState } from './state';

/**
 * The numbers behind the big-state views, which still read when there are too
 * many qubits for one arrow each to tell the story:
 *  - the Q-sphere: one dot per basis state, its latitude set by how many 1s it
 *    has, its size by probability and its colour by phase;
 *  - the state city: the density matrix as towers, real and imaginary parts;
 *  - the entanglement map: how strongly each pair is entangled, and how much
 *    each qubit is entangled with all the rest.
 */

export interface QPoint {
  k: number;
  label: string;
  /** number of 1s: 0 sits at the north pole, n at the south */
  weight: number;
  p: number;
  /** -pi..pi, relative to the most likely state (a global phase cannot be seen) */
  phase: number;
  /** unit sphere, y up */
  pos: [number, number, number];
}

const popcount = (k: number) => {
  let c = 0;
  for (; k; k &= k - 1) c++;
  return c;
};

export function qsphere(s: QState): QPoint[] {
  const n = s.n;
  const p = s.probabilities();
  let top = 0;
  for (let k = 1; k < s.dim; k++) if (p[k] > p[top] + 1e-12) top = k;
  const ref = Math.atan2(s.im[top], s.re[top]);
  // states in each ring, in order, so they spread evenly around it
  const rings: number[][] = Array.from({ length: n + 1 }, () => []);
  for (let k = 0; k < s.dim; k++) rings[popcount(k)].push(k);
  const out: QPoint[] = [];
  for (let w = 0; w <= n; w++) {
    const theta = (Math.PI * w) / n;
    rings[w].forEach((k, j) => {
      const phi = (2 * Math.PI * j) / rings[w].length + (w % 2 ? Math.PI / rings[w].length : 0);
      let phase = Math.atan2(s.im[k], s.re[k]) - ref;
      phase = Math.atan2(Math.sin(phase), Math.cos(phase));
      out.push({
        k,
        label: k.toString(2).padStart(n, '0'),
        weight: w,
        p: p[k],
        phase: p[k] > 1e-12 ? phase : 0,
        pos: [Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi)],
      });
    });
  }
  return out;
}

/** Phase to a hue (0 red, then round the colour wheel), muted so it reads as information rather than decoration. */
export const phaseHue = (phase: number) => ((((phase / (2 * Math.PI)) * 360) % 360) + 360) % 360;
export const phaseColor = (phase: number) => `hsl(${Math.round(phaseHue(phase))}, 58%, 64%)`;

export interface DensityLike {
  dim: number;
  re: ArrayLike<number>;
  im: ArrayLike<number>;
}

/** rho = |psi><psi| for a pure state. */
export function pureDensity(s: QState): DensityLike {
  const d = s.dim;
  const re = new Float64Array(d * d), im = new Float64Array(d * d);
  for (let i = 0; i < d; i++)
    for (let j = 0; j < d; j++) {
      re[i * d + j] = s.re[i] * s.re[j] + s.im[i] * s.im[j];
      im[i * d + j] = s.im[i] * s.re[j] - s.re[i] * s.im[j];
    }
  return { dim: d, re, im };
}

/** The tallest towers of the city, for the board's caption: diagonal entries are probabilities, the rest coherences. */
export function cityHighlights(rho: DensityLike, n: number, count = 6): { i: number; j: number; re: number; im: number; label: string }[] {
  const d = rho.dim;
  const all: { i: number; j: number; re: number; im: number; m: number }[] = [];
  for (let i = 0; i < d; i++)
    for (let j = i; j < d; j++) {
      const re = rho.re[i * d + j], im = rho.im[i * d + j];
      const m = Math.hypot(re, im);
      if (m > 1e-4) all.push({ i, j, re, im, m });
    }
  const ket = (k: number) => k.toString(2).padStart(n, '0');
  return all
    .sort((a, b) => b.m - a.m || a.i - b.i || a.j - b.j)
    .slice(0, count)
    .map(({ i, j, re, im }) => ({ i, j, re, im, label: `|${ket(i)}><${ket(j)}|` }));
}

export interface EntanglementMap {
  n: number;
  /** pair[a][b]: 0 separable .. 1 a Bell pair (symmetric, diagonal 0) */
  pair: number[][];
  /** each qubit with all the rest: 0 its own pure state .. 1 maximally entangled */
  rest: number[];
}

export function entanglementMap(s: QState): EntanglementMap {
  const n = s.n;
  const pair = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) pair[a][b] = pair[b][a] = pairStrength(s, a, b);
  return { n, pair, rest: Array.from({ length: n }, (_, q) => mixedness(s, q)) };
}

/** One or two plain sentences on what the map shows. */
export function entanglementSummary(m: EntanglementMap): string[] {
  const pairs: { a: number; b: number; v: number }[] = [];
  for (let a = 0; a < m.n; a++) for (let b = a + 1; b < m.n; b++) if (m.pair[a][b] >= 0.05) pairs.push({ a, b, v: m.pair[a][b] });
  pairs.sort((x, y) => y.v - x.v);
  const tangled = m.rest.map((v, q) => ({ q, v })).filter((x) => x.v >= 0.05);
  if (!tangled.length) return ['No entanglement: every qubit has a state of its own.'];
  const lines: string[] = [];
  if (pairs.length)
    lines.push(
      `Entangled pairs: ${pairs
        .slice(0, 4)
        .map((x) => `q${x.a}-q${x.b} ${x.v.toFixed(2)}`)
        .join(', ')}${pairs.length > 4 ? ` and ${pairs.length - 4} more` : ''}.`,
    );
  else
    lines.push(
      `No pair is entangled on its own, yet ${tangled.map((x) => `q${x.q}`).join(', ')} ${tangled.length > 1 ? 'are' : 'is'} entangled with the rest: the entanglement is shared by the whole group (like GHZ).`,
    );
  const loners = m.rest.map((v, q) => ({ q, v })).filter((x) => x.v < 0.05);
  if (loners.length && loners.length < m.n) lines.push(`${loners.map((x) => `q${x.q}`).join(', ')} ${loners.length > 1 ? 'are' : 'is'} not entangled with anything.`);
  return lines;
}

/** The order the View button steps through. */
export const STATE_VIEWS = ['qsphere', 'city', 'heatmap', 'unitary'] as const;
export type StateView = (typeof STATE_VIEWS)[number];
export const STATE_VIEW_NAMES: Record<StateView, string> = { qsphere: 'Q-sphere', city: 'State city', heatmap: 'Entanglement map', unitary: 'Circuit unitary' };
export const nextView = (v: StateView | null): StateView | null => (v === null ? STATE_VIEWS[0] : (STATE_VIEWS[STATE_VIEWS.indexOf(v) + 1] ?? null));
