import type { Op } from '../quantum/circuit';
import type { GateName } from '../quantum/gates';

/**
 * The Code Lab: write your own quantum program, in OpenQASM 3, in a headset.
 * There is no keyboard in VR, so the program is built from tokens: tap a gate
 * (h, cx, rx ...), then its qubits (q0 .. q4) and, for rotations, an angle.
 * Each statement completes itself (the semicolon, the commas) and the code
 * on the panel is always real OpenQASM you could paste into Qiskit. Run plays
 * it on the orbs a gate at a time; Step goes one line at a time.
 */

export type CodeGate = 'h' | 'x' | 'y' | 'z' | 's' | 'sdg' | 't' | 'tdg' | 'rx' | 'ry' | 'rz' | 'cx' | 'cz' | 'swap' | 'ccx' | 'measure';

export const CODE_GATES: CodeGate[] = ['h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg', 'rx', 'ry', 'rz', 'cx', 'cz', 'swap', 'ccx', 'measure'];
export const ANGLES: Record<string, number> = { pi: Math.PI, 'pi/2': Math.PI / 2, 'pi/4': Math.PI / 4, '-pi/2': -Math.PI / 2 };
export const MAX_QUBITS = 5;

/** How many qubits each gate takes, and whether it needs an angle. */
export const arity = (g: CodeGate) => (g === 'ccx' ? 3 : g === 'cx' || g === 'cz' || g === 'swap' ? 2 : 1);
export const needsAngle = (g: CodeGate) => g === 'rx' || g === 'ry' || g === 'rz';

export interface Stmt {
  gate: CodeGate;
  qubits: number[];
  angle: string | null;
}

export const complete = (s: Stmt) => s.qubits.length === arity(s.gate) && (!needsAngle(s.gate) || s.angle !== null);

/** One statement as OpenQASM 3 (an unfinished one shows _ where something is still missing). */
export function stmtText(s: Stmt): string {
  const q = (i: number) => (s.qubits[i] === undefined ? '_' : `q[${s.qubits[i]}]`);
  const args = Array.from({ length: arity(s.gate) }, (_, i) => q(i)).join(', ');
  if (s.gate === 'measure') return `c[${s.qubits[0] ?? '_'}] = measure ${q(0)};`;
  const head = needsAngle(s.gate) ? `${s.gate}(${s.angle ?? '_'})` : s.gate;
  return `${head} ${args}${complete(s) ? ';' : ''}`;
}

export const EXAMPLES: { name: string; n: number; stmts: Stmt[] }[] = [
  { name: 'Bell pair', n: 2, stmts: [{ gate: 'h', qubits: [0], angle: null }, { gate: 'cx', qubits: [0, 1], angle: null }] },
  { name: 'GHZ', n: 3, stmts: [{ gate: 'h', qubits: [0], angle: null }, { gate: 'cx', qubits: [0, 1], angle: null }, { gate: 'cx', qubits: [1, 2], angle: null }] },
  {
    name: 'Grover',
    n: 2,
    stmts: [
      { gate: 'h', qubits: [0], angle: null },
      { gate: 'h', qubits: [1], angle: null },
      { gate: 'cz', qubits: [0, 1], angle: null },
      { gate: 'h', qubits: [0], angle: null },
      { gate: 'h', qubits: [1], angle: null },
      { gate: 'x', qubits: [0], angle: null },
      { gate: 'x', qubits: [1], angle: null },
      { gate: 'cz', qubits: [0, 1], angle: null },
      { gate: 'x', qubits: [0], angle: null },
      { gate: 'x', qubits: [1], angle: null },
      { gate: 'h', qubits: [0], angle: null },
      { gate: 'h', qubits: [1], angle: null },
    ],
  },
  { name: 'Tilt and twist', n: 1, stmts: [{ gate: 'ry', qubits: [0], angle: 'pi/2' }, { gate: 'rz', qubits: [0], angle: 'pi/4' }, { gate: 's', qubits: [0], angle: null }] },
];

/** A program being written: the qubit count and its statements, with a cursor on one line. */
export class CodeProgram {
  n = 2;
  stmts: Stmt[] = [];
  /** The statement being edited (-1: before the first). */
  cursor = -1;

  get current(): Stmt | null {
    return this.stmts[this.cursor] ?? null;
  }

  /** A gate starts a new line after the cursor (or replaces the gate of an empty line). */
  gate(g: CodeGate): void {
    const cur = this.current;
    if (cur && cur.qubits.length === 0 && cur.angle === null) {
      cur.gate = g;
      return;
    }
    this.stmts.splice(this.cursor + 1, 0, { gate: g, qubits: [], angle: null });
    this.cursor++;
  }

  /** A qubit fills the line's next slot; on a finished line it repeats the gate on a new line ("h q0 q1" makes two lines). */
  qubit(q: number): string | null {
    if (q < 0 || q >= MAX_QUBITS) return 'Up to five qubits.';
    const cur = this.current;
    if (!cur) return 'Pick a gate first.';
    if (complete(cur)) {
      if (arity(cur.gate) !== 1) return 'That line is finished: pick the next gate.';
      this.stmts.splice(this.cursor + 1, 0, { gate: cur.gate, qubits: [], angle: cur.angle });
      this.cursor++;
      return this.qubit(q);
    }
    if (cur.qubits.includes(q)) return `q${q} is already on this line.`;
    cur.qubits.push(q);
    if (q + 1 > this.n) this.n = q + 1;
    return null;
  }

