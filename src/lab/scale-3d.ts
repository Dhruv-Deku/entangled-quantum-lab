import { BoxGeometry, Color, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3 } from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Scale } from '../quantum/scale';
import { Kit, LabelCard, finishes } from './machine-kit';

/** Racks drawn at most (beyond this the label says how many more). */
export const MAX_RACKS = 2400;
/** Racks per row: each row runs away from the desk, along one side of an aisle. */
const PER_ROW = 60;
const RACK_W = 0.62;
/** The first rows stand this far to either side of the desk; each further pair of rows is this much further out. */
const INNER = 1.15;
const ROW_STEP = 1.7;
const NEAR = -0.3;
const LED_OFF = new Color('#1d2a44');
const LED_ON = new Color('#8fb7ff');
const LED_MINT = new Color('#3ddc97');

/**
 * The exponential wall, around you: the computer an ordinary machine would
 * need to store the state of n qubits. Small states fit a phone, a laptop or
 * a server on the desk; then racks of memory appear on the floor ahead, row
 * after row, filling the room and running on past its walls. A big label
 * floats over them: how many qubits, how many bytes.
 */
export class ScaleVisual {
  readonly root = new Group();
  private readonly phone = new Group();
  private readonly laptop = new Group();
  private readonly server = new Group();
  private readonly racks: InstancedMesh;
  private readonly leds: InstancedMesh;
  private readonly label = new LabelCard(1.4, '2 qubits');
  /** Racks shown now, and the count they are growing toward (they pop in row by row). */
  private shown = 0;
  private target = 0;
  private floor = -0.75;
  private pop = 0;
  private blink = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();

  constructor() {
    this.root.name = 'ExponentialWall';
    const f = finishes();
    // a phone
    let k = new Kit();
    k.box(0.075, 0.008, 0.155, f.black, new Vector3(0, 0.004, 0));
    k.build(this.phone);
    const screen = new MeshBasicMaterial({ color: '#1e3354', toneMapped: false });
    const ps = new Mesh(new BoxGeometry(0.066, 0.001, 0.14), screen);
    ps.position.y = 0.0085;
    this.phone.add(ps);
    // a laptop, open
    k = new Kit();
    k.box(0.32, 0.014, 0.22, f.brushed, new Vector3(0, 0.007, 0));
    k.box(0.32, 0.21, 0.008, f.brushed, new Vector3(0, 0.11, -0.11), new Euler(-0.25, 0, 0));
    k.build(this.laptop);
    const ls = new Mesh(new BoxGeometry(0.29, 0.18, 0.001), screen);
    ls.position.set(0, 0.11, -0.104);
    ls.rotation.x = -0.25;
    this.laptop.add(ls);
    // a server, one unit, on the desk
    k = new Kit();
    k.box(0.44, 0.045, 0.42, f.dark, new Vector3(0, 0.0225, 0));
    for (let i = 0; i < 8; i++) k.box(0.035, 0.03, 0.003, f.black, new Vector3(-0.17 + i * 0.045, 0.0225, 0.211));
    k.build(this.server);
    const led = new Mesh(new BoxGeometry(0.008, 0.004, 0.002), new MeshBasicMaterial({ color: '#3ddc97', toneMapped: false }));
    led.position.set(0.19, 0.03, 0.212);
    this.server.add(led);
    for (const g of [this.phone, this.laptop, this.server]) {
      g.position.set(0, 0, -0.05);
      g.visible = false;
      this.root.add(g);
    }
    // a rack: a dark cabinet with a door, and two light strips on its front
    const body = mergeGeometries([new BoxGeometry(0.6, 2.0, 1.0).translate(0, 1.0, 0), new BoxGeometry(0.54, 1.86, 0.02).translate(0, 1.0, 0.51)], false)!;
    this.racks = new InstancedMesh(body, new MeshStandardMaterial({ color: '#16181c', roughness: 0.5, metalness: 0.6 }), MAX_RACKS);
    this.racks.count = 0;
    this.racks.frustumCulled = false;
    this.root.add(this.racks);
    const strip = mergeGeometries([new BoxGeometry(0.012, 1.5, 0.004).translate(-0.18, 1.0, 0.525), new BoxGeometry(0.012, 1.5, 0.004).translate(0.18, 1.0, 0.525)], false)!;
    this.leds = new InstancedMesh(strip, new MeshBasicMaterial({ toneMapped: false }), MAX_RACKS);
    this.leds.count = 0;
    this.leds.frustumCulled = false;
    this.root.add(this.leds);
    this.root.add(this.label.mesh);
    this.root.visible = false;
  }

