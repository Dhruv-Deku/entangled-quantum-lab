import {
  BoxGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import { SurfaceCode, type SurfaceRound } from '../quantum/surface';
import type { SurfaceView } from './figures';
import { Kit, LabelCard, useStudio } from './machine-kit';
import type { Texture } from '@iwsdk/core';

/** Metres between neighbouring data qubits. */
const P = 0.034;
const SILVER = new Color('#d5d9e0');
const BIT = new Color('#ff5a4f');
const PHASE = new Color('#9b87f5');
const LIT = new Color('#2d7ff9');
const FIX = new Color('#3ddc97');
const X_TILE = new Color('#2b3a52');
const Z_TILE = new Color('#3b3631');
const BLACK = new Color('#000000');
/** When the decoder's fix appears in a round that runs by itself (seconds into the round). */
const AUTO_DECODE = 1.4;

const smooth = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

interface Tile {
  mesh: Mesh;
  mat: MeshStandardMaterial;
  base: Color;
  dot: Mesh;
  dotMat: MeshStandardMaterial;
  centre: Vector3;
  /** Rows of the sweep that runs over the lattice each cycle. */
  row: number;
}

/**
 * The surface code as a chip, like Google's Willow: a silicon die with a grid
 * of data qubits (silver beads) and a measure qubit on every tile between
 * them (blue-grey tiles check for phase flips, warm graphite for bit flips;
 * half-discs along the edges). Each cycle a sweep runs over the measure
 * qubits; errors turn their qubit coral (bit flip) or violet (phase flip), the
 * tiles around them light up blue, and the decoder's fix grows in mint along
 * the shortest paths before the errors heal. A failed correction flashes the
 * die's edge coral: the logical qubit flipped.
 */
export class SurfaceCodeVisual {
  readonly root = new Group();
  private readonly chip = new Group();
  private code: SurfaceCode | null = null;
  private tiles: Tile[] = [];
  private beads: { mesh: Mesh; mat: MeshStandardMaterial; at: Vector3 }[] = [];
  private chains: Mesh[] = [];
  private readonly chainMat = new MeshStandardMaterial({ color: FIX, emissive: FIX, emissiveIntensity: 0.9, roughness: 0.4 });
  private edge!: MeshStandardMaterial;
  private readonly name = new LabelCard(0.2, 'Surface code', '');
  private id = -1;
  private decodedSeen = false;
  private round: SurfaceRound | null = null;
  private t = 0;
  private tDecode = Infinity;
  /** The studio the metal reflects (set by the lab). */
  env: Texture | null = null;

  constructor() {
    this.root.name = 'SurfaceCode';
    this.root.add(this.chip);
    this.chip.add(this.name.mesh);
  }

  private build(d: number): void {
    this.chip.clear();
    this.chip.add(this.name.mesh);
    this.tiles = [];
    this.beads = [];
    this.chains = [];
    const code = (this.code = new SurfaceCode(d));
    const span = (d - 1) * P;
    const at = (r: number, c: number, y = 0) => new Vector3(c * P - span / 2, y, r * P - span / 2);
    // the die, and a frame around it that flashes when a correction fails
    const dieMat = new MeshStandardMaterial({ color: '#0d0f12', roughness: 0.75, metalness: 0 });
    const die = new Mesh(new BoxGeometry(span + 2.2 * P, 0.004, span + 2.2 * P), dieMat);
    die.position.y = -0.0025;
    this.chip.add(die);
    this.edge = new MeshStandardMaterial({ color: '#3a3d43', emissive: BLACK, roughness: 0.35, metalness: 0.8 });
    const side = span + 2.3 * P;
    for (const [w, dd, x, z] of [[side, 0.004, 0, -side / 2], [side, 0.004, 0, side / 2], [0.004, side, -side / 2, 0], [0.004, side, side / 2, 0]]) {
      const bar = new Mesh(new BoxGeometry(w, 0.006, dd), this.edge);
      bar.position.set(x, -0.001, z);
      this.chip.add(bar);
    }
    // measure qubits: square tiles inside, half-discs on the edges
    for (const ch of code.checks) {
      const centre = at(ch.r + 0.5, ch.c + 0.5, 0.0004);
      const base = ch.type === 'X' ? X_TILE : Z_TILE;
      const mat = new MeshStandardMaterial({ color: base.clone(), emissive: BLACK.clone(), roughness: 0.5, metalness: 0.2 });
      let mesh: Mesh;
      if (ch.data.length === 4) {
        mesh = new Mesh(new PlaneGeometry(P * 0.92, P * 0.92), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(centre);
      } else {
        // a half-disc on the edge, bulging outward from the two qubits it checks
        const a = at(Math.floor(ch.data[0] / d), ch.data[0] % d), b = at(Math.floor(ch.data[1] / d), ch.data[1] % d);
        const mid = a.clone().lerp(b, 0.5);
        const out = centre.clone().sub(mid).setY(0).normalize();
        // the disc's half points along local +y; lying flat, that is world (-sin z, 0, -cos z)
        mesh = new Mesh(new CircleGeometry(P * 0.46, 24, 0, Math.PI), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = Math.atan2(-out.x, -out.z);
        mesh.position.set(mid.x, 0.0004, mid.z);
      }
      this.chip.add(mesh);
      const dotMat = new MeshStandardMaterial({ color: '#6b6e75', emissive: BLACK.clone(), roughness: 0.4, metalness: 0.3 });
      const dot = new Mesh(new SphereGeometry(P * 0.085, 12, 8), dotMat);
      dot.position.copy(ch.data.length === 4 ? centre : mesh.position.clone().add(centre.clone().sub(mesh.position).multiplyScalar(0.35)));
      dot.position.y = 0.003;
      this.chip.add(dot);
      this.tiles.push({ mesh, mat, base, dot, dotMat, centre: dot.position.clone(), row: ch.r + 1 });
    }
    // couplers: a thin line from each measure qubit to the data qubits it checks, as on the real chip
    const kit = new Kit();
    const coupler = new MeshStandardMaterial({ color: '#7a7f88', roughness: 0.3, metalness: 0.9 });
    code.checks.forEach((ch, i) => {
      for (const q of ch.data) kit.rod(this.tiles[i].centre.clone().setY(0.0012), at(Math.floor(q / d), q % d, 0.0012), 0.0011, coupler, 5);
    });
    kit.build(this.chip);
    // data qubits
    for (let q = 0; q < code.dataCount; q++) {
      const mat = new MeshStandardMaterial({ color: SILVER.clone(), emissive: BLACK.clone(), roughness: 0.25, metalness: 0.35 });
      const mesh = new Mesh(new SphereGeometry(P * 0.17, 20, 14), mat);
      const p = at(Math.floor(q / d), q % d, P * 0.17);
      mesh.position.copy(p);
      this.chip.add(mesh);
      this.beads.push({ mesh, mat, at: p });
    }
    this.name.set(`Distance ${d}`, `${d * d} data + ${d * d - 1} measure qubits`);
    this.name.mesh.rotation.x = -Math.PI / 2;
    // beside the die, flush with it
    this.name.mesh.position.set(span / 2 + 1.15 * P + 0.105, 0.001, 0);
    if (this.env) useStudio(this.chip, this.env);
    // the die stays dark silicon: only a faint sheen of the studio
    dieMat.envMapIntensity = 0.12;
  }

  /** The chapter's state, every frame: rebuilds for a new size and replays each new round. */
  /**
   * The decoder game: lit checks, the player's flips (mint) and, once
   * revealed, the real errors (coral; an error the player also flipped is
   * healed and shows silver). No animation: it shows exactly this.
   */
  showPuzzle(d: number, lit: readonly number[], flips: readonly number[], errors: readonly number[] | null): void {
    if (!this.code || this.code.d !== d) {
      this.build(d);
      this.id = -1;
    }
    this.puzzle = { lit: new Set(lit), flips: new Set(flips), errors: errors ? new Set(errors) : null };
    this.name.mesh.visible = false;
    for (const m of this.chains) m.visible = false;
  }

  private puzzle: { lit: Set<number>; flips: Set<number>; errors: Set<number> | null } | null = null;

  set(v: SurfaceView): void {
    this.puzzle = null;
    this.name.mesh.visible = true;
    if (!this.code || this.code.d !== v.d) {
      this.build(v.d);
      this.id = -1;
    }
    if (v.id !== this.id) {
      this.id = v.id;
      this.round = v.round;
      this.t = 0;
      this.decodedSeen = v.decoded;
      this.tDecode = v.decoded ? AUTO_DECODE : Infinity;
      this.layChains();
    } else if (v.decoded && !this.decodedSeen) {
      this.decodedSeen = true;
      this.tDecode = Math.max(this.t, 0.9);
    }
  }

  /** Tubes along each correction chain: from a lit tile through the qubits it flips to the other tile (or off the edge). */
  private layChains(): void {
    for (const m of this.chains) {
      this.chip.remove(m);
      m.geometry.dispose();
    }
    this.chains = [];
    const r = this.round, code = this.code;
    if (!r || !code) return;
    const tileAt = (ci: number) => this.tiles[ci].centre;
    const draw = (chains: number[][], defects: number[]) => {
      // pair each chain with the lit tiles at its ends: the tiles touching its first and last qubit
      for (const chain of chains) {
        if (!chain.length) continue;
        const pts: Vector3[] = [];
        const first = this.beads[chain[0]].at, last = this.beads[chain[chain.length - 1]].at;
        const near = (p: Vector3) => {
          let best = -1, bd = Infinity;
          for (const ci of defects) {
            const dd = tileAt(ci).distanceTo(p);
            if (dd < bd) [bd, best] = [dd, ci];
          }
          return bd < P * 0.9 ? tileAt(best) : null;
        };
        const start = near(first), end = near(last);
        if (start) pts.push(start.clone().setY(0.006));
        for (const q of chain) pts.push(this.beads[q].at.clone().setY(0.006));
        if (end && (chain.length > 1 || end !== start)) pts.push(end.clone().setY(0.006));
        else {
          // off the edge: carry on outward past the last qubit
          const prev = pts[pts.length - 2] ?? first;
          pts.push(last.clone().setY(0.006).add(last.clone().sub(prev).setY(0).normalize().multiplyScalar(P * 0.6)));
        }
        if (pts.length < 2) continue;
        const curve = new CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
        const mesh = new Mesh(new TubeGeometry(curve, Math.max(8, pts.length * 10), P * 0.055, 6), this.chainMat);
        mesh.geometry.setDrawRange(0, 0);
        this.chip.add(mesh);
        this.chains.push(mesh);
      }
    };
    const xDef = r.defects.filter((ci) => code.checks[ci].type === 'Z');
    const zDef = r.defects.filter((ci) => code.checks[ci].type === 'X');
    draw(r.xChains, xDef);
    draw(r.zChains, zDef);
  }

  update(dt: number): void {
    if (!this.code) return;
    this.t += dt;
    const t = this.t, r = this.round;
    // the cycle's sweep across the measure qubits, row by row
    for (const tile of this.tiles) {
      const sweep = Math.max(0, 1 - Math.abs(t * 3.2 - tile.row * 0.45) * 1.6);
      tile.dotMat.emissive.copy(SILVER).multiplyScalar(0.8 * sweep);
    }
    if (this.puzzle) {
      const z = this.puzzle;
      this.tiles.forEach((tile, i) => {
        const on = z.lit.has(i) ? 1 : 0;
        tile.mat.color.copy(tile.base).lerp(LIT, on * 0.7);
        tile.mat.emissive.copy(LIT).multiplyScalar(on * 0.9);
      });
      this.beads.forEach((b, q) => {
        const err = z.errors?.has(q) ?? false, flip = z.flips.has(q);
        const c = err && !flip ? BIT : flip && !err ? FIX : SILVER;
        b.mat.color.copy(c);
        b.mat.emissive.copy(c === SILVER ? BLACK : c).multiplyScalar(0.6);
        b.mesh.scale.setScalar(flip || err ? 1.25 : 1);
      });
      this.edge.emissive.copy(BLACK);
      return;
    }
    if (!r) return;
    const healed = smooth((t - this.tDecode - 0.85) / 0.35);
    const errorsIn = smooth((t - 0.35) / 0.18);
    const lit = smooth((t - 0.7) / 0.2) * (1 - healed);
    const defects = new Set(r.defects);
    this.tiles.forEach((tile, i) => {
      const on = defects.has(i) ? lit : 0;
      tile.mat.color.copy(tile.base).lerp(LIT, on * 0.7);
      tile.mat.emissive.copy(LIT).multiplyScalar(on * 0.9);
    });
    const xs = new Set(r.xErrors), zs = new Set(r.zErrors);
    this.beads.forEach((b, q) => {
      const kind = xs.has(q) ? BIT : zs.has(q) ? PHASE : null;
      const flash = kind ? smooth((t - this.tDecode - 0.75) / 0.15) * (1 - smooth((t - this.tDecode - 1.2) / 0.4)) : 0;
      if (kind) {
        b.mat.color.copy(SILVER).lerp(kind, errorsIn * (1 - healed)).lerp(FIX, flash);
        b.mat.emissive.copy(kind).multiplyScalar(0.7 * errorsIn * (1 - healed)).lerp(FIX.clone().multiplyScalar(0.6), flash);
        const pop = errorsIn < 1 ? 1 + 0.5 * Math.sin(Math.PI * errorsIn) : 1;
        b.mesh.scale.setScalar(pop);
      } else {
        b.mat.color.copy(SILVER);
        b.mat.emissive.copy(BLACK);
        b.mesh.scale.setScalar(1);
      }
    });
    // the fix grows along each chain, then fades with the errors
    const grow = smooth((t - this.tDecode) / 0.45);
    for (const m of this.chains) {
      const count = (m.geometry.index?.count ?? 0) * grow;
      m.geometry.setDrawRange(0, Math.floor(count / 6) * 6);
      m.visible = grow > 0 && t < this.tDecode + 1.5;
    }
    // a failed correction: the edge flashes coral
    const fail = r.logical ? smooth((t - this.tDecode - 0.9) / 0.15) * (1 - smooth((t - this.tDecode - 1.9) / 0.6)) : 0;
    this.edge.emissive.copy(BIT).multiplyScalar(fail * 1.2);
  }
}
