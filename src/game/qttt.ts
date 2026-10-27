/**
 * Quantum tic-tac-toe (Allan Goff's rules). Each move is a "spooky" mark in
 * two squares at once: the mark is in superposition between them, and the two
 * squares are entangled. When a move closes a loop of entangled squares the
 * loop is measured: the other player chooses which of its two squares the
 * newest mark lands in, and every mark tied to it is forced into a square of
 * its own. Three classical marks in a row win; if both players get a row in
 * the same collapse, the row finished first (lower highest move number) wins.
 */

export type Player = 'X' | 'O';

export interface Mark {
  player: Player;
  /** Move number, from 1. */
  n: number;
  squares: [number, number];
  /** The square it collapsed into, or null while it is still spooky. */
  at: number | null;
}

export interface Result {
  winner: Player | null;
  line: number[] | null;
  note: string;
}

export interface Game {
  marks: Mark[];
  /** The mark (index into marks) sitting classically in each square, or -1. */
  board: number[];
  turn: Player;
  /** A move closed a loop: this mark collapses into one of its squares, chosen by `chooser`. */
  pending: { mark: number; chooser: Player } | null;
  over: Result | null;
}

export type Rng = () => number;

export const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const SQUARE_NAMES = ['top left', 'top', 'top right', 'left', 'centre', 'right', 'bottom left', 'bottom', 'bottom right'];

export const other = (p: Player): Player => (p === 'X' ? 'O' : 'X');

export function newGame(first: Player = 'X'): Game {
  return { marks: [], board: Array(9).fill(-1), turn: first, pending: null, over: null };
}

export const clone = (g: Game): Game => ({
  marks: g.marks.map((m) => ({ ...m, squares: [...m.squares] as [number, number] })),
  board: [...g.board],
  turn: g.turn,
  pending: g.pending ? { ...g.pending } : null,
  over: g.over ? { ...g.over, line: g.over.line ? [...g.over.line] : null } : null,
});

/** Squares without a classical mark. */
export const freeSquares = (g: Game): number[] => g.board.flatMap((m, s) => (m < 0 ? [s] : []));

/** The spooky marks still in a square. */
export const spookyIn = (g: Game, s: number): Mark[] => g.marks.filter((m) => m.at === null && m.squares.includes(s));

/** Are two squares already tied together through spooky marks? */
export function connected(g: Game, a: number, b: number): boolean {
  const seen = new Set([a]);
  const queue = [a];
  while (queue.length) {
    const s = queue.shift()!;
    if (s === b) return true;
    for (const m of g.marks) {
      if (m.at !== null || !m.squares.includes(s)) continue;
      const t = m.squares[0] === s ? m.squares[1] : m.squares[0];
      if (!seen.has(t)) {
        seen.add(t);
        queue.push(t);
      }
    }
  }
  return false;
}

/** Can the player to move put a spooky mark in squares a and b? */
export function canPlace(g: Game, a: number, b: number): boolean {
  return !g.over && !g.pending && a !== b && g.board[a] < 0 && g.board[b] < 0 && freeSquares(g).length > 1;
}

/** Only one square is left: the last move is an ordinary, classical mark. */
export const lastSquare = (g: Game): number | null => {
  const f = freeSquares(g);
  return !g.over && !g.pending && f.length === 1 ? f[0] : null;
};

/** Play a spooky mark. Returns 'loop' if it closed a loop (now `pending`), 'placed' otherwise, or null if illegal. */
export function place(g: Game, a: number, b: number): 'placed' | 'loop' | null {
  if (!canPlace(g, a, b)) return null;
  const loop = connected(g, a, b);
  const player = g.turn;
  g.marks.push({ player, n: g.marks.length + 1, squares: [a, b], at: null });
  g.turn = other(player);
  if (loop) {
    g.pending = { mark: g.marks.length - 1, chooser: g.turn };
    return 'loop';
  }
  return 'placed';
}

