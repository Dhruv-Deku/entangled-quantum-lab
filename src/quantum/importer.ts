import type { Op } from './circuit';
import type { GateName } from './gates';

/**
 * Import a circuit from text: OpenQASM 2 or 3, or Qiskit Python. It reads the
 * same subset the exporters write (and the common hand-written forms): the
 * standard gates, controlled versions (cx, ccx, cp, ctrl @, ...), swaps,
 * measurements, resets and classical conditions. Anything else is reported
 * with its line number rather than silently skipped.
 */

export interface Imported {
  n: number;
  ops: Op[];
  format: 'qasm' | 'qiskit';
}

export class ImportError extends Error {}

export const MAX_IMPORT_QUBITS = 5;

const ONE: Record<string, { gate: GateName; params: number }> = {
  h: { gate: 'h', params: 0 }, x: { gate: 'x', params: 0 }, y: { gate: 'y', params: 0 }, z: { gate: 'z', params: 0 },
  s: { gate: 's', params: 0 }, sdg: { gate: 'sdg', params: 0 }, t: { gate: 't', params: 0 }, tdg: { gate: 'tdg', params: 0 },
  sx: { gate: 'sx', params: 0 }, sxdg: { gate: 'sxdg', params: 0 },
  rx: { gate: 'rx', params: 1 }, ry: { gate: 'ry', params: 1 }, rz: { gate: 'rz', params: 1 },
  p: { gate: 'p', params: 1 }, u1: { gate: 'p', params: 1 }, phase: { gate: 'p', params: 1 },
  u: { gate: 'u', params: 3 }, u3: { gate: 'u', params: 3 },
};

/** Evaluate an angle like pi/4, -3*pi/2, 0.5, 2*pi/3 + 0.1 (numbers, pi, + - * / and brackets). */
export function angle(expr: string): number {
  const src = expr.replace(/\s+/g, '').replace(/π/g, 'pi');
  let i = 0;
  const peek = () => src[i];
  const num = (): number => {
    if (peek() === '(') {
      i++;
      const v = sum();
      if (src[i++] !== ')') throw new ImportError(`bad angle "${expr}"`);
      return v;
    }
    if (peek() === '-') {
      i++;
      return -num();
    }
    if (peek() === '+') {
      i++;
      return num();
    }
    if (src.startsWith('pi', i)) {
      i += 2;
      return Math.PI;
    }
    if (src.startsWith('np.pi', i)) {
      i += 5;
      return Math.PI;
    }
    if (src.startsWith('tau', i)) {
      i += 3;
      return 2 * Math.PI;
    }
    const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i));
    if (!m) throw new ImportError(`bad angle "${expr}"`);
    i += m[0].length;
    return Number(m[0]);
  };
  const product = (): number => {
    let v = num();
    while (peek() === '*' || peek() === '/') v = src[i++] === '*' ? v * num() : v / num();
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (peek() === '+' || peek() === '-') v = src[i++] === '+' ? v + product() : v - product();
    return v;
  };
  const v = sum();
  if (i !== src.length || !Number.isFinite(v)) throw new ImportError(`bad angle "${expr}"`);
  return v;
}

