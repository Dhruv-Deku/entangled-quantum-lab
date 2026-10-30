import { BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, Vector3, Quaternion } from '@iwsdk/core';
import { LabelCard } from './machine-kit';

export const MAX_ROWS = 14;
const MAX_PEGS = (MAX_ROWS * (MAX_ROWS + 1)) / 2;
const MAX_MARBLES = 48;
const TOP = 0.36;
const PEG_BOTTOM = 0.15;
const BAR_BASE = 0.012;
const BAR_MAX = 0.12;
const HALF_W = 0.13;
/** The two boards' centres. */
const SIDE = [-0.165, 0.165];
const DIM = new Color('#3a3d43');
const LIT = new Color('#2d7ff9');
const MARBLE = new Color('#d9dce2');
const QBAR = new Color('#2d7ff9');
const CBAR = new Color('#c8ccd2');

interface Marble {
  path: number[];
  s: number;
  done: () => void;
}

/**
 * The quantum Galton board: two upright boards of pegs side by side. On the
 * left a marble meets each peg and goes left or right, and the bars below
 * grow into a bell curve. On the right a quantum walker: the pegs light up
 * row by row with the walk's probability (all paths at once, interfering),
 * and each measured walker simply appears in a bin. Its bars pile up near
 * the edges. Pegs, bars and marbles are three instanced meshes.
 */
export class GaltonVisual {
  readonly root = new Group();
  private rows = 10;
  private readonly pegs: InstancedMesh;
  private readonly bars: InstancedMesh;
  private readonly marbles: InstancedMesh;
  private readonly flashes: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly one = new Vector3(1, 1, 1);
  private flying: Marble[] = [];
  private flashing: { bin: number; t: number }[] = [];
  private barWant: number[][] = [[], []];
  private barShown: number[][] = [[], []];
  /** The walk's distribution on each row (index position + row). */
  private wave: number[][] = [];
  /** Rows of the wave lit so far, rising to `rows` as it descends. */
  private front = 0;
  private frontTarget = 0;
  private colorsDirty = true;

