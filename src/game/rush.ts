import { run, type Op } from '../quantum/circuit';
import type { Rng } from '../quantum/measure';
import type { QState } from '../quantum/state';
import { movesFor, shortestPath } from './daily';

/**
 * Quantum Rush: an arcade round on two qubits. A target state appears; make
 * it on the orbs, any way you like, and the next one appears. Targets climb
 * from one gate to entangled states with phases. Points come from how many
 * moves the target needs (par), how fast it was made, and a combo multiplier
 * for solving in a row. Each solve adds a few seconds to the clock; a skip
 * costs a few and breaks the combo. Pure logic: the UI passes the time in.
 */

export const RUSH_QUBITS = 2;
export const RUSH_SECONDS = 60;
/** Seconds a solve adds, and a skip takes away. */
export const RUSH_BONUS = 3;
export const RUSH_SKIP_COST = 3;
export const RUSH_MAX_COMBO = 5;
/** A solve within this many seconds of the last keeps the combo going. */
export const RUSH_COMBO_WINDOW = 15;
/** Close enough: |<target|state>|^2 at least this. */
export const RUSH_FIDELITY = 0.995;

export interface RushTarget {
  name: string;
  /** One way to make it (its length can be more than par). */
  ops: Op[];
  /** The fewest moves that make it (H X Y Z S T CNOT SWAP). */
  par: number;
  state: QState;
  tier: number;
}

const g = (gate: 'h' | 'x' | 'y' | 'z' | 's' | 't', target: number): Op => ({ kind: 'gate', gate, target });
const cx = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });

/** Hand-picked targets, with names worth learning; the fourth tier is generated. */
const NAMED: { name: string; tier: number; ops: Op[] }[] = [
  { name: 'q0 in superposition', tier: 1, ops: [g('h', 0)] },
  { name: 'q1 in superposition', tier: 1, ops: [g('h', 1)] },
  { name: 'Flip q0', tier: 1, ops: [g('x', 0)] },
  { name: 'Flip q1', tier: 1, ops: [g('x', 1)] },
  { name: 'Both flipped', tier: 2, ops: [g('x', 0), g('x', 1)] },
  { name: 'Plus plus', tier: 2, ops: [g('h', 0), g('h', 1)] },
  { name: 'Minus on q0', tier: 2, ops: [g('x', 0), g('h', 0)] },
  { name: 'q1 to the +i pole', tier: 2, ops: [g('h', 1), g('s', 1)] },
  { name: 'Superposed and flipped', tier: 2, ops: [g('h', 0), g('x', 1)] },
  { name: 'Bell pair: |00> + |11>', tier: 3, ops: [g('h', 0), cx(0, 1)] },
  { name: 'Bell pair: |00> - |11>', tier: 3, ops: [g('h', 0), g('z', 0), cx(0, 1)] },
  { name: 'Bell pair: |01> + |10>', tier: 3, ops: [g('h', 0), g('x', 1), cx(0, 1)] },
  { name: 'Entangled the other way', tier: 3, ops: [g('h', 1), cx(1, 0)] },
  { name: 'Bell pair with a quarter turn', tier: 3, ops: [g('h', 0), g('s', 0), cx(0, 1)] },
  { name: 'Bell pair: |01> - |10>', tier: 3, ops: [g('h', 0), g('z', 0), g('x', 1), cx(0, 1)] },
];

/** Which tier comes next, from how many targets have been solved so far. */
export const tierFor = (solved: number) => (solved < 3 ? 1 : solved < 6 ? 2 : solved < 9 ? 3 : 4);

/** A random target for tier 4: three or four moves, entangled or with phases, never trivial. */
function generated(rng: Rng): { name: string; ops: Op[] } {
  const moves = movesFor(RUSH_QUBITS);
  for (;;) {
    const len = 3 + Math.floor(rng() * 2);
    const ops = Array.from({ length: len }, () => moves[Math.floor(rng() * moves.length)]);
    const s = run(RUSH_QUBITS, ops, rng).state;
    const p = s.probabilities();
    // skip anything that is still just |00>
    if (p[0] > 0.999) continue;
    return { name: 'Mystery state', ops };
  }
}

/** Make a target: the state its ops reach, and the true minimum number of moves. */
export function makeTarget(def: { name: string; ops: Op[] }, tier: number): RushTarget {
  const state = run(RUSH_QUBITS, def.ops, () => 0.5).state;
  const path = shortestPath(RUSH_QUBITS, state, def.ops.length);
  return { name: def.name, ops: def.ops, par: path ? Math.max(1, path.length) : def.ops.length, state, tier };
}