/** Split "a, b(c, d), e" at top-level commas. */
function args(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** A gate with some controls, as an op (any number of controls on any of the standard gates). */
function gateOp(name: string, params: number[], qubits: number[], line: number): Op {
  if (name === 'swap') {
    if (qubits.length < 2) throw new ImportError(`line ${line}: swap needs two qubits`);
    const controls = qubits.slice(0, -2);
    return { kind: 'swap', a: qubits[qubits.length - 2], b: qubits[qubits.length - 1], ...(controls.length ? { controls } : {}) };
  }
  if (name === 'iswap') return { kind: 'iswap', a: qubits[0], b: qubits[1] };
  const g = ONE[name];
  if (!g) throw new ImportError(`line ${line}: unknown gate "${name}"`);
  if (params.length !== g.params) throw new ImportError(`line ${line}: ${name} takes ${g.params} angle${g.params === 1 ? '' : 's'}`);
  const controls = qubits.slice(0, -1);
  if (new Set(qubits).size !== qubits.length) throw new ImportError(`line ${line}: a qubit appears twice`);
  return { kind: 'gate', gate: g.gate, target: qubits[qubits.length - 1], ...(controls.length ? { controls } : {}), ...(params.length ? { params } : {}) };
}

/** cx -> (x, 1 control), ccx -> (x, 2), cp -> (p, 1), cswap -> (swap, 1), ... */
function unwrapControls(name: string): { base: string; controls: number } {
  for (const special of ['cswap', 'ccx', 'ccz']) {
    if (name === special) return special === 'cswap' ? { base: 'swap', controls: 1 } : { base: special.slice(2), controls: 2 };
  }
  if (name === 'mcx') return { base: 'x', controls: -1 };
  if (name.startsWith('c') && name.length > 1 && (ONE[name.slice(1)] || name.slice(1) === 'swap')) return { base: name.slice(1), controls: 1 };
  if (name === 'cu1') return { base: 'p', controls: 1 };
  return { base: name, controls: 0 };
}

export function parseQasm(text: string): Imported {
  let n = 0;
  const regs = new Map<string, { offset: number; size: number }>();
  const ops: Op[] = [];
  const statements = text
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';');
  let lineNo = 0;
  const qref = (ref: string, line: number): number[] => {
    const t = ref.trim();
    const phys = /^\$(\d+)$/.exec(t);
    if (phys) return [Number(phys[1])];
    const m = /^([A-Za-z_]\w*)(?:\[(\d+)\])?$/.exec(t);
    if (!m) throw new ImportError(`line ${line}: bad qubit "${ref}"`);
    const reg = regs.get(m[1]);
    if (!reg) throw new ImportError(`line ${line}: unknown register "${m[1]}"`);
    if (m[2] === undefined) return [...Array(reg.size).keys()].map((k) => reg.offset + k);
    const k = Number(m[2]);
    if (k >= reg.size) throw new ImportError(`line ${line}: ${m[1]}[${k}] is out of range`);
    return [reg.offset + k];
  };
  const bitIndex = (ref: string): number => {
    const m = /\[(\d+)\]/.exec(ref);
    return m ? Number(m[1]) : 0;
  };
  for (const raw of statements) {
    lineNo += (raw.match(/\n/g) ?? []).length;
    let st = raw.trim();
    if (!st) continue;
    const line = lineNo + 1;
    if (/^(OPENQASM|include|bit\b|creg\b|barrier\b|gate\b)/.test(st)) continue;
    let m: RegExpExecArray | null;
    if ((m = /^qubit(?:\[(\d+)\])?\s+([A-Za-z_]\w*)$/.exec(st)) || (m = /^qreg\s+([A-Za-z_]\w*)\[(\d+)\]$/.exec(st))) {
      const [name, size] = st.startsWith('qreg') ? [m[1], Number(m[2])] : [m[2], Number(m[1] ?? 1)];
      regs.set(name, { offset: n, size });
      n += size;
      continue;
    }
    // classical condition: if (c[0] == 1) or if (c[0] == true) or OpenQASM 2's if(c==1)
    let condition: { bit: number; value: 0 | 1 } | undefined;
    if ((m = /^if\s*\(\s*([^=)]+?)\s*==\s*(\w+)\s*\)\s*(.*)$/s.exec(st))) {
      const v = m[2] === 'true' ? 1 : m[2] === 'false' ? 0 : Number(m[2]);
      if (v !== 0 && v !== 1) throw new ImportError(`line ${line}: only single-bit conditions are supported`);
      condition = { bit: bitIndex(m[1]), value: v as 0 | 1 };
      st = m[3].trim();
    }
    if ((m = /^(?:([^=]+?)\s*=\s*)?measure\s+(\S+?)(?:\s*->\s*(\S+))?$/.exec(st))) {
      const qs = qref(m[2], line);
      const target = m[1] ?? m[3];
      // one qubit into a named bit, or a whole register bit for bit
      for (const q of qs) ops.push({ kind: 'measure', qubit: q, bit: qs.length === 1 && target ? bitIndex(target) : q });
      continue;
    }
    if ((m = /^reset\s+(\S+)$/.exec(st))) {
      qref(m[1], line).forEach((q) => ops.push({ kind: 'reset', qubit: q }));
      continue;
    }
    // modifiers: ctrl @, ctrl(2) @, inv @
    let controls = 0, inv = false;
    while ((m = /^(ctrl(?:\((\d+)\))?|inv)\s*@\s*(.*)$/s.exec(st))) {
      if (m[1] === 'inv') inv = !inv;
      else controls += m[2] ? Number(m[2]) : 1;
      st = m[3].trim();
    }
    m = /^([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s+(.+)$/s.exec(st);
    if (!m) throw new ImportError(`line ${line}: cannot read "${st.slice(0, 40)}"`);
    const name = m[1].toLowerCase();
    const params = m[2] ? args(m[2]).map(angle) : [];
    const qubits = args(m[3]).flatMap((r) => qref(r, line));
    const { base, controls: extra } = unwrapControls(name);
    let gate = base;
    let ps = params;
    if (inv) {
      if (gate === 'sx') gate = 'sxdg';
      else if (gate === 's') gate = 'sdg';
      else if (gate === 't') gate = 'tdg';
      else if (['rx', 'ry', 'rz', 'p'].includes(gate)) ps = ps.map((v) => -v);
      else if (!['h', 'x', 'y', 'z', 'swap'].includes(gate)) throw new ImportError(`line ${line}: inv @ ${gate} is not supported`);
    }
    if (extra >= 0) {
      const want = (gate === 'swap' || gate === 'iswap' ? 2 : 1) + controls + extra;
      if (qubits.length !== want) throw new ImportError(`line ${line}: ${name} needs ${want} qubit${want === 1 ? '' : 's'}, got ${qubits.length}`);
    }
    const op = gateOp(gate, ps, qubits, line);
    if (condition) {
      if (op.kind !== 'gate') throw new ImportError(`line ${line}: only gates can be conditioned`);
      op.condition = condition;
    }
    ops.push(op);
  }
  return finish(n, ops, 'qasm');
}

export function parseQiskit(text: string): Imported {
  let n = 0;
  const ops: Op[] = [];
  const lines = text.split('\n');
  let pendingCondition: { bit: number; value: 0 | 1 } | undefined;
  let condIndent = -1;
  lines.forEach((rawLine, idx) => {
    const line = idx + 1;
    const indent = rawLine.length - rawLine.trimStart().length;
    const st = rawLine.replace(/#.*$/, '').trim();
    if (!st) return;
    if (pendingCondition && indent <= condIndent) pendingCondition = undefined;
    let m: RegExpExecArray | null;
    if ((m = /QuantumCircuit\(\s*(\d+)/.exec(st))) {
      n = Number(m[1]);
      return;
    }
    if ((m = /^with\s+\w+\.if_test\(\s*\(\s*\w+\.clbits\[(\d+)\]\s*,\s*(\d|True|False)\s*\)\s*\)\s*:$/.exec(st))) {
      pendingCondition = { bit: Number(m[1]), value: m[2] === '1' || m[2] === 'True' ? 1 : 0 };
      condIndent = indent;
      return;
    }
    if (!/^\w+\.\w+\(/.test(st)) return; // imports, prints and the like
    m = /^\w+\.(\w+)\((.*)\)$/.exec(st);
    if (!m) throw new ImportError(`line ${line}: cannot read "${st.slice(0, 40)}"`);
    const method = m[1].toLowerCase();
    const a = args(m[2]);
    if (method === 'measure') {
      ops.push({ kind: 'measure', qubit: Number(a[0]), bit: Number(a[1] ?? a[0]) });
      return;
    }
    if (method === 'measure_all') {
      for (let q = 0; q < n; q++) ops.push({ kind: 'measure', qubit: q, bit: q });
      return;
    }
    if (method === 'reset') {
      ops.push({ kind: 'reset', qubit: Number(a[0]) });
      return;
    }
    if (method === 'barrier' || method === 'draw') return;
    if (method === 'mcx') {
      const controls = JSON.parse(a[0].replace(/\(/g, '[').replace(/\)/g, ']')) as number[];
      ops.push({ kind: 'gate', gate: 'x', target: Number(a[1]), controls });
      return;
    }
    if (method === 'append') {
      // qc.append(library.RYGate(pi/4).control(2), [0, 1, 2]), as the exporter writes multi-controlled gates
      const g = /^library\.(\w+?)Gate\(([^)]*)\)(?:\.control\((\d+)\))?$/.exec(a[0] ?? '');
      const qs = /^\[(.*)\]$/.exec(a[1] ?? '');
      if (!g || !qs) throw new ImportError(`line ${line}: only qc.append(library.<Gate>(...).control(k), [...]) is supported`);
      const cls = g[1].toLowerCase();
      const base = cls === 'phase' ? 'p' : cls;
      const qubits = args(qs[1]).map(Number);
      const params = g[2] ? args(g[2]).map(angle) : [];
      const op = gateOp(base, params, qubits, line);
      if (pendingCondition && op.kind === 'gate') op.condition = pendingCondition;
      ops.push(op);
      return;
    }
    const { base, controls } = unwrapControls(method);
    const isSwap = base === 'swap' || base === 'iswap';
    const nParams = isSwap ? 0 : ONE[base]?.params ?? 0;
    if (!isSwap && !ONE[base]) throw new ImportError(`line ${line}: unknown gate qc.${method}`);
    const params = a.slice(0, nParams).map(angle);
    const qubits = a.slice(nParams).map((s) => {
      const v = Number(s);
      if (!Number.isInteger(v)) throw new ImportError(`line ${line}: bad qubit "${s}"`);
      return v;
    });
    if (qubits.length !== controls + (isSwap ? 2 : 1)) throw new ImportError(`line ${line}: qc.${method} needs ${controls + (isSwap ? 2 : 1)} qubits`);
    const op = gateOp(base, params, qubits, line);
    if (pendingCondition && op.kind === 'gate') op.condition = pendingCondition;
    ops.push(op);
  });
  return finish(n, ops, 'qiskit');
}

function finish(n: number, ops: Op[], format: Imported['format']): Imported {
  const used = Math.max(n, ...ops.flatMap((op) => (op.kind === 'gate' ? [op.target, ...(op.controls ?? [])] : op.kind === 'swap' || op.kind === 'iswap' ? [op.a, op.b, ...(op.kind === 'swap' ? op.controls ?? [] : [])] : [op.qubit])).map((q) => q + 1));
  if (used < 1) throw new ImportError('no qubits found');
  if (used > MAX_IMPORT_QUBITS) throw new ImportError(`${used} qubits: the lab holds at most ${MAX_IMPORT_QUBITS}`);
  return { n: used, ops, format };
}

/** Qiskit if it looks like Python, OpenQASM otherwise. */
export function parseCircuit(text: string): Imported {
  return /QuantumCircuit|^\s*\w+\.\w+\(/m.test(text) && !/OPENQASM/.test(text) ? parseQiskit(text) : parseQasm(text);
}
