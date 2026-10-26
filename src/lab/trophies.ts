import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Texture,
} from '@iwsdk/core';
import { Kit, LabelCard, useStudio } from './machine-kit';

const COLS = 7;
const CELL = 0.058;
const ROW = 0.078;

/** Five trophy shapes, about 4 cm tall, standing on y = 0. */
function shape(kind: number): BufferGeometry {
  switch (kind % 5) {
    case 0: {
      // a cup: foot, stem, bowl
      const pts = [[0, 0], [0.011, 0], [0.011, 0.003], [0.003, 0.006], [0.0025, 0.016], [0.006, 0.019], [0.012, 0.03], [0.013, 0.04], [0.011, 0.04], [0.01, 0.031], [0, 0.026]].map(([x, y]) => new Vector2(x, y));
      return new LatheGeometry(pts, 24);
    }
    case 1: {
      // a star, standing up
      const st = new Shape();
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.0075 : 0.017;
        i ? st.lineTo(Math.cos(a) * r, Math.sin(a) * r) : st.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const g = new ExtrudeGeometry(st, { depth: 0.004, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0012, bevelSegments: 2 });
      g.translate(0, 0.021, -0.002);
      return g;
    }
    case 2: {
      const g = new OctahedronGeometry(0.012, 0);
      g.scale(1, 1.6, 1);
      g.translate(0, 0.022, 0);
      return g;
    }
    case 3: {
      // a medal on edge
      const g = new CylinderGeometry(0.014, 0.014, 0.003, 28);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0.02, 0);
      return g;
    }
    default: {
      const g = new CylinderGeometry(0.004, 0.008, 0.034, 4);
      g.rotateY(Math.PI / 4);
      g.translate(0, 0.019, 0);
      return g;
    }
  }
}

export interface TrophyItem {
  id: string;
  title: string;
  unlocked: boolean;
}

/**
 * The trophy shelf beside the progress board: one 3D trophy per achievement,
 * in polished silver, copper or mint glass once earned (turning slowly), a dim
 * silhouette until then. Newly earned trophies pop up when the shelf opens.
 */
export class TrophyShelf {
  readonly root = new Group();
  private trophies: { mesh: Mesh; id: string; on: boolean; pop: number }[] = [];
  private readonly title = new LabelCard(0.3, 'Trophies', '');
  private seen = new Set<string>();
  private key = '';
  env: Texture | null = null;
  private readonly finishes = [
    new MeshStandardMaterial({ color: '#d8dce3', roughness: 0.12, metalness: 1 }),
    new MeshStandardMaterial({ color: '#c47c4e', roughness: 0.2, metalness: 1 }),
    new MeshStandardMaterial({ color: '#3ddc97', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 }),
  ];
  private readonly locked = new MeshStandardMaterial({ color: '#3a3c41', roughness: 0.6, metalness: 0.2, transparent: true, opacity: 0.45 });

  constructor() {
    this.root.name = 'Trophies';
  }

  private build(n: number): void {
    this.root.clear();
    this.trophies = [];
    const rows = Math.ceil(n / COLS);
    const w = COLS * CELL + 0.03, h = rows * ROW + 0.02;
    const kit = new Kit();
    const wood = new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.45, metalness: 0.6 });
    const back = new MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.8, metalness: 0.1 });
    kit.box(w, h, 0.006, back, new Vector3(0, h / 2, -0.03));
    for (let r = 0; r <= rows; r++) kit.box(w + 0.01, 0.006, 0.07, wood, new Vector3(0, r * ROW, 0));
    for (const sx of [-1, 1]) kit.box(0.006, h, 0.07, wood, new Vector3((sx * (w + 0.004)) / 2, h / 2, 0));
    kit.build(this.root);
    for (let i = 0; i < n; i++) {
      const r = rows - 1 - Math.floor(i / COLS), c = i % COLS;
      const mesh = new Mesh(shape(i), this.locked);
      mesh.position.set((c - (COLS - 1) / 2) * CELL, r * ROW + 0.003, 0);
      const plinth = new Mesh(new BoxGeometry(0.02, 0.004, 0.02), wood);
      plinth.position.set(mesh.position.x, mesh.position.y + 0.002, 0);
      mesh.position.y += 0.004;
      this.root.add(plinth, mesh);
      this.trophies.push({ mesh, id: '', on: false, pop: 0 });
    }
    this.title.mesh.position.set(0, h + 0.035, 0);
    this.root.add(this.title.mesh);
    if (this.env) useStudio(this.root, this.env, 1.2);
  }

  /** The achievements, in order: earned ones get their finish; ones earned since last time pop. */
  set(items: readonly TrophyItem[]): void {
    const key = items.map((t) => `${t.id}:${t.unlocked ? 1 : 0}`).join(',');
    if (key === this.key) return;
    this.key = key;
    if (this.trophies.length !== items.length) this.build(items.length);
    const first = this.seen.size === 0;
    items.forEach((t, i) => {
      const tr = this.trophies[i];
      tr.id = t.id;
      tr.on = t.unlocked;
      tr.mesh.material = t.unlocked ? this.finishes[i % 3] : this.locked;
      if (t.unlocked && !this.seen.has(t.id)) {
        if (!first) tr.pop = 1;
        this.seen.add(t.id);
      }
    });
    const earned = items.filter((t) => t.unlocked).length;
    this.title.set('Trophies', `${earned} of ${items.length} earned`);
  }

  update(dt: number): void {
    for (const t of this.trophies) {
      if (t.on) t.mesh.rotation.y += dt * 0.6;
      if (t.pop > 0) {
        t.pop = Math.max(0, t.pop - dt / 1.2);
        t.mesh.scale.setScalar(1 + 0.6 * Math.sin(Math.PI * t.pop));
      }
    }
  }
}
