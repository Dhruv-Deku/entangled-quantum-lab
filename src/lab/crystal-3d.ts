import { Color, ConeGeometry, CylinderGeometry, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, TorusGeometry, Vector3 } from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Growth } from '../game/growth';
import { LabelCard } from './machine-kit';

const MAX_SHARDS = 32;
const MAX_RINGS = 40;
const TOP = 0.012;
const MINT = new Color('#3ddc97');
const OLD_RING = new Color('#5a6170');

interface Live {
  id: string;
  x: number;
  z: number;
  lean: number;
  spin: number;
  width: number;
  /** Height shown now, and where it is heading. */
  h: number;
  target: number;
  color: Color;
  /** 0..1 while a new shard sprouts. */
  sprout: number;
}

/**
 * Your crystal, on the desk: glass shards on a dark base, one per idea you
 * have met in Today, taller the better you know it, with a ring around the
 * base for every day you came. Dim and slowly breathing until today's five
 * minutes are done; then it brightens, and new shards sprout.
 */
export class CrystalVisual {
  readonly root = new Group();
  private readonly shards: InstancedMesh;
  private readonly shardMat: MeshStandardMaterial;
  private readonly rings: InstancedMesh;
  private readonly waiting: Mesh;
  private readonly waitMat: MeshBasicMaterial;
  private readonly label = new LabelCard(0.2, 'Your crystal');
  private live: Live[] = [];
  private awake = false;
  private glow = 0;
  private t = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly v = new Vector3();
  private readonly s = new Vector3();

  constructor() {
    this.root.name = 'Crystal';
    const base = new Mesh(new CylinderGeometry(0.056, 0.06, TOP, 48), new MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.4, metalness: 0.6 }));
    base.position.y = TOP / 2;
    this.root.add(base);
    // the day rings, laid flat on top of the base
    this.rings = new InstancedMesh(new TorusGeometry(1, 0.0007, 4, 72), new MeshBasicMaterial({ toneMapped: false }), MAX_RINGS);
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    this.root.add(this.rings);
    // one shard: a hexagonal prism with a pointed tip, one unit tall
    // a hexagonal prism, one unit wide and tall, with a pointed tip
    const prism = new CylinderGeometry(0.42, 0.5, 0.74, 6);
    prism.translate(0, 0.37, 0);
    const tip = new ConeGeometry(0.42, 0.26, 6);
    tip.translate(0, 0.87, 0);
    const shard = mergeGeometries([prism.toNonIndexed(), tip.toNonIndexed()], false)!;
    shard.computeVertexNormals();
    this.shardMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.8, emissive: new Color('#ffffff'), emissiveIntensity: 0.06, flatShading: true });
    this.shards = new InstancedMesh(shard, this.shardMat, MAX_SHARDS);
    this.shards.count = 0;
    this.shards.frustumCulled = false;
    this.root.add(this.shards);
    // a soft ring that breathes while today's session is still to do
    this.waitMat = new MeshBasicMaterial({ color: '#8fb7ff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.waiting = new Mesh(new TorusGeometry(0.062, 0.0012, 6, 72), this.waitMat);
    this.waiting.rotation.x = Math.PI / 2;
    this.waiting.position.y = TOP;
    this.root.add(this.waiting);
    this.label.mesh.position.set(0, 0.16, 0);
    this.label.mesh.visible = false;
    this.root.add(this.label.mesh);
  }

  /** Show this crystal; with `animate`, new shards sprout and grown ones rise. */
  set(g: Growth, animate: boolean): void {
    const old = new Map(this.live.map((l) => [l.id, l]));
    this.live = g.shards.slice(0, MAX_SHARDS).map((s) => {
      const prev = old.get(s.id);
      const spin = ((s.x * 9301 + s.z * 49297) % 1) * Math.PI;
      return {
        id: s.id,
        x: s.x,
        z: s.z,
        lean: s.lean,
        spin,
        width: 0.0085 + 0.0011 * s.box,
        h: prev ? prev.h : animate ? 0 : s.height,
        target: s.height,
        color: new Color(s.color),
        sprout: prev || !animate ? 1 : 0,
      };
    });
    this.shards.count = this.live.length;
    this.live.forEach((l, i) => this.shards.setColorAt(i, l.color));
    if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;
    // rings: newest outermost; the current streak in mint
    const n = Math.min(MAX_RINGS, g.days.length);
    this.rings.count = n;
    for (let k = 0; k < n; k++) {
      const r = 0.054 - k * 0.0011;
      this.m.compose(this.v.set(0, TOP + 0.0004, 0), this.q.setFromEuler(this.e.set(Math.PI / 2, 0, 0)), this.s.set(r, r, r));
      this.rings.setMatrixAt(k, this.m);
      this.rings.setColorAt(k, k < g.streak ? MINT : OLD_RING);
    }
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    if (animate && g.todayDone && !this.awake) this.glow = 1;
    this.awake = g.todayDone;
    this.label.set(g.shards.length ? `${g.shards.length} ideas, ${g.solid} solid` : 'Your crystal', g.todayDone ? `${g.days.length} day${g.days.length === 1 ? '' : 's'}, ${g.streak} in a row` : "Grows after today's five minutes");
    this.layout();
  }

  /** Name and numbers above it (during Today and on the progress board). */
  showLabel(on: boolean): void {
    this.label.mesh.visible = on;
  }

  private layout(): void {
    this.live.forEach((l, i) => {
      const grow = l.sprout < 1 ? 1 - Math.pow(1 - l.sprout, 3) : 1;
      const h = Math.max(0.0005, l.h * grow);
      const out = Math.atan2(l.z, l.x);
      // lean away from the centre, then turn to face out
      this.q.setFromEuler(this.e.set(0, -out, 0, 'YXZ'));
      const tilt = new Quaternion().setFromEuler(new Euler(0, 0, -l.lean * 0.75));
      const spin = new Quaternion().setFromEuler(new Euler(0, l.spin, 0));
      this.q.multiply(tilt).multiply(spin);
      this.m.compose(this.v.set(l.x, TOP, l.z), this.q, this.s.set(l.width * grow, h, l.width * grow));
      this.shards.setMatrixAt(i, this.m);
    });
    this.shards.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, head: Vector3): void {
    this.t += dt;
    let moving = false;
    for (const l of this.live) {
      if (l.sprout < 1) {
        l.sprout = Math.min(1, l.sprout + dt / 1.4);
        moving = true;
      }
      if (Math.abs(l.target - l.h) > 1e-4) {
        l.h += (l.target - l.h) * (1 - Math.exp(-dt * 2.5));
        moving = true;
      }
    }
    if (moving) this.layout();
    this.glow = Math.max(0, this.glow - dt * 0.5);
    // awake: bright glass; waiting: dim, with a breathing ring
    const breathe = 0.5 + 0.5 * Math.sin(this.t * 1.6);
    this.shardMat.emissiveIntensity = this.awake ? 0.25 + 0.6 * this.glow : 0;
    this.shardMat.opacity = this.awake ? 0.88 : 0.55;
    // waiting, the glass is greyed; awake, its colours come back
    this.shardMat.color.setScalar(this.awake ? 1 : 0.45 + 0.08 * breathe);
    this.waitMat.opacity = this.awake ? 0 : 0.25 + 0.4 * breathe;
    if (this.label.mesh.visible) this.label.mesh.lookAt(head);
  }
}
