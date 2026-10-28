import { Quaternion, Vector3 } from '@iwsdk/core';

/**
 * The pinned lab: a persistent WebXR anchor where you left the desk, so the
 * lab comes back to the same spot in your room next time (Quest keeps the
 * anchor across sessions; the app stores only its id).
 */
export class LabAnchor {
  private anchor: XRAnchor | null = null;
  private pending = false;
  /** The anchor we tried to restore could not be found (cleared room, another headset). */
  lost = false;

  /** Whether this session can make persistent anchors. */
  static supported(session: XRSession | null | undefined): boolean {
    if (!session || typeof (session as XRSession & { restorePersistentAnchor?: unknown }).restorePersistentAnchor !== 'function') return false;
    const features = (session as XRSession & { enabledFeatures?: readonly string[] }).enabledFeatures;
    return !features || features.includes('anchors');
  }

  get ready(): boolean {
    return !!this.anchor;
  }

  /** Pin at a pose in the reference space; resolves to the persistent id (null if refused). */
  async pin(frame: XRFrame, ref: XRReferenceSpace, position: Vector3, quaternion: Quaternion): Promise<string | null> {
    if (!frame.createAnchor) return null;
    const pose = new XRRigidTransform({ x: position.x, y: position.y, z: position.z }, { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w });
    try {
      const anchor = await frame.createAnchor(pose, ref);
      if (!anchor) return null;
      this.anchor?.delete?.();
      this.anchor = anchor;
      this.lost = false;
      return (await anchor.requestPersistentHandle?.()) ?? null;
    } catch {
      return null;
    }
  }

  /** Bring back a pinned anchor by id (once per session). */
  restore(session: XRSession, uuid: string): void {
    if (this.pending || this.anchor) return;
    const s = session as XRSession & { restorePersistentAnchor?: (id: string) => Promise<XRAnchor> };
    if (!s.restorePersistentAnchor) {
      this.lost = true;
      return;
    }
    this.pending = true;
    s.restorePersistentAnchor(uuid)
      .then((a) => {
        this.anchor = a;
        this.lost = false;
      })
      .catch(() => {
        this.lost = true;
      })
      .finally(() => {
        this.pending = false;
      });
  }

  /** Delete a stored pin on the headset (not the live anchor). */
  static async forget(session: XRSession | null | undefined, uuid: string): Promise<void> {
    const s = session as (XRSession & { deletePersistentAnchor?: (id: string) => Promise<void> }) | null | undefined;
    if (s?.deletePersistentAnchor) await s.deletePersistentAnchor(uuid).catch(() => undefined);
  }

  /** Forget the pin, here and on the headset. */
  async unpin(session: XRSession | null | undefined, uuid: string | null): Promise<void> {
    this.anchor?.delete?.();
    this.anchor = null;
    const s = session as (XRSession & { deletePersistentAnchor?: (id: string) => Promise<void> }) | null | undefined;
    if (uuid && s?.deletePersistentAnchor) await s.deletePersistentAnchor(uuid).catch(() => undefined);
  }

  /** Session over: anchors belong to the session that made or restored them. */
  reset(): void {
    this.anchor = null;
    this.pending = false;
    this.lost = false;
  }

  /** The anchor's pose this frame, written into `pos` and `quat` (false while it is not tracked). */
  pose(frame: XRFrame, ref: XRReferenceSpace, pos: Vector3, quat: Quaternion): boolean {
    if (!this.anchor) return false;
    let p: XRPose | undefined;
    try {
      p = frame.getPose(this.anchor.anchorSpace, ref);
    } catch {
      return false;
    }
    if (!p) return false;
    const t = p.transform;
    pos.set(t.position.x, t.position.y, t.position.z);
    quat.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
    return true;
  }
}
