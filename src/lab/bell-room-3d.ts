import { BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';
import type { BellMode, BellRound } from '../quantum/bell-room';
import { dialDeg } from '../quantum/bell-room';
import { LabelCard } from './machine-kit';

const PLUS = new Color('#3fc6c9');
const MINUS = new Color('#ff7759');
const IDLE = new Color('#55585e');
const MAX_SPARKS = 16;
const FLIGHT = 0.45;

interface Beacon {
  group: Group;
  core: MeshStandardMaterial;
  pointer: Group;
  label: LabelCard;
  name: string;
  flash: number;
  /** Where the pointer is turning to (radians). */
  want: number;
}

interface Spark {
  from: Vector3;
  to: Vector3;
  t: number;
  done?: () => void;
}

/**
 * The Bell test, room-sized: a source on your desk and two detectors far
 * apart in the room (on your real walls when the headset knows them). Each
 * round a pair flies out; while they fly, each detector turns its dial to a
 * setting chosen at random; on arrival each lights teal (+1) or red (-1).
 * In the quantum run a gold thread spans the room between them.
 */
export class BellRoomVisual {
  readonly root = new Group();
  private readonly source = new Group();
  private readonly beacons: Beacon[];
  private readonly thread: Mesh;
  private readonly threadMat: MeshBasicMaterial;
  private readonly sparks: InstancedMesh;
  private flying: Spark[] = [];
  private readonly m = new Matrix4();
  private mode: BellMode = 'quantum';

  constructor() {
    this.root.name = 'BellRoom';
    const emitter = new Mesh(new SphereGeometry(0.014, 20, 14), new MeshBasicMaterial({ color: '#f2f3f5', toneMapped: false }));
    const ring = new Mesh(new TorusGeometry(0.026, 0.002, 8, 40), new MeshBasicMaterial({ color: '#8a8d93' }));
    this.source.add(emitter, ring);
    this.root.add(this.source);
    this.beacons = ['Alice', 'Bob'].map((name) => {
      const group = new Group();
      const glass = new Mesh(new SphereGeometry(0.085, 32, 24), new MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false }));
      const core = new MeshStandardMaterial({ color: IDLE, emissive: IDLE, emissiveIntensity: 0.4, roughness: 0.3 });
      const coreMesh = new Mesh(new SphereGeometry(0.04, 24, 18), core);
      // the dial: a ring facing you with a pointer to the setting
      const dial = new Mesh(new TorusGeometry(0.11, 0.0025, 8, 64), new MeshBasicMaterial({ color: '#8a8d93' }));
      const pointer = new Group();
      const needle = new Mesh(new BoxGeometry(0.004, 0.11, 0.004).translate(0, 0.055, 0), new MeshBasicMaterial({ color: '#f2f3f5', toneMapped: false }));
      pointer.add(needle);
      const label = new LabelCard(0.2, name, 'waiting');
      label.mesh.position.set(0, -0.17, 0);
      group.add(glass, coreMesh, dial, pointer, label.mesh);
      this.root.add(group);
      return { group, core, pointer, label, name, flash: 0, want: 0 };
    });
    this.threadMat = new MeshBasicMaterial({ color: '#e2b04a', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false });
    this.thread = new Mesh(new CylinderGeometry(0.0022, 0.0022, 1, 8), this.threadMat);
    this.root.add(this.thread);
    this.sparks = new InstancedMesh(new SphereGeometry(0.009, 12, 8), new MeshBasicMaterial({ color: '#f2f3f5', toneMapped: false }), MAX_SPARKS);
    this.sparks.count = 0;
    this.sparks.frustumCulled = false;
    this.root.add(this.sparks);
    this.root.visible = false;
  }

  /** Put the source and the two detectors (world positions), the detectors turned toward `face`. */
  place(source: Vector3, alice: Vector3, bob: Vector3, face: Vector3): void {
    this.source.position.copy(source);
    this.beacons[0].group.position.copy(alice);
    this.beacons[1].group.position.copy(bob);
    for (const b of this.beacons) b.group.lookAt(face.x, b.group.position.y, face.z);
    // the thread: a straight line from one detector to the other
    const mid = alice.clone().add(bob).multiplyScalar(0.5);
    const d = bob.clone().sub(alice);
    this.thread.position.copy(mid);
    this.thread.scale.set(1, Math.max(0.01, d.length() - 0.17), 1);
    this.thread.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  }

  setMode(mode: BellMode): void {
    this.mode = mode;
    this.thread.visible = mode === 'quantum';
    for (const b of this.beacons) b.label.set(b.name, mode === 'quantum' ? 'entangled pair' : 'hidden instructions');
  }

  /** One round: a pair flies out; dials turn while it flies; both light up on arrival. */
  fire(r: BellRound, done: () => void): void {
    if (this.flying.length + 2 > MAX_SPARKS) return done();
    const [a, b] = this.beacons;
    a.want = (dialDeg('a', r.x) * Math.PI) / 180;
    b.want = (dialDeg('b', r.y) * Math.PI) / 180;
    this.flying.push({ from: this.source.position.clone(), to: a.group.position.clone(), t: 0 });
    this.flying.push({
      from: this.source.position.clone(),
      to: b.group.position.clone(),
      t: 0,
      done: () => {
        this.light(a, r.a, `${dialDeg('a', r.x)} deg: ${r.a > 0 ? '+1' : '-1'}`);
        this.light(b, r.b, `${dialDeg('b', r.y)} deg: ${r.b > 0 ? '+1' : '-1'}`);
        done();
      },
    });
  }

  private light(b: Beacon, v: number, text: string): void {
    const c = v > 0 ? PLUS : MINUS;
    b.core.color.copy(c);
    b.core.emissive.copy(c);
    b.flash = 1;
    b.label.set(b.name, text);
  }

  update(dt: number): void {
    for (const b of this.beacons) {
      // dials turn quickly to their setting
      const cur = b.pointer.rotation.z;
      b.pointer.rotation.z = cur + (b.want - cur) * (1 - Math.exp(-dt * 18));
      b.flash = Math.max(0, b.flash - dt * 2.2);
      b.core.emissiveIntensity = 0.3 + 1.2 * b.flash;
    }
    // sparks along a gentle arc
    const done: Spark[] = [];
    this.flying.forEach((s, i) => {
      s.t += dt / FLIGHT;
      const u = Math.min(1, s.t);
      const p = s.from.clone().lerp(s.to, u);
      p.y += Math.sin(Math.PI * u) * 0.12;
      this.m.makeTranslation(p.x, p.y, p.z);
      this.sparks.setMatrixAt(i, this.m);
      if (s.t >= 1) done.push(s);
    });
    this.flying = this.flying.filter((s) => !done.includes(s));
    done.forEach((s) => s.done?.());
    this.sparks.count = this.flying.length;
    this.sparks.instanceMatrix.needsUpdate = true;
    this.threadMat.opacity = this.mode === 'quantum' ? 0.55 + 0.3 * Math.max(...this.beacons.map((b) => b.flash)) : 0;
  }
}
