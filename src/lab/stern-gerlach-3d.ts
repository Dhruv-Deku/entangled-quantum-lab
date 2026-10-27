import { CatmullRomCurve3, CircleGeometry, CylinderGeometry, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, TubeGeometry, Vector3 } from '@iwsdk/core';
import type { AtomPath, Stage } from '../quantum/experiments';
import { Kit, LabelCard, finishes } from './machine-kit';

const Y = 0.075;
const Z = -0.06;
const OVEN_X = -0.31;
const SCREEN_X = 0.25;
const SPLIT = 0.024;
const MAX_HITS = 1500;
const SPEED = 0.42;

/** Where the magnets stand for 1, 2 or 3 stages. */
const STAGE_X: Record<number, number[]> = { 1: [-0.04], 2: [-0.15, 0.06], 3: [-0.18, -0.045, 0.09] };
const MAG_LEN = 0.075;

/** Offset of a branch: up/down along z is vertical; along x it is toward or away from the player. */
const branch = (axis: 'z' | 'x', spin: 'up' | 'down', amount = SPLIT) => (axis === 'z' ? new Vector3(0, spin === 'up' ? amount : -amount, 0) : new Vector3(0, 0, spin === 'up' ? amount : -amount));

interface Flight {
  bead: Mesh;
  curve: CatmullRomCurve3;
  length: number;
  t: number;
  /** Lands on the screen (with this vertical offset), or stops at a blocker. */
  land: number | null;
}

/**
 * Stern-Gerlach on the desk: an oven of silver atoms on the left, one to three
 * magnets in a row, and a screen on the right. Each magnet splits the beam in
 * two along its axis (Z vertical, X toward and away from you); a small plate
 * stops the beam the experiment throws away. Atoms fly one by one along the
 * branch the quantum rules pick, and pile up in two spots on the screen.
 */
export class SgBench {
  readonly root = new Group();
  counts = { up: 0, down: 0, stopped: 0 };
  private readonly fixed = new Group();
  private readonly hits: InstancedMesh;
  private hitCount = 0;
  private stages: Stage[] = [];
  private readonly flights: Flight[] = [];
  private readonly pool: Mesh[] = [];
  private readonly upCard = new LabelCard(0.085, 'up 0', '');
  private readonly downCard = new LabelCard(0.085, 'down 0', '');
  private readonly smear: Mesh;
  /** The screen, turned partly toward the player so the spots can be seen. */
  private readonly screen = new Group();
  private readonly m = new Matrix4();

  constructor() {
    this.root.name = 'SternGerlach';
    const f = finishes();
    const kit = new Kit();
    // the oven: a small furnace with a glowing mouth, and the collimator slits
    kit.cyl(0.03, 0.06, f.copper, new Vector3(OVEN_X, Y, Z), 28, new Euler(0, 0, Math.PI / 2));
    kit.cyl(0.006, Y - 0.03, f.brushed, new Vector3(OVEN_X, (Y - 0.03) / 2, Z));
    kit.box(0.004, 0.04, 0.04, f.dark, new Vector3(OVEN_X + 0.06, Y, Z));
    kit.cyl(0.006, Y - 0.055, f.brushed, new Vector3(SCREEN_X, (Y - 0.055) / 2, Z));
    kit.box(SCREEN_X - OVEN_X + 0.1, 0.006, 0.05, f.anodised, new Vector3((SCREEN_X + OVEN_X) / 2, 0.003, Z));
    kit.build(this.root);
    // the screen: dark glass facing the beam, in a frame, turned toward you
    const sk = new Kit();
    sk.box(0.004, 0.11, 0.11, f.black, new Vector3());
    sk.box(0.008, 0.006, 0.12, f.steel, new Vector3(0, 0.058, 0));
    sk.box(0.008, 0.006, 0.12, f.steel, new Vector3(0, -0.058, 0));
    sk.build(this.screen);
    this.screen.position.set(SCREEN_X, Y, Z);
    this.screen.rotation.y = 0.85;
    this.root.add(this.screen);
    const mouth = new Mesh(new CircleGeometry(0.012, 24), new MeshBasicMaterial({ color: '#ffb36b', toneMapped: false }));
    mouth.position.set(OVEN_X + 0.031, Y, Z);
    mouth.rotation.y = Math.PI / 2;
    this.root.add(mouth, this.fixed);
    // where a classical spinning magnet would land: one long smear (shown for the first experiment)
    this.smear = new Mesh(new PlaneGeometry(0.008, 0.07), new MeshBasicMaterial({ color: '#8a8d93', transparent: true, opacity: 0.25, depthWrite: false }));
    this.smear.position.set(-0.003, 0, 0);
    this.smear.rotation.y = -Math.PI / 2;
    this.screen.add(this.smear);
    this.hits = new InstancedMesh(new CircleGeometry(0.0018, 8), new MeshBasicMaterial({ color: '#dfe3ea', toneMapped: false }), MAX_HITS);
    this.hits.count = 0;
    this.hits.frustumCulled = false;
    this.screen.add(this.hits);
    const silver = new MeshStandardMaterial({ color: '#d7dbe2', roughness: 0.2, metalness: 1 });
    for (let i = 0; i < 40; i++) {
      const b = new Mesh(new SphereGeometry(0.004, 10, 8), silver);
      b.visible = false;
      this.root.add(b);
      this.pool.push(b);
    }
    for (const [card, dy] of [[this.upCard, 0.115], [this.downCard, 0.09]] as const) {
      card.mesh.position.set(SCREEN_X, Y + dy, Z);
      this.root.add(card.mesh);
    }
    this.root.visible = false;
  }

