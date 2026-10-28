import { Matrix4, Vector3 } from '@iwsdk/core';

/**
 * The real room, as the headset sees it: detected planes (tables, floor,
 * walls) and meshes (furniture), turned into simple rectangles the lab can
 * use. Entangled stays seated: it puts the desk on your real table, within
 * reach, and uses the wall in front of you as a screen. It never asks you to
 * walk around.
 */

export interface Surface {
  label: string;
  horizontal: boolean;
  /** World centre and the plane's normal (its +Y axis; runtimes disagree on which way it points). */
  center: Vector3;
  normal: Vector3;
  /** Width and depth of the surface's bounding rectangle, metres. */
  size: [number, number];
  /** World corners of the bounding rectangle (four points, in order). */
  corners: Vector3[];
}

const m = new Matrix4();

/** Read the planes and meshes in this frame (empty when the headset reports none). */
export function readRoom(frame: XRFrame | undefined, ref: XRReferenceSpace | null | undefined): Surface[] {
  if (!frame || !ref) return [];
  const out: Surface[] = [];
  const planes = (frame as XRFrame & { detectedPlanes?: Set<XRPlane> }).detectedPlanes;
  planes?.forEach((plane) => {
    const pose = frame.getPose(plane.planeSpace, ref);
    if (!pose) return;
    m.fromArray(pose.transform.matrix);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of plane.polygon) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    if (!isFinite(minX)) return;
    const corners = [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ].map(([x, z]) => new Vector3(x, 0, z).applyMatrix4(m));
    const center = new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2).applyMatrix4(m);
    const normal = new Vector3(0, 1, 0).transformDirection(m);
    out.push({ label: (plane as XRPlane & { semanticLabel?: string }).semanticLabel ?? 'other', horizontal: plane.orientation === 'horizontal', center, normal, size: [maxX - minX, maxZ - minZ], corners });
  });
  const meshes = (frame as XRFrame & { detectedMeshes?: Set<XRMesh & { semanticLabel?: string }> }).detectedMeshes;
  meshes?.forEach((mesh) => {
    const pose = frame.getPose(mesh.meshSpace, ref);
    if (!pose || !mesh.vertices?.length) return;
    // the whole-room mesh is not a piece of furniture
    if (mesh.semanticLabel === 'global mesh') return;
    m.fromArray(pose.transform.matrix);
    const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity), v = new Vector3();
    for (let i = 0; i + 2 < mesh.vertices.length; i += 3) {
      v.set(mesh.vertices[i], mesh.vertices[i + 1], mesh.vertices[i + 2]).applyMatrix4(m);
      lo.min(v);
      hi.max(v);
    }
    // a piece of furniture: its top is a horizontal surface
    const top = hi.y;
    const corners = [new Vector3(lo.x, top, lo.z), new Vector3(hi.x, top, lo.z), new Vector3(hi.x, top, hi.z), new Vector3(lo.x, top, hi.z)];
    out.push({ label: mesh.semanticLabel ?? 'other', horizontal: true, center: new Vector3((lo.x + hi.x) / 2, top, (lo.z + hi.z) / 2), normal: new Vector3(0, 1, 0), size: [hi.x - lo.x, hi.z - lo.z], corners });
  });
  return out;
}

const DESK_LABELS = new Set(['table', 'desk']);
/** Furthest a seated player can comfortably reach to the desk spot, metres (horizontal). */
export const SEATED_REACH = 0.65;
/** Where the lab sits in front of a seated head when nothing better is known, metres. */
export const NATURAL_REACH = 0.4;

/**
 * The desk to work on, for a seated player: a table-height level surface
 * under the hands (a labelled table first). The lab goes where it would float
 * anyway, 40 cm in front of the head, moved onto the table if that point is
 * just off it, and kept 12 cm in from the edges. A table behind you, off to
 * the side or beyond seated reach does not count.
 */
export function pickDesk(surfaces: readonly Surface[], head: Vector3, forward: Vector3): { surface: Surface; spot: Vector3 } | null {
  const fwd = new Vector3(forward.x, 0, forward.z);
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  const ideal = head.clone().addScaledVector(fwd, NATURAL_REACH);
  let best: { surface: Surface; spot: Vector3 } | null = null;
  let bestScore = Infinity;
  for (const s of surfaces) {
    // runtimes disagree on which way a plane's normal points, so any level surface counts
    if (!s.horizontal || Math.abs(s.normal.y) < 0.9) continue;
    if (s.center.y < 0.45 || s.center.y > 1.15 || s.center.y > head.y - 0.15) continue;
    if (s.size[0] * s.size[1] < 0.1 || Math.min(s.size[0], s.size[1]) < 0.25) continue;
    ideal.y = s.center.y;
    const spot = nearestInside(s, ideal, 0.12);
    const off = Math.hypot(spot.x - ideal.x, spot.z - ideal.z);
    const reach = Math.hypot(spot.x - head.x, spot.z - head.z);
    if (off > 0.35 || reach > SEATED_REACH) continue;
    const score = off - (DESK_LABELS.has(s.label) ? 0.2 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = { surface: s, spot };
    }
  }
  return best;
}

