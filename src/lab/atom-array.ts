import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Op } from '../quantum/circuit';
import { Beam, ease, finishes, Kit, LabelCard } from './machine-kit';
import { GLOW, GOLD, qubitColor, textTexture } from './visuals';

/** Metres between tweezer sites. */
const SP = 0.022;
const SITES = 7;
const AXIS = 0.04;
/** The lane in front of the row where atoms travel. */
const LANE = 0.017;
const BACK = -0.02;
const WHITE = new Color('#ffffff');
const TWEEZER = new Color('#ff6b6b');

const smooth = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** A thin cylinder from a to b. */
function beamBetween(a: Vector3, b: Vector3, r: number, mat: MeshBasicMaterial | MeshStandardMaterial): Mesh {
  const m = new Mesh(new CylinderGeometry(r, r, a.distanceTo(b), 8), mat);
  m.position.copy(a).lerp(b, 0.5);
  m.lookAt(b);
  m.rotateX(Math.PI / 2);
  return m;
}

interface Atom {
  body: Mesh;
  mat: MeshBasicMaterial;
  halo: Sprite;
  haloMat: SpriteMaterial;
  tweezer: Mesh;
  raman: Mesh;
  ramanMat: MeshBasicMaterial;
  home: Vector3;
  pos: Vector3;
  flash: number;
  read: number;
}

/** One step of a run as the atoms act it out. */
interface Action {
  op: Op;
  dur: number;
  t: number;
  /** For a two-qubit gate between non-neighbours: the atom that travels, and where it parks. */
  mover?: number;
  park?: Vector3;
}

/**
 * A neutral-atom quantum computer up close: a glass vacuum cell, a microscope
 * objective above it, and a row of rubidium atoms each held in a beam of
 * laser light (an optical tweezer), with spare atoms waiting in a second row.
 * Neighbours are close enough to interact; for a gate between atoms further
 * apart, one atom is carried along the lane in front, the two glow gold while
 * the Rydberg interaction entangles them, and it is carried back.
 */
export class AtomArrayVisual {
  readonly root = new Group();
  private atoms: Atom[] = [];
  private readonly spares = new Group();
  private queue: Action[] = [];
  private current: Action | null = null;
  private readonly blockade: Mesh;
  private readonly blockadeMat: MeshBasicMaterial;
  private readonly glow = glowTexture();
  private readonly v = new Vector3();