  /** Where the floor is, below the desk (workspace y). */
  setFloor(y: number): void {
    this.floor = y;
  }

  set(sc: Scale): void {
    this.phone.visible = sc.device === 'phone';
    this.laptop.visible = sc.device === 'laptop';
    this.server.visible = sc.device === 'server';
    this.target = Math.min(MAX_RACKS, sc.racks);
    if (this.target < this.shown) this.shown = this.target;
    this.racks.count = this.leds.count = this.shown;
    this.pop = 1;
    const more = sc.racks > MAX_RACKS ? `, ${(sc.racks - MAX_RACKS).toLocaleString('en-US')} more out of sight` : '';
    this.label.set(`${sc.n} qubits: ${sc.bytes}`, sc.racks ? `${sc.racks.toLocaleString('en-US')} rack${sc.racks === 1 ? '' : 's'} of memory${more}` : `${sc.amplitudes} numbers`);
    // the label floats over the desk device, or high over the racks
    if (sc.racks) this.label.mesh.position.set(0, this.floor + 2.3, -3.6);
    else this.label.mesh.position.set(0, 0.32, -0.12);
    this.label.mesh.scale.setScalar(sc.racks ? 1 : 0.32);
  }

  /**
   * Rack k's place: racks line both sides of an aisle that runs away from the
   * desk, left and right in turn, near to far; a full pair of rows starts the
   * next pair further out. Each faces the aisle.
   */
  private place(k: number): void {
    const side = k % 2 ? 1 : -1;
    const i = Math.floor(k / 2);
    const pair = Math.floor(i / PER_ROW), along = i % PER_ROW;
    const x = side * (INNER + pair * ROW_STEP);
    const z = NEAR - along * RACK_W;
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), side < 0 ? Math.PI / 2 : -Math.PI / 2);
    this.m.compose(this.v.set(x, this.floor, z), this.q, this.s.set(1, 1, 1));
    this.racks.setMatrixAt(k, this.m);
    this.leds.setMatrixAt(k, this.m);
    this.leds.setColorAt(k, LED_OFF.clone().multiplyScalar(this.fadeOf(k)));
  }

  /** Far racks fade into the distance. */
  private fadeOf(k: number): number {
    const i = Math.floor(k / 2);
    return Math.max(0.25, 1 - (i % PER_ROW) / 70 - Math.floor(i / PER_ROW) * 0.06);
  }

  update(dt: number, head: Vector3): void {
    this.pop = Math.max(0, this.pop - dt * 2);
    // racks appear a row at a time
    if (this.shown < this.target) {
      const step = Math.max(PER_ROW, Math.ceil((this.target - this.shown) * dt * 2.5));
      const end = Math.min(this.target, this.shown + step);
      for (let k = this.shown; k < end; k++) this.place(k);
      this.shown = end;
      this.racks.count = this.leds.count = this.shown;
      this.racks.instanceMatrix.needsUpdate = true;
      this.leds.instanceMatrix.needsUpdate = true;
      if (this.leds.instanceColor) this.leds.instanceColor.needsUpdate = true;
    }
    // the racks' lights flicker a few times a second
    this.blink += dt;
    if (this.blink > 0.2 && this.shown) {
      this.blink = 0;
      const n = Math.min(this.shown, 400);
      for (let i = 0; i < n; i++) {
        const k = Math.floor(Math.random() * this.shown);
        const fade = this.fadeOf(k);
        this.leds.setColorAt(k, (Math.random() < 0.15 ? LED_MINT : Math.random() < 0.5 ? LED_ON : LED_OFF).clone().multiplyScalar(fade));
      }
      if (this.leds.instanceColor) this.leds.instanceColor.needsUpdate = true;
    }
    const grow = 1 + 0.12 * this.pop;
    for (const g of [this.phone, this.laptop, this.server]) g.scale.setScalar(grow);
    this.label.mesh.lookAt(head);
  }
}
