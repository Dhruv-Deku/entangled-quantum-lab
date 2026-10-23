import { createSystem, Matrix4, Vector3 } from '@iwsdk/core';
import { DEMO_LOOP, demoHand, pulse } from '../gestures/demos';
import { synthHand, type SynthHandOptions } from '../gestures/synthetic';
import { GhostHand } from '../lab/ghost-hand';
import { lab } from '../lab/instance';
import { LabSystem } from '../lab/lab-system';
import { ORB_RADIUS } from '../lab/visuals';
import type { Hint } from './chapters';
import { campaign } from './instance';
import { puzzleTarget } from './puzzles';

/** A new hint plays this long, then rests until the player has been idle a while. */
const SHOW_FOR = 2 * DEMO_LOOP;
const IDLE_AGAIN = 9;
const MAX_OPACITY = 0.9;

// Hand orientations as bases: columns are where the synthetic hand's x (thumb side),
// y (fingers) and z (palm normal) point in workspace space.
// open hand behind the orb, palm facing it and fingers rising: you see the back of the hand and the fan of fingers
const PALM_TOWARD = new Matrix4().makeBasis(new Vector3(-1, 0, 0), new Vector3(0, 0.6, -0.8), new Vector3(0, -0.8, -0.6));
/** From the orb centre toward where the palm hovers (opposite the palm normal). */
const PALM_OFFSET = new Vector3(0, 0.8, 0.6);
const SHAKE_RIGHT = new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(-0.35, 0, -1).normalize(), new Vector3(-1, 0, 0.35).normalize());
const SHAKE_LEFT = new Matrix4().makeBasis(new Vector3(0, -1, 0), new Vector3(0.35, 0, -1).normalize(), new Vector3(1, 0, 0.35).normalize());

interface Pose {
  opts: SynthHandOptions;
  basis: Matrix4;
  /** Joint the hand is placed by (its position lands on `target`). */
  anchor: 'pinch' | 'palm';
  target: Vector3;
}

/**
 * The ghost hand: shows the gesture the current chapter step needs, right on
 * the orb it applies to. It plays when a step starts, then steps aside, and
 * comes back if the player stalls. Works the same on desktop and in a headset.
 */
export class TutorSystem extends createSystem({}) {
  private hands = [new GhostHand(), new GhostHand()];
  private key = '';
  private shown = 0;
  private idle = 0;
  private opacity = 0;
  private parented = false;
  private targetKey = '';
  private readonly orb = new Vector3();
  private readonly orb2 = new Vector3();
  private readonly v = new Vector3();
  private readonly anchorWorld = new Vector3();

  init(): void {
    this.cleanupFuncs.push(
      lab.on((e) => {
        if (e.type === 'op' || e.type === 'shots') this.idle = 0;
        // a restarted chapter or lesson plays its demo again from the top
        if (e.type === 'reset') this.shown = 0;
      }),
    );
  }

  private poses(h: Hint, u: number): Pose[] {
    const labSys = this.world.getSystem(LabSystem)!;
    const r = ORB_RADIUS;
    labSys.orbLocal(h.qubits[0], this.orb);
    switch (h.gesture) {
      case 'spread': {
        const a = pulse(u);
        return [{
          opts: demoHand('spread', u),
          basis: PALM_TOWARD,
          anchor: 'palm',
          target: this.orb.clone().addScaledVector(PALM_OFFSET, r + 0.06 - 0.015 * a),
        }];
      }
      case 'fist': {
        return [{
          opts: demoHand('fist', u),
          basis: PALM_TOWARD,
          anchor: 'palm',
          target: this.orb.clone().addScaledVector(PALM_OFFSET, r + 0.055),
        }];
      }
      case 'twist': {
        return [{
          opts: demoHand('twist', u),
          basis: SHAKE_RIGHT,
          anchor: 'pinch',
          target: this.orb.clone().add(new Vector3(r * 0.95, 0, 0.005)),
        }];
      }
      case 'touch': {
        // one hand on each orb, both drift toward the middle and back
        labSys.orbLocal(h.qubits[1], this.orb2);
        let [left, right] = [this.orb.clone(), this.orb2.clone()];
        if (left.x > right.x) [left, right] = [right, left];
        const gap = Math.max(0, left.distanceTo(right) / 2 - r * 1.05);
        const a = pulse(u);
        const dir = right.clone().sub(left).normalize();
        return [
          { opts: demoHand('pinch', u), basis: SHAKE_RIGHT, anchor: 'pinch', target: right.addScaledVector(dir, -gap * a).add(new Vector3(r * 0.95, 0, 0)) },
          { opts: { ...demoHand('pinch', u), handedness: 'left' }, basis: SHAKE_LEFT, anchor: 'pinch', target: left.addScaledVector(dir, gap * a).add(new Vector3(-r * 0.95, 0, 0)) },
        ];
      }
    }
  }

