import { settings } from '../game/settings';
import { createSystem, GrabSystem, Grabbed, InstancedMesh, Matrix4, MeshBasicMaterial, SphereGeometry, Vector3, type Entity } from '@iwsdk/core';
import { DEFAULT_GESTURES, withSensitivity } from '../gestures/config';
import { J, JOINTS } from '../gestures/hand';
import { recognize, SPELL_GATE, type P2 } from '../gestures/spells';
import { LabSystem } from './lab-system';
import { HandTracker, type GestureEvent } from '../gestures/tracker';
import { TapDetector, type TapFinger } from '../gestures/taps';
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
  /** Finger taps: thumb to the middle, ring or little fingertip applies a gate. */
  private taps = { left: new TapDetector(), right: new TapDetector() };
  /** Told about each finger tap (the UI shows what it did). */
  onTap: ((finger: TapFinger, hand: 'left' | 'right') => void) | null = null;
  private joints = { left: new Float32Array(75), right: new Float32Array(75) };
  private readonly v = new Vector3();
  private readonly orbPos = new Vector3();
  private readonly palm = new Vector3();
  private entangleLatch = false;
  /** A spell being drawn: the fingertip's path while pinching away from the orbs. */
  private stroke: { hand: 'left' | 'right'; pts: Vector3[]; t: number } | null = null;
  /** The trail: a string of small beads along the fingertip's path (lines are one pixel wide in a headset). */
  private trailMat = new MeshBasicMaterial({ color: '#3ddc97', transparent: true, opacity: 0, depthWrite: false });
  private trail = new InstancedMesh(new SphereGeometry(0.0032, 8, 6), this.trailMat, 256);
  private readonly bead = new Matrix4();
  private trailFade = 0;
  /** The left palm facing up (for the wrist menu), or null. */
  palmUp: { center: Vector3; normal: Vector3 } | null = null;
  private palmLatch = false;

  init(): void {
    this.queries.held.subscribe('disqualify', () => lab.commitRotation());
    this.trail.count = 0;
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    if (import.meta.env.DEV) (globalThis as { __entangledSpell?: (kind: 'circle' | 'zigzag' | 'up') => void }).__entangledSpell = (kind) => this.demoSpell(kind);
  }

  /** Lay the beads along a stroke. */
  private drawTrail(pts: readonly Vector3[]): void {
    pts.forEach((q, i) => this.trail.setMatrixAt(i, this.bead.makeTranslation(q.x, q.y, q.z)));
    this.trail.count = pts.length;
    this.trail.instanceMatrix.needsUpdate = true;
  }

  /** Dev only: draw a spell in the air in front of the player, as a hand would. */
  private demoSpell(kind: 'circle' | 'zigzag' | 'up'): void {
    const m = this.player.head.matrixWorld.elements;
    const right = new Vector3(m[0], m[1], m[2]).normalize(), up = new Vector3(m[4], m[5], m[6]).normalize();
    const back = new Vector3(m[8], m[9], m[10]).normalize();
    const c = new Vector3(m[12], m[13], m[14]).addScaledVector(back, -0.42).addScaledVector(up, -0.06).addScaledVector(right, 0.12);
    const flat: [number, number][] = [];
    const seg = (a: [number, number], b: [number, number]) => { for (let i = 0; i < 14; i++) flat.push([a[0] + ((b[0] - a[0]) * i) / 14, a[1] + ((b[1] - a[1]) * i) / 14]); };
    if (kind === 'circle') for (let i = 0; i <= 64; i++) flat.push([0.08 * Math.cos((i / 64) * 2 * Math.PI), 0.075 * Math.sin((i / 64) * 2 * Math.PI)]);
    else if (kind === 'zigzag') { seg([-0.07, 0.06], [0.07, 0.06]); seg([0.07, 0.06], [-0.07, -0.06]); seg([-0.07, -0.06], [0.07, -0.06]); flat.push([0.07, -0.06]); }
    else seg([0, -0.08], [0.005, 0.08]);
    const pts = flat.map(([x, y]) => c.clone().addScaledVector(right, x).addScaledVector(up, y));
    this.drawTrail(pts);
    this.stroke = { hand: 'right', pts, t: 1 };
    this.endStroke();
  }

  /** The tip of the index finger, from the last joints read for this hand. */
  private tip(hand: 'left' | 'right', out: Vector3): Vector3 {
    const j = this.joints[hand];
    return out.set(j[J.indexTip * 3], j[J.indexTip * 3 + 1], j[J.indexTip * 3 + 2]);
  }

  /** A pinch away from the orbs, with nothing held, starts drawing a spell. */
  private startStroke(hand: 'left' | 'right'): void {
    const tip = this.tip(hand, new Vector3());
    if (this.nearestOrb(tip, 0.14)) return;
    const grab = this.world.getSystem(GrabSystem);
    for (const e of this.queries.held.entities) if (grab?.getHolderHand(e) === hand) return;
    this.stroke = { hand, pts: [tip], t: 0 };
  }

  /** The pinch let go: read the shape, and cast it on the selected qubit. */
  private endStroke(): void {
    const st = this.stroke;
    this.stroke = null;
    this.trailFade = 1;
    if (!st || st.t < 0.25 || st.pts.length < 6) return;
    // flatten onto the plane facing the player
    const m = this.player.head.matrixWorld.elements;
    const right = new Vector3(m[0], m[1], m[2]).normalize(), up = new Vector3(m[4], m[5], m[6]).normalize();
    const flat: P2[] = st.pts.map((p) => [p.dot(right), p.dot(up)]);
    const spell = recognize(flat);
    if (!spell) return;
    const gate = SPELL_GATE[spell];
    lab.gate(gate.toLowerCase() as 's' | 'z' | 'x', lab.selected);
    feedback('gate');
    this.trailMat.color.set('#ffffff');
    this.world.getSystem(LabSystem)?.rushFx.pop(gate, spell === 'circle' ? 'circle spell' : spell === 'zigzag' ? 'Z spell' : 'up spell', '#3ddc97');
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
    if (ev === 'pinch-start' && !this.stroke) this.startStroke(handedness);
    if (ev === 'pinch-end' && this.stroke?.hand === handedness) this.endStroke();
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

  /** A finger tap: middle is H, ring is X, the little finger measures, on the selected qubit. */
  private fingerTap(finger: TapFinger, hand: 'left' | 'right'): void {
    if (finger === 'middle') {
      if (lab.gate('h')) feedback('gate');
    } else if (finger === 'ring') {
      if (lab.gate('x')) feedback('gate');
    } else if (lab.measure() !== null) feedback('measure');
    this.onTap?.(finger, hand);
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    for (const hand of ['left', 'right'] as const) {
      const joints = this.readHand(hand);
      const events = this.trackers[hand].update(joints, dt);
      const tap = settings.fingerTaps ? this.taps[hand].update(joints, dt) : null;
      if (tap) this.fingerTap(tap, hand);
      for (const ev of events) this.onGesture(hand, ev);
    }

    // drawing a spell: follow the fingertip and draw the trail
    if (this.stroke) {
      const s = this.stroke;
      s.t += dt;
      const p = this.tip(s.hand, new Vector3());
      if (p.distanceTo(s.pts[s.pts.length - 1]) > 0.004 && s.pts.length < 256) s.pts.push(p);
      this.drawTrail(s.pts);
      this.trailMat.color.set('#3ddc97');
      this.trailMat.opacity = s.t > 0.2 ? 0.9 : 0;
    } else if (this.trailFade > 0) {
      this.trailFade = Math.max(0, this.trailFade - dt * 1.6);
      this.trailMat.opacity = 0.9 * this.trailFade;
    }

    // the palm turned up opens the wrist menu (left by default; Settings can swap hands), with a little hysteresis
    const left = this.trackers[settings.wristHand].state;
    const ny = left.frame ? left.frame.normal[1] : -1;
    this.palmLatch = !!left.frame && !left.pinching && !left.fist && (this.palmLatch ? ny > 0.5 : ny > 0.75);
    this.palmUp = this.palmLatch && left.frame ? { center: new Vector3(...left.frame.center), normal: new Vector3(...left.frame.normal) } : null;

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
