import { BoxGeometry, Color, CylinderGeometry, Euler, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { BombOutcome } from '../quantum/experiments';
import { Beam, Kit, LabelCard, finishes } from './machine-kit';
import { GLOW } from './visuals';

const Y = 0.06;
const LASER = new Vector3(-0.33, Y, 0.06);
const BS1 = new Vector3(-0.15, Y, 0.06);
const M_UP = new Vector3(-0.15, Y, -0.2);
const M_LOW = new Vector3(0.15, Y, 0.06);
const BS2 = new Vector3(0.15, Y, -0.2);
const BOMB = new Vector3(0, Y, 0.06);
const DET_C = new Vector3(0.3, Y, -0.2);
const DET_D = new Vector3(0.15, Y, -0.35);
const PHOTON = '#8fb7ff';
const IDLE = new Color('#2a2c30');
const LIT_C = new Color(PHOTON);
const LIT_D = new Color('#3ddc97');

/** Points along a path of straight segments, by fraction of its length. */
function along(pts: readonly Vector3[], u: number, out: Vector3): Vector3 {
  const lens = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
  let d = Math.max(0, Math.min(1, u)) * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) return out.copy(pts[i]).lerp(pts[i + 1], lens[i] ? Math.min(1, d / lens[i]) : 1);
    d -= lens[i];
  }
  return out.copy(pts[pts.length - 1]);
}

type Show =
  | { kind: 'one'; live: boolean; outcome: BombOutcome }
  | { kind: 'zeno'; live: boolean; result: 'live' | 'dud' | 'boom'; pass: number; passes: number };

/**
 * The Elitzur-Vaidman bomb tester: a Mach-Zehnder interferometer on an optical
 * breadboard. A laser fires one photon into the first beam splitter, where it
 * becomes two half-bright beads, one in each arm; the lower arm runs past the
 * bomb (whose trigger is a single-photon detector). A dud lets both halves meet
 * again at the second beam splitter and the photon always reaches the bright
 * detector C; a live bomb looks, and either goes off or leaves the photon in
 * the upper arm alone, which can then reach the dark detector D. In the Zeno
 * version the photon makes many quick passes and the bomb looks every time.
 */
export class Interferometer {
  readonly root = new Group();
  readonly label = new LabelCard(0.13, 'Bomb 1 of 6', 'live or dud?');
  private readonly bomb = new Group();
  private readonly beads: Mesh[] = [];
  private readonly beadMat: MeshBasicMaterial[] = [];
  private readonly lampC: MeshBasicMaterial;
  private readonly lampD: MeshBasicMaterial;
  private readonly blast: Mesh;
  private readonly blastMat: MeshBasicMaterial;
  private readonly beams: Beam[] = [];
  private readonly passCard = new LabelCard(0.07, '', '');
  private show: Show | null = null;
  private t = 0;
  private boomT = -1;
  private glowC = 0;
  private glowD = 0;
  private onDone: (() => void) | null = null;

