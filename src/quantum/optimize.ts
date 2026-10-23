import type { Op } from './circuit';
import type { GateName } from './gates';

/**
 * Circuit simplification, the way real compilers start: cancel gates that undo
 * each other, merge gates that add up, and slide gates past others they commute
 * with so more of them meet. Every rule is exact (the result is the same
 * unitary, up to a global phase only where noted), and measurements, resets and
 * classically controlled gates are never moved.
 */

const TAU = 2 * Math.PI;
const EPS = 1e-9;

/** How an op acts on one wire, for deciding whether two ops commute. */
type Role = 'Z' | 'X' | 'Y' | 'other';

/** Phase gates: diagonal, and their angles add. */
const PHASE: Partial<Record<GateName, number>> = { z: Math.PI, s: Math.PI / 2, sdg: -Math.PI / 2, t: Math.PI / 4, tdg: -Math.PI / 4 };
/** Powers of X: X^(1/2) = SX exactly, so their exponents add. */
const XPOW: Partial<Record<GateName, number>> = { x: 1, sx: 0.5, sxdg: -0.5 };
const SELF_INVERSE = new Set<GateName>(['h', 'y']);
const ROTATION = new Set<GateName>(['rx', 'ry', 'rz']);

function targetRole(gate: GateName): Role {
  if (gate in PHASE || gate === 'p' || gate === 'rz') return 'Z';
  if (gate in XPOW || gate === 'rx') return 'X';
  if (gate === 'y' || gate === 'ry') return 'Y';
  return 'other';
}

/** Measurements, resets and classically controlled gates stay exactly where they are. */
function isBarrier(op: Op): boolean {
  return op.kind === 'measure' || op.kind === 'reset' || (op.kind === 'gate' && !!op.condition);
}

function roles(op: Op): Map<number, Role> {
  const m = new Map<number, Role>();
  switch (op.kind) {
    case 'gate':
      for (const c of op.controls ?? []) m.set(c, 'Z');
      m.set(op.target, targetRole(op.gate));
      break;
    case 'swap':
      for (const c of op.controls ?? []) m.set(c, 'Z');
      m.set(op.a, 'other');
      m.set(op.b, 'other');
      break;
    case 'iswap':
      m.set(op.a, 'other');
      m.set(op.b, 'other');
      break;
    case 'measure':
    case 'reset':
      m.set(op.qubit, 'other');
      break;
  }
  return m;
}

/**
 * Two ops commute if, on every wire they share, both are diagonal in the same
 * basis there (Z: a control or a phase; X or Y: that Pauli's rotations). Then
 * each op is block diagonal in that shared basis and the blocks act on
 * different wires.
 */
export function commutes(a: Op, b: Op): boolean {
  // two barriers keep their order even on different wires (feed-forward reads the bits)
  if (isBarrier(a) && isBarrier(b)) return false;
  const ra = roles(a), rb = roles(b);
  let shared = false;
  for (const [w, r] of ra) {
    const s = rb.get(w);
    if (s === undefined) continue;
    shared = true;
    if (r === 'other' || r !== s) return false;
  }
  return !shared || (!isBarrier(a) && !isBarrier(b));
}

const sameSet = (a: readonly number[] = [], b: readonly number[] = []) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Angle in (-pi, pi]. */
function wrap(x: number, period = TAU): number {
  let y = x % period;
  if (y <= -period / 2) y += period;
  if (y > period / 2) y -= period;
  return y;
}

const near = (a: number, b: number) => Math.abs(a - b) < EPS;

/** A phase gate for angle phi, by name when it has one; null when it is the identity. */
function phaseGate(phi: number): { gate: GateName; params?: number[] } | null {
  const w = wrap(phi);
  if (near(w, 0)) return null;
  for (const [g, a] of Object.entries(PHASE) as [GateName, number][]) if (near(w, a) || near(w, a - TAU) || near(w, a + TAU)) return { gate: g };
  return { gate: 'p', params: [w] };
}

function xPowGate(e: number): GateName | null {
  const w = ((e % 2) + 2) % 2;
  if (near(w, 0) || near(w, 2)) return null;
  if (near(w, 0.5)) return 'sx';
  if (near(w, 1)) return 'x';
  return 'sxdg';
}

/**
 * A gate that does nothing: a rotation by a full turn. Uncontrolled, Rz(2 pi)
 * is -1, a global phase; controlled, that sign is real, so only 4 pi counts.
 */
function isIdentity(op: Op): boolean {
  if (op.kind !== 'gate' || op.condition) return false;
  const a = op.params?.[0] ?? 0;
  if (ROTATION.has(op.gate)) return near(wrap(a, op.controls?.length ? 2 * TAU : TAU), 0);
  if (op.gate === 'p') return near(wrap(a), 0);
  return false;
}

/**
 * Combine b into a when they sit next to each other (a first). Returns the
 * replacement: null if they cancel, undefined if no rule applies.
 */
function combine(a: Op, b: Op): Op | null | undefined {
  if (a.kind === 'swap' && b.kind === 'swap') {
    const same = (a.a === b.a && a.b === b.b) || (a.a === b.b && a.b === b.a);
    return same && sameSet(a.controls, b.controls) ? null : undefined;
  }
  if (a.kind !== 'gate' || b.kind !== 'gate' || a.condition || b.condition) return undefined;
  if (a.target !== b.target || !sameSet(a.controls, b.controls)) return undefined;
  const base = { kind: 'gate' as const, target: a.target, ...(a.controls?.length ? { controls: a.controls.slice() } : {}) };
  if (SELF_INVERSE.has(a.gate) && a.gate === b.gate) return null;
  const pa = a.gate === 'p' ? a.params![0] : PHASE[a.gate];
  const pb = b.gate === 'p' ? b.params![0] : PHASE[b.gate];
  if (pa !== undefined && pb !== undefined) {
    const g = phaseGate(pa + pb);
    return g ? { ...base, ...g } : null;
  }
  const xa = XPOW[a.gate], xb = XPOW[b.gate];
  if (xa !== undefined && xb !== undefined) {
    const g = xPowGate(xa + xb);
    return g ? { ...base, gate: g } : null;
  }
  if (ROTATION.has(a.gate) && a.gate === b.gate) {
    const op: Op = { ...base, gate: a.gate, params: [a.params![0] + b.params![0]] };
    return isIdentity(op) ? null : op;
  }
  return undefined;
}

export interface Simplified {
  ops: Op[];
  /** Gates removed because they cancelled or did nothing. */
  cancelled: number;
  /** Pairs merged into one gate. */
  merged: number;
}

/** Simplify a circuit; the input is not changed. */
export function simplify(input: readonly Op[]): Simplified {
  const ops: Op[] = input.map((op) => ({ ...op }) as Op);
  let cancelled = 0, merged = 0;
  for (let i = ops.length - 1; i >= 0; i--) {
    if (isIdentity(ops[i])) {
      ops.splice(i, 1);
      cancelled++;
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < ops.length; i++) {
      const a = ops[i];
      if (isBarrier(a)) continue;
      for (let j = i + 1; j < ops.length; j++) {
        const b = ops[j];
        const r = combine(a, b);
        if (r !== undefined) {
          // a commutes with everything between, so it can slide up to b; the result sits where b was
          if (r === null) {
            ops.splice(j, 1);
            ops.splice(i, 1);
            cancelled += 2;
          } else {
            ops[j] = r;
            ops.splice(i, 1);
            merged++;
          }
          changed = true;
          break outer;
        }
        if (!commutes(a, b)) break;
      }
    }
  }
  return { ops, cancelled, merged };
}
