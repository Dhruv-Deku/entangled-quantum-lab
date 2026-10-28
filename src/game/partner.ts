import { blochVector } from '../quantum/bloch';
import type { Op } from '../quantum/circuit';
import { pairStrength } from '../quantum/entanglement';
import type { QState } from '../quantum/state';
import { shortestPath } from './daily';

/**
 * Ket, the lab partner: a small companion beside the desk that watches what
 * you do and says what it means, in one or two plain sentences read off the
 * real state (not canned per gate). When you are stuck on a "make this state"
 * task it plans the shortest way from where you are to the goal (a search
 * over gates) and suggests the next move; and it answers spoken questions
 * about the state in front of you or the ideas behind it. All on the device.
 */

export interface Line {
  text: string;
  /** The qubit it is talking about (it points at that orb), if any. */
  point: number | null;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const label = (k: number, n: number) => `|${k.toString(2).padStart(n, '0')}>`;
const GATE_NAMES: Record<string, string> = { h: 'H', x: 'X', y: 'Y', z: 'Z', s: 'S', t: 'T', sdg: 'S dagger', tdg: 'T dagger', rx: 'Rx', ry: 'Ry', rz: 'Rz' };

/** Pairs of qubits entangled in this state (strength above a half). */
export function entangledPairs(s: QState): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a < s.n; a++) for (let b = a + 1; b < s.n; b++) if (pairStrength(s, a, b) > 0.5) out.push([a, b]);
  return out;
}

/** The likely outcomes, most likely first: "50% |00>, 50% |11>". */
export function outcomes(s: QState, max = 4): string {
  const p = s.probabilities();
  const list = Array.from(p, (v, k) => [v, k] as const).filter(([v]) => v > 0.005).sort((a, b) => b[0] - a[0]);
  const shown = list.slice(0, max).map(([v, k]) => `${pct(v)} ${label(k, s.n)}`);
  return list.length > max ? `${shown.join(', ')} and ${list.length - max} more` : shown.join(', ');
}

/** One qubit, in words: a definite 0 or 1, or a mix (and where its phase points). */
function qubitWords(s: QState, q: number): string {
  const [x, y, z] = blochVector(s, q);
  const len = Math.hypot(x, y, z);
  if (len < 0.5) return `q${q} has no state of its own: it is entangled`;
  const p1 = (1 - z / Math.max(len, 1e-9)) / 2;
  if (p1 < 0.02) return `q${q} is a sure 0`;
  if (p1 > 0.98) return `q${q} is a sure 1`;
  if (Math.abs(p1 - 0.5) < 0.02) {
    const where = Math.abs(y) > Math.abs(x) ? (y > 0 ? '+i' : '-i') : x > 0 ? '+' : '-';
    return `q${q} is half 0, half 1 (the ${where} direction)`;
  }
  return `q${q} reads 1 with ${pct(p1)} chance`;
}