  constructor() {
    this.root.name = 'AtomArray';
    const dark = new MeshStandardMaterial({ color: '#25272b', roughness: 0.55, metalness: 0.4 });
    const steel = new MeshStandardMaterial({ color: '#a7adb5', roughness: 0.3, metalness: 0.9 });
    const W = 0.18, D = 0.075, Hc = 0.07;
    const base = new Mesh(new BoxGeometry(W + 0.02, 0.006, D + 0.02), dark);
    base.position.y = 0.003;
    this.root.add(base);
    // the glass cell and its frame
    const cell = new Mesh(new BoxGeometry(W, Hc, D), new MeshStandardMaterial({ color: '#9fb6d6', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.1, depthWrite: false }));
    cell.position.y = 0.006 + Hc / 2;
    this.root.add(cell);
    const edge = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new Mesh(new BoxGeometry(w, h, d), steel);
      m.position.set(x, y, z);
      this.root.add(m);
    };
    for (const y of [0.006, 0.006 + Hc]) for (const z of [-D / 2, D / 2]) edge(W, 0.0018, 0.0018, 0, y, z);
    for (const y of [0.006, 0.006 + Hc]) for (const x of [-W / 2, W / 2]) edge(0.0018, 0.0018, D, x, y, 0);
    for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) edge(0.0018, Hc, 0.0018, x, 0.006 + Hc / 2, z);
    // the objective above
    const obj = new Mesh(new CylinderGeometry(0.022, 0.026, 0.03, 36), dark);
    obj.position.y = 0.006 + Hc + 0.034;
    this.root.add(obj);
    const glass = new Mesh(new CylinderGeometry(0.02, 0.02, 0.002, 36), new MeshStandardMaterial({ color: '#6f8fb8', roughness: 0.05, transparent: true, opacity: 0.55 }));
    glass.position.y = 0.006 + Hc + 0.019;
    this.root.add(glass);
    // spare atoms waiting in the back row
    const spareMat = new MeshBasicMaterial({ color: '#7c8088' });
    const spareTweezer = new MeshBasicMaterial({ color: TWEEZER, transparent: true, opacity: 0.14, depthWrite: false, ...GLOW });
    for (let i = 0; i < SITES; i++) {
      const p = new Vector3((i - (SITES - 1) / 2) * SP, AXIS, BACK);
      const a = new Mesh(new SphereGeometry(0.0022, 10, 8), spareMat);
      a.position.copy(p);
      this.spares.add(a, beamBetween(p, new Vector3(p.x, 0.006 + Hc, p.z), 0.0009, spareTweezer));
    }
    this.root.add(this.spares);
    // normal blending: an additive glow vanishes against a bright room
    this.blockadeMat = new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, depthWrite: false });
    this.blockade = new Mesh(new SphereGeometry(0.014, 24, 16), this.blockadeMat);
    this.root.add(this.blockade);
    const caption = new Mesh(new PlaneGeometry(0.08, 0.03), new MeshBasicMaterial({ map: textTexture([{ text: 'Atoms', color: '#8a8d93' }], 500), transparent: true, depthWrite: false }));
    caption.rotation.x = -Math.PI / 2;
    caption.position.set(-W / 2 + 0.03, 0.0062, D / 2 + 0.006);
    this.root.add(caption);
    this.setQubits(3);
  }

  /** The qubits sit in the middle of the front row; spares wait in the back row. */
  setQubits(n: number): void {
    if (n === this.atoms.length) return;
    for (const a of this.atoms) this.root.remove(a.body, a.halo, a.tweezer, a.raman);
    this.atoms = [];
    const ramanGeo = new CylinderGeometry(0.0008, 0.0008, 0.06, 8);
    ramanGeo.rotateX(Math.PI / 2);
    for (let q = 0; q < n; q++) {
      const home = new Vector3((q - (n - 1) / 2) * SP, AXIS, 0);
      const mat = new MeshBasicMaterial({ color: qubitColor(q) });
      const body = new Mesh(new SphereGeometry(0.0034, 14, 10), mat);
      const haloMat = new SpriteMaterial({ map: this.glow, color: qubitColor(q), transparent: true, opacity: 0.45, depthWrite: false, ...GLOW });
      const halo = new Sprite(haloMat);
      halo.scale.setScalar(0.022);
      const tweezer = new Mesh(new CylinderGeometry(0.0014, 0.0014, 1, 8), new MeshBasicMaterial({ color: TWEEZER, transparent: true, opacity: 0.3, depthWrite: false, ...GLOW }));
      const ramanMat = new MeshBasicMaterial({ color: qubitColor(q), transparent: true, opacity: 0, depthWrite: false, ...GLOW });
      const raman = new Mesh(ramanGeo, ramanMat);
      this.root.add(body, halo, tweezer, raman);
      this.atoms.push({ body, mat, halo, haloMat, tweezer, raman, ramanMat, home, pos: home.clone(), flash: 0, read: 0 });
    }
    this.place();
  }

  /** Play a run: atoms act out each op, travelling for gates between non-neighbours. */
  play(ops: readonly Op[]): void {
    this.queue = ops.map((op) => {
      const qs = op.kind === 'gate' ? [...(op.controls ?? []), op.target] : op.kind === 'swap' || op.kind === 'iswap' ? [op.a, op.b] : [];
      if (qs.length === 2 && Math.abs(qs[0] - qs[1]) > 1 && this.atoms[qs[0]] && this.atoms[qs[1]]) {
        const [a, b] = qs;
        const side = Math.sign(b - a);
        const park = new Vector3(this.atoms[a].home.x + side * SP * 0.45, AXIS, LANE * 0.7);
        return { op, dur: 2.3, t: 0, mover: b, park };
      }
      if (qs.length === 2) return { op, dur: 0.55, t: 0 };
      return { op, dur: op.kind === 'measure' || op.kind === 'reset' ? 0.3 : 0.22, t: 0 };
    });
    this.current = null;
  }

  get playing(): boolean {
    return this.queue.length > 0 || this.current !== null;
  }

  /** Where the travelling atom is at time t of its trip. */
  private trip(a: Atom, park: Vector3, t: number): Vector3 {
    const lane = this.v.set(a.home.x, AXIS, LANE);
    const out = new Vector3();
    if (t < 0.25) out.copy(a.home).lerp(lane, smooth(t / 0.25));
    else if (t < 0.85) out.copy(lane).lerp(park, smooth((t - 0.25) / 0.6));
    else if (t < 1.45) out.copy(park);
    else if (t < 2.05) out.copy(park).lerp(lane, smooth((t - 1.45) / 0.6));
    else out.copy(lane).lerp(a.home, smooth((t - 2.05) / 0.25));
    return out;
  }

  private start(act: Action): void {
    const op = act.op;
    if (op.kind === 'measure' || op.kind === 'reset') {
      const a = this.atoms[op.qubit];
      if (a) a.read = 1;
      return;
    }
    const qs = op.kind === 'gate' ? [...(op.controls ?? []), op.target] : op.kind === 'swap' || op.kind === 'iswap' ? [op.a, op.b] : [];
    if (qs.length === 1 && this.atoms[qs[0]]) this.atoms[qs[0]].flash = 1;
  }

  update(dt: number): void {
    // advance the run
    if (!this.current && this.queue.length) {
      this.current = this.queue.shift()!;
      this.start(this.current);
    }
    let glow = 0;
    let pair: [number, number] | null = null;
    if (this.current) {
      const act = this.current;
      act.t += dt;
      const qs = act.op.kind === 'gate' ? [...(act.op.controls ?? []), act.op.target] : act.op.kind === 'swap' || act.op.kind === 'iswap' ? [act.op.a, act.op.b] : [];
      if (qs.length === 2) {
        pair = [qs[0], qs[1]];
        const g0 = act.mover !== undefined ? 0.85 : 0.05, g1 = act.mover !== undefined ? 1.45 : 0.5;
        glow = act.t > g0 && act.t < g1 ? Math.sin((Math.PI * (act.t - g0)) / (g1 - g0)) : 0;
      }
      if (act.mover !== undefined && act.park) this.atoms[act.mover]?.pos.copy(this.trip(this.atoms[act.mover], act.park, act.t));
      if (act.t >= act.dur) {
        if (act.mover !== undefined) this.atoms[act.mover]?.pos.copy(this.atoms[act.mover].home);
        this.current = null;
      }
    }
    // the gold glow of the Rydberg interaction, between the pair
    if (pair && this.atoms[pair[0]] && this.atoms[pair[1]]) this.blockade.position.copy(this.atoms[pair[0]].pos).lerp(this.atoms[pair[1]].pos, 0.5);
    this.blockadeMat.opacity = 0.32 * glow;
    this.blockade.scale.setScalar(0.8 + 0.3 * glow);
    for (const a of this.atoms) {
      a.flash = Math.max(0, a.flash - dt * 2.6);
      a.read = Math.max(0, a.read - dt * 1.6);
    }
    this.atoms.forEach((a, q) => {
      const lit = pair && (pair[0] === q || pair[1] === q) ? glow : 0;
      const c = new Color(qubitColor(q)).lerp(WHITE, Math.max(0.25, a.read, a.flash * 0.5)).lerp(GOLD, lit * 0.6);
      a.mat.color.copy(c);
      a.haloMat.color.copy(c);
      a.haloMat.opacity = 0.65 + 0.35 * Math.max(a.read, a.flash, lit);
      a.halo.scale.setScalar(0.022 * (1 + 0.8 * Math.max(a.read, lit)));
      a.ramanMat.opacity = 0.85 * a.flash;
    });
    this.place();
  }

  /** Put each atom, its halo, its tweezer beam (from the objective down to it) and its addressing beam where it is. */
  private place(): void {
    // tweezers come down from the objective, through the top of the cell
    const top = 0.095;
    for (const a of this.atoms) {
      a.body.position.copy(a.pos);
      a.halo.position.copy(a.pos);
      a.tweezer.position.set(a.pos.x, (a.pos.y + top) / 2, a.pos.z);
      a.tweezer.scale.set(1, top - a.pos.y, 1);
      a.raman.position.set(a.pos.x, a.pos.y, a.pos.z + 0.034);
    }
  }
}

