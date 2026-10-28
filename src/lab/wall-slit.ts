import { CanvasTexture, CircleGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import { histogram, slitIntensity, type SlitSetup } from '../quantum/experiments';
import { LabelCard } from './machine-kit';
import { fringeSpacing, patternHalfWidth, type WallHit } from './room';
import { GLOW } from './visuals';

const MAX_HITS = 3000;
const PHOTON = '#8fb7ff';
const BINS = 60;
/** With no wall in front, a virtual screen this far from the slits. */
export const VIRTUAL_WALL = 2.2;

/**
 * The double slit at room scale: your real wall is the screen. Photons leave
 * the slits on the desk and land on the wall in front of you, where the
 * stripes are lambda L / d apart, so a wall twice as far gives stripes twice
 * as wide. The wall stays visible through a thin dark screen, with corner
 * marks, the distance above and the running histogram below.
 */
export class WallScreen {
  readonly root = new Group();
  /** Metres from the slits to the wall, and whether it is a real wall. */
  distance = VIRTUAL_WALL;
  real = false;
  label = '';
  halfW = 0.4;
  halfH = 0.12;
  private readonly backing: Mesh;
  private readonly backMat: MeshBasicMaterial;
  private readonly corners: Mesh[] = [];
  private readonly hits: InstancedMesh;
  private readonly card = new LabelCard(0.5, 'Your wall');
  private readonly chart: Mesh;
  private readonly chartCanvas = document.createElement('canvas');
  private readonly chartTex: CanvasTexture;
  private readonly xs: number[] = [];
  private readonly m = new Matrix4();
  private chartDirty = false;
  private chartTimer = 0;
  setup: SlitSetup = 'both';

  constructor() {
    this.root.name = 'WallScreen';
    this.backMat = new MeshBasicMaterial({ color: '#0d0e10', transparent: true, opacity: 0.55, depthWrite: false });
    this.backing = new Mesh(new PlaneGeometry(1, 1), this.backMat);
    this.root.add(this.backing);
    const cornerMat = new MeshBasicMaterial({ color: '#e4e6eb', transparent: true, opacity: 0.85, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const c = new Mesh(new PlaneGeometry(1, 1), cornerMat);
      this.corners.push(c);
      this.root.add(c);
    }
    this.hits = new InstancedMesh(new CircleGeometry(1, 10), new MeshBasicMaterial({ color: PHOTON, transparent: true, opacity: 0.95, ...GLOW, toneMapped: false }), MAX_HITS);
    this.hits.count = 0;
    this.hits.frustumCulled = false;
    this.root.add(this.hits);
    this.root.add(this.card.mesh);
    this.chartCanvas.width = 1024;
    this.chartCanvas.height = 192;
    this.chartTex = new CanvasTexture(this.chartCanvas);
    this.chartTex.colorSpace = SRGBColorSpace;
    this.chart = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: this.chartTex, transparent: true, depthWrite: false }));
    this.root.add(this.chart);
    this.root.visible = false;
  }

  /**
   * Put the screen on the wall the slits face (or, with no wall, a virtual
   * one 2.2 m out), centred at `height` (world y), facing back at the slits.
   */
  place(slits: Vector3, dir: Vector3, wall: WallHit | null, height: number): void {
    const d = new Vector3(dir.x, 0, dir.z).normalize();
    this.real = !!wall;
    this.label = wall?.label ?? 'virtual';
    const centre = wall ? wall.point.clone() : slits.clone().addScaledVector(d, VIRTUAL_WALL);
    centre.y = height;
    // a hair in front of the wall so the dots never sink into it
    const normal = wall ? wall.normal.clone() : d.clone().negate();
    centre.addScaledVector(normal, 0.01);
    this.distance = Math.hypot(centre.x - slits.x, centre.z - slits.z);
    this.root.position.copy(centre);
    this.root.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal));
    this.layout();
    this.clear();
  }

  private layout(): void {
    const hw = (this.halfW = patternHalfWidth(this.distance) * 0.9);
    const hh = (this.halfH = Math.max(0.05, hw * 0.4));
    this.backing.scale.set(2 * hw + 0.06, 2 * hh + 0.06, 1);
    this.backMat.opacity = this.real ? 0.55 : 0.85;
    // corner marks: an L at each corner
    const t = Math.max(0.004, hw * 0.012), len = Math.max(0.03, hw * 0.12);
    const ox = hw + 0.03, oy = hh + 0.03;
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].forEach(([sx, sy], i) => {
      const a = this.corners[2 * i], b = this.corners[2 * i + 1];
      a.scale.set(len, t, 1);
      a.position.set(sx * (ox - len / 2), sy * oy, 0.001);
      b.scale.set(t, len, 1);
      b.position.set(sx * ox, sy * (oy - len / 2), 0.001);
    });
    const cw = Math.max(0.36, Math.min(0.9, hw * 1.1));
    this.card.mesh.scale.setScalar(cw / 0.5);
    this.card.mesh.position.set(0, oy + 0.02 + (cw * (200 / 768)) / 2, 0.002);
    this.chart.scale.set(2 * hw, (2 * hw * 192) / 1024, 1);
    this.chart.position.set(0, -oy - 0.02 - (hw * 192) / 1024, 0.002);
    const where = this.real ? `Your ${this.label === 'other' ? 'wall' : this.label}, ${this.distance.toFixed(1)} m away` : `No wall ahead: a screen ${this.distance.toFixed(1)} m away`;
    this.card.set(where, `Stripes ${(fringeSpacing(this.distance) * 100).toFixed(1)} cm apart: lambda L / d`);
  }

  clear(): void {
    this.hits.count = 0;
    this.xs.length = 0;
    this.chartDirty = true;
  }

  get hitCount(): number {
    return this.xs.length;
  }

  /** The world point for screen coordinates x, y (-1..1). */
  worldPoint(x: number, y: number, out: Vector3): Vector3 {
    out.set(x * this.halfW, y * this.halfH, 0.003);
    this.root.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.root.matrixWorld);
  }

  land(x: number, y: number): void {
    if (this.xs.length >= MAX_HITS) return;
    const r = Math.max(0.0016, this.halfW * 0.006);
    // the slit model draws y from -0.43..0.43: spread it over the screen's height
    this.m.makeScale(r, r, 1).setPosition(x * this.halfW, Math.max(-1, Math.min(1, y * 2.1)) * this.halfH, 0.003);
    this.hits.setMatrixAt(this.xs.length, this.m);
    this.xs.push(x);
    this.hits.count = this.xs.length;
    this.hits.instanceMatrix.needsUpdate = true;
    this.chartDirty = true;
  }

  update(dt: number): void {
    this.chartTimer += dt;
    if (!this.chartDirty || this.chartTimer < 0.25) return;
    this.chartTimer = 0;
    this.chartDirty = false;
    this.drawChart();
  }

  /** The histogram of hits against the prediction (dashed), under the screen. */
  private drawChart(): void {
    const g = this.chartCanvas.getContext('2d')!;
    const W = 1024, H = 192;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(27,28,31,0.82)';
    g.beginPath();
    g.roundRect(2, 2, W - 4, H - 4, 28);
    g.fill();
    const counts = histogram(this.xs, BINS);
    const top = Math.max(1, ...counts);
    const pad = 28, base = H - 24, span = H - 48;
    const bw = (W - 2 * pad) / BINS;
    g.fillStyle = PHOTON;
    counts.forEach((c, i) => {
      const h = (c / top) * span;
      g.fillRect(pad + i * bw + 1, base - h, bw - 2, h);
    });
    // the prediction, scaled to the tallest bin's expected height
    let peak = 0;
    for (let i = 0; i <= 200; i++) peak = Math.max(peak, slitIntensity(-1 + (2 * i) / 200, this.setup));
    g.strokeStyle = '#e4e6eb';
    g.lineWidth = 3;
    g.setLineDash([10, 8]);
    g.beginPath();
    for (let i = 0; i <= 200; i++) {
      const x = -1 + (2 * i) / 200;
      const px = pad + ((x + 1) / 2) * (W - 2 * pad), py = base - (slitIntensity(x, this.setup) / peak) * span;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#9a9da3';
    g.font = '600 26px Inter, system-ui, sans-serif';
    g.fillText(`${this.xs.length} photons`, pad, 34);
    this.chartTex.needsUpdate = true;
  }
}
