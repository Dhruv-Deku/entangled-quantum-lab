import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, QuadraticBezierCurve3, SRGBColorSpace, TubeGeometry, Vector3 } from '@iwsdk/core';
import type { Mark, Player } from '../game/qttt';
import { GLOW } from './visuals';

const TILE = 0.078;
const PITCH = 0.086;
const PX = 256;
export const PLAYER_COLOR: Record<Player, string> = { X: '#3FC6C9', O: '#FF7759' };

export interface TicTacToeView {
  marks: readonly Mark[];
  board: readonly number[];
  /** The first square of a move being made. */
  selected: number | null;
  /** Squares a loop can collapse into (outlined in gold). */
  options: readonly number[];
  line: readonly number[] | null;
}

/** Where the k-th spooky mark sits on a tile face (tile-local, metres). */
const slot = (k: number) => new Vector3(((k % 2) - 0.5) * 0.034, 0.022 - (Math.floor(k / 2) % 3) * 0.022, 0.005);

/**
 * Quantum tic-tac-toe on the desk: nine dark tiles on a tilted stand. Each tile
 * shows its spooky marks small and faint, or one classical mark large; a gold
 * thread joins the two halves of every spooky mark (they are entangled). When
 * a loop collapses, the tiles pop one after another in the order the marks
 * were forced, and a mint bar crosses the winning row. The tiles themselves are
 * what you tap (they get ray and poke input from the LabSystem).
 */
export class TicTacToeBoard {
  readonly root = new Group();
  readonly tiles: Mesh[] = [];
  private readonly faces: { canvas: HTMLCanvasElement; tex: CanvasTexture }[] = [];
  private readonly arcs = new Group();
  private readonly arcMat = new MeshBasicMaterial({ color: '#e2b04a', transparent: true, opacity: 0.85, toneMapped: false });
  private readonly win: Mesh;
  private key = '';
  private pops: { square: number; at: number }[] = [];
  private t = 0;

