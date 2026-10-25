import { Matrix4, Vector3 } from '@iwsdk/core';

/**
 * The real room, as the headset sees it: detected planes (tables, floor,
 * walls, shelves) and meshes (furniture), turned into simple surfaces the lab
 * can use. Entangled puts its qubits on your real desk, and the Quantum Hunt
 * hides qubits around your room on real surfaces.
 */

export interface Surface {
  label: string;
  horizontal: boolean;
  /** World centre and up-facing normal (for horizontal surfaces). */
  center: Vector3;
  normal: Vector3;
  /** Width and depth of the surface's bounding rectangle, metres. */
  size: [number, number];
  /** World corners of the bounding rectangle (four points), for placing things inside it. */
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

/**
 * The desk to work on: a table-height horizontal surface near the head
 * (a labelled table first), and the spot on it closest to the player, pulled
 * in from the edge so the qubits sit on the surface.
 */
export function pickDesk(surfaces: readonly Surface[], head: Vector3): { surface: Surface; spot: Vector3 } | null {
  // runtimes disagree on which way a plane's normal points, so any level surface counts
  const ok = surfaces.filter((s) => s.horizontal && Math.abs(s.normal.y) > 0.9 && s.center.y > 0.5 && s.center.y < 1.2 && s.size[0] * s.size[1] > 0.12);
  if (!ok.length) return null;
  const score = (s: Surface) => s.center.distanceTo(head) - (DESK_LABELS.has(s.label) ? 1 : 0);
  const surface = ok.reduce((a, b) => (score(b) < score(a) ? b : a));
  if (surface.center.distanceTo(head) > 2.5) return null;
  // the closest point of the rectangle to the head, 18 cm in from that edge (or the centre if small)
  const toHead = new Vector3(head.x - surface.center.x, 0, head.z - surface.center.z);
  const half = Math.min(surface.size[0], surface.size[1]) / 2;
  const inset = Math.max(0, half - 0.18);
  const spot = surface.center.clone().addScaledVector(toHead.lengthSq() > 1e-6 ? toHead.normalize() : toHead, inset);
  spot.y = surface.center.y;
  return { surface, spot };
}

/**
 * Hiding places for the Quantum Hunt: points on real surfaces (floor, tables,
 * shelves, sofas) between 0.8 and 4 m from the player, spread out as far from
 * each other as possible. Falls back to a ring around the player when the room
 * has not been scanned.
 */
export function pickHidingSpots(surfaces: readonly Surface[], head: Vector3, count: number, rng: () => number): Vector3[] {
  const candidates: Vector3[] = [];
  for (const s of surfaces) {
    if (!s.horizontal || Math.abs(s.normal.y) < 0.9 || s.label === 'ceiling' || s.center.y > 2) continue;
    // points inside each surface, more on bigger ones, kept 15 cm from its edges
    const [a, b, c, d] = s.corners;
    const mu = Math.min(0.45, 0.15 / Math.max(0.01, s.size[0])), mw = Math.min(0.45, 0.15 / Math.max(0.01, s.size[1]));
    const n = Math.max(6, Math.round(s.size[0] * s.size[1] * 16));
    for (let k = 0; k < n; k++) {
      const u = mu + (1 - 2 * mu) * rng(), w = mw + (1 - 2 * mw) * rng();
      const p = a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), w);
      p.y += 0.06;
      const dist = Math.hypot(p.x - head.x, p.z - head.z);
      if (dist > 0.6 && dist < 4) candidates.push(p);
    }
  }
  if (candidates.length < count) {
    // an unscanned room: a ring around the player at desk and floor heights
    for (let k = candidates.length; k < count; k++) {
      const ang = (k / count) * Math.PI * 2 + rng() * 0.6;
      const r = 1.3 + rng() * 0.9;
      candidates.push(new Vector3(head.x + Math.sin(ang) * r, k % 2 ? 0.08 : 0.8, head.z - Math.cos(ang) * r));
    }
  }
  // farthest-point sampling: each spot as far as possible from those already picked
  const picked = [candidates[Math.floor(rng() * candidates.length)]];
  while (picked.length < count && picked.length < candidates.length) {
    let best = candidates[0], bestD = -1;
    for (const c of candidates) {
      const d = Math.min(...picked.map((p) => p.distanceTo(c)));
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    picked.push(best);
  }
  return picked;
}