/** The next target for this many solves, avoiding the ones already shown. */
export function nextTarget(solved: number, seen: ReadonlySet<string>, rng: Rng): RushTarget {
  const tier = tierFor(solved);
  if (tier < 4) {
    const pool = NAMED.filter((t) => t.tier === tier && !seen.has(t.name));
    const from = pool.length ? pool : NAMED.filter((t) => t.tier === tier);
    return makeTarget(from[Math.floor(rng() * from.length)], tier);
  }
  return makeTarget(generated(rng), 4);
}

/** Points for a solve: 100 per par move, up to as much again for speed, times the combo. */
export function points(par: number, seconds: number, combo: number): number {
  const speed = Math.max(0, 1 - seconds / (par * 6));
  return Math.round((100 * par + 100 * par * speed) * combo);
}

/** Phases in eighths of a turn, as a sign and a factor: 1, e^(i pi/4), i, ... */
const PHASES: [string, string][] = [['+', ''], ['+', 'e^(i pi/4)'], ['+', 'i'], ['-', 'e^(-i pi/4)'], ['-', ''], ['-', 'e^(i pi/4)'], ['-', 'i'], ['+', 'e^(-i pi/4)']];

/** A state written as a ket, relative to its largest term: "|00> + i|11>", "0.92|00> - 0.38|01>". */
export function ket(s: QState): string {
  let top = 0;
  for (let k = 1; k < s.dim; k++) if (Math.hypot(s.re[k], s.im[k]) > Math.hypot(s.re[top], s.im[top]) + 1e-9) top = k;
  const ref = Math.atan2(s.im[top], s.re[top]), topMag = Math.hypot(s.re[top], s.im[top]);
  const equal = (() => {
    for (let k = 0; k < s.dim; k++) {
      const m = Math.hypot(s.re[k], s.im[k]);
      if (m > 1e-6 && Math.abs(m - topMag) > 1e-3) return false;
    }
    return true;
  })();
  const terms: string[] = [];
  for (let k = 0; k < s.dim; k++) {
    const m = Math.hypot(s.re[k], s.im[k]);
    if (m < 1e-6) continue;
    let ph = Math.atan2(s.im[k], s.re[k]) - ref;
    ph = Math.atan2(Math.sin(ph), Math.cos(ph));
    const eighth = Math.round(ph / (Math.PI / 4));
    const exact = Math.abs(ph - eighth * (Math.PI / 4)) < 1e-3;
    const mag = equal ? '' : m.toFixed(2);
    const [sign, phase] = exact ? PHASES[((eighth % 8) + 8) % 8] : ['+', `e^(${ph.toFixed(2)}i)`];
    const coef = `${mag}${phase}`;
    const label = `|${k.toString(2).padStart(s.n, '0')}>`;
    terms.push(`${terms.length ? ` ${sign} ` : sign === '-' ? '-' : ''}${coef}${label}`);
  }
  return terms.join('');
}

export interface SolveResult {
  points: number;
  combo: number;
  seconds: number;
  par: number;
}

/** One round of Quantum Rush. */
export class RushSession {
  score = 0;
  solved = 0;
  combo = 1;
  bestCombo = 1;
  target: RushTarget;
  /** When the current target appeared, and when the clock runs out (seconds, the caller's clock). */
  private shownAt: number;
  private endsAt: number;
  private lastSolve = -Infinity;
  private seen = new Set<string>();
  readonly results: SolveResult[] = [];

  constructor(
    now: number,
    private rng: Rng,
  ) {
    this.endsAt = now + RUSH_SECONDS;
    this.shownAt = now;
    this.target = nextTarget(0, this.seen, rng);
    this.seen.add(this.target.name);
  }

  timeLeft(now: number): number {
    return Math.max(0, this.endsAt - now);
  }

  over(now: number): boolean {
    return now >= this.endsAt;
  }

  /** Does this state match the target? */
  matches(s: QState): boolean {
    return s.n === RUSH_QUBITS && s.fidelity(this.target.state) >= RUSH_FIDELITY;
  }

  /** The target was made: score it, extend the clock, and bring the next one. */
  solve(now: number): SolveResult {
    const seconds = now - this.shownAt;
    this.combo = now - this.lastSolve <= RUSH_COMBO_WINDOW ? Math.min(RUSH_MAX_COMBO, this.combo + 1) : 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const r = { points: points(this.target.par, seconds, this.combo), combo: this.combo, seconds, par: this.target.par };
    this.score += r.points;
    this.solved++;
    this.results.push(r);
    this.lastSolve = now;
    this.endsAt = Math.min(now + RUSH_SECONDS, this.endsAt + RUSH_BONUS);
    this.advance(now);
    return r;
  }

  /** Give up on this target: it costs time and the combo. */
  skip(now: number): void {
    this.combo = 1;
    this.lastSolve = -Infinity;
    this.endsAt -= RUSH_SKIP_COST;
    this.advance(now);
  }

  private advance(now: number): void {
    this.target = nextTarget(this.solved, this.seen, this.rng);
    this.seen.add(this.target.name);
    this.shownAt = now;
  }
}