/**
 * The optics table around the atoms: a breadboard where the tweezer laser runs
 * through a pair of crossed acousto-optic deflectors, a lens and three mirrors
 * up a periscope into the objective, which focuses it to a grid of spots in a
 * small glass cell. Six cooling beams cross in the cell between two copper
 * coils (the magneto-optical trap), and two Rydberg lasers, blue and red,
 * light up during gates. A camera on top reads the atoms out.
 *
 * Coming into view, it plays what a real machine does before every run: the
 * cooling beams come on, the tweezer light traces its path, atoms fall into
 * the tweezers at random, about half of them, and the tweezers then sort them
 * one by one into a perfect block. On the desk it is a model; at full size it
 * is a real optical table on its legs.
 */
export class OpticsTableVisual {
  readonly root = new Group();
  /** Model units: 1:1 on the desk, 4x at full size, on legs 0.2 units tall. */
  readonly size = { deskScale: 1, fullScale: 4, lift: 0.2 };
  readonly stand = new Group();
  private mot: Beam[] = [];
  private path: Beam[] = [];
  private rydberg: Beam[] = [];
  private atoms: { body: Mesh; halo: Sprite; from: Vector3; to: Vector3 | null; dropped: boolean; at: number }[] = [];
  private readonly glow = glowTexture();
  private readonly cell = new Vector3(0.03, 0.06, -0.02);
  private pulse = 0;
  private t = 99;

