/**
 * Gesture spells: shapes drawn in the air with a pinched fingertip, away from
 * the orbs. The stroke is flattened onto the plane facing the player and
 * matched by its geometry:
 *  - a circle (closed, turning all the way round) casts S, a quarter turn of phase;
 *  - a Z (right, down-left, right) casts Z;
 *  - a straight stroke upward casts X, the flip.
 */

export type Spell = 'circle' | 'zigzag' | 'up';
export type P2 = [number, number];

/** What each spell does to the selected qubit. */
export const SPELL_GATE: Record<Spell, 'S' | 'Z' | 'X'> = { circle: 'S', zigzag: 'Z', up: 'X' };

const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The stroke resampled to `n` evenly spaced points. */
export function resample(pts: readonly P2[], n = 48): P2[] {
  const total = pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
  if (total === 0) return pts.slice(0, 1);
  const step = total / (n - 1);
  const out: P2[] = [pts[0]];
  let acc = 0;
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    let cur = pts[i];
    let d = dist(prev, cur);
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d;
      const q: P2 = [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])];
      out.push(q);
      prev = q;
      d = dist(prev, cur);
      acc = 0;
    }
    acc += d;
    prev = cur;
    cur = pts[i];
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out;
}

const angle = (a: P2, b: P2) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

/** Recognise a stroke (metres, x right and y up in the player's view), or null if it is none of the spells. */
export function recognize(raw: readonly P2[]): Spell | null {
  if (raw.length < 6) return null;
  const pts = resample(raw);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const diag = Math.hypot(w, h);
  if (diag < 0.06) return null;
  const start = pts[0], end = pts[pts.length - 1];
  const length = pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
  // a straight stroke upward
  const chord = dist(start, end);
  const up = angle(start, end);
  if (chord > 0.85 * length && end[1] - start[1] > 0.08 && Math.abs(wrap(up - Math.PI / 2)) < Math.PI / 6) return 'up';
  // a circle: back where it started, after turning all the way round, about as wide as tall
  let turning = 0;
  for (let i = 2; i < pts.length; i++) turning += wrap(angle(pts[i - 1], pts[i]) - angle(pts[i - 2], pts[i - 1]));
  if (chord < 0.3 * diag && Math.abs(turning) > 1.5 * Math.PI && w / Math.max(h, 1e-6) > 0.5 && w / Math.max(h, 1e-6) < 2) return 'circle';
  // a Z: runs of direction east, then down-left, then east
  const dirs: number[] = [];
  for (let i = 1; i < pts.length; i++) dirs.push(angle(pts[i - 1], pts[i]));
  const kind = (a: number) => (Math.abs(a) < Math.PI / 5 ? 'E' : a < -Math.PI / 2 - Math.PI / 12 && a > -Math.PI + Math.PI / 12 ? 'SW' : 'other');
  const runs: { k: string; n: number }[] = [];
  for (const d of dirs) {
    const k = kind(d);
    if (runs.length && runs[runs.length - 1].k === k) runs[runs.length - 1].n++;
    else runs.push({ k, n: 1 });
  }
  const solid = runs.filter((r) => r.n >= 4 && r.k !== 'other').map((r) => r.k);
  const squeezed = solid.filter((k, i) => i === 0 || solid[i - 1] !== k);
  if (squeezed.join(',') === 'E,SW,E' && w > 0.06 && h > 0.04) return 'zigzag';
  return null;
}
