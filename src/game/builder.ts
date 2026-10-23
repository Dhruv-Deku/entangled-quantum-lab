import { run, type Op } from '../quantum/circuit';
import type { GateName } from '../quantum/gates';
import { QState } from '../quantum/state';

/**
 * The circuit builder: a grid of time steps (columns) by qubits (rows), written
 * in standard circuit notation. Within one column, filled dots (controls) and
 * open dots (anti-controls) apply to every gate in that column, so a dot over a
 * cross is a CNOT, two dots over a cross a Toffoli, a dot and two swap marks a
 * Fredkin. Pure logic, no rendering, so it is fully tested.
 */

export type Tool =
  | 'h' | 'x' | 'y' | 'z' | 's' | 'sdg' | 't' | 'tdg' | 'sx' | 'sxdg' | 'rx' | 'ry' | 'rz'
  | 'ctrl' | 'anti' | 'target' | 'swap'
  /** Custom gates from the library, in three slots. */
  | 'g1' | 'g2' | 'g3';

/** A custom gate in a builder slot: k qubits, stored as the ops it expands to (on qubits 0..k-1). */
export interface CustomGate {
  name: string;
  n: number;
  ops: Op[];
}

/** Optional per-grid extras: angles of rotation cells, and the custom gates in the three slots. */
export interface CompileOptions {
  angles?: (number | null)[][];
  customs?: readonly (CustomGate | null)[];
}

export const CUSTOM_TOOLS = ['g1', 'g2', 'g3'] as const;
export const isCustom = (t: Tool | null): t is 'g1' | 'g2' | 'g3' => t === 'g1' || t === 'g2' || t === 'g3';

export interface ToolInfo {
  /** What the cell shows (ASCII only: the panel font has no special symbols). */
  label: string;
  /** One line for the info bar. */
  about: string;
  /** New in the builder (not on the gate dock). */
  isNew?: boolean;
}

export const TOOLS: Record<Tool, ToolInfo> = {
  h: { label: 'H', about: 'Hadamard: swaps the top and the front of the sphere. Makes and undoes superposition.' },
  x: { label: 'X', about: 'X: half turn about the front axis. Flips 0 and 1.' },
  y: { label: 'Y', about: 'Y: half turn about the side axis. Flips 0 and 1 with a phase.' },
  z: { label: 'Z', about: 'Z: half turn about the vertical axis. Flips the sign of 1.' },
  s: { label: 'S', about: 'S: quarter turn about the vertical axis. Two make a Z.' },
  sdg: { label: 'Sdg', about: 'S dagger: quarter turn the other way. Undoes S.', isNew: true },
  t: { label: 'T', about: 'T: eighth turn about the vertical axis. Two make an S.' },
  tdg: { label: 'Tdg', about: 'T dagger: eighth turn the other way. Undoes T.', isNew: true },
  sx: { label: 'SX', about: 'Square root of X: a quarter turn about the front axis. Two make an X.', isNew: true },
  sxdg: { label: 'SXdg', about: 'SX dagger: a quarter turn back about the front axis. Undoes SX.', isNew: true },
  rx: { label: 'Rx', about: 'Rx(90): quarter turn about the front axis (SX up to a global phase).', isNew: true },
  ry: { label: 'Ry', about: 'Ry(90): quarter turn about the side axis, the turn your wrist makes.' },
  rz: { label: 'Rz', about: 'Rz(90): quarter turn about the vertical axis (S up to a global phase).', isNew: true },
  ctrl: { label: 'ctrl', about: 'Control (filled dot): the other gates in this column act only when this qubit is 1.', isNew: true },
  anti: { label: 'anti', about: 'Anti-control (open dot): the column acts only when this qubit is 0.', isNew: true },
  target: { label: '+', about: 'Target (circled plus): an X that is usually controlled. Dot + plus = CNOT.', isNew: true },
  swap: { label: 'x', about: 'Swap mark: two in one column swap those qubits. Add a dot for a Fredkin.', isNew: true },
  g1: { label: 'G1', about: 'Your custom gate 1: one block across as many qubits as it has.', isNew: true },
  g2: { label: 'G2', about: 'Your custom gate 2: one block across as many qubits as it has.', isNew: true },
  g3: { label: 'G3', about: 'Your custom gate 3: one block across as many qubits as it has.', isNew: true },
};

