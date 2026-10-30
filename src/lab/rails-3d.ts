import { BoxGeometry, CanvasTexture, ClampToEdgeWrapping, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, SphereGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import type { Op } from '../quantum/circuit';
import type { Vec3 } from '../quantum/gates';
import { gateLabel } from './gate-label';
import { blochToLocal, QUBIT_COLORS } from './visuals';

/** Metres of track per step of the circuit. */
const STEP = 0.07;
/** The track runs from just in front of the riders to this far back. */
const NEAR = 0.07;
const FAR = -0.46;
const LANE = 0.062;
const RIDE_Y = 0.05;
const ORB = 0.02;
const MAX_GATES = 64;
const MAX_PAIRS = 10;
/** Canvas pixels per metre of track. */
const PX = 1400;
const GOLD = '#e2b04a';

export interface RailFrame {
  /** Bloch vector of each qubit. */
  bloch: Vec3[];
  /** Entanglement of each pair (a, b, strength 0..1). */
  pairs: [number, number, number][];
}

/**
 * Your circuit as a railway on the desk: one lane per qubit running away from
 * you, every gate a glass block on its lane (labelled on the track bed), and
 * a rider per qubit at the front. The track slides toward you; as each gate
 * passes under them the riders turn to the new state (arrow on its Bloch
 * sphere, shorter when entangled) and gold threads join the pairs that are
 * entangled. Scrub, slow down, or start again.
 */
export class RailsVisual {
  readonly root = new Group();
  private n = 0;
  private ops: Op[] = [];
  private frames: RailFrame[] = [];
  private readonly bed: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private readonly rails: InstancedMesh;
  private readonly blocks: InstancedMesh;
  private readonly links: InstancedMesh;
  private readonly riders: InstancedMesh;
  private readonly arrows: InstancedMesh;
  private readonly threads: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private trackLength = 1;
  /** Time in circuit steps: t = k means the riders hold the state after k ops. */
  time = 0;

  constructor() {
    this.root.name = 'CircuitRailway';
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.tex.wrapS = this.tex.wrapT = ClampToEdgeWrapping;
    this.bed = new Mesh(new PlaneGeometry(1, NEAR - FAR).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.bed.position.set(0, 0.003, (NEAR + FAR) / 2);
    this.root.add(this.bed);
    const box = new BoxGeometry(1, 1, 1);
    this.rails = new InstancedMesh(box, new MeshStandardMaterial({ color: '#4a4d54', roughness: 0.4, metalness: 0.5 }), 5);
    this.blocks = new InstancedMesh(box, new MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.38, roughness: 0.1, depthWrite: false }), MAX_GATES);
    this.links = new InstancedMesh(new CylinderGeometry(1, 1, 1, 8).rotateZ(Math.PI / 2), new MeshBasicMaterial({ color: GOLD, toneMapped: false }), MAX_GATES);
    this.riders = new InstancedMesh(new SphereGeometry(1, 28, 18), new MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.32, roughness: 0.08, depthWrite: false }), 5);
    this.arrows = new InstancedMesh(new CylinderGeometry(0.0026, 0.0026, 1, 8).translate(0, 0.5, 0), new MeshBasicMaterial({ color: '#f2f3f5', toneMapped: false }), 5);
    this.threads = new InstancedMesh(new CylinderGeometry(1, 1, 1, 8).rotateZ(Math.PI / 2), new MeshBasicMaterial({ color: GOLD, toneMapped: false, transparent: true, opacity: 0.9 }), MAX_PAIRS);
    for (const mesh of [this.rails, this.blocks, this.links, this.riders, this.arrows, this.threads]) {
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
    // a thin line across the lanes where the riders read the state
    const gate = new Mesh(new BoxGeometry(1, 0.0012, 0.0012), new MeshBasicMaterial({ color: '#2d7ff9', toneMapped: false }));
    gate.name = 'ReadLine';
    gate.position.set(0, 0.006, 0);
    this.root.add(gate);
    this.root.visible = false;
  }

  private laneX(q: number): number {
    return (q - (this.n - 1) / 2) * LANE;
  }

  /** A circuit and the state after each of its ops (frames[k] after k ops). */
  build(n: number, ops: readonly Op[], frames: RailFrame[]): void {
    this.n = n;
    this.ops = ops.slice(0, MAX_GATES);
    this.frames = frames;
    this.time = 0;
    const width = n * LANE + 0.04;
    this.bed.scale.set(width, 1, 1);
    (this.root.getObjectByName('ReadLine') as Mesh).scale.set(width, 1, 1);
    this.rails.count = n;
    for (let q = 0; q < n; q++) {
      this.m.makeScale(0.003, 0.004, NEAR - FAR).setPosition(this.laneX(q), 0.004, (NEAR + FAR) / 2);
      this.rails.setMatrixAt(q, this.m);
    }
    this.rails.instanceMatrix.needsUpdate = true;
    this.riders.count = this.arrows.count = n;
    for (let q = 0; q < n; q++) this.riders.setColorAt(q, new Color(QUBIT_COLORS[q % QUBIT_COLORS.length]));
    if (this.riders.instanceColor) this.riders.instanceColor.needsUpdate = true;
    this.drawBed(width);
  }

  /** The whole circuit drawn once on a long strip; the bed shows a window of it that scrolls. */
  private drawBed(width: number): void {
    const steps = this.ops.length;
    this.trackLength = (steps + 1) * STEP + (NEAR - FAR);
    this.canvas.width = Math.round(width * PX);
    this.canvas.height = Math.min(8192, Math.round(this.trackLength * PX));
    const g = this.canvas.getContext('2d')!;
    const H = this.canvas.height;
    const toY = (along: number) => H - (along / this.trackLength) * H;
    const laneX = (q: number) => (this.laneX(q) + width / 2) * PX;
    g.clearRect(0, 0, this.canvas.width, H);
    // along = distance from the start of the strip; the riders sit at NEAR on it at time 0
    const opAt = (k: number) => NEAR + (k + 0.5) * STEP;
    g.strokeStyle = 'rgba(138,141,147,0.5)';
    g.lineWidth = 3;
    for (let q = 0; q < this.n; q++) {
      g.beginPath();
      g.moveTo(laneX(q), toY(NEAR));
      g.lineTo(laneX(q), toY(opAt(steps) + STEP));
      g.stroke();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    this.ops.forEach((op, k) => {
      const y = toY(opAt(k));
      const box = (q: number, label: string, color: string) => {
        const w = Math.min(LANE * PX * 0.8, 74), h = STEP * PX * 0.5;
        g.fillStyle = '#26282c';
        g.strokeStyle = color;
        g.lineWidth = 3;
        g.beginPath();
        g.roundRect(laneX(q) - w / 2, y - h / 2, w, h, 10);
        g.fill();
        g.stroke();
        g.fillStyle = '#f2f3f5';
        g.font = `700 ${label.length > 4 ? 18 : 26}px Inter, system-ui, sans-serif`;
        g.fillText(label, laneX(q), y + 1);
      };
      const link = (qs: number[]) => {
        g.strokeStyle = GOLD;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(laneX(Math.min(...qs)), y);
        g.lineTo(laneX(Math.max(...qs)), y);
        g.stroke();
      };
      if (op.kind === 'gate') {
        const c = op.controls ?? [];
        if (c.length) {
          link([...c, op.target]);
          for (const q of c) {
            g.fillStyle = GOLD;
            g.beginPath();
            g.arc(laneX(q), y, 9, 0, Math.PI * 2);
            g.fill();
          }
        }
        if (c.length && op.gate === 'x') {
          g.strokeStyle = GOLD;
          g.lineWidth = 4;
          g.beginPath();
          g.arc(laneX(op.target), y, 18, 0, Math.PI * 2);
          g.moveTo(laneX(op.target) - 18, y);
          g.lineTo(laneX(op.target) + 18, y);
          g.moveTo(laneX(op.target), y - 18);
          g.lineTo(laneX(op.target), y + 18);
          g.stroke();
        } else box(op.target, gateLabel(op), c.length ? GOLD : '#7fa9f5');
      } else if (op.kind === 'measure') box(op.qubit, 'M', '#8a8d93');
      else if (op.kind === 'reset') box(op.qubit, '|0>', '#8a8d93');
      else if (op.kind === 'swap' || op.kind === 'iswap') {
        link([op.a, op.b]);
        box(op.a, op.kind === 'swap' ? 'SW' : 'iSW', '#7fa9f5');
        box(op.b, op.kind === 'swap' ? 'SW' : 'iSW', '#7fa9f5');
      }
    });
    this.tex.needsUpdate = true;
    this.tex.repeat.set(1, (NEAR - FAR) / this.trackLength);
  }

  update(): void {
    if (!this.n) return;
    const t = Math.max(0, Math.min(this.ops.length, this.time));
    // the window of the strip under the bed: the riders (z = 0) at NEAR + t * STEP along it
    this.tex.offset.set(0, (t * STEP) / this.trackLength);
    // glass blocks over each gate in view
    let b = 0, l = 0;
    this.ops.forEach((op, k) => {
      const z = -(k + 0.5 - t) * STEP;
      if (z > NEAR || z < FAR) return;
      const lanes = op.kind === 'gate' ? [op.target] : op.kind === 'measure' || op.kind === 'reset' ? [op.qubit] : [op.a, op.b];
      const all = op.kind === 'gate' ? [...(op.controls ?? []), op.target] : lanes;
      // a gate fades in from the far end
      const fade = Math.min(1, (z - FAR) / 0.06);
      for (const q of lanes) {
        if (b >= MAX_GATES) break;
        this.m.makeScale(LANE * 0.62, 0.014 * fade, STEP * 0.42).setPosition(this.laneX(q), 0.011 * fade, z);
        this.blocks.setMatrixAt(b++, this.m);
      }
      if (all.length > 1 && l < MAX_GATES) {
        const x0 = this.laneX(Math.min(...all)), x1 = this.laneX(Math.max(...all));
        this.m.makeScale(x1 - x0, 0.0016, 0.0016).setPosition((x0 + x1) / 2, 0.012, z);
        this.links.setMatrixAt(l++, this.m);
      }
    });
    this.blocks.count = b;
    this.links.count = l;
    this.blocks.instanceMatrix.needsUpdate = this.links.instanceMatrix.needsUpdate = true;
    // riders: the state between frames, eased
    const k0 = Math.floor(t), f = t - k0;
    const a = this.frames[k0], c = this.frames[Math.min(this.frames.length - 1, k0 + 1)];
    if (!a || !c) return;
    const ease = f * f * (3 - 2 * f);
    for (let q = 0; q < this.n; q++) {
      const x = this.laneX(q);
      this.m.makeScale(ORB, ORB, ORB).setPosition(x, RIDE_Y, 0);
      this.riders.setMatrixAt(q, this.m);
      const va = a.bloch[q], vc = c.bloch[q];
      const bv: Vec3 = [va[0] + (vc[0] - va[0]) * ease, va[1] + (vc[1] - va[1]) * ease, va[2] + (vc[2] - va[2]) * ease];
      blochToLocal(bv, this.v);
      const len = this.v.length();
      if (len < 1e-4) this.m.makeScale(0, 0, 0);
      else {
        this.q.setFromUnitVectors(this.up, this.v.clone().normalize());
        this.m.compose(this.s.set(x, RIDE_Y, 0), this.q, new Vector3(1, len * ORB * 0.95, 1));
      }
      this.arrows.setMatrixAt(q, this.m);
    }
    this.riders.instanceMatrix.needsUpdate = this.arrows.instanceMatrix.needsUpdate = true;
    // gold threads between entangled riders
    const pairs = (f < 0.5 ? a : c).pairs.filter(([, , s]) => s > 0.04).slice(0, MAX_PAIRS);
    pairs.forEach(([p, r, s], i) => {
      const x0 = this.laneX(p), x1 = this.laneX(r);
      const th = 0.0008 + 0.0022 * s;
      // neighbours' threads run straight; farther pairs arc over the riders in between
      const lift = Math.abs(r - p) > 1 ? 0.012 * (Math.abs(r - p) - 1) : 0;
      this.m.makeScale(Math.abs(x1 - x0) - ORB * 2, th, th).setPosition((x0 + x1) / 2, RIDE_Y + lift, 0);
      this.threads.setMatrixAt(i, this.m);
    });
    this.threads.count = pairs.length;
    this.threads.instanceMatrix.needsUpdate = true;
  }
}