/** What a step did, read off the states before and after. */
export function explainOp(op: Op, before: QState, after: QState): Line | null {
  if (op.kind === 'measure') {
    const o = op.outcome ?? 0;
    const partners: number[] = [];
    for (let q = 0; q < before.n; q++) if (q !== op.qubit && pairStrength(before, op.qubit, q) > 0.05) partners.push(q);
    if (!partners.length) return { text: `q${op.qubit} read ${o}. Measuring picks one answer, and the qubit stays there.`, point: op.qubit };
    const p = partners[0];
    const v = after.prob1(p) > 0.99 ? 1 : after.prob1(p) < 0.01 ? 0 : null;
    return { text: `q${op.qubit} read ${o}, and its partner q${p} ${v === null ? 'changed' : `became a sure ${v}`} in the same instant, with no signal between them.`, point: p };
  }
  if (op.kind === 'swap' || op.kind === 'iswap') return { text: `q${op.a} and q${op.b} traded states.`, point: op.b };
  if (op.kind !== 'gate') return null;
  const pairsBefore = entangledPairs(before).map((p) => p.join('-'));
  const fresh = entangledPairs(after).filter((p) => !pairsBefore.includes(p.join('-')));
  if (op.controls?.length) {
    const c = op.controls[0];
    if (fresh.length) {
      const [a, b] = fresh[0];
      return { text: `q${a} and q${b} are entangled now: the gold thread. Each alone is random, but they always answer together.`, point: b };
    }
    const pc = before.prob1(c);
    if (pc < 0.01) return { text: `Nothing changed: ${op.gate === 'x' ? 'CNOT' : 'a controlled gate'} only acts when q${c} is 1, and q${c} is a sure 0.`, point: c };
    if (pc > 0.99) return { text: `q${c} is a sure 1, so q${op.target} was flipped.`, point: op.target };
    return { text: `The control was undecided, so q${op.target} is now flipped in some branches and not in others.`, point: op.target };
  }
  const q = op.target;
  const g = GATE_NAMES[op.gate] ?? op.gate.toUpperCase();
  const zb = blochVector(before, q)[2], za = blochVector(after, q)[2];
  const lenA = Math.hypot(...blochVector(after, q));
  if (lenA < 0.5) return { text: `${g} acted on q${q}, which is entangled: the change shows up in the pair, not in q${q} alone.`, point: q };
  if (op.gate === 'h') {
    if (Math.abs(zb) > 0.98 && Math.abs(za) < 0.02) return { text: `H put q${q} in superposition: it will read 0 or 1, half the time each.`, point: q };
    if (Math.abs(zb) < 0.02 && Math.abs(za) > 0.98) return { text: `H brought q${q} back to a sure ${za > 0 ? 0 : 1}: the two paths interfered. That is how quantum algorithms cancel wrong answers.`, point: q };
  }
  if (op.gate === 'x' || op.gate === 'y') {
    if (Math.abs(zb) > 0.98) return { text: `${g} flipped q${q}: ${zb > 0 ? '0 became 1' : '1 became 0'}.`, point: q };
    return { text: `${g} swapped q${q}'s odds of 0 and 1.`, point: q };
  }
  if (op.gate === 'z' || op.gate === 's' || op.gate === 't' || op.gate === 'sdg' || op.gate === 'tdg' || op.gate === 'rz') {
    if (Math.abs(zb) > 0.98) return { text: `${g} changed nothing you can see: a sure 0 or 1 has no phase to turn.`, point: q };
    const turn = op.gate === 'z' ? 'half' : op.gate === 's' || op.gate === 'sdg' ? 'quarter' : op.gate === 't' || op.gate === 'tdg' ? 'eighth of a' : 'part of a';
    return { text: `${g} turned q${q}'s phase a ${turn} turn. The odds stay the same; an H next would show the difference.`, point: q };
  }
  return { text: `${g} on q${q}: ${qubitWords(after, q)}.`, point: q };
}

/** What the state is now, in a sentence or two. */
export function describeState(s: QState): Line {
  const pairs = entangledPairs(s);
  const parts = [`${s.n === 1 ? 'One qubit' : `${s.n} qubits`}: ${outcomes(s)}.`];
  if (pairs.length) parts.push(`${pairs.map(([a, b]) => `q${a} and q${b}`).join(', ')} ${pairs.length === 1 ? 'are' : 'are pairs'} entangled.`);
  else if (s.n <= 3) parts.push(Array.from({ length: s.n }, (_, q) => qubitWords(s, q)).join('; ') + '.');
  return { text: parts.join(' '), point: pairs.length ? pairs[0][1] : null };
}

/**
 * The next move toward a target state: the first step of a shortest path
 * from the current state (up to global phase), searched over H, X, Y, Z, S,
 * T, CNOT and SWAP, at most `depth` moves deep. Null if already there or too far.
 */
export function nextMove(current: QState, target: QState, depth = 4): Op | null {
  if (current.n !== target.n || current.n > 3) return null;
  if (current.fidelity(target) > 0.999) return null;
  const path = shortestPath(current.n, target, depth, current);
  return path?.[0] ?? null;
}