  /** Build the magnets and beam paths for an experiment, and clear the screen. */
  setExperiment(stages: Stage[]): void {
    this.stages = stages;
    for (const c of [...this.fixed.children]) {
      c.traverse((o) => (o as Mesh).geometry?.dispose());
      this.fixed.remove(c);
    }
    const f = finishes();
    const north = new MeshStandardMaterial({ color: '#a8463e', roughness: 0.45, metalness: 0.5 });
    const south = new MeshStandardMaterial({ color: '#3f5f8f', roughness: 0.45, metalness: 0.5 });
    const xs = STAGE_X[stages.length];
    stages.forEach((st, i) => {
      const g = new Group();
      const kit = new Kit();
      // the pointed pole above, the grooved pole below (for X, the whole magnet turns a quarter turn about the beam)
      kit.add(new CylinderGeometry(0.022, 0.022, MAG_LEN, 3, 1, false, -Math.PI / 2), north, new Vector3(0, 0.03, 0), new Euler(0, 0, Math.PI / 2));
      kit.box(MAG_LEN, 0.012, 0.05, north, new Vector3(0, 0.05, 0));
      kit.box(MAG_LEN, 0.02, 0.018, south, new Vector3(0, -0.032, 0.016));
      kit.box(MAG_LEN, 0.02, 0.018, south, new Vector3(0, -0.032, -0.016));
      kit.box(MAG_LEN, 0.012, 0.05, south, new Vector3(0, -0.048, 0));
      kit.build(g);
      g.position.set(xs[i], Y, Z);
      if (st.axis === 'x') g.rotation.x = Math.PI / 2;
      const post = new Mesh(new CylinderGeometry(0.006, 0.006, Y - 0.055), f.brushed);
      post.position.set(xs[i], (Y - 0.055) / 2, Z);
      const card = new LabelCard(0.08, `${st.axis.toUpperCase()} magnet`, st.block ? `keeps ${st.block === 'up' ? 'down' : 'up'}` : 'both to the screen');
      card.mesh.position.set(xs[i], Y + 0.09, Z);
      this.fixed.add(g, post, card.mesh);
      // a plate stopping the thrown-away beam
      if (st.block && i < stages.length - 1) {
        const stop = new Mesh(new PlaneGeometry(0.014, 0.014), new MeshBasicMaterial({ color: '#1b1c1f' }));
        stop.position.set(xs[i] + MAG_LEN / 2 + 0.03, Y, Z).add(branch(st.axis, st.block, SPLIT * 1.3));
        stop.rotation.y = Math.PI / 2;
        this.fixed.add(stop);
      }
    });
    // the beam's possible paths, faint
    const paths = new MeshBasicMaterial({ color: '#c9ced6', transparent: true, opacity: 0.18, depthWrite: false });
    for (const spinPath of this.allPaths()) this.fixed.add(new Mesh(new TubeGeometry(spinPath, 48, 0.0007, 5), paths));
    this.smear.visible = stages.length === 1;
    this.clear();
  }

