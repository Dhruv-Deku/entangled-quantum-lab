import { BufferAttribute, Color, DoubleSide, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, Vector3, EdgesGeometry, BoxGeometry } from '@iwsdk/core';
import type { Point } from '../quantum/qml';

/** Grid of the landscape (points per side). */
export const FIELD_N = 25;
const SIZE = 0.36;
const LIFT = 0.055;
const PLUS = new Color('#3fc6c9');
const MINUS = new Color('#ff7759');
const MID = new Color('#2a2c31');

/**
 * Quantum AI on the desk: the network's answer over the whole square as a
 * landscape (up and teal where it says +1, down and red where it says -1),
 * and the training points as beads at the height of their true label. When
 * it has learned, every bead sits on its own side of the surface; while it
 * is wrong, the beads it gets wrong are larger and blink.
 */
export class QmlVisual {
  readonly root = new Group();
  private readonly surface: Mesh;
  private readonly geo: PlaneGeometry;
  private readonly colors: Float32Array;
  private readonly beads: InstancedMesh;
  private points: Point[] = [];
  private wrong: boolean[] = [];
  private t = 0;
  private readonly m = new Matrix4();
  private readonly c = new Color();
  /** Heights shown now, easing toward the latest field. */
  private shown: number[] = new Array(FIELD_N * FIELD_N).fill(0);
  private target: number[] = new Array(FIELD_N * FIELD_N).fill(0);

  constructor() {
    this.root.name = 'QuantumAI';
    this.geo = new PlaneGeometry(SIZE, SIZE, FIELD_N - 1, FIELD_N - 1);
    this.geo.rotateX(-Math.PI / 2);
    this.colors = new Float32Array(FIELD_N * FIELD_N * 3);
    this.geo.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.surface = new Mesh(this.geo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: DoubleSide, transparent: true, opacity: 0.88 }));
    this.root.add(this.surface);
    // the zero level: a thin frame where the answer changes sign
    const frame = new LineSegments(new EdgesGeometry(new BoxGeometry(SIZE, 0.0001, SIZE)), new LineBasicMaterial({ color: '#8a8d93', transparent: true, opacity: 0.6 }));
    this.root.add(frame);
    this.beads = new InstancedMesh(new SphereGeometry(0.0065, 14, 10), new MeshBasicMaterial({ toneMapped: false }), 128);
    this.beads.count = 0;
    this.beads.frustumCulled = false;
    this.root.add(this.beads);
    this.root.visible = false;
  }

  setData(points: Point[]): void {
    this.points = points;
    this.wrong = points.map(() => true);
    this.beads.count = points.length;
    points.forEach((p, i) => this.beads.setColorAt(i, p.label > 0 ? PLUS : MINUS));
    if (this.beads.instanceColor) this.beads.instanceColor.needsUpdate = true;
  }

  /** The network's latest answer over the grid (row by row from y = -1), and which points it gets wrong. */
  setField(values: readonly number[], wrong: boolean[]): void {
    this.target = [...values];
    this.wrong = wrong;
  }

  update(dt: number): void {
    this.t += dt;
    const pos = this.geo.getAttribute('position') as BufferAttribute;
    const k = 1 - Math.exp(-dt * 6);
    for (let j = 0; j < FIELD_N; j++)
      for (let i = 0; i < FIELD_N; i++) {
        // PlaneGeometry rows run from +z to -z after the turn; the field's rows run from y = -1 up
        const idx = j * FIELD_N + i;
        const f = (this.shown[idx] += (this.target[idx] - this.shown[idx]) * k);
        const v = (FIELD_N - 1 - j) * FIELD_N + i;
        pos.setY(v, f * LIFT);
        this.c.copy(MID).lerp(f > 0 ? PLUS : MINUS, Math.min(1, Math.abs(f) * 1.2));
        this.colors[v * 3] = this.c.r;
        this.colors[v * 3 + 1] = this.c.g;
        this.colors[v * 3 + 2] = this.c.b;
      }
    pos.needsUpdate = true;
    (this.geo.getAttribute('color') as BufferAttribute).needsUpdate = true;
    this.geo.computeVertexNormals();
    // beads: at their true label's height; the ones it gets wrong swell and blink
    const blink = 0.5 + 0.5 * Math.sin(this.t * 8);
    this.points.forEach((p, i) => {
      const s = this.wrong[i] ? 1.25 + 0.35 * blink : 1;
      this.m.makeScale(s, s, s).setPosition(new Vector3(p.x * (SIZE / 2), p.label * LIFT * 0.8, -p.y * (SIZE / 2)));
      this.beads.setMatrixAt(i, this.m);
    });
    this.beads.instanceMatrix.needsUpdate = true;
  }
}
