import { BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';
import type { Vec3 } from '../quantum/gates';
import { LabelCard } from './machine-kit';
import { blochToLocal, qubitColor } from './visuals';

const R = 1.05;
const PAINT = 4000;
const UP = new Vector3(0, 1, 0);

/**
 * Step inside the Bloch sphere: a room-sized sphere around the desk, its poles
 * and axes labelled, and the selected qubit's arrow reaching out from the
 * middle. The tip paints a lasting trail wherever the qubit goes, so a circuit
 * draws a picture around you.
 */
export class GiantSphere {
  readonly root = new Group();
  private readonly arrow = new Group();
  private readonly mat = new MeshBasicMaterial({ color: '#ffffff' });
  private readonly paintPos = new Float32Array(PAINT * 3);
  private readonly paintGeo = new BufferGeometry();
  private readonly paintMat = new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });
  private count = 0;
  private readonly last = new Vector3(0, 9, 0);
  private readonly v = new Vector3();

  constructor() {
    this.root.name = 'GiantBlochSphere';
    const ring = (axis: 'x' | 'y' | 'z', opacity: number, scale = 1, y = 0) => {
      const m = new Mesh(new TorusGeometry(R * scale, 0.003, 6, 160), new MeshBasicMaterial({ color: '#cfe0ff', transparent: true, opacity, depthWrite: false }));
      if (axis === 'y') m.rotation.x = Math.PI / 2;
      if (axis === 'x') m.rotation.y = Math.PI / 2;
      m.position.y = y;
      this.root.add(m);
    };
    ring('y', 0.55);
    ring('x', 0.28);
    ring('z', 0.28);
    for (const lat of [0.5, -0.5]) ring('y', 0.14, Math.sqrt(1 - lat * lat), lat * R);
    const poles: [string, string, Vec3][] = [['|0>', 'north pole', [0, 0, 1]], ['|1>', 'south pole', [0, 0, -1]], ['|+>', 'front', [1, 0, 0]], ['|->', 'back', [-1, 0, 0]], ['|+i>', 'right', [0, 1, 0]], ['|-i>', 'left', [0, -1, 0]]];
    for (const [t, s, b] of poles) {
      const card = new LabelCard(0.18, t, s);
      blochToLocal(b, card.mesh.position).multiplyScalar(R * 1.1);
      this.root.add(card.mesh);
      const dot = new Mesh(new SphereGeometry(0.014, 10, 8), new MeshBasicMaterial({ color: '#e4e6eb' }));
      blochToLocal(b, dot.position).multiplyScalar(R);
      this.root.add(dot);
    }
    const shaft = new Mesh(new CylinderGeometry(0.008, 0.008, R * 0.92, 10).translate(0, (R * 0.92) / 2, 0), this.mat);
    const head = new Mesh(new ConeGeometry(0.03, 0.08, 16).translate(0, R * 0.92 + 0.04, 0), this.mat);
    const tip = new Mesh(new SphereGeometry(0.02, 12, 10), this.mat);
    tip.position.y = R;
    this.arrow.add(shaft, head, tip);
    this.root.add(this.arrow);
    this.paintGeo.setAttribute('position', new BufferAttribute(this.paintPos, 3));
    this.paintGeo.setDrawRange(0, 0);
    const paint = new Line(this.paintGeo, this.paintMat);
    paint.frustumCulled = false;
    this.root.add(paint);
    this.root.visible = false;
  }

  /** Point at the selected qubit's Bloch vector, in its colour, painting as it goes. */
  set(b: Vec3, qubit: number): void {
    const col = new Color(qubitColor(qubit));
    this.mat.color.copy(col);
    this.paintMat.color.copy(col).lerp(new Color('#ffffff'), 0.25);
    blochToLocal(b, this.v);
    const len = this.v.length();
    if (len > 1e-6) this.arrow.quaternion.setFromUnitVectors(UP, this.v.clone().normalize());
    this.arrow.scale.setScalar(Math.max(0.05, len));
    const tip = this.v.multiplyScalar(R);
    if (tip.distanceTo(this.last) > 0.01 && this.count < PAINT) {
      tip.toArray(this.paintPos, this.count * 3);
      this.count++;
      this.paintGeo.attributes.position.needsUpdate = true;
      this.paintGeo.setDrawRange(0, this.count);
      this.last.copy(tip);
    }
  }

  /** Start a fresh painting. */
  clear(): void {
    this.count = 0;
    this.last.set(0, 9, 0);
    this.paintGeo.setDrawRange(0, 0);
  }
}