  clear(): void {
    this.counts = { up: 0, down: 0, stopped: 0 };
    this.hitCount = 0;
    this.hits.count = 0;
    for (const fl of this.flights) fl.bead.visible = false;
    this.flights.length = 0;
    this.drawCounts();
  }

  private drawCounts(): void {
    this.upCard.set(`up ${this.counts.up}`, '');
    this.downCard.set(`down ${this.counts.down}`, '');
  }

  /** The curve an atom follows for these outcomes (up to where it stops). */
  private curveFor(outcomes: readonly ('up' | 'down')[], stoppedAt: number | null): CatmullRomCurve3 {
    const xs = STAGE_X[this.stages.length];
    const pts = [new Vector3(OVEN_X + 0.03, Y, Z)];
    outcomes.forEach((spin, i) => {
      const st = this.stages[i];
      const x0 = xs[i] - MAG_LEN / 2, x1 = xs[i] + MAG_LEN / 2;
      pts.push(new Vector3(x0 - 0.01, Y, Z));
      pts.push(new Vector3(x1, Y, Z).add(branch(st.axis, spin, SPLIT * 0.5)));
      if (stoppedAt === i) {
        pts.push(new Vector3(x1 + 0.03, Y, Z).add(branch(st.axis, spin, SPLIT * 1.3)));
        return;
      }
      if (i < this.stages.length - 1) {
        // back to the middle before the next magnet
        const next = xs[i + 1] - MAG_LEN / 2;
        pts.push(new Vector3(x1 + 0.03, Y, Z).add(branch(st.axis, spin, SPLIT * 1.3)));
        pts.push(new Vector3(next - 0.025, Y, Z));
      } else {
        pts.push(new Vector3(SCREEN_X - 0.004, Y, Z).add(branch(st.axis, spin, SPLIT * 1.4)));
      }
    });
    return new CatmullRomCurve3(pts, false, 'centripetal');
  }

  /** Every branch an atom can take, for the faint guide lines. */
  private allPaths(): CatmullRomCurve3[] {
    const out: CatmullRomCurve3[] = [];
    const n = this.stages.length;
    const walk = (prefix: ('up' | 'down')[]) => {
      const i = prefix.length;
      if (i > 0) {
        const st = this.stages[i - 1];
        if (st.block === prefix[i - 1] && i < n) return out.push(this.curveFor(prefix, i - 1));
        if (i === n) return out.push(this.curveFor(prefix, null));
      }
      walk([...prefix, 'up']);
      walk([...prefix, 'down']);
    };
    walk([]);
    return out;
  }

  /** One atom along its path; with `animate` false (a fast stream) it just lands. */
  fire(path: AtomPath, animate: boolean): void {
    const land = path.blockedAt === null ? (path.outcomes[path.outcomes.length - 1] === 'up' ? 1 : -1) : null;
    const bead = animate ? this.pool.find((b) => !b.visible) : undefined;
    if (!bead) return this.arrive(land);
    const curve = this.curveFor(path.outcomes, path.blockedAt);
    bead.visible = true;
    this.flights.push({ bead, curve, length: curve.getLength(), t: 0, land });
  }

  private arrive(land: number | null): void {
    if (land === null) this.counts.stopped++;
    else {
      if (land > 0) this.counts.up++;
      else this.counts.down++;
      if (this.hitCount < MAX_HITS) {
        // a little spread around each spot
        const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.006;
        this.m.makeRotationY(-Math.PI / 2).setPosition(-0.0025, land * SPLIT * 1.4 + g(), g() * 1.6);
        this.hits.setMatrixAt(this.hitCount++, this.m);
        this.hits.count = this.hitCount;
        this.hits.instanceMatrix.needsUpdate = true;
      }
    }
    this.drawCounts();
  }

  update(dt: number): void {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const fl = this.flights[i];
      fl.t += (dt * SPEED) / fl.length;
      fl.curve.getPointAt(Math.min(1, fl.t), fl.bead.position);
      if (fl.t >= 1) {
        fl.bead.visible = false;
        this.arrive(fl.land);
        this.flights.splice(i, 1);
      }
    }
  }
}
