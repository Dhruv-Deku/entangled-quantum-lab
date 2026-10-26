import { BoxGeometry, CapsuleGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import { LabelCard } from './machine-kit';

const TITLE = "Schrodinger's cat";

/**
 * Schrodinger's cat, kindly: a wooden box on the desk whose cat is awake and
 * asleep at once while the qubit is in superposition. Measuring opens the
 * lid: the cat sits up, eyes open (|0>), or lies curled up asleep (|1>).
 */
export class CatBox {
  readonly root = new Group();
  private readonly lid = new Group();
  private readonly awake = new Group();
  private readonly asleep = new Group();
  private readonly card = new LabelCard(0.24, TITLE, '');
  private open = 0;
  private target = 0;

  constructor() {
    this.root.name = 'CatBox';
    const wood = new MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.7, metalness: 0 });
    const dark = new MeshStandardMaterial({ color: '#5e4630', roughness: 0.8, metalness: 0 });
    const W = 0.16, H = 0.07;
    // the box: a floor and four walls
    const parts: [number, number, number, number, number, number][] = [
      [W, 0.008, W, 0, 0.004, 0],
      [W, H, 0.008, 0, H / 2, -W / 2],
      [W, H, 0.008, 0, H / 2, W / 2],
      [0.008, H, W, -W / 2, H / 2, 0],
      [0.008, H, W, W / 2, H / 2, 0],
    ];
    for (const [w, h, d, x, y, z] of parts) {
      const m = new Mesh(new BoxGeometry(w, h, d), wood);
      m.position.set(x, y, z);
      this.root.add(m);
    }
    // the lid hinges on the back edge
    const board = new Mesh(new BoxGeometry(W + 0.01, 0.01, W + 0.01), dark);
    board.position.set(0, 0, W / 2);
    this.lid.add(board);
    this.lid.position.set(0, H + 0.005, -W / 2);
    this.root.add(this.lid);
    const fur = new MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.9, metalness: 0 });
    const eye = new MeshStandardMaterial({ color: '#3ddc97', emissive: '#3ddc97', emissiveIntensity: 0.6 });
    // awake: sitting up, ears pricked, eyes open, tail curled round
    const body = new Mesh(new CapsuleGeometry(0.028, 0.03, 6, 12), fur);
    body.position.set(0, 0.045, 0);
    const head = new Mesh(new SphereGeometry(0.024, 16, 12), fur);
    head.position.set(0, 0.098, 0.008);
    this.awake.add(body, head);
    for (const sx of [-1, 1]) {
      const ear = new Mesh(new ConeGeometry(0.008, 0.016, 8), fur);
      ear.position.set(sx * 0.012, 0.122, 0.006);
      const e = new Mesh(new SphereGeometry(0.004, 8, 6), eye);
      e.position.set(sx * 0.009, 0.101, 0.03);
      this.awake.add(ear, e);
    }
    const tail = new Mesh(new TorusGeometry(0.03, 0.006, 6, 20, Math.PI), fur);
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 0.012, 0);
    this.awake.add(tail);
    // asleep: curled into a ring on the floor of the box, head tucked in
    const curl = new Mesh(new TorusGeometry(0.032, 0.017, 10, 24), fur);
    curl.rotation.x = Math.PI / 2;
    curl.position.y = 0.022;
    const nap = new Mesh(new SphereGeometry(0.02, 14, 10), fur);
    nap.position.set(0.026, 0.03, 0.012);
    this.asleep.add(curl, nap);
    this.root.add(this.awake, this.asleep);
    this.card.mesh.position.set(0, H + 0.12, 0);
    this.root.add(this.card.mesh);
    this.root.visible = false;
  }

  /** The cat as the qubit has it: p1 is the chance of |1> (asleep); `collapsed` once measured. */
  set(p1: number, collapsed: boolean): void {
    this.target = collapsed ? 1 : 0;
    const asleep = collapsed && p1 > 0.5;
    this.awake.visible = collapsed && !asleep;
    this.asleep.visible = asleep;
    this.card.set(TITLE, collapsed ? (asleep ? 'asleep: you measured |1>' : 'awake: you measured |0>') : `awake ${Math.round((1 - p1) * 100)}%, asleep ${Math.round(p1 * 100)}%. Measure to look.`);
  }

  update(dt: number): void {
    this.open += (this.target - this.open) * Math.min(1, dt * 4);
    this.lid.rotation.x = -this.open * 1.9;
  }
}
