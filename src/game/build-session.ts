import type { Lab } from '../lab/lab';
import { BUILD_COLS, BUILDS, check, compile, CUSTOM_TOOLS, emptyCells, isCustom, type BuildChallenge, type Cells, type CheckResult, type CompileOptions, type CustomGate, type Tool } from './builder';
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
  /** Angle new Rx, Ry and Rz cells get (steps of pi/8). */
  angle = Math.PI / 2;
  /** The angle each rotation cell was placed with: angles[col][row]. */
  angles: (number | null)[][] = this.emptyAngles();
  /** The library's custom gates in the three slots G1-G3. */
  customs: (CustomGate | null)[] = [null, null, null];
  private listeners = new Set<Listener>();

  constructor(private lab: Lab, readonly challenges: BuildChallenge[] = BUILDS) {}

  private emptyAngles(n = BUILDS[0].qubits): (number | null)[][] {
    return Array.from({ length: BUILD_COLS }, () => new Array<number | null>(n).fill(null));
  }

  private get opts(): CompileOptions {
    return { angles: this.angles, customs: this.customs };
  }

  /** Fill the custom slots (from the library); rerun the grid on the lab only while the builder is open. */
  setCustoms(gates: readonly (CustomGate | null)[], active = true): void {
    this.customs = [0, 1, 2].map((i) => gates[i] ?? null);
    if (active) this.sync();
    else this.emit();
  }

  /** Step the angle for new rotation cells by pi/8 (from -pi to pi). */
  stepAngle(dir: 1 | -1): void {
    const k = Math.round(this.angle / (Math.PI / 8)) + dir;
    this.angle = (Math.max(-8, Math.min(8, k)) * Math.PI) / 8;
    this.emit();
  }

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
    if (this.angles.length !== BUILD_COLS || this.angles[0]?.length !== ch.qubits || !cells) this.angles = this.emptyAngles(ch.qubits);
    if (!ch.tools.includes(this.tool)) this.tool = ch.tools[0];
    this.cursor = { col: 0, row: 0 };
    this.sync();
  }

  selectTool(t: Tool): void {
    if (!this.challenge.tools.includes(t)) return;
    this.tool = t;
    this.emit();
  }

  /** Put the selected tool in a cell; the same tool again clears it. A custom gate fills one row per qubit. */
  place(col: number, row: number, tool: Tool = this.tool): void {
    if (col < 0 || col >= BUILD_COLS || row < 0 || row >= this.challenge.qubits) return;
    if (!this.challenge.tools.includes(tool)) return;
    this.cursor = { col, row };
    if (isCustom(tool)) {
      const gate = this.customs[CUSTOM_TOOLS.indexOf(tool)];
      if (!gate || row + gate.n > this.challenge.qubits) return;
      const already = this.cells[col][row] === tool;
      this.erase(col, row, false);
      if (!already) for (let k = 0; k < gate.n; k++) {
        this.erase(col, row + k, false);
        this.cells[col][row + k] = tool;
      }
      this.sync();
      return;
    }
    if (isCustom(this.cells[col][row])) this.erase(col, row, false);
    this.cells[col][row] = this.cells[col][row] === tool ? null : tool;
    this.angles[col][row] = tool === 'rx' || tool === 'ry' || tool === 'rz' ? this.angle : null;
    this.sync();
  }

  /** Clear a cell (and the whole block if it is part of a custom gate). */
  erase(col = this.cursor.col, row = this.cursor.row, resync = true): void {
    if (!this.cells[col] || this.cells[col][row] === undefined) return;
    const v = this.cells[col][row];
    if (isCustom(v)) {
      // a block is a run of the same slot; clear the run
      let top = row;
      while (top > 0 && this.cells[col][top - 1] === v) top--;
      for (let r = top; r < this.cells[col].length && this.cells[col][r] === v; r++) this.cells[col][r] = null;
    } else this.cells[col][row] = null;
    this.angles[col][row] = null;
    if (resync) this.sync();
  }

  clear(): void {
    this.cells = emptyCells(this.challenge.qubits, BUILD_COLS);
    this.angles = this.emptyAngles(this.challenge.qubits);
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
    this.lab.load(ch.qubits, compile(this.cells, this.opts).ops);
    this.result = check(ch, this.cells, this.opts);
    if (this.result.status === 'solved') {
      const stars = starsFor(this.result.columns, this.result.par);
      this.best.set(this.index, Math.max(stars, this.best.get(this.index) ?? 0));
    }
    this.emit();
  }

  toJSON() {
    return { index: this.index, cells: this.cells, angles: this.angles, best: [...this.best] };
  }

  restore(data: ReturnType<BuildSession['toJSON']> | undefined): void {
    if (!data) return;
    this.best = new Map((data.best ?? []).filter(([i, s]) => i >= 0 && i < this.challenges.length && s >= 1 && s <= 3));
    this.index = Math.max(0, Math.min(this.challenges.length - 1, data.index ?? 0));
  }

  /** Cells saved with the session, to reopen the grid exactly as it was. */
  savedCells(data: ReturnType<BuildSession['toJSON']> | undefined): Cells | undefined {
    if (data?.angles) this.angles = data.angles;
    return data?.cells;
  }
}
