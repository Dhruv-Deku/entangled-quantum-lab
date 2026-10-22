import { createSystem, GrabSystem, Grabbed, Vector3, type Entity } from '@iwsdk/core';
import { DEFAULT_GESTURES, withSensitivity } from '../gestures/config';
import { JOINTS } from '../gestures/hand';
import { HandTracker, type GestureEvent } from '../gestures/tracker';
import { Qubit } from './components';
import { lab } from './instance';
import { feedback } from './feedback';
import { ORB_RADIUS } from './visuals';

/** How close (m) a palm must be to an orb for fist or spread to act on it. */
const REACH = 0.2;

/**
 * Reads tracked hand joints each XR frame and turns gestures into lab actions:
 * spread over an orb = Hadamard, fist near an orb = measure, wrist roll while
 * holding = rotation, touching two held orbs together = entangle (CNOT).
 */
export class GestureSystem extends createSystem({
  held: { required: [Qubit, Grabbed] },
  qubits: { required: [Qubit] },
}) {
  private trackers = { left: new HandTracker('left'), right: new HandTracker('right') };
  private joints = { left: new Float32Array(75), right: new Float32Array(75) };
  private readonly v = new Vector3();
  private readonly orbPos = new Vector3();
  private readonly palm = new Vector3();
  private entangleLatch = false;

  init(): void {
    this.queries.held.subscribe('disqualify', () => lab.commitRotation());
  }

  /** 0..1 from the settings panel. */
  setSensitivity(s: number): void {
    const cfg = withSensitivity(DEFAULT_GESTURES, s);
    this.trackers.left.config = cfg;
    this.trackers.right.config = cfg;
  }

  private readHand(handedness: 'left' | 'right'): Float32Array | null {
    const frame = this.world.xrFrame, ref = this.world.xrReferenceSpace, session = this.world.xrSession;
    if (!frame || !ref || !session) return null;
    let source: XRInputSource | undefined;
    for (const s of session.inputSources) if (s.hand && s.handedness === handedness) source = s;
    if (!source?.hand) return null;
    const out = this.joints[handedness];
    const m = this.player.matrixWorld;
    for (let i = 0; i < JOINTS.length; i++) {
      const space = source.hand.get(JOINTS[i] as XRHandJoint);
      const pose = space ? frame.getJointPose?.(space, ref) : undefined;
      if (!pose) return null;
      const p = pose.transform.position;
      this.v.set(p.x, p.y, p.z).applyMatrix4(m);
      out[i * 3] = this.v.x;
      out[i * 3 + 1] = this.v.y;
      out[i * 3 + 2] = this.v.z;
    }
    return out;
  }

  /** Nearest orb to a point, within `reach`. */
  private nearestOrb(point: Vector3, reach: number): { index: number; entity: Entity; dist: number } | null {
    let best: { index: number; entity: Entity; dist: number } | null = null;
    for (const e of this.queries.qubits.entities) {
      e.object3D!.getWorldPosition(this.orbPos);
      const d = this.orbPos.distanceTo(point);
      if (d < reach && (!best || d < best.dist)) best = { index: e.getValue(Qubit, 'index') ?? 0, entity: e, dist: d };
    }
    return best;
  }

  private onGesture(handedness: 'left' | 'right', ev: GestureEvent): void {
    const st = this.trackers[handedness].state;
    if (!st.frame) return;
    this.palm.set(...st.frame.center);
    if (ev === 'fist') {
      const orb = this.nearestOrb(this.palm, REACH * 0.8);
      if (orb) {
        lab.select(orb.index);
        lab.measure(orb.index);
        feedback('measure');
      }
    } else if (ev === 'spread') {
      const orb = this.nearestOrb(this.palm, REACH);
      if (!orb) return;
      // the palm must face the orb, so waving past one does not apply a gate
      orb.entity.object3D!.getWorldPosition(this.orbPos);
      const toOrb = this.orbPos.sub(this.palm).normalize();
      const n = st.frame.normal;
      if (toOrb.x * n[0] + toOrb.y * n[1] + toOrb.z * n[2] < 0.2) return;
      lab.select(orb.index);
      lab.gate('h', orb.index);
      feedback('gate');
    }
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    for (const hand of ['left', 'right'] as const) {
      const events = this.trackers[hand].update(this.readHand(hand), dt);
      for (const ev of events) this.onGesture(hand, ev);
    }

    // wrist roll turns whichever orb that hand is holding
    const grab = this.world.getSystem(GrabSystem);
    const held: { index: number; entity: Entity }[] = [];
    for (const e of this.queries.held.entities) {
      const index = e.getValue(Qubit, 'index') ?? 0;
      held.push({ index, entity: e });
      const hand = grab?.getHolderHand(e);
      if (!hand) continue;
      const roll = this.trackers[hand].state.roll;
      if (roll !== 0) lab.rotate(index, roll);
    }

    // two held orbs touching -> entangle, once per touch
    if (held.length === 2) {
      const [a, b] = held;
      a.entity.object3D!.getWorldPosition(this.v);
      b.entity.object3D!.getWorldPosition(this.orbPos);
      const d = this.v.distanceTo(this.orbPos);
      if (!this.entangleLatch && d < ORB_RADIUS * 2.15) {
        this.entangleLatch = true;
        // control = the chapter's choice, else the qubit closer to an even superposition
        const s = lab.state;
        const pa = Math.abs(s.prob1(a.index) - 0.5), pb = Math.abs(s.prob1(b.index) - 0.5);
        let [control, target] = pa <= pb ? [a.index, b.index] : [b.index, a.index];
        if (lab.preferredControl === b.index) [control, target] = [b.index, a.index];
        else if (lab.preferredControl === a.index) [control, target] = [a.index, b.index];
        lab.entangle(control, target);
        feedback('entangle');
      } else if (this.entangleLatch && d > ORB_RADIUS * 3) {
        this.entangleLatch = false;
      }
    } else {
      this.entangleLatch = false;
    }
  }
}
