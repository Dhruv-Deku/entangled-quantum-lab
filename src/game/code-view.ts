import type { Op } from '../quantum/circuit';
import { toPennyLane, toQasm, toQiskit } from '../quantum/export';
import { route, RoutingError, T5, type Routed } from '../quantum/routing';

/** The code window's languages, in tab order. */
export const FORMATS = ['qiskit', 'qasm', 'pennylane', 'chip'] as const;
export type Format = (typeof FORMATS)[number];
export const FORMAT_NAMES: Record<Format, string> = { qiskit: 'Qiskit', qasm: 'OpenQASM 3', pennylane: 'PennyLane', chip: 'On chip' };

/** One line of the code window: the gate or call name is coloured, comments are dimmed. */
export interface CodeLine {
  head: string;
  rest: string;
  comment: boolean;
}

/** The full program in one language (PennyLane refuses some feed-forward; the error becomes a comment). */
export function program(format: Format, n: number, ops: readonly Op[]): string {
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
  if (format === 'qasm' || format === 'chip') {
    m = /^(c\[\d+\] = measure)(.*)$/.exec(t) ??
      /^((?:if \([^)]*\) )?(?:(?:ctrl(?:\(\d+\))?|inv) @ )*[A-Za-z_][\w]*(?:\([^)]*\))?)(.*)$/.exec(t);
  } else {
    m = /^((?:\w+ = )?[A-Za-z_][\w.]*)(.*)$/.exec(t);
  }
  return m ? { head: m[1], rest: m[2], comment: false } : { head: '', rest: t, comment: false };
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
  return program(format, n, ops)
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => splitLine(l, format));
}

/** How many pages `total` lines fill at `per` lines a page (at least one). */
export function pages(total: number, per: number): number {
  return Math.max(1, Math.ceil(total / per));
}