export const ALL_TOOLS = Object.keys(TOOLS) as Tool[];
const QUARTER = Math.PI / 2;
const SINGLE: Partial<Record<Tool, { gate: GateName; params?: number[] }>> = {
  h: { gate: 'h' }, x: { gate: 'x' }, y: { gate: 'y' }, z: { gate: 'z' }, s: { gate: 's' }, sdg: { gate: 'sdg' },
  t: { gate: 't' }, tdg: { gate: 'tdg' }, sx: { gate: 'sx' }, sxdg: { gate: 'sxdg' },
  rx: { gate: 'rx', params: [QUARTER] }, ry: { gate: 'ry', params: [QUARTER] }, rz: { gate: 'rz', params: [QUARTER] },
  target: { gate: 'x' },
};

/** cells[col][row] */
export type Cells = (Tool | null)[][];

export function emptyCells(n: number, cols: number): Cells {
  return Array.from({ length: cols }, () => new Array<Tool | null>(n).fill(null));
}

export interface Compiled {
  ops: Op[];
  /** Problems a player should hear about, per column (e.g. a lone swap mark). */
  errors: string[];
  /** Columns that contain anything. */
  usedColumns: number;
}

/** Turn the grid into ops, column by column (Quirk semantics for dots). */
export function compile(cells: Cells, opts: CompileOptions = {}): Compiled {
  const ops: Op[] = [];
  const errors: string[] = [];
  let usedColumns = 0;
  cells.forEach((col, c) => {
    const rows = (t: Tool) => col.flatMap((v, r) => (v === t ? [r] : []));
    const ctrls = rows('ctrl'), antis = rows('anti'), swaps = rows('swap');
    const gates = col.flatMap((v, r) => {
      if (!v || !SINGLE[v]) return [];
      const g = { r, ...SINGLE[v]! };
      // rotation cells keep the angle they were placed with
      const a = opts.angles?.[c]?.[r];
      return [g.params && a != null ? { ...g, params: [a] } : g];
    });
    // custom gate blocks: runs of the same slot, k rows each
    const blocks: { top: number; gate: CustomGate }[] = [];
    for (let r = 0; r < col.length; r++) {
      const v = col[r];
      if (!isCustom(v)) continue;
      const gate = opts.customs?.[CUSTOM_TOOLS.indexOf(v)];
      if (!gate) {
        errors.push(`Step ${c + 1}: custom slot ${v.toUpperCase()} is empty.`);
        continue;
      }
      blocks.push({ top: r, gate });
      r += gate.n - 1;
    }
    if (col.some((v) => v)) usedColumns++;
    const controls = [...ctrls, ...antis].sort((a, b) => a - b);
    if (swaps.length && swaps.length !== 2) errors.push(`Step ${c + 1}: a swap needs exactly two marks.`);
    if (controls.length && !gates.length && !blocks.length && swaps.length !== 2) {
      errors.push(`Step ${c + 1}: a dot needs a gate in its column to control.`);
      return;
    }
    // an open dot is a filled dot with X on both sides
    const flipAnti = (): void => antis.forEach((r) => ops.push({ kind: 'gate', gate: 'x', target: r }));
    if (controls.length) flipAnti();
    for (const g of gates) {
      const op: Op = { kind: 'gate', gate: g.gate, target: g.r };
      if (g.params) op.params = g.params;
      if (controls.length) op.controls = controls;
      ops.push(op);
    }
    if (swaps.length === 2) ops.push({ kind: 'swap', a: swaps[0], b: swaps[1], ...(controls.length ? { controls } : {}) });
    for (const { top, gate } of blocks) {
      const m = (q: number) => top + q;
      const ctl = (own?: number[]) => {
        const all = [...(own ?? []).map(m), ...controls];
        return all.length ? { controls: all } : {};
      };
      for (const op of gate.ops) {
        if (op.kind === 'gate') ops.push({ ...op, target: m(op.target), ...ctl(op.controls) });
        else if (op.kind === 'swap') ops.push({ ...op, a: m(op.a), b: m(op.b), ...ctl(op.controls) });
        else if (op.kind === 'iswap' && !controls.length) ops.push({ ...op, a: m(op.a), b: m(op.b) });
        else if (op.kind === 'iswap') errors.push(`Step ${c + 1}: an iSWAP inside a custom gate cannot be controlled.`);
      }
    }
    if (controls.length) flipAnti();
  });
  return { ops, errors, usedColumns };
}

/** Run ops on one basis state. */
function apply(n: number, ops: readonly Op[], k: number): QState {
  const s = new QState(n);
  s.re[0] = 0;
  s.re[k] = 1;
  return run(n, ops, () => 0.5, s).state;
}

