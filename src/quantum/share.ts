import type { Op } from './circuit';
import type { GateName } from './gates';

/**
 * Circuits as short, readable, URL-safe text, for share links:
 *   "3_h0/x1c0/ry2p0.7854/M0=1/S0,1"
 * qubit count, then one token per op. Gates: name, target, optional
 * "c" + controls, optional "p" + params (joined by ~), optional "?bit=value"
 * condition. M = measure (=outcome), R = reset, S = swap, I = iswap.
 */

const GATES = new Set<GateName>(['x', 'y', 'z', 'h', 's', 'sdg', 't', 'tdg', 'sx', 'sxdg', 'rx', 'ry', 'rz', 'p', 'u']);
const PARAMS: Partial<Record<GateName, number>> = { rx: 1, ry: 1, rz: 1, p: 1, u: 3 };
export const MAX_SHARED_QUBITS = 5;

const num = (v: number) => String(Math.round(v * 1e4) / 1e4);

export function encodeCircuit(n: number, ops: readonly Op[]): string {
  const tokens = ops.map((op) => {
    switch (op.kind) {
      case 'gate': {
        let t = `${op.gate}${op.target}`;
        if (op.controls?.length) t += `c${op.controls.join(',')}`;
        if (op.params?.length) t += `p${op.params.map(num).join('~')}`;
        if (op.condition) t += `?${op.condition.bit}=${op.condition.value}`;
        return t;
      }
      case 'swap':
        return `S${op.a},${op.b}${op.controls?.length ? `c${op.controls.join(',')}` : ''}`;
      case 'iswap':
        return `I${op.a},${op.b}`;
      case 'measure':
        return `M${op.qubit}${op.bit !== undefined ? `b${op.bit}` : ''}${op.outcome !== undefined ? `=${op.outcome}` : ''}`;
      case 'reset':
        return `R${op.qubit}${op.outcome !== undefined ? `=${op.outcome}` : ''}`;
    }
  });
  return `${n}_${tokens.join('/')}`;
}

const GATE_RE = /^([a-z]+?)(\d)(?:c([\d,]+))?(?:p([-\d.e~]+))?(?:\?(\d)=([01]))?$/;
const SWAP_RE = /^([SI])(\d),(\d)(?:c([\d,]+))?$/;
const MEAS_RE = /^([MR])(\d)(?:b(\d))?(?:=([01]))?$/;

/** Parse a shared circuit; null if anything is malformed or out of range. */
export function decodeCircuit(text: string): { n: number; ops: Op[] } | null {
  const m = /^(\d)_(.*)$/.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > MAX_SHARED_QUBITS) return null;
  const ok = (q: number) => Number.isInteger(q) && q >= 0 && q < n;
  const ops: Op[] = [];
  for (const tok of m[2] ? m[2].split('/') : []) {
    let r: RegExpExecArray | null;
    if ((r = SWAP_RE.exec(tok))) {
      const a = Number(r[2]), b = Number(r[3]);
      const controls = r[4] ? r[4].split(',').map(Number) : undefined;
      if (!ok(a) || !ok(b) || a === b || controls?.some((c) => !ok(c) || c === a || c === b)) return null;
      ops.push(r[1] === 'S' ? { kind: 'swap', a, b, ...(controls ? { controls } : {}) } : { kind: 'iswap', a, b });
    } else if ((r = MEAS_RE.exec(tok))) {
      const q = Number(r[2]);
      if (!ok(q)) return null;
      const outcome = r[4] !== undefined ? (Number(r[4]) as 0 | 1) : undefined;
      if (r[1] === 'M') ops.push({ kind: 'measure', qubit: q, ...(r[3] ? { bit: Number(r[3]) } : {}), ...(outcome !== undefined ? { outcome } : {}) });
      else ops.push({ kind: 'reset', qubit: q, ...(outcome !== undefined ? { outcome } : {}) });
    } else if ((r = GATE_RE.exec(tok))) {
      const gate = r[1] as GateName;
      const target = Number(r[2]);
      if (!GATES.has(gate) || !ok(target)) return null;
      const controls = r[3] ? r[3].split(',').map(Number) : undefined;
      if (controls?.some((c) => !ok(c) || c === target)) return null;
      const params = r[4] ? r[4].split('~').map(Number) : undefined;
      if ((params?.length ?? 0) !== (PARAMS[gate] ?? 0) || params?.some((p) => !Number.isFinite(p))) return null;
      const op: Op = { kind: 'gate', gate, target };
      if (controls) op.controls = controls;
      if (params) op.params = params;
      if (r[5] !== undefined) op.condition = { bit: Number(r[5]), value: Number(r[6]) as 0 | 1 };
      ops.push(op);
    } else return null;
  }
  return { n, ops };
}

/** The hash part of a share link. */
export const SHARE_PREFIX = '#c=';
