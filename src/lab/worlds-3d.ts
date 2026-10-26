import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { opName, type Worlds } from '../quantum/paths';
import { phaseColor } from '../quantum/state-views';
import { textTexture } from './visuals';

const WIDTH = 0.46;
const MAX_HEIGHT = 0.28;
const MAX_ROWS = 16;
const MAX_NODES = 512;
const MAX_EDGES = 4096;
const MAX_RINGS = 256;
/** Seconds between one layer branching out and the next. */
const LAYER_DELAY = 0.16;
const GROW = 0.28;
const LABEL_W = 0.05;

const UP = new Vector3(0, 1, 0);
const smooth = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

interface EdgeDraw {
  from: Vector3;
  to: Vector3;
  r: number;
  color: Color;
  layer: number;
  /** A world a measurement ended: drawn a short way and faded. */
  stub: boolean;
}

interface NodeDraw {
  at: Vector3;
  r: number;
  color: Color;
  layer: number;
}

/**
 * Many worlds, in 3D: time runs left to right, one row per basis state. Every
 * path the computation takes is a strand from one state to the next, as thick
 * as the weight it carries and coloured by its phase; each state that holds
 * weight is a bead, sized by probability. Where strands of opposite colour
 * meet and nothing is left, an empty ring marks the cancellation: destructive
 * interference, the reason quantum algorithms work. A measurement keeps the
 * worlds that agree with it; the others end in a short faded stub.
 *
 * Opening it, or changing the circuit, replays the branching layer by layer.
 */
export class ManyWorldsVisual {
  readonly root = new Group();
  /** The picture, raised so its bottom edge sits at the root (above the orbs). */
  private readonly content = new Group();
  private readonly plate: Mesh;
  private readonly nodes: InstancedMesh;
  private readonly edges: InstancedMesh;
  private readonly rings: InstancedMesh;
  private edgeList: EdgeDraw[] = [];
  private nodeList: NodeDraw[] = [];
  private ringList: { at: Vector3; layer: number }[] = [];
  private labels: Mesh[] = [];
  private tex = new Map<string, CanvasTexture>();
  private t = 0;
  private total = 0;
  private key = '';
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();