  private place(hand: GhostHand, pose: Pose): void {
    const joints = synthHand(pose.opts);
    // anchor point in hand space: between thumb and index tips, or the middle of the palm
    const [i, j] = pose.anchor === 'pinch' ? [4, 9] : [0, 11];
    const w = pose.anchor === 'pinch' ? 0.5 : 0.6;
    this.v.set(
      joints[i * 3] + (joints[j * 3] - joints[i * 3]) * w,
      joints[i * 3 + 1] + (joints[j * 3 + 1] - joints[i * 3 + 1]) * w,
      joints[i * 3 + 2] + (joints[j * 3 + 2] - joints[i * 3 + 2]) * w,
    );
    this.anchorWorld.copy(this.v).applyMatrix4(pose.basis);
    hand.root.quaternion.setFromRotationMatrix(pose.basis);
    hand.root.position.copy(pose.target).sub(this.anchorWorld);
    hand.setPose(joints);
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    const labSys = this.world.getSystem(LabSystem);
    if (!labSys) return;
    if (!this.parented) {
      for (const h of this.hands) labSys.workspaceObject.add(h.root);
      this.parented = true;
    }
    // a lesson's target arrows, kept up after the goal is met so the ring can turn mint
    const v = campaign.view;
    const targets = v.mode !== 'sandbox' && !v.intro ? v.targets : null;
    const tkey = `${v.mode}-${v.chapterIndex}-${v.lessonIndex}-${v.puzzleIndex}-${labSys.orbCount}-${targets ? JSON.stringify(targets) : ''}`;
    if (tkey !== this.targetKey) {
      this.targetKey = tkey;
      labSys.setTargets(targets);
      labSys.setBoardTarget(v.mode === 'puzzle' && v.chapter ? puzzleTarget(v.chapter) : null);
    }

    const hint = campaign.hint();
    const valid = hint && hint.qubits.every((q) => q < labSys.orbCount) ? hint : null;
    const key = valid ? `${campaign.mode}-${campaign.chapterIndex}-${campaign.lessonIndex}-${campaign.stepIndex}-${valid.gesture}-${valid.qubits.join(',')}` : '';
    if (key !== this.key) {
      this.key = key;
      this.shown = 0;
      this.idle = 0;
    }
    this.shown += dt;
    this.idle += dt;
    const want = valid && (this.shown < SHOW_FOR || this.idle > IDLE_AGAIN) && !lab.rotating ? MAX_OPACITY : 0;
    this.opacity += Math.sign(want - this.opacity) * Math.min(Math.abs(want - this.opacity), dt * 2.5);
    GhostHand.opacity = this.opacity;

    const visible = !!valid && this.opacity > 0.01;
    if (!visible) {
      for (const h of this.hands) h.root.visible = false;
      return;
    }
    const poses = this.poses(valid!, (this.shown % DEMO_LOOP) / DEMO_LOOP);
    this.hands.forEach((h, k) => {
      h.root.visible = k < poses.length;
      if (k < poses.length) this.place(h, poses[k]);
    });
  }
}
