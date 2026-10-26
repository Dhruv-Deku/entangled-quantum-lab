import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, type Texture } from '@iwsdk/core';
import { LabelCard, useStudio } from './machine-kit';

const DOORS = 8;
const UP = new Color('#8fb7ff');
const DOWN = new Color('#ff8a7a');
const PRIZE = new Color('#3ddc97');

/**
 * The Grover maze: eight doors in an arc behind the orbs, one hiding the
 * prize. Above each door a bar shows its amplitude: the oracle flips the
 * prize door's bar below the line, the diffusion step reflects every bar
 * about the average, and after two rounds the prize door towers over the
 * rest. Looking opens one door.
 */
export class GroverDoors {
  readonly root = new Group();
  env: Texture | null = null;
  private lit = false;
  private doors: { leaf: Group; bar: Mesh; barMat: MeshStandardMaterial; open: number; want: number; amp: number; target: number; prize: Mesh }[] = [];

  constructor() {
    this.root.name = 'GroverMaze';
    const frame = new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.4, metalness: 0.6 });
    const wood = new MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.7 });
    const line = new MeshStandardMaterial({ color: '#55585e', roughness: 0.5 });
    for (let i = 0; i < DOORS; i++) {
      // a wide arc, so the doors stand clear of the orbs
      const a = -1.05 + (i / (DOORS - 1)) * 2.1;
      const g = new Group();
      g.position.set(Math.sin(a) * 0.44, 0, -Math.cos(a) * 0.44 + 0.08);
      g.rotation.y = -a;
      for (const [w, h, x, y] of [[0.006, 0.09, -0.028, 0.045], [0.006, 0.09, 0.028, 0.045], [0.062, 0.006, 0, 0.093]]) {
        const b = new Mesh(new BoxGeometry(w, h, 0.012), frame);
        b.position.set(x, y, 0);
        g.add(b);
      }
      // the prize behind the door, and the door itself hinged on its left edge
      const prize = new Mesh(new BoxGeometry(0.02, 0.02, 0.02), new MeshStandardMaterial({ color: PRIZE, emissive: PRIZE, emissiveIntensity: 0.5 }));
      prize.position.set(0, 0.03, -0.01);
      prize.visible = false;
      const leaf = new Group();
      leaf.position.set(-0.025, 0, 0);
      const panel = new Mesh(new BoxGeometry(0.05, 0.086, 0.006), wood);
      panel.position.set(0.025, 0.044, 0);
      leaf.add(panel);
      const num = new LabelCard(0.05, `${i + 1}`, '');
      num.mesh.position.set(0.025, 0.06, 0.004);
      leaf.add(num.mesh);
      // the amplitude bar above the door, from a baseline
      const base = new Mesh(new BoxGeometry(0.05, 0.002, 0.004), line);
      base.position.y = 0.17;
      const barMat = new MeshStandardMaterial({ color: UP, emissive: UP, emissiveIntensity: 0.35, roughness: 0.4 });
      const bar = new Mesh(new BoxGeometry(0.03, 1, 0.006), barMat);
      bar.position.y = 0.17;
      g.add(prize, leaf, base, bar);
      this.root.add(g);
      this.doors.push({ leaf, bar, barMat, open: 0, want: 0, amp: 0, target: 0, prize });
    }
    this.root.visible = false;
  }

  /** The amplitude of each door (real numbers: Grover's never get a phase), and which door is open (null: all shut). */
  set(amps: readonly number[], open: number | null, prize: number | null): void {
    this.doors.forEach((d, i) => {
      d.target = amps[i] ?? 0;
      d.want = open === i ? 1 : 0;
      d.prize.visible = prize === i && open === i;
    });
  }

  update(dt: number): void {
    if (!this.lit && this.env) {
      useStudio(this.root, this.env);
      this.lit = true;
    }
    const k = 1 - Math.exp(-dt * 6);
    for (const d of this.doors) {
      d.amp += (d.target - d.amp) * k;
      d.open += (d.want - d.open) * k;
      const h = Math.max(0.001, Math.abs(d.amp) * 0.11);
      d.bar.scale.y = h;
      d.bar.position.y = 0.17 + (d.amp >= 0 ? h / 2 : -h / 2);
      const c = d.amp >= 0 ? UP : DOWN;
      d.barMat.color.copy(c);
      d.barMat.emissive.copy(c);
      d.leaf.rotation.y = -d.open * 1.6;
    }
  }
}