  constructor() {
    this.root.name = 'BombTester';
    const f = finishes();
    const kit = new Kit();
    kit.box(0.72, 0.008, 0.52, f.black, new Vector3(0, 0.004, -0.07));
    // a grid of threaded holes, as on a real breadboard
    const hole = new MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.9 });
    for (let x = -0.33; x <= 0.331; x += 0.05) for (let z = -0.31; z <= 0.171; z += 0.05) kit.cyl(0.0022, 0.0004, hole, new Vector3(x, 0.0082, z), 8);
    const post = (p: Vector3) => kit.cyl(0.005, Y - 0.02, f.brushed, new Vector3(p.x, 0.008 + (Y - 0.02) / 2, p.z), 12);
    // the laser
    kit.box(0.1, 0.03, 0.03, f.black, LASER.clone().add(new Vector3(-0.03, 0, 0)));
    kit.ring(0.006, 0.0015, f.steel, LASER.clone().add(new Vector3(0.021, 0, 0)));
    post(LASER);
    // beam splitters: glass cubes with a silvered diagonal
    for (const [p, turn] of [[BS1, Math.PI / 4], [BS2, Math.PI / 4]] as const) {
      kit.box(0.028, 0.028, 0.028, f.glass, p);
      kit.box(0.038, 0.026, 0.0015, f.steel, p, new Euler(0, turn, 0));
      post(p);
    }
    // mirrors on 45 degree mounts
    for (const p of [M_UP, M_LOW]) {
      kit.add(new CylinderGeometry(0.016, 0.016, 0.004, 32), f.steel, p, new Euler(Math.PI / 2, Math.PI / 4, 0, 'YXZ'));
      kit.box(0.03, 0.03, 0.006, f.anodised, p.clone().add(new Vector3(p === M_UP ? -0.004 : 0.004, 0, p === M_UP ? -0.004 : 0.004)), new Euler(0, Math.PI / 4, 0));
      post(p);
    }
    // the detectors, each facing the second beam splitter
    kit.add(new CylinderGeometry(0.016, 0.016, 0.045, 24), f.anodised, DET_C.clone().add(new Vector3(0.02, 0, 0)), new Euler(0, 0, Math.PI / 2));
    kit.add(new CylinderGeometry(0.016, 0.016, 0.045, 24), f.anodised, DET_D.clone().add(new Vector3(0, 0, -0.02)), new Euler(Math.PI / 2, 0, 0));
    post(DET_C.clone().add(new Vector3(0.02, 0, 0)));
    post(DET_D.clone().add(new Vector3(0, 0, -0.02)));
    kit.build(this.root);
    this.lampC = new MeshBasicMaterial({ color: '#2a2c30', toneMapped: false });
    this.lampD = new MeshBasicMaterial({ color: '#2a2c30', toneMapped: false });
    const lc = new Mesh(new CylinderGeometry(0.012, 0.012, 0.004, 24), this.lampC);
    lc.position.copy(DET_C).add(new Vector3(-0.003, 0, 0));
    lc.rotation.z = Math.PI / 2;
    const ld = new Mesh(new CylinderGeometry(0.012, 0.012, 0.004, 24), this.lampD);
    ld.position.copy(DET_D).add(new Vector3(0, 0, 0.003));
    ld.rotation.x = Math.PI / 2;
    this.root.add(lc, ld);
    for (const [txt, sub, at] of [['C', 'bright port', DET_C.clone().add(new Vector3(0.03, 0.05, 0))], ['D', 'dark port', DET_D.clone().add(new Vector3(0.06, 0.04, 0))]] as const) {
      const c = new LabelCard(0.085, txt, sub);
      c.mesh.position.copy(at);
      this.root.add(c.mesh);
    }
    // the beam paths, faint
    const segs: [Vector3, Vector3][] = [[LASER, BS1], [BS1, M_UP], [M_UP, BS2], [BS1, M_LOW], [M_LOW, BS2], [BS2, DET_C], [BS2, DET_D]];
    for (const [a, b] of segs) {
      const beam = new Beam(a, b, 0.0012, PHOTON, 0.22);
      beam.set(1, 1);
      this.root.add(beam.mesh);
      this.beams.push(beam);
    }
    // the bomb: a dark sphere on a stand, its trigger window facing the beam
    const body = new Mesh(new SphereGeometry(0.026, 28, 18), new MeshStandardMaterial({ color: '#1a1b1e', roughness: 0.35, metalness: 0.6 }));
    body.position.set(0, 0.028, 0);
    const trigger = new Mesh(new CylinderGeometry(0.007, 0.007, 0.006, 20), new MeshStandardMaterial({ color: '#c47c4e', roughness: 0.25, metalness: 1 }));
    trigger.position.set(0, 0.028, 0.026);
    trigger.rotation.x = Math.PI / 2;
    const stand = new Mesh(new BoxGeometry(0.03, 0.008, 0.03), f.anodised);
    stand.position.y = 0.004;
    this.bomb.add(body, trigger, stand);
    this.bomb.position.set(BOMB.x, 0.008, BOMB.z - 0.035);
    this.root.add(this.bomb);
    this.label.mesh.position.set(BOMB.x, 0.11, BOMB.z - 0.04);
    this.root.add(this.label.mesh);
    // photons
    for (let i = 0; i < 2; i++) {
      const m = new MeshBasicMaterial({ color: PHOTON, transparent: true, opacity: 1, ...GLOW, toneMapped: false });
      const b = new Mesh(new SphereGeometry(0.0075, 16, 12), m);
      b.visible = false;
      this.root.add(b);
      this.beads.push(b);
      this.beadMat.push(m);
    }
    this.blastMat = new MeshBasicMaterial({ color: '#ff8a7a', transparent: true, opacity: 0, depthWrite: false, ...GLOW, toneMapped: false });
    this.blast = new Mesh(new SphereGeometry(1, 24, 16), this.blastMat);
    this.blast.position.set(BOMB.x, 0.03, BOMB.z - 0.035);
    this.blast.visible = false;
    this.root.add(this.blast);
    this.passCard.mesh.position.set(-0.15, 0.11, -0.07);
    this.passCard.mesh.visible = false;
    this.root.add(this.passCard.mesh);
    this.root.visible = false;
  }

  get busy(): boolean {
    return this.show !== null;
  }

  /** A fresh bomb on the stand. */
  newBomb(title: string, sub: string): void {
    this.bomb.visible = true;
    this.label.set(title, sub);
    this.glowC = this.glowD = 0;
  }

  /** One photon through, with its outcome already decided; `done` runs when it has landed. */
  fire(live: boolean, outcome: BombOutcome, done: () => void): void {
    this.show = { kind: 'one', live, outcome };
    this.t = 0;
    this.onDone = done;
  }

  /** The Zeno version: `passes` quick passes, the bomb looking on each. */
  zeno(live: boolean, result: 'live' | 'dud' | 'boom', pass: number, passes: number, done: () => void): void {
    this.show = { kind: 'zeno', live, result, pass, passes };
    this.t = 0;
    this.onDone = done;
  }

  private explode(): void {
    this.bomb.visible = false;
    this.boomT = 0;
    this.blast.visible = true;
  }

  private finish(port: 'C' | 'D' | null): void {
    if (port === 'C') this.glowC = 1;
    if (port === 'D') this.glowD = 1;
    for (const b of this.beads) b.visible = false;
    this.passCard.mesh.visible = false;
    this.show = null;
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  update(dt: number): void {
    const s = this.show;
    if (s) {
      this.t += dt;
      const [u, l] = this.beads;
      if (s.kind === 'one') this.runOne(s, u, l);
      else this.runZeno(s, u, l);
    }
    if (this.boomT >= 0) {
      this.boomT += dt;
      const k = this.boomT / 0.7;
      this.blast.scale.setScalar(0.01 + 0.09 * Math.sqrt(Math.min(1, k)));
      this.blastMat.opacity = 0.8 * Math.max(0, 1 - k);
      if (k >= 1) {
        this.boomT = -1;
        this.blast.visible = false;
      }
    }
    this.glowC = Math.max(0, this.glowC - dt * 0.4);
    this.glowD = Math.max(0, this.glowD - dt * 0.4);
    this.lampC.color.copy(IDLE).lerp(LIT_C, this.glowC);
    this.lampD.color.copy(IDLE).lerp(LIT_D, this.glowD);
  }

  private runOne(s: Extract<Show, { kind: 'one' }>, u: Mesh, l: Mesh): void {
    const t = this.t;
    const T1 = 0.35, T2 = 1.1, T3 = 1.45;
    if (t < T1) {
      u.visible = true;
      l.visible = false;
      this.beadMat[0].opacity = 1;
      along([LASER, BS1], t / T1, u.position);
      return;
    }
    if (t < T2) {
      const k = (t - T1) / (T2 - T1);
      u.visible = true;
      along([BS1, M_UP, BS2], k, u.position);
      along([BS1, M_LOW, BS2], k, l.position);
      // the bomb sits a third of the way along the lower arm
      const looked = s.live && k > 0.29;
      if (looked && s.outcome === 'boom') {
        if (this.bomb.visible) this.explode();
        u.visible = l.visible = false;
        return;
      }
      l.visible = !looked;
      this.beadMat[0].opacity = this.beadMat[1].opacity = looked ? 1 : 0.5;
      return;
    }
    if (s.outcome === 'boom') return this.finish(null);
    l.visible = false;
    this.beadMat[0].opacity = 1;
    const port = s.outcome === 'D' ? 'D' : 'C';
    along([BS2, port === 'C' ? DET_C : DET_D], (t - T2) / (T3 - T2), u.position);
    if (t >= T3) this.finish(port);
  }

  private runZeno(s: Extract<Show, { kind: 'zeno' }>, u: Mesh, l: Mesh): void {
    const LAP = 0.32;
    const k = Math.floor(this.t / LAP);
    const f = (this.t % LAP) / LAP;
    this.passCard.mesh.visible = true;
    this.passCard.set(`pass ${Math.min(k + 1, s.passes)} of ${s.passes}`, '');
    const stop = s.result === 'boom' ? s.pass : s.passes;
    if (k >= stop) {
      if (s.result === 'boom') return this.finish(null);
      // a dud: the turns add up and the photon leaves by C; a live bomb kept it as it was: D
      return this.finish(s.result === 'live' ? 'D' : 'C');
    }
    u.visible = true;
    along([BS1, M_UP, BS2], f, u.position);
    along([BS1, M_LOW, BS2], f, l.position);
    // the lower half grows a little each pass (the polarisation turns), unless the bomb looks
    const grown = s.live ? 0.1 : Math.min(1, (k + f) / s.passes);
    this.beadMat[1].opacity = 0.15 + 0.6 * grown;
    this.beadMat[0].opacity = 1 - 0.5 * grown;
    const looked = s.live && f > 0.29;
    l.visible = !looked;
    if (looked && k === stop - 1 && s.result === 'boom' && this.bomb.visible) {
      this.explode();
      u.visible = false;
    }
  }
}