/** The hint for a move, as words. */
export function moveWords(op: Op): Line {
  if (op.kind === 'swap') return { text: `Try a SWAP of q${op.a} and q${op.b}.`, point: op.a };
  if (op.kind === 'gate' && op.controls?.length) return { text: `Try a CNOT: touch q${op.controls[0]} to q${op.target}, with q${op.controls[0]} in control.`, point: op.controls[0] };
  if (op.kind === 'gate') {
    const how: Record<string, string> = { h: 'spread your fingers over it, or tap H', x: 'tap X', y: 'tap Y', z: 'tap Z', s: 'tap S', t: 'tap T' };
    return { text: `Try ${GATE_NAMES[op.gate] ?? op.gate} on q${op.target}: ${how[op.gate] ?? 'from the dock'}.`, point: op.target };
  }
  return { text: 'Try measuring.', point: null };
}

// ---------------------------------------------------------------- questions

const KNOWLEDGE: [RegExp, string][] = [
  [/entangle/, 'Entangled qubits share one state: neither has an answer of its own, yet when you measure one, the other matches at once, however far apart. Touch two orbs to entangle them.'],
  [/superposition|both (at once|0 and 1)/, 'Superposition: the qubit is not secretly 0 or 1. It holds both with amplitudes, and measuring picks one, with odds set by those amplitudes.'],
  [/measur|collapse/, 'Measuring asks a qubit for 0 or 1. You get one answer, with the odds the state gives, and the state jumps to match it. Make a fist over an orb to measure.'],
  [/interfer/, 'Interference: amplitudes can add or cancel, like waves. Two H gates in a row cancel the path to 1, which is why |0> comes back.'],
  [/phase/, 'Phase is the direction of an amplitude. You cannot see it in the odds, but it decides how paths interfere: Z, S and T turn it.'],
  [/hadamard|\bh gate\b/, 'H turns a sure 0 into an even mix of 0 and 1, and back again. On the sphere it swaps the north pole with the front.'],
  [/cnot|controlled/, 'CNOT flips the target only when the control is 1. With the control in superposition, it entangles the two.'],
  [/bloch|sphere|arrow/, 'The arrow in each orb is the Bloch sphere: up is 0, down is 1, the equator is an even mix, and turning around it is phase.'],
  [/qubit/, 'A qubit is the quantum bit: two possible answers, 0 and 1, but before you look it can be any mix of the two, with a phase between them.'],
  [/decoher|noise/, 'Decoherence: a qubit slowly leaks its state into the world around it, and the superposition fades. That is why real chips sit near absolute zero.'],
  [/teleport/, 'Teleportation moves a qubit state using a shared entangled pair and two ordinary bits. The original is destroyed: nothing is copied, and nothing beats light.'],
  [/quantum computer|why (is it|are they) (faster|useful)/, 'A quantum computer is not faster at everything. It wins when interference can cancel the wrong answers, like Grover search or Shor factoring.'],
  [/spin|stern|gerlach/, 'Spin along an axis is quantised: measured, it is always up or down, never in between. The Stern-Gerlach mode shows it.'],
  [/slit|wave|particle/, 'Each photon lands as one dot, but where it may land is set by a wave through both slits. Watch which slit, and the stripes vanish.'],
];

export type Question = 'what-happened' | 'hint' | 'state' | 'topic';

/** Sort a spoken question into what is being asked. */
export function classify(text: string): Question {
  const s = text.toLowerCase();
  if (/what (just )?happened|what did (that|it|i) do|explain (that|this|it)|why did/.test(s)) return 'what-happened';
  if (/what (should|do) i do|what next|help( me)?$|^help|hint|stuck|how do i/.test(s)) return 'hint';
  if (/what('s| is) (the |my )?state|where am i|what do i have|describe/.test(s)) return 'state';
  return 'topic';
}

/** An answer about an idea (null if the question is about nothing it knows). */
export function answerTopic(text: string): Line | null {
  const s = text.toLowerCase();
  for (const [re, a] of KNOWLEDGE) if (re.test(s)) return { text: a, point: null };
  return null;
}
