import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Vector3, type Texture } from '@iwsdk/core';
import { FridgeVisual } from './fridge';
import { Kit, LabelCard, useStudio } from './machine-kit';

const BAY = 2.2;
const H = 3.4;
const W = 3 * BAY;

/**
 * A modular quantum computer, room-sized, like IBM's Quantum System Two: a
 * long black frame holding three dilution refrigerators side by side, each
 * behind its own glass, linked into one machine, with racks of control
 * electronics at both ends and a light bar along the top. It stands a few
 * metres behind the desk; its cryostats open and cool down as it appears.
 */
export class SystemTwo {
  readonly root = new Group();
  private fridges: FridgeVisual[] = [];
  private leds: MeshBasicMaterial[] = [];
  env: Texture | null = null;
  private built = false;

  constructor() {
    this.root.name = 'SystemTwo';
    this.root.visible = false;
  }

  private build(): void {
    this.built = true;
    const kit = new Kit();
    const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const black = new MeshStandardMaterial({ color: '#111214', roughness: 0.35, metalness: 0.7 });
    const rack = new MeshStandardMaterial({ color: '#1c1e22', roughness: 0.45, metalness: 0.6 });
    // the plinth, the frame of posts and beams, and the top fascia
    kit.box(W + 2.4, 0.12, 2.0, black, P(0, 0.06, 0));
    for (let i = 0; i <= 3; i++)
      for (const z of [-0.9, 0.9]) kit.box(0.09, H, 0.09, black, P(-W / 2 + i * BAY, H / 2 + 0.12, z));
    for (const z of [-0.9, 0.9]) kit.box(W + 0.09, 0.09, 0.09, black, P(0, H + 0.12, z));
    for (let i = 0; i <= 3; i++) kit.box(0.09, 0.09, 1.8, black, P(-W / 2 + i * BAY, H + 0.12, 0));
    kit.box(W + 0.2, 0.32, 0.06, black, P(0, H + 0.34, 0.93));
    // control electronics racks at both ends
    for (const sx of [-1, 1]) kit.box(1.0, 2.4, 1.6, rack, P(sx * (W / 2 + 0.62), 1.32, 0));
    kit.build(this.root);
    const bar = new Mesh(new BoxGeometry(W, 0.03, 0.02), new MeshBasicMaterial({ color: '#e4e6eb', toneMapped: false }));
    bar.position.set(0, H + 0.26, 0.97);
    this.root.add(bar);
    // the three cryostats, each behind glass
    const glass = new MeshStandardMaterial({ color: '#dfe8f2', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const f = new FridgeVisual(5);
      f.root.position.set(-BAY + i * BAY, 0.12, 0);
      f.root.rotation.y = 0;
      this.root.add(f.root);
      this.fridges.push(f);
      const pane = new Mesh(new PlaneGeometry(BAY - 0.1, H - 0.1), glass);
      pane.position.set(-BAY + i * BAY, H / 2 + 0.12, 0.93);
      this.root.add(pane);
    }
    // rack lights
    for (const sx of [-1, 1])
      for (let r = 0; r < 12; r++)
        for (let c = 0; c < 8; c++) {
          const m = new MeshBasicMaterial({ color: '#26324a', toneMapped: false });
          const led = new Mesh(new BoxGeometry(0.05, 0.03, 0.01), m);
          led.position.set(sx * (W / 2 + 0.62) - 0.35 + c * 0.1, 0.4 + r * 0.17, 0.81);
          this.root.add(led);
          this.leds.push(m);
        }
    const name = new LabelCard(1.6, 'A modular quantum computer', 'three cryostats linked into one machine, like IBM System Two');
    name.mesh.position.set(0, H + 0.85, 0.95);
    this.root.add(name.mesh);
    if (this.env) useStudio(this.root, this.env);
  }

  show(on: boolean): void {
    if (on && !this.built) this.build();
    if (on && !this.root.visible) for (const f of this.fridges) f.reveal();
    this.root.visible = on;
  }

  update(dt: number): void {
    for (const f of this.fridges) f.update(dt);
    const now = performance.now() / 1000;
    this.leds.forEach((m, i) => m.color.set(Math.sin(now * 1.1 + i * 2.7) > 0.3 ? '#8fb7ff' : i % 9 === 0 ? '#3ddc97' : '#26324a'));
  }
}