  constructor() {
    this.root.name = 'ManyWorlds';
    this.nodes = new InstancedMesh(new SphereGeometry(1, 16, 12), new MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 }), MAX_NODES);
    // a unit strand from y = 0 to y = 1, stretched between two beads
    this.edges = new InstancedMesh(new CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0), new MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }), MAX_EDGES);
    this.rings = new InstancedMesh(new TorusGeometry(1, 0.14, 8, 32), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false }), MAX_RINGS);
    this.root.add(this.content);
    for (const im of [this.nodes, this.edges, this.rings]) {
      im.count = 0;
      im.frustumCulled = false;
      this.content.add(im);
    }
    // the backing plate, so the strands read against any room (sized to the picture)
    this.plate = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color: '#1b1c1f', transparent: true, opacity: 0.85 }));
    // it writes depth, so the board behind it cannot paint over it
    this.plate.renderOrder = -1;
    this.content.add(this.plate);
  }

  private texFor(text: string, color: string): CanvasTexture {
    const k = `${text}|${color}`;
    let t = this.tex.get(k);
    if (!t) this.tex.set(k, (t = textTexture([{ text, color }], 600)));
    return t;
  }

  private label(text: string, color: string, x: number, y: number, w = LABEL_W): void {
    let m = this.labels.find((l) => !l.visible);
    if (!m) {
      m = new Mesh(new PlaneGeometry(1, 96 / 256), new MeshBasicMaterial({ transparent: true, depthWrite: false }));
      m.renderOrder = 2;
      this.content.add(m);
      this.labels.push(m);
    }
    const mat = m.material as MeshBasicMaterial;
    mat.map = this.texFor(text, color);
    mat.needsUpdate = true;
    m.scale.setScalar(w);
    m.position.set(x, y, 0.002);
    m.visible = true;
  }

  /** Show these worlds; the same picture again does nothing (so the growth plays once per change). */
  set(w: Worlds): void {
    const key = JSON.stringify(w.layers.map((l) => [l.op, l.nodes.map((n) => [n.k, n.p.toFixed(3)])]));
    if (key === this.key) return;
    this.key = key;
    // rows: every basis state that holds weight anywhere, or that paths reach and cancel
    const weight = new Map<number, number>();
    for (const l of w.layers) {
      for (const n of l.nodes) weight.set(n.k, Math.max(weight.get(n.k) ?? 0, n.p));
      for (const k of l.cancelled) weight.set(k, Math.max(weight.get(k) ?? 0, 0.01));
    }
    const rows = [...weight.keys()].sort((a, b) => (weight.get(b)! - weight.get(a)!)).slice(0, MAX_ROWS).sort((a, b) => a - b);
    const rowOf = new Map(rows.map((k, i) => [k, i]));
    const cols = w.layers.length;
    const height = Math.min(MAX_HEIGHT, Math.max(0.06, (rows.length - 1) * 0.04));
    this.content.position.y = height / 2 + 0.07;
    this.plate.scale.set(WIDTH + 0.17, height + 0.13, 1);
    this.plate.position.set(-0.03, 0.01, -0.012);
    const x = (L: number) => (cols === 1 ? 0 : -WIDTH / 2 + (L * WIDTH) / (cols - 1));
    const y = (k: number) => (rows.length === 1 ? 0 : height / 2 - ((rowOf.get(k) ?? 0) * height) / (rows.length - 1));
    const has = (k: number) => rowOf.has(k);
    const phase = (re: number, im: number) => new Color(phaseColor(Math.atan2(im, re)));

    this.edgeList = [];
    this.nodeList = [];
    this.ringList = [];
    w.layers.forEach((l, L) => {
      for (const e of l.edges) {
        if (!has(e.from) || !has(e.to)) continue;
        this.edgeList.push({ from: new Vector3(x(L - 1), y(e.from), 0), to: new Vector3(x(L), y(e.to), 0), r: 0.0007 + 0.0028 * Math.sqrt(e.w), color: phase(e.re, e.im), layer: L, stub: false });
      }
      for (const k of l.pruned) {
        if (!has(k)) continue;
        const from = new Vector3(x(L - 1), y(k), 0);
        this.edgeList.push({ from, to: from.clone().lerp(new Vector3(x(L), y(k), 0), 0.35), r: 0.0008, color: new Color('#55585e'), layer: L, stub: true });
      }
      for (const n of l.nodes) if (has(n.k)) this.nodeList.push({ at: new Vector3(x(L), y(n.k), 0), r: 0.0032 + 0.0105 * Math.sqrt(n.p), color: phase(n.re, n.im), layer: L });
      for (const k of l.cancelled) if (has(k)) this.ringList.push({ at: new Vector3(x(L), y(k), 0.001), layer: L });
    });
    this.edgeList = this.edgeList.slice(0, MAX_EDGES);
    this.nodeList = this.nodeList.slice(0, MAX_NODES);
    this.ringList = this.ringList.slice(0, MAX_RINGS);

    // labels: basis states down the left, ops along the top
    for (const l of this.labels) l.visible = false;
    for (const k of rows) this.label(`|${k.toString(2).padStart(w.n, '0')}>`, '#c9ccd1', x(0) - 0.05, y(k));
    w.layers.forEach((l, L) => {
      if (cols > 9 && L % 2 === 1 && L !== cols - 1) return;
      this.label(L === 0 && w.skipped ? `+${w.skipped} before` : opName(l.op), L === 0 ? '#8a8d93' : '#e4e6eb', x(L), height / 2 + 0.032, LABEL_W);
    });
    this.edges.count = this.edgeList.length;
    this.nodes.count = this.nodeList.length;
    this.rings.count = this.ringList.length;
    this.edgeList.forEach((e, i) => this.edges.setColorAt(i, e.color.clone().multiplyScalar(e.stub ? 1 : 1.05)));
    this.nodeList.forEach((n, i) => this.nodes.setColorAt(i, n.color));
    for (const im of [this.edges, this.nodes]) if (im.instanceColor) im.instanceColor.needsUpdate = true;
    this.t = 0;
    this.total = cols * LAYER_DELAY + GROW + 0.3;
    this.layout();
  }

  /** Grow each layer's strands, then pop its beads, in order. */
  private layout(): void {
    const t = this.t;
    this.edgeList.forEach((e, i) => {
      const g = smooth((t - (e.layer - 1) * LAYER_DELAY) / GROW);
      const dir = this.v.copy(e.to).sub(e.from);
      const len = Math.max(1e-5, dir.length() * g);
      this.q.setFromUnitVectors(UP, dir.normalize());
      this.m.compose(e.from, this.q, this.s.set(e.r, len, e.r));
      this.edges.setMatrixAt(i, this.m);
    });
    this.nodeList.forEach((n, i) => {
      const g = n.layer === 0 ? smooth(t / GROW) : smooth((t - (n.layer - 1) * LAYER_DELAY - GROW * 0.8) / (GROW * 0.6));
      const r = Math.max(1e-5, n.r * g);
      this.m.compose(n.at, this.q.identity(), this.s.set(r, r, r));
      this.nodes.setMatrixAt(i, this.m);
    });
    this.ringList.forEach((ring, i) => {
      const g = smooth((t - (ring.layer - 1) * LAYER_DELAY - GROW) / 0.3);
      const r = Math.max(1e-5, 0.0085 * g);
      this.m.compose(ring.at, this.q.identity(), this.s.set(r, r, r));
      this.rings.setMatrixAt(i, this.m);
    });
    for (const im of [this.edges, this.nodes, this.rings]) im.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.t >= this.total) return;
    this.t = Math.min(this.total, this.t + dt);
    this.layout();
  }
}
