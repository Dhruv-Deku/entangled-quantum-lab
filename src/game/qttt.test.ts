import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../quantum/measure';
import { canPlace, collapse, computerCollapse, computerMove, newGame, place, placeLast, lastSquare, result, type Game } from './qttt';

const at = (g: Game) => g.board.map((m) => (m < 0 ? '.' : `${g.marks[m].player}${g.marks[m].n}`));

describe('quantum tic-tac-toe', () => {
  it('moves are spooky marks in two squares, and turns alternate', () => {
    const g = newGame();
    expect(place(g, 0, 4)).toBe('placed');
    expect(g.turn).toBe('O');
    expect(place(g, 4, 8)).toBe('placed');
    expect(g.marks.map((m) => `${m.player}${m.n}:${m.squares}`)).toEqual(['X1:0,4', 'O2:4,8']);
    expect(canPlace(g, 2, 2)).toBe(false);
  });

  it('a loop is measured: the other player chooses, and every tied mark is forced into a square', () => {
    const g = newGame();
    place(g, 0, 1); // X1
    place(g, 1, 2); // O2
    expect(place(g, 2, 0)).toBe('loop'); // X3 closes 0-1-2
    expect(g.pending).toEqual({ mark: 2, chooser: 'O' });
    expect(canPlace(g, 5, 6)).toBe(false);
    expect(collapse(g, 0)).toEqual([2, 0, 1]);
    expect(at(g).slice(0, 3)).toEqual(['X3', 'X1', 'O2']);
    expect(g.pending).toBeNull();
    // marks hanging off the loop are forced too
    const h = newGame();
    place(h, 0, 1); // X1
    place(h, 1, 5); // O2 (a branch off square 1)
    place(h, 5, 8); // X3 (further out)
    place(h, 0, 1); // O4: two marks on the same pair is a loop
    expect(h.pending?.mark).toBe(3);
    collapse(h, 1);
    expect(at(h)).toEqual(['X1', 'O4', '.', '.', '.', 'O2', '.', '.', 'X3']);
  });

  it('three in a row wins; if both rows appear in one collapse, the one finished first wins', () => {
    const g = newGame();
    // rows built from classical marks directly
    const set = (s: number, player: 'X' | 'O', n: number) => {
      g.marks.push({ player, n, squares: [s, s], at: s });
      g.board[s] = g.marks.length - 1;
    };
    set(0, 'X', 1);
    set(1, 'X', 3);
    set(2, 'X', 7);
    set(3, 'O', 2);
    set(4, 'O', 4);
    set(5, 'O', 6);
    expect(result(g)).toMatchObject({ winner: 'O', line: [3, 4, 5] });
    expect(result(g)!.note).toMatch(/finished first/);
  });

  it('the last free square takes a classical mark', () => {
    const g = newGame();
    for (let s = 0; s < 8; s++) {
      g.marks.push({ player: s % 2 ? 'O' : 'X', n: s + 1, squares: [s, s], at: s });
      g.board[s] = s;
    }
    // X O X / O X O / X O . has X on the diagonal 2-4-6 already; clear it for the test
    g.board[4] = -1;
    g.board[8] = -1;
    g.over = null;
    expect(lastSquare(g)).toBeNull();
    g.board[4] = 4;
    expect(lastSquare(g)).toBe(8);
    expect(placeLast(g, 8)).toBe(true);
    expect(g.board.every((m) => m >= 0)).toBe(true);
  });

  it('computer against computer always plays legal moves and every game ends with a consistent board', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = mulberry32(seed);
      const g = newGame();
      for (let guard = 0; guard < 40 && !g.over; guard++) {
        if (g.pending) {
          expect(collapse(g, computerCollapse(g, g.pending.chooser, rng))).not.toBeNull();
          continue;
        }
        const mv = computerMove(g, rng);
        if (typeof mv === 'number') expect(placeLast(g, mv)).toBe(true);
        else expect(place(g, mv[0], mv[1])).not.toBeNull();
      }
      expect(g.over).not.toBeNull();
      // each classical square holds a mark that really collapsed there, and no square holds two
      g.board.forEach((m, s) => {
        if (m >= 0) expect(g.marks[m].at).toBe(s);
      });
      const placed = g.marks.filter((m) => m.at !== null).map((m) => m.at);
      expect(new Set(placed).size).toBe(placed.length);
    }
  });
});