/** <a|b> */
function inner(a: QState, b: QState): [number, number] {
  let re = 0, im = 0;
  for (let i = 0; i < a.dim; i++) {
    re += a.re[i] * b.re[i] + a.im[i] * b.im[i];
    im += a.re[i] * b.im[i] - a.im[i] * b.re[i];
  }
  return [re, im];
}

/**
 * Do two circuits do the same thing to every input, up to one global phase?
 * Checks each basis state, and that the phase is the same for all of them.
 */
export function sameUnitary(n: number, a: readonly Op[], b: readonly Op[]): boolean {
  let phase: [number, number] | null = null;
  for (let k = 0; k < 1 << n; k++) {
    const [re, im] = inner(apply(n, a, k), apply(n, b, k));
    if (Math.abs(Math.hypot(re, im) - 1) > 1e-6) return false;
    if (!phase) phase = [re, im];
    else if (Math.abs(re - phase[0]) > 1e-6 || Math.abs(im - phase[1]) > 1e-6) return false;
  }
  return true;
}

export interface BuildChallenge {
  title: string;
  chip: string;
  qubits: number;
  /** What to build, in one or two sentences. */
  text: string;
  /** Tools on the palette for this challenge (the free build has all of them). */
  tools: Tool[];
  /** The circuit to match (as a whole gate, for every input). Free build: none. */
  target?: Op[];
  /** A reference solution; its column count is par. */
  solution?: Cells;
  /** Extra rule, e.g. "controls only on q0"; returns a message when broken. */
  rule?: (cells: Cells) => string | null;
  outro?: string;
}

const g = (gate: GateName, target: number, controls?: number[]): Op => ({ kind: 'gate', gate, target, ...(controls ? { controls } : {}) });
/** Build a solution grid from columns written top to bottom, e.g. ['ctrl', 'target']. */
const sol = (n: number, cols: (Tool | null)[][]): Cells => cols.map((c) => Array.from({ length: n }, (_, r) => c[r] ?? null));

export const BUILD_COLS = 14;
export const BUILD_ROWS = 4;