/** The last free square, classically. */
export function placeLast(g: Game, s: number): boolean {
  if (lastSquare(g) !== s) return false;
  g.marks.push({ player: g.turn, n: g.marks.length + 1, squares: [s, s], at: s });
  g.board[s] = g.marks.length - 1;
  g.turn = other(g.turn);
  g.over = result(g);
  return true;
}

/** Measure the loop: the pending mark lands in `square`, and everything tied to it follows. Returns the marks that collapsed, in order. */
export function collapse(g: Game, square: number): number[] | null {
  const p = g.pending;
  if (!p || !g.marks[p.mark].squares.includes(square)) return null;
  const order: number[] = [];
  const queue: [number, number][] = [[p.mark, square]];
  while (queue.length) {
    const [mi, s] = queue.shift()!;
    const m = g.marks[mi];
    if (m.at !== null) continue;
    m.at = s;
    g.board[s] = mi;
    order.push(mi);
    // every other spooky mark in this square is pushed out to its other square
    g.marks.forEach((k, ki) => {
      if (ki === mi || k.at !== null || !k.squares.includes(s)) return;
      queue.push([ki, k.squares[0] === s ? k.squares[1] : k.squares[0]]);
    });
  }
  g.pending = null;
  g.over = result(g);
  return order;
}

/** Who won (or a draw), once the board says so; null while the game goes on. */
export function result(g: Game): Result | null {
  const rows: { player: Player; line: number[]; max: number }[] = [];
  for (const line of LINES) {
    const ms = line.map((s) => g.board[s]);
    if (ms.some((m) => m < 0)) continue;
    const players = ms.map((m) => g.marks[m].player);
    if (players.every((p) => p === players[0])) rows.push({ player: players[0], line, max: Math.max(...ms.map((m) => g.marks[m].n)) });
  }
  if (rows.length) {
    rows.sort((a, b) => a.max - b.max);
    const best = rows[0];
    const both = rows.some((r) => r.player !== best.player);
    return { winner: best.player, line: best.line, note: both ? `Both made a row in the same collapse; ${best.player}'s was finished first (by move ${best.max}).` : `Three ${best.player}s in a row.` };
  }
  if (freeSquares(g).length === 0) return { winner: null, line: null, note: 'The board is full: a draw.' };
  // one square left and no spooky marks can change anything: the last classical move decides, so play on
  return null;
}

// ---- a computer opponent: modest, but it knows what a loop means

function score(g: Game, me: Player): number {
  if (!g.over) return 0;
  return g.over.winner === me ? 100 : g.over.winner ? -100 : 0;
}

/** The computer chooses where a loop collapses: win if it can, never hand the player a row if it can avoid it. */
export function computerCollapse(g: Game, me: Player, rng: Rng): number {
  const opts = g.marks[g.pending!.mark].squares;
  const scored = opts.map((s) => {
    const t = clone(g);
    collapse(t, s);
    return { s, v: score(t, me) + rng() };
  });
  scored.sort((a, b) => b.v - a.v);
  return scored[0].s;
}

const PREF = [2, 1, 2, 1, 3, 1, 2, 1, 2];

/** The computer's move: a pair of squares, or the last square. */
export function computerMove(g: Game, rng: Rng): [number, number] | number {
  const last = lastSquare(g);
  if (last !== null) return last;
  const me = g.turn;
  const free = freeSquares(g);
  let best: { pair: [number, number]; v: number } | null = null;
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j];
      let v = PREF[a] + PREF[b] + rng() * 2;
      if (connected(g, a, b)) {
        // a loop lets the player choose the collapse: only worth it if every choice is good for me
        const outcomes = [a, b].map((s) => {
          const t = clone(g);
          place(t, a, b);
          collapse(t, s);
          return score(t, me);
        });
        v += Math.min(...outcomes) > 0 ? 50 : Math.min(...outcomes) < 0 ? -50 : -4;
      }
      if (!best || v > best.v) best = { pair: [a, b], v };
    }
  }
  return best!.pair;
}
