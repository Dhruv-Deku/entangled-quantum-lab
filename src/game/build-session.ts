import type { Lab } from '../lab/lab';
import { BUILD_COLS, BUILDS, check, compile, emptyCells, type BuildChallenge, type Cells, type CheckResult, type Tool } from './builder';
import { starsFor } from './puzzles';

type Listener = () => void;

/**
 * One builder session: the grid being edited, the selected tool, a keyboard
 * cursor, and the current challenge. Every edit recompiles the grid and loads
 * it into the lab, so the orbs, the circuit board and the timeline always show
 * what the grid does.
 */
export class BuildSession {
  index = 0;
  cells: Cells = emptyCells(BUILDS[0].qubits, BUILD_COLS);
  tool: Tool = 'h';
  cursor = { col: 0, row: 0 };
  result: CheckResult = { status: 'free' };
  /** Best stars per challenge (free build has none). */
  best = new Map<number, number>();
  private listeners = new Set<Listener>();

  constructor(private lab: Lab, readonly challenges: BuildChallenge[] = BUILDS) {}

  get challenge(): BuildChallenge {
    return this.challenges[this.index];
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Open a challenge with an empty grid (wraps around). */
  start(i: number, cells?: Cells): void {
    const n = this.challenges.length;
    this.index = ((i % n) + n) % n;
    const ch = this.challenge;
    this.cells = cells && cells.length === BUILD_COLS && cells[0]?.length === ch.qubits ? cells : emptyCells(ch.qubits, BUILD_COLS);
    if (!ch.tools.includes(this.tool)) this.tool = ch.tools[0];
    this.cursor = { col: 0, row: 0 };
    this.sync();
  }

  selectTool(t: Tool): void {
    if (!this.challenge.tools.includes(t)) return;
    this.tool = t;
    this.emit();
  }

  /** Put the selected tool in a cell; the same tool again clears it. */
  place(col: number, row: number, tool: Tool = this.tool): void {
    if (col < 0 || col >= BUILD_COLS || row < 0 || row >= this.challenge.qubits) return;
    if (!this.challenge.tools.includes(tool)) return;
    this.cursor = { col, row };
    this.cells[col][row] = this.cells[col][row] === tool ? null : tool;
    this.sync();
  }

  erase(col = this.cursor.col, row = this.cursor.row): void {
    if (!this.cells[col] || this.cells[col][row] === undefined) return;
    this.cells[col][row] = null;
    this.sync();
  }

  clear(): void {
    this.cells = emptyCells(this.challenge.qubits, BUILD_COLS);
    this.sync();
  }

  moveCursor(dc: number, dr: number): void {
    this.cursor = {
      col: Math.max(0, Math.min(BUILD_COLS - 1, this.cursor.col + dc)),
      row: Math.max(0, Math.min(this.challenge.qubits - 1, this.cursor.row + dr)),
    };
    this.emit();
  }

  get solved(): boolean {
    return this.result.status === 'solved';
  }

  /** Recompile, run on the lab, and check the challenge. */
  private sync(): void {
    const ch = this.challenge;
    this.lab.load(ch.qubits, compile(this.cells).ops);
    this.result = check(ch, this.cells);
    if (this.result.status === 'solved') {
      const stars = starsFor(this.result.columns, this.result.par);
      this.best.set(this.index, Math.max(stars, this.best.get(this.index) ?? 0));
    }
    this.emit();
  }

  toJSON() {
    return { index: this.index, cells: this.cells, best: [...this.best] };
  }

  restore(data: ReturnType<BuildSession['toJSON']> | undefined): void {
    if (!data) return;
    this.best = new Map((data.best ?? []).filter(([i, s]) => i >= 0 && i < this.challenges.length && s >= 1 && s <= 3));
    this.index = Math.max(0, Math.min(this.challenges.length - 1, data.index ?? 0));
  }

  /** Cells saved with the session, to reopen the grid exactly as it was. */
  savedCells(data: ReturnType<BuildSession['toJSON']> | undefined): Cells | undefined {
    return data?.cells;
  }
}