  constructor() {
    this.root.name = 'GaltonBoards';
    this.pegs = new InstancedMesh(new CylinderGeometry(0.0022, 0.0022, 0.014, 10).rotateX(Math.PI / 2), new MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.4 }), MAX_PEGS * 2);
    this.bars = new InstancedMesh(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }), (MAX_ROWS + 1) * 2);
    this.marbles = new InstancedMesh(new SphereGeometry(0.0045, 14, 10), new MeshStandardMaterial({ color: MARBLE, roughness: 0.2, metalness: 0.6 }), MAX_MARBLES);
    this.flashes = new InstancedMesh(new SphereGeometry(0.0055, 14, 10), new MeshBasicMaterial({ color: '#cfe0ff', toneMapped: false }), 16);
    for (const mesh of [this.pegs, this.bars, this.marbles, this.flashes]) {
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
    this.marbles.count = 0;
    this.flashes.count = 0;
    // a pane of dark glass behind each board, and its name above
    SIDE.forEach((x, b) => {
      const pane = new Mesh(new PlaneGeometry(HALF_W * 2 + 0.03, TOP + 0.03), new MeshStandardMaterial({ color: '#1b1c1f', transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false }));
      pane.position.set(x, (TOP + 0.03) / 2, -0.012);
      this.root.add(pane);
      // named on the desk in front of each board, tilted up to the eye
      const label = new LabelCard(0.15, b ? 'A qubit coin' : 'A coin', b ? 'every path at once' : 'left or right at each peg');
      label.mesh.rotation.x = -Math.PI / 2 + 0.75;
      label.mesh.position.set(x, 0.012, 0.045);
      this.root.add(label.mesh);
    });
    this.setRows(10);
    this.root.visible = false;
  }

  private get u(): number {
    return HALF_W / (this.rows + 1);
  }

  private get dv(): number {
    return (TOP - PEG_BOTTOM) / this.rows;
  }

  /** New boards with `rows` rows of pegs; the bars empty. */
  setRows(rows: number): void {
    this.rows = Math.min(MAX_ROWS, rows);
    this.flying = [];
    this.flashing = [];
    this.barWant = [new Array(rows + 1).fill(0), new Array(rows + 1).fill(0)];
    this.barShown = [new Array(rows + 1).fill(0), new Array(rows + 1).fill(0)];
    const per = (rows * (rows + 1)) / 2;
    this.pegs.count = per * 2;
    let i = 0;
    for (const x0 of SIDE)
      for (let r = 0; r < rows; r++)
        for (let p = -r; p <= r; p += 2) {
          this.m.makeTranslation(x0 + p * this.u, TOP - r * this.dv, 0);
          this.pegs.setMatrixAt(i++, this.m);
        }
    this.pegs.instanceMatrix.needsUpdate = true;
    this.bars.count = (rows + 1) * 2;
    for (let k = 0; k < this.bars.count; k++) this.bars.setColorAt(k, k <= rows ? CBAR : QBAR);
    if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
    this.wave = [];
    this.front = this.frontTarget = 0;
    this.colorsDirty = true;
  }

  /** The quantum walk's distribution on every row, and how far down it has spread so far (0 dark, rows all lit). */
  setWave(rows: number[][], front: number): void {
    this.wave = rows;
    this.frontTarget = front;
    this.colorsDirty = true;
  }

  /** Counts in each bin, left board then right. */
  setBins(classical: readonly number[], quantum: readonly number[]): void {
    const scale = (xs: readonly number[]) => {
      const max = Math.max(10, ...xs);
      return xs.map((c) => c / max);
    };
    this.barWant = [scale(classical), scale(quantum)];
  }

  /** A marble down the left board along `path` (+1 right, -1 left at each peg); `done` when it lands. */
  drop(path: number[], done: () => void): void {
    if (this.flying.length >= MAX_MARBLES) return done();
    this.flying.push({ path, s: -1, done });
  }

  /** A measured walker appears in bin k of the right board. */
  land(bin: number): void {
    this.flashing.push({ bin, t: 0 });
    if (this.flashing.length > 16) this.flashing.shift();
  }

  /** Whether the wave has finished spreading down. */
  get waveDown(): boolean {
    return this.front >= this.rows - 0.01;
  }

  private binX(board: number, k: number): number {
    return SIDE[board] + (2 * k - this.rows) * this.u;
  }

  update(dt: number): void {
    const rows = this.rows;
    // the wave descends about a row every 0.09 s
    if (this.front !== this.frontTarget) {
      this.front = this.frontTarget > this.front ? Math.min(this.frontTarget, this.front + dt / 0.09) : this.frontTarget;
      this.colorsDirty = true;
    }
    if (this.colorsDirty) {
      this.colorsDirty = false;
      const per = (rows * (rows + 1)) / 2;
      const c = new Color();
      let i = 0;
      for (let r = 0; r < rows; r++)
        for (let p = -r; p <= r; p += 2) {
          this.pegs.setColorAt(i, DIM);
          const d = this.wave[r];
          const lit = Math.max(0, Math.min(1, this.front - r + 1));
          if (d && lit > 0) {
            const max = Math.max(...d);
            c.copy(DIM).lerp(LIT, Math.min(1, (d[p + r] / max) ** 0.7) * lit);
            this.pegs.setColorAt(per + i, c);
          } else this.pegs.setColorAt(per + i, DIM);
          i++;
        }
      if (this.pegs.instanceColor) this.pegs.instanceColor.needsUpdate = true;
    }
    // bars ease to their counts
    const w = this.u * 1.5;
    const ease = 1 - Math.exp(-dt * 10);
    for (let b = 0; b < 2; b++)
      for (let k = 0; k <= rows; k++) {
        const h = (this.barShown[b][k] += ((this.barWant[b][k] ?? 0) - this.barShown[b][k]) * ease);
        if (h < 0.002) this.m.makeScale(0, 0, 0);
        else this.m.makeScale(w, h * BAR_MAX, 0.012).setPosition(this.binX(b, k), BAR_BASE, 0);
        this.bars.setMatrixAt(b * (rows + 1) + k, this.m);
      }
    this.bars.instanceMatrix.needsUpdate = true;
    // marbles: a hop from peg to peg, about 14 rows a second
    const landed: Marble[] = [];
    this.flying.forEach((mb, i) => {
      mb.s += dt / 0.07;
      const seg = Math.floor(mb.s), f = mb.s - seg;
      let x0 = 0, y0 = TOP + this.dv, x1 = 0, y1 = TOP + 0.004;
      let p = 0;
      for (let r = 0; r < Math.max(0, seg); r++) p += mb.path[r] ?? 0;
      if (seg >= 0) {
        x0 = p * this.u;
        y0 = TOP - seg * this.dv + 0.006;
        const np = p + (mb.path[seg] ?? 0);
        x1 = np * this.u;
        y1 = seg + 1 >= rows ? BAR_BASE + 0.01 : TOP - (seg + 1) * this.dv + 0.006;
      }
      const x = SIDE[0] + x0 + (x1 - x0) * f;
      const y = y0 + (y1 - y0) * f + (seg >= 0 ? Math.sin(Math.PI * f) * this.dv * 0.45 : 0);
      this.m.makeTranslation(x, y, 0.004);
      this.marbles.setMatrixAt(i, this.m);
      if (mb.s >= rows) landed.push(mb);
    });
    this.flying = this.flying.filter((mb) => !landed.includes(mb));
    landed.forEach((mb) => mb.done());
    this.marbles.count = this.flying.length;
    this.marbles.instanceMatrix.needsUpdate = true;
    // walkers: a quick swell where they were found
    this.flashing.forEach((fl) => (fl.t += dt));
    this.flashing = this.flashing.filter((fl) => fl.t < 0.45);
    this.flashing.forEach((fl, i) => {
      const s = Math.sin((Math.PI * fl.t) / 0.45) * 1.4;
      this.m.compose(this.v.set(this.binX(1, fl.bin), BAR_BASE + (this.barShown[1][fl.bin] ?? 0) * BAR_MAX + 0.008, 0.004), this.q, this.one.clone().multiplyScalar(Math.max(0.01, s)));
      this.flashes.setMatrixAt(i, this.m);
    });
    this.flashes.count = this.flashing.length;
    this.flashes.instanceMatrix.needsUpdate = true;
  }
}
