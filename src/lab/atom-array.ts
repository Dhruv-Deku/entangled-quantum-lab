import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from '@iwsdk/core';
import type { Op } from '../quantum/circuit';
import { GOLD, qubitColor, textTexture } from './visuals';

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
    const spareTweezer = new MeshBasicMaterial({ color: TWEEZER, transparent: true, opacity: 0.14, depthWrite: false, blending: AdditiveBlending });
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
      const haloMat = new SpriteMaterial({ map: this.glow, color: qubitColor(q), transparent: true, opacity: 0.45, depthWrite: false, blending: AdditiveBlending });
      const halo = new Sprite(haloMat);
      halo.scale.setScalar(0.022);
      const tweezer = new Mesh(new CylinderGeometry(0.0014, 0.0014, 1, 8), new MeshBasicMaterial({ color: TWEEZER, transparent: true, opacity: 0.3, depthWrite: false, blending: AdditiveBlending }));
      const ramanMat = new MeshBasicMaterial({ color: qubitColor(q), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
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
 * The optics table around the atoms: a breadboard with a laser, two mirrors
 * and a lens steering the tweezer light up into a small glass cell, and the
 * camera above it that reads the atoms out.
 */
export class OpticsTableVisual {
  readonly root = new Group();
  private readonly beamMat: MeshBasicMaterial;
  private pulse = 0;

  constructor() {
    this.root.name = 'OpticsTable';
    const dark = new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.5, metalness: 0.6 });
    const steel = new MeshStandardMaterial({ color: '#b3b8bf', roughness: 0.25, metalness: 0.92 });
    const black = new MeshStandardMaterial({ color: '#17181a', roughness: 0.6, metalness: 0.3 });
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
    const board = new Mesh(new BoxGeometry(0.3, 0.012, 0.22), [dark, dark, new MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.4 }), dark, dark, dark]);
    board.position.y = 0.006;
    this.root.add(board);
    const y = 0.06;
    const post = (x: number, z: number) => {
      const p = new Mesh(new CylinderGeometry(0.004, 0.004, y - 0.012, 10), steel);
      p.position.set(x, (y - 0.012) / 2 + 0.012, z);
      this.root.add(p);
    };
    // laser head
    const laser = new Mesh(new BoxGeometry(0.07, 0.035, 0.035), black);
    laser.position.set(-0.11, y, 0.08);
    this.root.add(laser);
    // mirrors and a lens on posts
    const pts = [new Vector3(-0.075, y, 0.08), new Vector3(0.09, y, 0.08), new Vector3(0.09, y, -0.02), new Vector3(0, y, -0.02)];
    for (const [i, p] of [[1, pts[1]], [2, pts[2]]] as const) {
      post(p.x, p.z);
      const mirror = new Mesh(new BoxGeometry(0.026, 0.026, 0.004), steel);
      mirror.position.copy(p);
      mirror.rotation.y = i === 1 ? Math.PI / 4 : -Math.PI / 4;
      this.root.add(mirror);
    }
    post(0.045, -0.02);
    const lens = new Mesh(new CylinderGeometry(0.012, 0.012, 0.003, 24), new MeshStandardMaterial({ color: '#8fa7c9', roughness: 0.05, transparent: true, opacity: 0.6 }));
    lens.rotation.z = Math.PI / 2;
    lens.position.set(0.045, y, -0.02);
    this.root.add(lens);
    // the cell, the objective above it and the camera on top
    const cell = new Mesh(new BoxGeometry(0.04, 0.03, 0.03), new MeshStandardMaterial({ color: '#9fb6d6', roughness: 0.05, transparent: true, opacity: 0.25 }));
    cell.position.set(0, y, -0.02);
    this.root.add(cell);
    const glow = new Mesh(new SphereGeometry(0.004, 12, 8), new MeshBasicMaterial({ color: '#ff8a7a' }));
    glow.position.set(0, y, -0.02);
    this.root.add(glow);
    const tube = new Mesh(new CylinderGeometry(0.012, 0.012, 0.09, 24), black);
    tube.position.set(0, y + 0.06, -0.02);
    this.root.add(tube);
    const camera = new Mesh(new BoxGeometry(0.05, 0.04, 0.05), dark);
    camera.position.set(0, y + 0.125, -0.02);
    this.root.add(camera);
    for (const [x, z] of [[-0.03, -0.05], [0.03, -0.05], [-0.03, 0.01], [0.03, 0.01]]) {
      const leg = new Mesh(new CylinderGeometry(0.003, 0.003, y + 0.1, 8), steel);
      leg.position.set(x, (y + 0.1) / 2 + 0.012, z);
      this.root.add(leg);
    }
    // the beam: laser, mirror, mirror, lens, cell
    this.beamMat = new MeshBasicMaterial({ color: '#ff6b6b', transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending });
    for (let i = 0; i + 1 < pts.length; i++) this.root.add(beamBetween(pts[i], pts[i + 1], 0.0012, this.beamMat));
    const caption = new Mesh(new PlaneGeometry(0.1, 0.0375), new MeshBasicMaterial({ map: textTexture([{ text: 'Optics', color: '#8a8d93' }], 500), transparent: true, depthWrite: false }));
    caption.rotation.x = -Math.PI / 2;
    caption.position.set(-0.07, 0.0125, -0.08);
    this.root.add(caption);
  }

  play(seconds: number): void {
    this.pulse = seconds;
  }

  update(dt: number): void {
    this.pulse = Math.max(0, this.pulse - dt);
    this.beamMat.opacity = this.pulse > 0 ? 0.7 + 0.2 * Math.sin(performance.now() / 70) : 0.45;
  }
}