  constructor() {
    this.root.name = 'TicTacToe';
    const stand = new Mesh(new BoxGeometry(PITCH * 3 + 0.02, PITCH * 3 + 0.02, 0.01), new MeshStandardMaterial({ color: '#141517', roughness: 0.5, metalness: 0.4 }));
    stand.position.z = -0.008;
    this.root.add(stand);
    const slab = new MeshStandardMaterial({ color: '#232428', roughness: 0.35, metalness: 0.5 });
    for (let s = 0; s < 9; s++) {
      const tile = new Mesh(new BoxGeometry(TILE, TILE, 0.006), slab);
      tile.name = `Square${s}`;
      tile.position.set(((s % 3) - 1) * PITCH, (1 - Math.floor(s / 3)) * PITCH, 0);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = PX;
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 4;
      const face = new Mesh(new PlaneGeometry(TILE, TILE), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      face.position.z = 0.0032;
      tile.add(face);
      this.root.add(tile);
      this.tiles.push(tile);
      this.faces.push({ canvas, tex });
    }
    this.root.add(this.arcs);
    this.win = new Mesh(new CylinderGeometry(0.004, 0.004, 1, 12), new MeshBasicMaterial({ color: '#3ddc97', transparent: true, opacity: 0.9, ...GLOW, toneMapped: false }));
    this.win.visible = false;
    this.root.add(this.win);
    // a little lectern foot so it stands on the desk
    // a support plate behind it, standing upright on the desk (the board leans back 54 degrees)
    const foot = new Mesh(new BoxGeometry(0.12, 0.09, 0.008), new MeshStandardMaterial({ color: '#141517', roughness: 0.5, metalness: 0.4 }));
    foot.position.set(0, -0.005, -0.058);
    foot.rotation.x = 0.95;
    this.root.add(foot);
    this.root.visible = false;
  }

  /** The marks just forced by a collapse, in order: their tiles pop one after another. */
  popCollapse(squares: readonly number[]): void {
    this.pops = squares.map((square, i) => ({ square, at: this.t + i * 0.12 }));
  }

  set(v: TicTacToeView): void {
    const key = JSON.stringify([v.marks.map((m) => [m.n, m.squares, m.at]), v.selected, v.options, v.line]);
    if (key === this.key) return;
    this.key = key;
    for (let s = 0; s < 9; s++) this.drawFace(s, v);
    // gold threads for every spooky mark
    for (const c of this.arcs.children) (c as Mesh).geometry.dispose();
    this.arcs.clear();
    const spooky = v.marks.filter((m) => m.at === null);
    const where = (m: Mark, s: number) => {
      const k = spooky.filter((o) => o.squares.includes(s)).indexOf(m);
      return this.tiles[s].position.clone().add(slot(k));
    };
    for (const m of spooky) {
      const a = where(m, m.squares[0]), b = where(m, m.squares[1]);
      const mid = a.clone().lerp(b, 0.5);
      mid.z += 0.012 + a.distanceTo(b) * 0.25;
      this.arcs.add(new Mesh(new TubeGeometry(new QuadraticBezierCurve3(a, mid, b), 24, 0.0009, 6), this.arcMat));
    }
    // the winning row
    this.win.visible = !!v.line;
    if (v.line) {
      const a = this.tiles[v.line[0]].position, b = this.tiles[v.line[2]].position;
      const d = b.clone().sub(a);
      this.win.position.copy(a).lerp(b, 0.5).setZ(0.008);
      this.win.scale.set(1, d.length() + TILE * 0.8, 1);
      this.win.rotation.set(0, 0, Math.atan2(d.y, d.x) - Math.PI / 2);
    }
  }

  private drawFace(s: number, v: TicTacToeView): void {
    const { canvas, tex } = this.faces[s];
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, PX, PX);
    const held = v.board[s];
    // the tile's face: a soft panel, so the nine squares read at a glance
    g.fillStyle = '#26282c';
    g.beginPath();
    g.roundRect(6, 6, PX - 12, PX - 12, 28);
    g.fill();
    g.strokeStyle = '#3a3c41';
    g.lineWidth = 3;
    g.stroke();
    const ring = v.selected === s ? '#2d7ff9' : v.options.includes(s) ? '#e2b04a' : v.line?.includes(s) ? '#3ddc97' : null;
    if (ring) {
      g.strokeStyle = ring;
      g.lineWidth = 12;
      g.beginPath();
      g.roundRect(8, 8, PX - 16, PX - 16, 26);
      g.stroke();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (held >= 0) {
      const m = v.marks[held];
      g.fillStyle = PLAYER_COLOR[m.player];
      g.font = '700 150px Inter, system-ui, sans-serif';
      g.fillText(m.player, PX / 2 - 12, PX / 2 + 6);
      g.font = '700 54px Inter, system-ui, sans-serif';
      g.fillText(`${m.n}`, PX / 2 + 62, PX / 2 + 62);
    } else {
      const spooky = v.marks.filter((m) => m.at === null && m.squares.includes(s));
      spooky.forEach((m, k) => {
        const p = slot(k);
        g.globalAlpha = 0.75;
        g.fillStyle = PLAYER_COLOR[m.player];
        g.font = '700 54px Inter, system-ui, sans-serif';
        g.fillText(`${m.player}${m.n}`, PX / 2 + (p.x / TILE) * PX, PX / 2 - (p.y / TILE) * PX);
      });
      g.globalAlpha = 1;
    }
    tex.needsUpdate = true;
  }

  update(dt: number): void {
    this.t += dt;
    this.arcMat.opacity = 0.7 + 0.2 * Math.sin(this.t * 3);
    for (let s = 0; s < 9; s++) {
      const p = this.pops.find((x) => x.square === s);
      const u = p ? (this.t - p.at) / 0.35 : -1;
      const k = u > 0 && u < 1 ? 1 + 0.14 * Math.sin(u * Math.PI) : 1;
      this.tiles[s].scale.setScalar(k);
    }
  }
}
