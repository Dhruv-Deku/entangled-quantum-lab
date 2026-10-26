import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Texture,
} from '@iwsdk/core';
import { LabelCard, useStudio } from './machine-kit';

interface Milestone {
  year: string;
  title: string;
  line: string;
  icon: (g: Group, m: MeshStandardMaterial, accent: MeshStandardMaterial) => void;
}

const add = (g: Group, geo: BufferGeometry, m: MeshStandardMaterial, x = 0, y = 0, z = 0) => {
  const mesh = new Mesh(geo, m);
  mesh.position.set(x, y, z);
  g.add(mesh);
  return mesh;
};

const MILESTONES: Milestone[] = [
  { year: '1981', title: 'Feynman', line: 'simulate nature with quantum machines', icon: (g, m, a) => { add(g, new SphereGeometry(0.012, 14, 10), a); for (let k = 0; k < 3; k++) add(g, new TorusGeometry(0.035, 0.002, 6, 40), m).rotation.set(k, k * 1.1, 0); } },
  { year: '1985', title: 'Deutsch', line: 'the universal quantum computer', icon: (g, m) => void add(g, new BoxGeometry(0.045, 0.045, 0.045), m).rotation.set(0.6, 0.7, 0) },
  { year: '1994', title: 'Shor', line: 'factoring, fast: RSA in danger', icon: (g, m, a) => { add(g, new BoxGeometry(0.03, 0.03, 0.03), m, -0.022); add(g, new BoxGeometry(0.03, 0.03, 0.03), a, 0.022); } },
  { year: '1996', title: 'Grover', line: 'search a haystack in its square root', icon: (g, m) => { add(g, new TorusGeometry(0.022, 0.004, 8, 32), m, 0, 0.01); add(g, new CylinderGeometry(0.004, 0.004, 0.035, 8), m, 0.022, -0.022).rotation.z = 0.8; } },
  { year: '1998', title: 'First qubits', line: 'two-qubit NMR runs Deutsch and Grover', icon: (g, m, a) => { add(g, new CylinderGeometry(0.012, 0.012, 0.06, 20), m); add(g, new SphereGeometry(0.008, 10, 8), a, 0, 0.02); } },
  { year: '2019', title: 'Sycamore', line: 'Google: beyond classical, 53 qubits', icon: (g, m, a) => { add(g, new BoxGeometry(0.06, 0.006, 0.06), m).rotation.x = 1.1; for (let i = 0; i < 9; i++) add(g, new SphereGeometry(0.004, 8, 6), a, ((i % 3) - 1) * 0.016, (Math.floor(i / 3) - 1) * 0.016 * 0.45, 0.012 + (Math.floor(i / 3) - 1) * 0.016 * 0.89); } },
  { year: '2023', title: 'Logical qubits', line: 'error-corrected qubits on atoms', icon: (g, m, a) => { for (let i = 0; i < 4; i++) add(g, new OctahedronGeometry(0.012, 0), i % 2 ? a : m, (i - 1.5) * 0.026); } },
  { year: '2024', title: 'Willow', line: 'below threshold: bigger is better', icon: (g, m, a) => { for (let i = 0; i < 25; i++) add(g, new SphereGeometry(0.0045, 8, 6), i === 12 ? a : m, ((i % 5) - 2) * 0.014, (Math.floor(i / 5) - 2) * 0.014); } },
];

/**
 * A gallery of quantum computing's milestones, from Feynman's 1981 talk to
 * Willow in 2024, standing in an arc behind the desk: each a small turning
 * model on a slim post above its card.
 */
export class HistoryGallery {
  readonly root = new Group();
  private icons: Group[] = [];
  env: Texture | null = null;
  private built = false;

  constructor() {
    this.root.name = 'History';
    this.root.visible = false;
  }

  private build(): void {
    this.built = true;
    const metal = new MeshStandardMaterial({ color: '#d8dce3', roughness: 0.15, metalness: 1 });
    const accent = new MeshStandardMaterial({ color: '#3ddc97', roughness: 0.2, metalness: 0.2, emissive: '#3ddc97', emissiveIntensity: 0.25 });
    const post = new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.4, metalness: 0.7 });
    const n = MILESTONES.length, R = 1.25;
    MILESTONES.forEach((ms, i) => {
      const a = -1.05 + (i / (n - 1)) * 2.1;
      const stand = new Group();
      stand.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
      stand.rotation.y = -a;
      const card = new LabelCard(0.3, `${ms.year}  ${ms.title}`, ms.line);
      card.mesh.position.y = 0.32;
      const icon = new Group();
      icon.position.y = 0.48;
      ms.icon(icon, metal, accent);
      const pole = new Mesh(new CylinderGeometry(0.004, 0.004, 0.28, 8), post);
      pole.position.y = 0.14;
      stand.add(pole, card.mesh, icon);
      this.root.add(stand);
      this.icons.push(icon);
    });
    if (this.env) useStudio(this.root, this.env, 1.2);
  }

  show(on: boolean): void {
    if (on && !this.built) this.build();
    this.root.visible = on;
  }

  update(dt: number): void {
    for (const g of this.icons) g.rotation.y += dt * 0.5;
  }
}