/** The point of a horizontal surface's rectangle closest to `p`, kept `inset` metres in from its edges (its centre if too small). */
function nearestInside(s: Surface, p: Vector3, inset: number): Vector3 {
  const [a, b, , d] = s.corners;
  const u = b.clone().sub(a), v = d.clone().sub(a);
  const lu = u.length(), lv = v.length();
  u.divideScalar(lu || 1);
  v.divideScalar(lv || 1);
  const rel = p.clone().sub(a);
  const clampTo = (x: number, len: number) => (len <= 2 * inset ? len / 2 : Math.min(len - inset, Math.max(inset, x)));
  const cu = clampTo(rel.dot(u), lu), cv = clampTo(rel.dot(v), lv);
  const out = a.clone().addScaledVector(u, cu).addScaledVector(v, cv);
  out.y = s.center.y;
  return out;
}

export interface WallHit {
  /** Where the ray meets the wall, and the wall's normal turned to face the player. */
  point: Vector3;
  normal: Vector3;
  distance: number;
  label: string;
}

/** Walls used as a screen: between these distances from where the ray starts, metres. */
export const WALL_RANGE: [number, number] = [0.35, 6];

/**
 * The wall straight ahead: the nearest vertical surface a level ray from
 * `origin` along `dir` meets inside its rectangle, between 0.35 and 6 m away (a desk against a wall counts).
 * Doors and windows count only when nothing else is there.
 */
export function pickWall(surfaces: readonly Surface[], origin: Vector3, dir: Vector3): WallHit | null {
  const d = new Vector3(dir.x, 0, dir.z);
  if (d.lengthSq() < 1e-6) return null;
  d.normalize();
  let best: WallHit | null = null;
  let bestKey = Infinity;
  for (const s of surfaces) {
    if (s.horizontal || Math.abs(s.normal.y) > 0.3) continue;
    const n = new Vector3(s.normal.x, 0, s.normal.z).normalize();
    const denom = n.dot(d);
    if (Math.abs(denom) < 0.25) continue; // nearly edge-on
    const t = n.dot(s.center.clone().sub(origin)) / denom;
    if (t < WALL_RANGE[0] || t > WALL_RANGE[1]) continue;
    const hit = origin.clone().addScaledVector(d, t);
    if (!insideRect(s, hit, 0.02)) continue;
    const facing = denom > 0 ? n.clone().negate() : n.clone();
    const key = t + (s.label === 'door' || s.label === 'window' || s.label === 'wall art' ? 10 : 0);
    if (key < bestKey) {
      bestKey = key;
      best = { point: hit, normal: facing, distance: t, label: s.label };
    }
  }
  return best;
}

/** Whether `p` (on the surface's plane) lies inside its rectangle, with some slack. */
function insideRect(s: Surface, p: Vector3, slack: number): boolean {
  const [a, b, , d] = s.corners;
  const u = b.clone().sub(a), v = d.clone().sub(a);
  const lu = u.length(), lv = v.length();
  if (lu < 1e-6 || lv < 1e-6) return false;
  const rel = p.clone().sub(a);
  const x = rel.dot(u) / lu, y = rel.dot(v) / lv;
  return x >= -slack && x <= lu + slack && y >= -slack && y <= lv + slack;
}

// ---------------------------------------------------------------- the double slit on your wall

/**
 * A red laser (650 nm) through two slits 16 microns apart: the stripes on a
 * wall L metres away are lambda L / d apart, about 4 cm per metre. In the
 * lab's slit model (bright stripes every 0.2 in x, from -1 to 1) one unit of
 * x is five stripe spacings.
 */
export const WAVELENGTH = 650e-9;
export const SLIT_SPACING = 16e-6;

export function fringeSpacing(distance: number): number {
  return (WAVELENGTH * distance) / SLIT_SPACING;
}

/** Half the width of the pattern on a screen `distance` metres away (x = 1 in the slit model). */
export function patternHalfWidth(distance: number): number {
  return 5 * fringeSpacing(distance);
}
