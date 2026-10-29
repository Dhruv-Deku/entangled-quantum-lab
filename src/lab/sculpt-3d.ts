import { BoxGeometry, CanvasTexture, Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

/** Bars for up to four qubits. */
export const MAX_BARS = 16;
/** Height of a bar at the top step, in metres. */
export const BAR_H = 0.17;
/** Width of the row of bars. */
const ROW = 0.46;
const GLASS = new Color('#2d7ff9');
const CAP = new Color('#7fa9f5');
const SHOT = new Color('#e4e6eb');
const MATCHED = new Color('#3ddc97');

/**
 * The State sculptor on the desk: one glass column per outcome, filled to
 * the line you tapped, and inside it the measured shots rising as they come
 * in. When the shots reach every line, the program the lab wrote loads your
 * shape. Each column has an invisible box for taps (ray, poke or look); all
 * the drawing is four instanced meshes and one label strip, so sixteen bars
 * cost a handful of draw calls.
 */
export class SculptVisual {
  readonly root = new Group();
  /** The tap boxes, one per bar (never drawn). */
  readonly hits: Mesh[] = [];
  private readonly glass: InstancedMesh;
  private readonly caps: InstancedMesh;
  private readonly shots: InstancedMesh;
  private readonly bases: InstancedMesh;
  private readonly labels: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private readonly m = new Matrix4();
  /** How many bars are up now. */
  count = 0;
  private spacing = 0.1;
  private width = 0.05;
  private want: number[] = new Array(MAX_BARS).fill(0);
  private shown: number[] = new Array(MAX_BARS).fill(0);
  private shotWant: number[] = new Array(MAX_BARS).fill(0);
  private shotShown: number[] = new Array(MAX_BARS).fill(0);
  private pulses: number[] = new Array(MAX_BARS).fill(0);
  private matched = false;
  private labelKey = '';

  constructor() {
    this.root.name = 'StateSculptor';
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const make = (mat: MeshStandardMaterial | MeshBasicMaterial) => {
      const mesh = new InstancedMesh(box, mat, MAX_BARS);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      return mesh;
    };
    this.bases = make(new MeshStandardMaterial({ color: '#2a2c31', roughness: 0.6, metalness: 0.1 }));
    this.shots = make(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.05 }));
    this.glass = make(new MeshStandardMaterial({ color: GLASS, transparent: true, opacity: 0.24, roughness: 0.15, metalness: 0, depthWrite: false }));
    this.caps = make(new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
    for (let k = 0; k < MAX_BARS; k++) {
      this.shots.setColorAt(k, SHOT);
      this.caps.setColorAt(k, CAP);
      const hit = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ visible: false }));
      hit.name = `SculptBar${k}`;
      this.root.add(hit);
      this.hits.push(hit);
    }
    this.canvas.width = 2048;
    this.canvas.height = 128;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    const lw = ROW + 0.04;
    this.labels = new Mesh(new PlaneGeometry(lw, lw * (128 / 2048)), new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.labels.rotation.x = -Math.PI / 2 + 0.75;
    this.labels.position.set(0, 0.012, 0.04);
    this.root.add(this.labels);
    this.root.visible = false;
  }

  /** Lay out `count` bars (4, 8 or 16), labelled with their outcomes. */
  setCount(count: number, label: (k: number) => string): void {
    this.count = count;
    this.spacing = Math.min(0.075, ROW / count);
    this.width = this.spacing * 0.66;
    for (const mesh of [this.glass, this.caps, this.shots, this.bases]) mesh.count = count;
    this.hits.forEach((hit, k) => {
      if (k < count) {
        hit.position.set(this.x(k), (BAR_H + 0.03) / 2, 0);
        hit.scale.set(this.spacing * 0.96, BAR_H + 0.03, 0.07);
      } else {
        // out of reach rather than scaled to nothing (a zero scale cannot be hit-tested)
        hit.position.set(0, -10, 0);
        hit.scale.set(0.01, 0.01, 0.01);
      }
    });
    const key = `${count}:${label(0)}`;
    if (key !== this.labelKey) {
      this.labelKey = key;
      const g = this.canvas.getContext('2d')!;
      g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const px = this.canvas.width / (ROW + 0.04);
      const size = count > 8 ? 46 : count > 4 ? 64 : 72;
      g.font = `600 ${size}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
      g.textAlign = 'center';
      g.fillStyle = '#e4e6eb';
      for (let k = 0; k < count; k++) g.fillText(label(k), this.canvas.width / 2 + this.x(k) * px, 56 + size * 0.36);
      this.tex.needsUpdate = true;
    }
  }

  /** Where each bar's line is, 0 (empty) to 1 (the top step). */
  setTarget(heights: readonly number[]): void {
    for (let k = 0; k < MAX_BARS; k++) this.want[k] = heights[k] ?? 0;
  }

  /** The shots so far on the same scale as the lines (null: none yet), and whether they have matched. */
  setShots(heights: readonly number[] | null, matched = false): void {
    for (let k = 0; k < MAX_BARS; k++) this.shotWant[k] = heights?.[k] ?? 0;
    if (matched !== this.matched) {
      this.matched = matched;
      for (let k = 0; k < MAX_BARS; k++) this.shots.setColorAt(k, matched ? MATCHED : SHOT);
      if (this.shots.instanceColor) this.shots.instanceColor.needsUpdate = true;
    }
  }

  /** A tapped bar's cap flashes. */
  pulse(k: number): void {
    if (k >= 0 && k < MAX_BARS) this.pulses[k] = 1;
  }

  private x(k: number): number {
    return (k - (this.count - 1) / 2) * this.spacing;
  }

  update(dt: number): void {
    const ease = 1 - Math.exp(-dt * 12);
    const rise = 1 - Math.exp(-dt * 7);
    const w = this.width;
    for (let k = 0; k < this.count; k++) {
      const h = (this.shown[k] += (this.want[k] - this.shown[k]) * ease) * BAR_H;
      const s = (this.shotShown[k] += (this.shotWant[k] - this.shotShown[k]) * rise) * BAR_H;
      const x = this.x(k);
      this.m.makeScale(w * 1.18, 0.006, w * 1.18).setPosition(x, 0, 0);
      this.bases.setMatrixAt(k, this.m);
      this.m.makeScale(w, Math.max(0.0005, h), w).setPosition(x, 0.006, 0);
      this.glass.setMatrixAt(k, this.m);
      // no shots yet: nothing inside the glass
      if (s < 0.0008) this.m.makeScale(0, 0, 0);
      else this.m.makeScale(w * 0.62, s, w * 0.62).setPosition(x, 0.006, 0);
      this.shots.setMatrixAt(k, this.m);
      // the line you drew: a bright plate at the top of the glass, larger for a moment after a tap
      const p = (this.pulses[k] = Math.max(0, this.pulses[k] - dt * 3));
      const cw = w * (1.08 + 0.35 * p);
      this.m.makeScale(cw, 0.0035, cw).setPosition(x, 0.006 + h, 0);
      this.caps.setMatrixAt(k, this.m);
    }
    for (const mesh of [this.glass, this.caps, this.shots, this.bases]) mesh.instanceMatrix.needsUpdate = true;
  }
}