  constructor() {
    this.root.name = 'OpticsTable';
    const f = finishes();
    const kit = new Kit();
    const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const C = this.cell, Y = C.y;
    // breadboard with its grid of tapped holes
    const holes = document.createElement('canvas');
    holes.width = holes.height = 256;
    const hg = holes.getContext('2d')!;
    hg.fillStyle = '#33363b';
    hg.fillRect(0, 0, 256, 256);
    hg.fillStyle = '#1c1d20';
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
      hg.beginPath();
      hg.arc(8 + i * 16, 8 + j * 16, 2.6, 0, Math.PI * 2);
      hg.fill();
    }
    const tex = new CanvasTexture(holes);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    const top = new MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.5 });
    const board = new Mesh(new BoxGeometry(0.3, 0.012, 0.22), [f.dark, f.dark, top, f.dark, f.dark, f.dark]);
    board.position.y = 0.006;
    this.root.add(board);

    const post = (p: Vector3) => {
      kit.cyl(0.0035, p.y - 0.012, f.steel, P(p.x, (p.y + 0.012) / 2, p.z), 10);
      kit.cyl(0.007, 0.004, f.anodised, P(p.x, 0.014, p.z), 12);
    };
    /** A mirror on a kinematic mount at p, facing the bisector of the two beam directions. */
    const mirror = (p: Vector3, normal: Vector3) => {
      const q = new Quaternion().setFromUnitVectors(P(0, 0, 1), normal.clone().normalize());
      const e = new Euler().setFromQuaternion(q);
      kit.add(new BoxGeometry(0.022, 0.022, 0.004), f.anodised, p.clone().addScaledVector(normal.clone().normalize(), -0.004), e);
      kit.add(new CylinderGeometry(0.0085, 0.0085, 0.002, 20).rotateX(Math.PI / 2), f.steel, p.clone(), e);
    };

    // ---- the tweezer path: laser, crossed deflectors, lens, mirrors, periscope, objective ----
    const laserAt = P(-0.115, Y, 0.075);
    kit.box(0.06, 0.03, 0.032, f.black, laserAt);
    kit.box(0.05, Y - 0.015 - 0.012, 0.028, f.anodised, P(laserAt.x, (Y - 0.015 + 0.012) / 2, laserAt.z));
    kit.box(0.03, 0.004, 0.02, f.anodised, laserAt.clone().add(P(0, 0.017, 0)));
    const pts = [P(-0.085, Y, 0.075), P(0.1, Y, 0.075), P(0.1, Y, C.z), P(0.1, 0.15, C.z), P(C.x, 0.15, C.z), P(C.x, 0.118, C.z)];
    // two crossed acousto-optic deflectors steer the beam into a grid of spots
    for (const [x, rz] of [[-0.06, 0], [-0.04, Math.PI / 2]] as const) {
      kit.box(0.014, 0.022, 0.018, f.anodised, P(x, Y, 0.075), new Euler(0, 0, rz));
      post(P(x, Y - 0.012, 0.075));
    }
    kit.add(new CylinderGeometry(0.011, 0.011, 0.003, 24).rotateZ(Math.PI / 2), f.glass, P(-0.005, Y, 0.075));
    kit.ring(0.011, 0.0015, f.anodised, P(-0.005, Y, 0.075));
    post(P(-0.005, Y - 0.012, 0.075));
    mirror(pts[1], P(-1, 0, -1));
    post(P(0.1, Y - 0.012, 0.075));
    mirror(pts[2], P(0, 1, 1));
    mirror(pts[3], P(-1, -1, 0));
    // the periscope post
    kit.cyl(0.004, 0.15 - 0.012, f.steel, P(0.1, (0.15 + 0.012) / 2, C.z - 0.012), 10);
    // dichroic cube: the camera looks through it, the tweezers bounce down off it
    kit.box(0.016, 0.016, 0.016, f.glass, pts[4]);
    kit.box(0.02, 0.003, 0.02, f.anodised, pts[4].clone().add(P(0, -0.0095, 0)));
    // the objective, and the camera above the cube
    kit.cyl(0.013, 0.038, f.black, P(C.x, 0.098, C.z), 32, undefined, 0.009);
    kit.ring(0.013, 0.0015, f.steel, P(C.x, 0.117, C.z), 32);
    kit.cyl(0.008, 0.025, f.anodised, P(C.x, 0.172, C.z), 20);
    kit.box(0.045, 0.035, 0.045, f.dark, P(C.x, 0.2, C.z));
    // a gantry holds the objective and camera
    for (const sx of [-1, 1]) kit.box(0.008, 0.21, 0.01, f.anodised, P(C.x + sx * 0.05, 0.117, C.z - 0.05));
    kit.box(0.11, 0.01, 0.01, f.anodised, P(C.x, 0.222, C.z - 0.05));
    kit.box(0.01, 0.01, 0.05, f.anodised, P(C.x, 0.222, C.z - 0.025));
    for (let i = 0; i + 1 < pts.length; i++) {
      const b = new Beam(pts[i], pts[i + 1], 0.0012, '#ff6b8a', 0.6);
      this.root.add(b.mesh);
      this.path.push(b);
    }
    // the focused light, a narrow cone from the objective into the cell
    const cone = new Beam(P(C.x, 0.079, C.z), C, 0.0016, '#ff6b8a', 0.5);
    this.root.add(cone.mesh);
    this.path.push(cone);

    // ---- the glass cell, its coils and six cooling beams ----
    kit.box(0.036, 0.028, 0.028, f.glass, C);
    kit.box(0.012, 0.012, 0.03, f.glass, C.clone().add(P(-0.024, 0, 0)));
    kit.cyl(0.006, 0.04, f.steel, C.clone().add(P(-0.05, 0, 0)), 16, new Euler(0, 0, Math.PI / 2));
    kit.box(0.03, 0.03, 0.03, f.brushed, C.clone().add(P(-0.08, -0.01, 0)));
    kit.cyl(0.01, Y - 0.025 - 0.012, f.steel, P(C.x - 0.08, (Y - 0.025 + 0.012) / 2, C.z), 12);
    for (const dy of [-0.022, 0.022]) kit.add(new TorusGeometry(0.02, 0.0045, 10, 40).rotateX(Math.PI / 2), f.copper, C.clone().add(P(0, dy, 0)));
    for (const d of [P(1, 0, 0), P(0, 0, 1), P(0.7, 0.7, 0)]) {
      const a = C.clone().addScaledVector(d, -0.075), b = C.clone().addScaledVector(d, 0.075);
      const beam = new Beam(a, b, 0.0035, '#ff9a6b', 0.16);
      this.root.add(beam.mesh);
      this.mot.push(beam);
      for (const end of [a, b]) {
        if (end.y > 0.11) continue;
        kit.add(new CylinderGeometry(0.007, 0.007, 0.006, 16).rotateX(Math.PI / 2), f.anodised, end, new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(P(0, 0, 1), d)));
        post(end.clone().setY(end.y - 0.008));
      }
    }

    // ---- two Rydberg lasers, blue and red, meeting in the cell ----
    for (const [at, color] of [[P(-0.1, Y, -0.085), '#5aa0ff'], [P(0.135, Y, -0.085), '#ff4a5a']] as const) {
      kit.box(0.04, 0.026, 0.026, f.black, at, new Euler(0, Math.atan2(C.x - at.x, C.z - at.z), 0));
      kit.cyl(0.006, Y - 0.013 - 0.012, f.steel, P(at.x, (Y - 0.013 + 0.012) / 2, at.z), 10);
      kit.cyl(0.012, 0.004, f.anodised, P(at.x, 0.014, at.z), 16);
      const from = at.clone().lerp(C, 0.15);
      const beam = new Beam(from, C, 0.0011, color, 0.8);
      this.root.add(beam.mesh);
      this.rydberg.push(beam);
    }

    // ---- the tweezer array: a 5 x 5 grid in the cell, sorted into the middle 3 x 3 ----
    const pitch = 0.005;
    for (let i = 0; i < 25; i++) {
      const body = new Mesh(new SphereGeometry(0.0014, 10, 8), new MeshBasicMaterial({ color: '#ffd2d9', toneMapped: false }));
      const halo = new Sprite(new SpriteMaterial({ map: this.glow, color: '#ff8aa0', transparent: true, opacity: 0.7, depthWrite: false, ...GLOW }));
      halo.scale.setScalar(0.0095);
      const from = C.clone().add(P(((i % 5) - 2) * pitch, (Math.floor(i / 5) - 2) * pitch * 0.9, 0.004));
      this.root.add(body, halo);
      this.atoms.push({ body, halo, from, to: null, dropped: false, at: 0 });
    }

    // ---- the optical table under it at full size: legs with air isolators ----
    const legs = new Kit();
    legs.box(0.33, 0.03, 0.25, f.dark, P(0, -0.015, 0));
    for (const [x, z] of [[-0.135, -0.095], [0.135, -0.095], [0.135, 0.095], [-0.135, 0.095]]) {
      legs.cyl(0.022, 0.12, f.anodised, P(x, -0.09, z), 24);
      legs.cyl(0.026, 0.03, f.black, P(x, -0.045, z), 24);
      legs.cyl(0.03, 0.01, f.black, P(x, -0.195, z), 24);
    }
    legs.build(this.stand);
    this.stand.visible = false;
    this.root.add(this.stand);
    kit.build(this.root);

    const name = new LabelCard(0.11, 'Optics table', 'atoms held by focused light');
    name.mesh.position.set(-0.08, 0.02, 0.125);
    const array = new LabelCard(0.08, 'Tweezer array', 'atoms sorted one by one');
    array.mesh.position.set(C.x - 0.085, C.y + 0.07, C.z + 0.01);
    const ryd = new LabelCard(0.08, 'Rydberg lasers', 'they entangle the atoms');
    ryd.mesh.position.set(0.165, C.y + 0.08, -0.06);
    this.root.add(name.mesh, array.mesh, ryd.mesh);
    this.reload();
  }

  /** Random loading, about half the sites, then a plan to fill the middle block from the nearest atoms. */
  private reload(): void {
    const loaded = this.atoms.map(() => Math.random() < 0.55);
    // make sure there are enough atoms for the block
    while (loaded.filter(Boolean).length < 9) loaded[Math.floor(Math.random() * 25)] = true;
    const targets: Vector3[] = [];
    for (let i = 0; i < 25; i++) {
      const x = i % 5, y = Math.floor(i / 5);
      if (x >= 1 && x <= 3 && y >= 1 && y <= 3) targets.push(this.atoms[i].from);
    }
    const free = this.atoms.map((a, i) => ({ a, i })).filter(({ i }) => loaded[i]);
    for (const a of this.atoms) {
      a.to = null;
      a.dropped = false;
      a.body.visible = false;
    }
    for (const { a } of free) {
      a.body.visible = true;
      a.at = 0.15 + 0.5 * Math.random();
    }
    // greedy: each target takes the nearest unassigned atom; the rest are dropped
    const pool = free.map(({ a }) => a);
    for (const t of targets) {
      let best = 0;
      for (let k = 1; k < pool.length; k++) if (pool[k].from.distanceToSquared(t) < pool[best].from.distanceToSquared(t)) best = k;
      pool[best].to = t;
      pool.splice(best, 1);
    }
    for (const a of pool) a.dropped = true;
  }

  /** The loading and sorting sequence, as before every run. */
  reveal(): void {
    this.t = 0;
    this.reload();
  }

  play(seconds: number): void {
    this.pulse = seconds;
  }

  update(dt: number): void {
    this.t += dt;
    this.pulse = Math.max(0, this.pulse - dt);
    const t = this.t;
    const flicker = this.pulse > 0 ? 1.2 + 0.25 * Math.sin(performance.now() / 70) : 0.8;
    this.mot.forEach((b, i) => b.set(ease((t - 0.1 - i * 0.12) / 0.4), 1));
    // the tweezer light traces its path, segment by segment
    const n = this.path.length;
    this.path.forEach((b, i) => b.set(ease((t - 0.6 - i * (0.9 / n)) / (0.9 / n)), flicker));
    // Rydberg lasers fire during a run
    this.rydberg.forEach((b, i) => b.set(this.pulse > 0 ? 1 : 0, 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / (90 + i * 30)))));
    // atoms fall in at random, then move to fill the block; spares are dropped
    const sortT = ease((t - 2.3) / 1.2);
    for (const a of this.atoms) {
      if (!a.body.visible) {
        a.halo.visible = false;
        continue;
      }
      const shown = t > 1.5 + a.at;
      const fade = a.dropped ? 1 - ease((t - 2.3) / 0.6) : 1;
      a.halo.visible = shown && fade > 0.01;
      a.body.scale.setScalar(shown ? Math.max(0.01, fade) : 0.01);
      const p = a.to ? a.from.clone().lerp(a.to, sortT) : a.from;
      a.body.position.copy(p);
      a.halo.position.copy(p);
      (a.halo.material as SpriteMaterial).opacity = 0.7 * fade * (this.pulse > 0 ? 1.2 : 1);
    }
  }
}
