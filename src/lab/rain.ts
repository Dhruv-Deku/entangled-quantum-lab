import {
  BoxGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { qubitColor, textTexture } from './visuals';

const MAX_MARBLES = 100;
const MARBLE_R = 0.0036;
const BIN_W = 0.026;
const BIN_GAP = 0.012;
const SIDE = 3;
const PER_ROW = SIDE * SIDE; // marbles per layer in a column (a 3x3 footprint, stacked)

/** Outcome label with each digit in its qubit's colour (leftmost digit is the highest qubit). */
function binLabel(k: number, n: number) {
  const digits = k.toString(2).padStart(n, '0').split('');
  return textTexture(digits.map((d, j) => ({ text: d, color: qubitColor(n - 1 - j) })), 700);
}

interface Marble {
  delay: number;
  from: Vector3;
  to: Vector3;
}

/**
 * "Probability rain": each shot is a marble that leaves the orbs and lands in
 * the column of its outcome, so the histogram builds up in front of you.
 */
export class RainVisual {
  readonly root = new Group();
  private readonly marbles: InstancedMesh;
  private readonly bins = new Group();
  private plan: Marble[] = [];
  private t = 0;
  private readonly m4 = new Matrix4();
  private readonly p = new Vector3();
  private countLabels: Mesh[] = [];
  private finalCounts: number[] = [];
  private labelsShown = false;

  constructor() {
    const mat = new MeshPhysicalMaterial({ color: '#f4f6fa', roughness: 0.15, metalness: 0, clearcoat: 1 });
    this.marbles = new InstancedMesh(new SphereGeometry(MARBLE_R, 12, 8), mat, MAX_MARBLES);
    this.marbles.instanceMatrix.setUsage(DynamicDrawUsage);
    this.marbles.count = 0;
    this.marbles.frustumCulled = false;
    this.root.add(this.bins, this.marbles);
    this.root.visible = false;
  }

  private binX(i: number, n: number): number {
    return (i - (n - 1) / 2) * (BIN_W + BIN_GAP);
  }

  private clearBins(): void {
    for (const child of [...this.bins.children]) {
      this.bins.remove(child);
      const m = child as Mesh;
      m.geometry?.dispose();
      const mat = m.material as MeshBasicMaterial | undefined;
      mat?.map?.dispose();
      mat?.dispose();
    }
    this.countLabels = [];
  }

  /**
   * Start a rain. `origin` is where marbles leave from, in this visual's parent space.
   * Outcomes with zero counts still get an empty column when there are few qubits.
   */
  play(counts: Uint32Array, nQubits: number, origin: Vector3): void {
    this.clearBins();
    const all = Array.from(counts, (c, k) => ({ k, c }));
    const shown = nQubits <= 3 ? all : all.filter((o) => o.c > 0).sort((a, b) => b.c - a.c).slice(0, 8).sort((a, b) => a.k - b.k);
    const n = shown.length;
    const glass = new MeshPhysicalMaterial({ color: '#dfe6f2', transparent: true, opacity: 0.1, roughness: 0.1, depthWrite: false });
    const binGeo = new BoxGeometry(BIN_W, 0.09, BIN_W);
    shown.forEach((o, i) => {
      const x = this.binX(i, n);
      const bin = new Mesh(binGeo, glass);
      bin.position.set(x, 0.045, 0);
      this.bins.add(bin);
      const label = new Mesh(new PlaneGeometry(0.04, 0.015), new MeshBasicMaterial({ map: binLabel(o.k, nQubits), transparent: true, depthWrite: false }));
      label.position.set(x, 0.002, BIN_W * 1.1);
      label.rotation.x = -Math.PI / 2.6;
      this.bins.add(label);
      const count = new Mesh(new PlaneGeometry(0.04, 0.015), new MeshBasicMaterial({ map: textTexture([{ text: String(o.c), color: '#ffffff' }]), transparent: true, depthWrite: false, opacity: 0 }));
      count.position.set(x, 0.102, 0);
      this.bins.add(count);
      this.countLabels.push(count);
    });
    this.finalCounts = shown.map((o) => o.c);
    this.labelsShown = false;

    // build the flight plan, marbles interleaved across outcomes so the rain looks random
    const queue: number[] = [];
    shown.forEach((o, i) => { for (let j = 0; j < o.c; j++) queue.push(i); });
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    const stacks = new Array(n).fill(0);
    const d = MARBLE_R * 2.05;
    this.plan = queue.slice(0, MAX_MARBLES).map((bin, i) => {
      const s = stacks[bin]++;
      const layer = Math.floor(s / PER_ROW), slot = s % PER_ROW;
      const to = new Vector3(
        this.binX(bin, n) + ((slot % SIDE) - (SIDE - 1) / 2) * d,
        MARBLE_R + layer * d * 0.9,
        (Math.floor(slot / SIDE) - (SIDE - 1) / 2) * d,
      );
      return { delay: i * 0.018, from: origin.clone(), to };
    });
    this.marbles.count = this.plan.length;
    this.t = 0;
    this.root.visible = true;
  }

  hide(): void {
    this.root.visible = false;
    this.plan = [];
    this.marbles.count = 0;
  }

  update(dt: number): void {
    if (!this.root.visible || this.plan.length === 0) return;
    this.t += dt;
    const flight = 0.55;
    let landed = 0;
    for (let i = 0; i < this.plan.length; i++) {
      const m = this.plan[i];
      const u = Math.max(0, Math.min(1, (this.t - m.delay) / flight));
      if (u <= 0) {
        this.p.copy(m.from);
        this.m4.makeScale(0.001, 0.001, 0.001).setPosition(this.p);
      } else {
        // arc up and over, then drop into the column
        this.p.lerpVectors(m.from, m.to, u);
        this.p.y += Math.sin(Math.PI * u) * 0.07;
        if (u >= 1) landed++;
        this.m4.makeTranslation(this.p.x, this.p.y, this.p.z);
      }
      this.marbles.setMatrixAt(i, this.m4);
    }
    this.marbles.instanceMatrix.needsUpdate = true;
    if (landed === this.plan.length && !this.labelsShown) {
      this.labelsShown = true;
      this.countLabels.forEach((l, i) => ((l.material as MeshBasicMaterial).opacity = this.finalCounts[i] > 0 ? 1 : 0.4));
    }
  }
}

