import { createSystem, Group, Mesh, MeshBasicMaterial, Quaternion, Raycaster, RingGeometry, Vector3, type Object3D } from '@iwsdk/core';
import { DWELL_SECONDS, settings } from '../game/settings';
import { feedback } from './feedback';

/** Something you can press by looking at it. */
export interface LookTarget {
  object: Object3D;
  press: () => void;
  /** Hit-test its children too (a group of meshes; a button is one UIKit element). */
  deep?: boolean;
  /** Hit-test as a ball of this radius around the object instead (orbs: their labels and effects never count). */
  radius?: number;
}

const STEPS = 32;

/** Whether `o` and everything up to `root` is visible. */
function shown(o: Object3D | null, root: Object3D): boolean {
  for (; o; o = o.parent) {
    if (!o.visible) return false;
    if (o === root) return true;
  }
  return true;
}
const MAX_DISTANCE = 4;

/**
 * Look to select: for people who cannot pinch or point. Rest your gaze on a
 * button or an orb and a ring fills around the spot; when it closes, that
 * thing is pressed, exactly as a tap would press it. The gaze is the head's
 * direction (eyes too, where the headset tracks them and IWSDK's gaze pointer
 * drives the rays). A target fires once; look away and back to press again.
 * With voice for the gates, the whole lab works without hands.
 */
export class LookSelectSystem extends createSystem({}) {
  /** Targets come from the UI (its buttons) and the lab (the orbs). */
  static providers: (() => LookTarget[])[] = [];
  private readonly ray = new Raycaster();
  private readonly root = new Group();
  private readonly fills: Mesh[] = [];
  private target: Object3D | null = null;
  private held = 0;
  /** The current target already fired: wait until the gaze leaves it. */
  private spent = false;
  private readonly o = new Vector3();
  private readonly d = new Vector3();
  private readonly q = new Quaternion();
  private readonly c = new Vector3();

  init(): void {
    const track = new Mesh(new RingGeometry(0.012, 0.016, 40), new MeshBasicMaterial({ color: '#e4e6eb', transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
    track.renderOrder = 30;
    this.root.add(track);
    const fillMat = new MeshBasicMaterial({ color: '#2d7ff9', depthTest: false, depthWrite: false });
    for (let k = 1; k <= STEPS; k++) {
      const m = new Mesh(new RingGeometry(0.012, 0.016, 40, 1, Math.PI / 2, (2 * Math.PI * k) / STEPS), fillMat);
      m.renderOrder = 31;
      m.visible = false;
      this.fills.push(m);
      this.root.add(m);
    }
    const dot = new Mesh(new RingGeometry(0, 0.003, 16), new MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false }));
    dot.renderOrder = 32;
    this.root.add(dot);
    this.root.visible = false;
    this.scene.add(this.root);
    if (import.meta.env.DEV) (globalThis as { __entangledLook?: unknown }).__entangledLook = this;
  }

  update(delta: number): void {
    if (!settings.lookSelect || !this.world.xrSession) {
      this.root.visible = false;
      this.target = null;
      return;
    }
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    this.o.setFromMatrixPosition(head.matrixWorld);
    head.getWorldQuaternion(this.q);
    this.d.set(0, 0, -1).applyQuaternion(this.q);
    this.ray.set(this.o, this.d);
    this.ray.far = MAX_DISTANCE;
    // sprites (orb labels) need the camera to hit-test
    this.ray.camera = this.camera;
    let best: { t: LookTarget; dist: number; point: Vector3 } | null = null;
    for (const provide of LookSelectSystem.providers) {
      for (const t of provide()) {
        if (t.radius !== undefined) {
          t.object.getWorldPosition(this.c);
          const along = this.c.clone().sub(this.o).dot(this.d);
          if (along > 0 && along < MAX_DISTANCE && this.ray.ray.distanceSqToPoint(this.c) < t.radius * t.radius && (!best || along < best.dist)) best = { t, dist: along, point: this.o.clone().addScaledVector(this.d, along) };
          continue;
        }
        let h;
        try {
          // the raycaster also hits hidden meshes: take the first one that is actually shown
          h = this.ray.intersectObject(t.object, !!t.deep).find((x) => !t.deep || shown(x.object, t.object));
        } catch {
          // a target that cannot be hit-tested this frame: skip it, never stop the frame
          continue;
        }
        if (h && (!best || h.distance < best.dist)) best = { t, dist: h.distance, point: h.point.clone() };
      }
    }
    if (!best) {
      this.target = null;
      this.spent = false;
      this.root.visible = false;
      return;
    }
    if (best.t.object !== this.target) {
      this.target = best.t.object;
      this.held = 0;
      this.spent = false;
    } else if (!this.spent) this.held += Math.min(delta, 0.1);
    const dwell = DWELL_SECONDS[settings.dwell];
    if (!this.spent && this.held >= dwell) {
      this.spent = true;
      best.t.press();
      feedback('select');
    }
    // the ring sits on the target, just in front, facing you, the same size at any distance
    this.root.visible = true;
    this.root.position.copy(best.point).addScaledVector(this.d, -0.01);
    this.root.quaternion.copy(this.q);
    this.root.scale.setScalar(Math.max(0.5, best.dist));
    const k = this.spent ? STEPS : Math.floor((this.held / dwell) * STEPS);
    this.fills.forEach((m, i) => (m.visible = i === k - 1));
  }
}