  angle(a: string): string | null {
    const cur = this.current;
    if (!cur || !needsAngle(cur.gate)) return 'Angles go with rx, ry and rz.';
    cur.angle = a;
    return null;
  }

  /** Remove the last thing typed on the current line, or the line itself. */
  backspace(): void {
    const cur = this.current;
    if (!cur) return;
    if (cur.qubits.length) cur.qubits.pop();
    else if (cur.angle !== null) cur.angle = null;
    else {
      this.stmts.splice(this.cursor, 1);
      this.cursor = Math.min(this.cursor, this.stmts.length - 1);
      if (this.cursor < 0 && this.stmts.length) this.cursor = 0;
    }
  }

  move(dir: 1 | -1): void {
    this.cursor = Math.max(this.stmts.length ? 0 : -1, Math.min(this.stmts.length - 1, this.cursor + dir));
  }

  clear(): void {
    this.stmts = [];
    this.cursor = -1;
    this.n = 2;
  }

  /** Change the declared qubit count (never below what the statements use). */
  setQubits(n: number): void {
    const used = Math.max(0, ...this.stmts.flatMap((s) => s.qubits.map((q) => q + 1)));
    this.n = Math.max(1, used, Math.min(MAX_QUBITS, n));
  }

  load(n: number, stmts: Stmt[]): void {
    this.n = n;
    this.stmts = stmts.map((s) => ({ ...s, qubits: [...s.qubits] }));
    this.cursor = this.stmts.length - 1;
  }

  /** The whole program as OpenQASM 3, one entry per line; `first` is the index of the first statement line. */
  lines(): { text: string[]; first: number } {
    const head = ['OPENQASM 3.0;', 'include "stdgates.inc";', `qubit[${this.n}] q;`, `bit[${this.n}] c;`];
    return { text: [...head, ...this.stmts.map(stmtText)], first: head.length };
  }

  /** The ops to run, or the first unfinished line. */
  ops(): { ops: Op[] } | { error: string; line: number } {
    const ops: Op[] = [];
    for (let i = 0; i < this.stmts.length; i++) {
      const s = this.stmts[i];
      if (!complete(s)) return { error: `Line ${i + 1} is not finished: ${stmtText(s)}`, line: i };
      ops.push(toOp(s));
    }
    return { ops };
  }
}

function toOp(s: Stmt): Op {
  const [a, b, c] = s.qubits;
  switch (s.gate) {
    case 'measure':
      return { kind: 'measure', qubit: a };
    case 'swap':
      return { kind: 'swap', a, b };
    case 'cx':
      return { kind: 'gate', gate: 'x', target: b, controls: [a] };
    case 'cz':
      return { kind: 'gate', gate: 'z', target: b, controls: [a] };
    case 'ccx':
      return { kind: 'gate', gate: 'x', target: c, controls: [a, b] };
    case 'rx':
    case 'ry':
    case 'rz':
      return { kind: 'gate', gate: s.gate, target: a, params: [ANGLES[s.angle ?? 'pi']] };
    default:
      return { kind: 'gate', gate: s.gate as GateName, target: a };
  }
}

/** Turn a circuit from the orbs into statements (gates the Code Lab has no token for are left out). */
export function fromOps(ops: readonly Op[]): { stmts: Stmt[]; skipped: number } {
  const stmts: Stmt[] = [];
  let skipped = 0;
  const angleName = (v: number) => Object.entries(ANGLES).find(([, x]) => Math.abs(x - v) < 1e-9)?.[0] ?? null;
  for (const op of ops) {
    if (op.kind === 'measure') stmts.push({ gate: 'measure', qubits: [op.qubit], angle: null });
    else if (op.kind === 'swap' && !op.controls?.length) stmts.push({ gate: 'swap', qubits: [op.a, op.b], angle: null });
    else if (op.kind === 'gate' && !op.condition) {
      const c = op.controls ?? [];
      if (c.length === 1 && op.gate === 'x') stmts.push({ gate: 'cx', qubits: [c[0], op.target], angle: null });
      else if (c.length === 1 && op.gate === 'z') stmts.push({ gate: 'cz', qubits: [c[0], op.target], angle: null });
      else if (c.length === 2 && op.gate === 'x') stmts.push({ gate: 'ccx', qubits: [c[0], c[1], op.target], angle: null });
      else if (!c.length && (CODE_GATES as string[]).includes(op.gate) && !needsAngle(op.gate as CodeGate)) stmts.push({ gate: op.gate as CodeGate, qubits: [op.target], angle: null });
      else if (!c.length && needsAngle(op.gate as CodeGate) && op.params && angleName(op.params[0])) stmts.push({ gate: op.gate as CodeGate, qubits: [op.target], angle: angleName(op.params[0]) });
      else skipped++;
    } else skipped++;
  }
  return { stmts, skipped };
}
