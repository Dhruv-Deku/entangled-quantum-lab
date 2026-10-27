import { createSystem, Grabbed, Vector3, type Entity } from '@iwsdk/core';
import { Qubit } from './components';
import { feedback } from './feedback';
import { lab } from './instance';
import { LabSystem } from './lab-system';
import { ORB_RADIUS } from './visuals';

/** A release faster than this (m/s) is a throw. */
const THROW = 0.9;
const GRAVITY = -5.5;
const BOUNCE = 0.45;
/** The desk top, in the workspace's own coordinates (the floor is below it). */
const DESK = { minX: -0.6, maxX: 0.6, minZ: -0.6, maxZ: 0.35 };

interface Flight {
  v: Vector3;
  landed: boolean;
  /** Seconds it has lain still; then it floats home over RETURN seconds. */
  still: number;
  back: number;
  from: Vector3;
}

const RETURN = 0.8;

/**
 * Toss the orbs: let go of an orb with a flick and it flies, falls, lands on
 * the desk with a bounce and rolls to a stop. Landing is a measurement (the
 * qubit collapses to 0 or 1, as if the impact looked at it); a moment later
 * the orb floats back to its place. An orb thrown off the desk falls to the
 * floor and comes back the same way.
 */
export class TossSystem extends createSystem({
  held: { required: [Qubit, Grabbed] },
  qubits: { required: [Qubit] },
}) {
  private samples = new Map<Entity, { p: Vector3; t: number }[]>();
  private flights = new Map<Entity, Flight>();
  private clock = 0;
  private readonly home = new Vector3();

  init(): void {
    this.queries.held.subscribe('disqualify', (e) => this.release(e));
    this.queries.held.subscribe('qualify', (e) => {
      this.flights.delete(e);
      this.samples.set(e, []);
    });
    if (import.meta.env.DEV) (globalThis as { __entangledToss?: (i: number, vx: number, vy: number, vz: number) => void }).__entangledToss = (i, vx, vy, vz) => {
      for (const e of this.queries.qubits.entities) if ((e.getValue(Qubit, 'index') ?? -1) === i) this.throw(e, new Vector3(vx, vy, vz));
    };
  }

  /** Let go: if the hand was moving fast enough, the orb flies on. */
  private release(e: Entity): void {
    const s = this.samples.get(e);
    this.samples.delete(e);
    if (!s || s.length < 2) return;
    const a = s[0], b = s[s.length - 1];
    const dt = b.t - a.t;
    if (dt <= 0) return;
    const v = b.p.clone().sub(a.p).divideScalar(dt);
    if (v.length() > THROW) this.throw(e, v);
  }

  private throw(e: Entity, v: Vector3): void {
    this.flights.set(e, { v: v.clone(), landed: false, still: 0, back: 0, from: new Vector3() });
    feedback('select');
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    this.clock += dt;
    // remember where held orbs have been for the last tenth of a second
    for (const e of this.queries.held.entities) {
      const list = this.samples.get(e) ?? [];
      list.push({ p: e.object3D!.position.clone(), t: this.clock });
      while (list.length && this.clock - list[0].t > 0.1) list.shift();
      this.samples.set(e, list);
    }
    const labSys = this.world.getSystem(LabSystem);
    const floor = labSys ? -labSys.workspaceObject.position.y : -0.75;
    for (const [e, f] of this.flights) {
      const obj = e.object3D!;
      const p = obj.position;
      const index = e.getValue(Qubit, 'index') ?? 0;
      if (f.back > 0 || (f.landed && f.still > 0.6)) {
        // float back home
        if (f.back === 0) f.from.copy(p);
        f.back += dt / RETURN;
        labSys?.homeOf(index, this.home);
        const u = Math.min(1, f.back), k = u * u * (3 - 2 * u);
        p.lerpVectors(f.from, this.home, k);
        if (u >= 1) this.flights.delete(e);
        continue;
      }
      f.v.y += GRAVITY * dt;
      p.addScaledVector(f.v, dt);
      const onDesk = p.x > DESK.minX && p.x < DESK.maxX && p.z > DESK.minZ && p.z < DESK.maxZ;
      const ground = (onDesk ? 0 : floor) + ORB_RADIUS;
      if (p.y < ground) {
        p.y = ground;
        if (!f.landed) {
          // the impact looks at the qubit
          f.landed = true;
          lab.select(index);
          lab.measure(index);
          feedback('measure');
        }
        f.v.y = Math.abs(f.v.y) > 0.25 ? -f.v.y * BOUNCE : 0;
        f.v.x *= 0.82;
        f.v.z *= 0.82;
      }
      if (f.landed && f.v.length() < 0.12) f.still += dt;
      // never fly away for good
      if (p.length() > 6) f.back = 0.0001;
    }
  }
}
