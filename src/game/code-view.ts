import type { Op } from '../quantum/circuit';
import { toPennyLane, toQasm, toQiskit } from '../quantum/export';
import { route, RoutingError, T5, type Routed } from '../quantum/routing';
import { run } from '../quantum/circuit';
import { exact } from '../quantum/exact';
import { dirac, factor, gateFormula, gateName, kronLabel, localMatrix, qubitsOf, toAscii } from '../quantum/matrix';

/** The code window's languages, in tab order. */
export const FORMATS = ['qiskit', 'qasm', 'pennylane', 'chip', 'maths'] as const;
export type Format = (typeof FORMATS)[number];
export const FORMAT_NAMES: Record<Format, string> = { qiskit: 'Qiskit', qasm: 'OpenQASM 3', pennylane: 'PennyLane', chip: 'On chip', maths: 'Maths' };

/** One line of the code window: the gate or call name is coloured, comments are dimmed. */
export interface CodeLine {
  head: string;
  rest: string;
  comment: boolean;
}

/** The full program in one language (PennyLane refuses some feed-forward; the error becomes a comment). */
export function program(format: Format, n: number, ops: readonly Op[]): string {
  if (format === 'maths') return mathsText(n, ops);
  if (format === 'chip') {
    const r = routeOrError(n, ops);
    if (typeof r === 'string') return `// ${r}`;
    const layout = r.initial.map((p, i) => `q${i}->Q${p}`).join(' ');
    return [`// Physical qubits Q0-Q4 on the T5 chip. Layout: ${layout}`, toQasm(T5.qubits, r.ops)].join('\n');
  }
  if (format === 'qasm') return toQasm(n, ops);
  if (format === 'qiskit') return toQiskit(n, ops);
  try {
    return toPennyLane(n, ops);
  } catch (err) {
    return `# PennyLane cannot express this circuit: ${(err as Error).message}`;
  }
}

/**
 * Split a line into a coloured head (qc.cx, ctrl @ x, qml.CNOT, measure) and
 * the rest (which keeps its leading space, if any). Indentation is dropped: the
 * panel font collapses spaces anyway, and the head shows where a block starts.
 */
export function splitLine(line: string, format: Format): CodeLine {
  const t = line.trim();
  if (t.startsWith('#') || t.startsWith('//')) return { head: '', rest: t, comment: true };
  let m: RegExpMatchArray | null = null;
  if (format === 'maths') {
    m = /^((?:U|\|psi>|Matrix) = )(.*)$/.exec(t);
  } else if (format === 'qasm' || format === 'chip') {
    m = /^(c\[\d+\] = measure)(.*)$/.exec(t) ??
      /^((?:if \([^)]*\) )?(?:(?:ctrl(?:\(\d+\))?|inv) @ )*[A-Za-z_][\w]*(?:\([^)]*\))?)(.*)$/.exec(t);
  } else {
    m = /^((?:\w+ = )?[A-Za-z_][\w.]*)(.*)$/.exec(t);
  }
  return m ? { head: m[1], rest: m[2], comment: false } : { head: '', rest: t, comment: false };
}

/**
 * The maths of the last step, as plain text for the panel: which gate, its
 * place in the register, its formula, its matrix row by row, and the state.
 */
export function mathsText(n: number, ops: readonly Op[]): string {
  const noRandom = () => {
    throw new Error('replay needs no randomness');
  };
  const state = run(n, ops, noRandom).state;
  if (!ops.length) return [`Step 0: no gates yet`, `|psi> = |${'0'.repeat(n)}>`, 'Each step multiplies the state by a matrix: |psi> -> U|psi>'].join('\n');
  const op = ops[ops.length - 1];
  const { m } = localMatrix(op);
  const f = factor(m.flat());
  const cells = m.map((row) => row.map(([re, im]) => (f ? exact(re / f.scale, im / f.scale) : exact(re, im)).ascii));
  const w = Math.max(...cells.flat().map((c) => c.length));
  const lines = [
    `Step ${ops.length}: ${toAscii(gateName(op))} on ${qubitsOf(op).map((q) => `q${q}`).join(', ')}`,
    `U = ${toAscii(kronLabel(n, op))}`,
    toAscii(gateFormula(op)),
    ...(f ? [`Matrix = ${f.label.ascii} *`] : ['Matrix =']),
    ...cells.map((row) => `[ ${row.map((c) => c.padStart(w)).join('  ')} ]`),
    `|psi> = ${toAscii(dirac(state, 4))}`,
  ];
  return lines.join('\n');
}

/** The circuit routed onto the T5 chip, or why it cannot be. */
export function routeOrError(n: number, ops: readonly Op[]): Routed | string {
  try {
    return route(T5, n, ops);
  } catch (err) {
    if (err instanceof RoutingError) return err.message;
    throw err;
  }
}

/** Every non-blank line of the program, split for colouring. */
export function codeLines(format: Format, n: number, ops: readonly Op[]): CodeLine[] {
  return linesOf(program(format, n, ops), format);
}

/** Any program text as code-window lines. */
export function linesOf(text: string, format: Format): CodeLine[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => splitLine(l, format));
}

/** How many pages `total` lines fill at `per` lines a page (at least one). */
export function pages(total: number, per: number): number {
  return Math.max(1, Math.ceil(total / per));
}
