import { run, type Op } from '../quantum/circuit';
import type { GateName } from '../quantum/gates';
import { mulberry32 } from '../quantum/measure';
import { QState } from '../quantum/state';
import type { Chapter } from './chapters';
import { makePuzzle } from './puzzles';

/**
 * The daily challenge: one puzzle a day, the same for everyone. Today's date
 * seeds a random circuit; a breadth-first search over every move the player
 * has (H, X, Y, Z, S, T, CNOT, SWAP) then finds the shortest way to make the
 * same state, so par is the true minimum. Solving it keeps a streak going.
 */

/** Daily #1 was 1 October 2026. */
const FIRST_DAY = Date.UTC(2026, 9, 1);
const DAY = 86_400_000;

/** The player's calendar day, YYYY-MM-DD. */
export function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const dayIndex = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - FIRST_DAY) / DAY);
};
export const dailyNumber = (key: string) => dayIndex(key) + 1;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Every move the player can make on n qubits. */
export function movesFor(n: number): Op[] {
  const ops: Op[] = [];
  for (let q = 0; q < n; q++) for (const gate of ['h', 'x', 'y', 'z', 's', 't'] as GateName[]) ops.push({ kind: 'gate', gate, target: q });
  for (let c = 0; c < n; c++) for (let t = 0; t < n; t++) if (c !== t) ops.push({ kind: 'gate', gate: 'x', target: t, controls: [c] });
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) ops.push({ kind: 'swap', a, b });
  return ops;
}

/** A state up to global phase, as a key. */
function stateKey(s: QState): string {
  let k = 0;
  while (k < s.dim && Math.hypot(s.re[k], s.im[k]) < 1e-6) k++;
  const pr = s.re[k], pi = s.im[k], m = Math.hypot(pr, pi);
  let out = '';
  for (let i = 0; i < s.dim; i++) {
    const re = (s.re[i] * pr + s.im[i] * pi) / m, im = (s.im[i] * pr - s.re[i] * pi) / m;
    out += `${Math.round(re * 1e4)},${Math.round(im * 1e4)};`;
  }
  return out;
}

/** The shortest move sequence from |0...0> (or from `from`) to the target (up to global phase), searching up to maxDepth moves. */
export function shortestPath(n: number, target: QState, maxDepth: number, from?: QState): Op[] | null {
  const moves = movesFor(n);
  const goal = stateKey(target);
  const start = from ? from.clone() : new QState(n);
  if (stateKey(start) === goal) return [];
  const seen = new Map<string, { parent: string | null; op: Op | null }>([[stateKey(start), { parent: null, op: null }]]);
  let frontier: [string, QState][] = [[stateKey(start), start]];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: [string, QState][] = [];
    for (const [key, s] of frontier)
      for (const op of moves) {
        const t = run(n, [op], () => 0.5, s).state;
        const k = stateKey(t);
        if (seen.has(k)) continue;
        seen.set(k, { parent: key, op });
        if (k === goal) {
          const path: Op[] = [];
          for (let at: string | null = k; at; at = seen.get(at)!.parent) {
            const e = seen.get(at)!;
            if (e.op) path.unshift(e.op);
          }
          return path;
        }
        next.push([k, t]);
      }
    frontier = next;
  }
  return null;
}

export interface DailyPuzzle {
  key: string;
  number: number;
  n: number;
  /** A shortest solution: its length is par. */
  solution: Op[];
}

const touches = (ops: Op[], n: number) => {
  const q = new Set<number>();
  for (const o of ops) {
    if (o.kind === 'gate') [o.target, ...(o.controls ?? [])].forEach((x) => q.add(x));
    if (o.kind === 'swap') [o.a, o.b].forEach((x) => q.add(x));
  }
  return q.size === n;
};

/** Today's puzzle: 2 or 3 qubits, all of them used, needing 2 to 4 moves at best. */
export function dailyPuzzle(key: string): DailyPuzzle {
  const rng = mulberry32(hash(`entangled:${key}`));
  for (let attempt = 0; attempt < 50; attempt++) {
    const n = rng() < 0.5 ? 2 : 3;
    const len = 3 + Math.floor(rng() * (n === 2 ? 3 : 2));
    const moves = movesFor(n);
    const ops = Array.from({ length: len }, () => moves[Math.floor(rng() * moves.length)]);
    const target = run(n, ops, () => 0.5).state;
    const best = shortestPath(n, target, len);
    // every qubit has a part to play
    if (best && best.length >= 2 && best.length <= 4 && touches(best, n)) return { key, number: dailyNumber(key), n, solution: best };
  }
  // never reached in practice; a Bell pair is always a fair puzzle
  return { key, number: dailyNumber(key), n: 2, solution: [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 1, controls: [0] }] };
}

/** The daily puzzle as a playable chapter (it sits at the end of the Puzzles tab). */
export function dailyChapter(key = dayKey()): Chapter {
  const d = dailyPuzzle(key);
  const ch = makePuzzle({
    title: `Daily #${d.number}`,
    chip: 'Daily',
    qubits: d.n,
    solution: d.solution,
    text: `Today's challenge, the same for everyone: make the target state. Nobody can do it in fewer than ${d.solution.length} moves.`,
    keys: 'Gates by key: H X Y Z S T, C for CNOT, W for SWAP',
    outro: 'Come back tomorrow for a new one: solve one every day to keep your streak going.',
  });
  ch.daily = key;
  return ch;
}

// ---------------------------------------------------------------- streaks

export interface DailyRecord {
  /** Best result per day solved: moves used and par. */
  days: Record<string, { moves: number; par: number }>;
}

export const emptyDaily = (): DailyRecord => ({ days: {} });

/** Keep the better result for the day. */
export function recordDaily(r: DailyRecord, key: string, moves: number, par: number): DailyRecord {
  const old = r.days[key];
  if (old && old.moves <= moves) return r;
  return { days: { ...r.days, [key]: { moves, par } } };
}

const keyOf = (i: number) => new Date(FIRST_DAY + i * DAY).toISOString().slice(0, 10);

/** Days in a row solved, ending today (or yesterday, if today is still open). */
export function streak(r: DailyRecord, today: string): number {
  let i = dayIndex(today);
  if (!r.days[keyOf(i)]) i--;
  let n = 0;
  while (r.days[keyOf(i)]) {
    n++;
    i--;
  }
  return n;
}

/** The longest run ever. */
export function bestStreak(r: DailyRecord): number {
  const idx = Object.keys(r.days).map(dayIndex).sort((a, b) => a - b);
  let best = 0, run = 0;
  idx.forEach((d, i) => {
    run = i > 0 && d === idx[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

/** A line to paste anywhere. */
export function shareText(r: DailyRecord, key: string, link: string): string {
  const d = r.days[key];
  if (!d) return `Entangled daily #${dailyNumber(key)}: not solved yet. ${link}`;
  const stars = d.moves <= d.par ? 3 : d.moves <= d.par + 2 ? 2 : 1;
  const s = streak(r, key);
  return `Entangled daily #${dailyNumber(key)}: ${d.moves} move${d.moves === 1 ? '' : 's'} (par ${d.par}), ${stars} of 3 stars. Streak: ${s} day${s === 1 ? '' : 's'}. ${link}`;
}