export const BUILDS: BuildChallenge[] = [
  {
    title: 'Free build',
    chip: 'Free',
    qubits: 3,
    text: 'Every tool, three qubits, no goal. Tap a tool, then tap the grid. Tap a cell again with the same tool to clear it.',
    tools: ALL_TOOLS,
  },
  {
    title: 'Z from H and X',
    chip: 'Z from HX',
    qubits: 1,
    text: 'Build a Z gate using only H and X.',
    tools: ['h', 'x'],
    target: [g('z', 0)],
    solution: sol(1, [['h'], ['x'], ['h']]),
    outro: 'H X H = Z: H swaps the X and Z axes, so it turns one flip into the other.',
  },
  {
    title: 'Root of NOT',
    chip: 'Root NOT',
    qubits: 1,
    text: 'Build an X gate using only the square-root-of-X gates.',
    tools: ['sx', 'sxdg'],
    target: [g('x', 0)],
    solution: sol(1, [['sx'], ['sx']]),
    outro: 'Two square roots of NOT make a NOT. Classical logic has no such gate.',
  },
  {
    title: 'Undo T',
    chip: 'Undo T',
    qubits: 1,
    text: 'Build T dagger (an eighth turn backwards) using only T. Think in eighths of a full turn.',
    tools: ['t'],
    target: [g('tdg', 0)],
    solution: sol(1, [['t'], ['t'], ['t'], ['t'], ['t'], ['t'], ['t']]),
    outro: 'Seven eighths forward is one eighth back: T to the seventh is T dagger.',
  },
  {
    title: 'CZ from CNOT',
    chip: 'CZ',
    qubits: 2,
    text: 'Build a controlled-Z: flip the sign of 11 only. You have H, dots and plus targets.',
    tools: ['h', 'ctrl', 'target'],
    target: [g('z', 1, [0])],
    solution: sol(2, [[null, 'h'], ['ctrl', 'target'], [null, 'h']]),
    outro: 'H on both sides of the target turns a CNOT into a CZ. Notice CZ is symmetric: either qubit can be the control.',
  },
  {
    title: 'Flip the CNOT',
    chip: 'Flip CNOT',
    qubits: 2,
    text: 'Build a CNOT with control q1 and target q0, but dots may only go on q0.',
    tools: ['h', 'ctrl', 'target'],
    target: [g('x', 0, [1])],
    rule: (cells) => (cells.some((c) => c[1] === 'ctrl') ? 'Dots may only go on q0 here.' : null),
    solution: sol(2, [['h', 'h'], ['ctrl', 'target'], ['h', 'h']]),
    outro: 'Hadamards on every wire swap the roles of control and target. Which qubit is "in charge" depends on how you look.',
  },
  {
    title: 'Open dot',
    chip: 'Open dot',
    qubits: 2,
    text: 'Flip q1 only when q0 is 0. No open dots allowed: use X, dots and plus targets.',
    tools: ['x', 'ctrl', 'target'],
    target: [g('x', 0), g('x', 1, [0]), g('x', 0)],
    solution: sol(2, [['x'], ['ctrl', 'target'], ['x']]),
    outro: 'X around a dot makes it react to 0. That is all an open dot is.',
  },
  {
    title: 'Controlled-Y',
    chip: 'CY',
    qubits: 2,
    text: 'Build a controlled-Y from a CNOT and phase gates on the target.',
    tools: ['s', 'sdg', 'ctrl', 'target'],
    target: [g('y', 1, [0])],
    solution: sol(2, [[null, 'sdg'], ['ctrl', 'target'], [null, 's']]),
    outro: 'Turning the target a quarter back and forward makes the X act like a Y.',
  },
  {
    title: 'SWAP from CNOTs',
    chip: 'SWAP',
    qubits: 2,
    text: 'Build a SWAP using nothing but dots and plus targets.',
    tools: ['ctrl', 'target'],
    target: [{ kind: 'swap', a: 0, b: 1 }],
    solution: sol(2, [['ctrl', 'target'], ['target', 'ctrl'], ['ctrl', 'target']]),
    outro: 'Three CNOTs, alternating direction. The same trick swaps two numbers with XOR.',
  },
  {
    title: 'Fredkin',
    chip: 'Fredkin',
    qubits: 3,
    text: 'Build a controlled-SWAP (q0 controls, q1 and q2 swap) without swap marks.',
    tools: ['ctrl', 'target'],
    target: [{ kind: 'swap', a: 1, b: 2, controls: [0] }],
    solution: sol(3, [[null, 'target', 'ctrl'], ['ctrl', 'ctrl', 'target'], [null, 'target', 'ctrl']]),
    outro: 'A Toffoli between two CNOTs. The Fredkin gate conserves the number of 1s: billiard balls bouncing.',
  },
  {
    title: 'Toffoli from pairs',
    chip: 'Toffoli',
    qubits: 3,
    text: 'Expert: build a Toffoli (two dots, one target) with at most one dot per step. Hint: 6 CNOTs, T and T dagger gates, and 2 H.',
    tools: ['h', 't', 'tdg', 'ctrl', 'target'],
    target: [g('x', 2, [0, 1])],
    rule: (cells) => (cells.some((c) => c.filter((v) => v === 'ctrl').length > 1) ? 'At most one dot per step: build it from two-qubit gates.' : null),
    solution: sol(3, [
      [null, null, 'h'],
      [null, 'ctrl', 'target'],
      [null, null, 'tdg'],
      ['ctrl', null, 'target'],
      [null, null, 't'],
      [null, 'ctrl', 'target'],
      [null, null, 'tdg'],
      ['ctrl', null, 'target'],
      [null, 't', 't'],
      [null, null, 'h'],
      ['ctrl', 'target', null],
      ['t', 'tdg', null],
      ['ctrl', 'target', null],
    ]),
    outro: 'This is how every real quantum computer runs a Toffoli: the T count is what makes error-corrected computing expensive.',
  },
];

export type CheckResult =
  | { status: 'free' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'wrong' }
  | { status: 'solved'; columns: number; par: number };

/** Par for a challenge: the columns its reference solution uses. */
export function parOf(ch: BuildChallenge): number {
  return ch.solution ? compile(ch.solution).usedColumns : 0;
}

/** Is the grid a solution to the challenge? */
export function check(ch: BuildChallenge, cells: Cells, opts: CompileOptions = {}): CheckResult {
  if (!ch.target) return { status: 'free' };
  const c = compile(cells, opts);
  if (!c.usedColumns) return { status: 'empty' };
  if (c.errors.length) return { status: 'error', message: c.errors[0] };
  const broken = ch.rule?.(cells);
  if (broken) return { status: 'error', message: broken };
  const used = new Set(cells.flat().filter(Boolean));
  const extra = [...used].find((t) => !ch.tools.includes(t as Tool));
  if (extra) return { status: 'error', message: `${TOOLS[extra as Tool].label} is not allowed here.` };
  if (!sameUnitary(ch.qubits, c.ops, ch.target)) return { status: 'wrong' };
  return { status: 'solved', columns: c.usedColumns, par: parOf(ch) };
}
