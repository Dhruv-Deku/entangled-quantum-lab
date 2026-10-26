import { BoxGeometry, CatmullRomCurve3, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, TubeGeometry, Vector3 } from '@iwsdk/core';
import type { Bb84Round } from '../game/bb84';
import { LabelCard } from './machine-kit';

const MAX = 32;
const TRAVEL = 1.3;
const GAP = 0.22;
const BIT0 = new Color('#8fb7ff');
const BIT1 = new Color('#ff8a7a');
const Z = new Vector3(0, 0, 1);

/**
 * The spy game on the desk: Alice's station on the left, Bob's on the right,
 * an optical fibre arching between them. Each photon flies across as a bead
 * with a little bar for its polarisation (upright or flat in the + basis,
 * slanted in the x basis); what Bob reads stacks up above his station. Eve
 * hides under the fibre and only shows herself when the round is revealed.
 */
export class SpyVisual {
  readonly root = new Group();
  private readonly fibre: CatmullRomCurve3;
  private readonly beads: InstancedMesh;
  private readonly bars: InstancedMesh;
  private readonly reads: InstancedMesh;
  private readonly eve = new Group();
  private round: Bb84Round | null = null;
  private t = -1;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly one = new Vector3(1, 1, 1);

  constructor() {
    this.root.name = 'SpyGame';
    const dark = new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.4, metalness: 0.6 });
    const glass = new MeshStandardMaterial({ color: '#8fb7ff', emissive: '#2d7ff9', emissiveIntensity: 0.4, roughness: 0.1 });
    const station = (x: number, name: string, sub: string) => {
      const g = new Group();
      g.position.set(x, 0, -0.02);
      const body = new Mesh(new BoxGeometry(0.06, 0.07, 0.06), dark);
      body.position.y = 0.035;
      const lens = new Mesh(new CylinderGeometry(0.014, 0.014, 0.012, 20), glass);
      lens.rotation.z = Math.PI / 2;
      lens.position.set(x < 0 ? 0.034 : -0.034, 0.05, 0);
      const card = new LabelCard(0.12, name, sub);
      card.mesh.position.y = 0.12;
      g.add(body, lens, card.mesh);
      this.root.add(g);
    };
    station(-0.3, 'Alice', 'sends the key');
    station(0.3, 'Bob', 'reads it');
    this.fibre = new CatmullRomCurve3([new Vector3(-0.26, 0.05, -0.02), new Vector3(-0.1, 0.14, -0.04), new Vector3(0.1, 0.14, -0.04), new Vector3(0.26, 0.05, -0.02)]);
    this.root.add(new Mesh(new TubeGeometry(this.fibre, 60, 0.0025, 6), new MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.5 })));
    // Eve: a dark box tapping the fibre, hidden until the reveal
    const evil = new Mesh(new BoxGeometry(0.05, 0.05, 0.05), new MeshStandardMaterial({ color: '#16171a', roughness: 0.5, metalness: 0.4 }));
    evil.position.y = 0.025;
    const tap = new Mesh(new CylinderGeometry(0.003, 0.003, 0.09, 6), dark);
    tap.position.y = 0.09;
    const card = new LabelCard(0.12, 'Eve', 'was listening');
    card.mesh.position.set(0, 0.03, 0.06);
    this.eve.add(evil, tap, card.mesh);
    this.eve.position.set(0, 0, -0.04);
    this.eve.visible = false;
    this.root.add(this.eve);
    this.beads = new InstancedMesh(new SphereGeometry(0.007, 10, 8), new MeshBasicMaterial({ color: '#ffffff' }), MAX);
    this.bars = new InstancedMesh(new BoxGeometry(0.003, 0.022, 0.003), new MeshBasicMaterial({ color: '#ffffff' }), MAX);
    this.reads = new InstancedMesh(new BoxGeometry(0.008, 0.008, 0.008), new MeshBasicMaterial({ color: '#ffffff' }), MAX);
    for (const im of [this.beads, this.bars, this.reads]) {
      im.count = 0;
      im.frustumCulled = false;
      im.setColorAt(0, BIT0);
      this.root.add(im);
    }
    this.root.visible = false;
  }

  /** Send a round's photons across, one after another. */
  send(round: Bb84Round): void {
    this.round = round;
    this.t = 0;
    this.eve.visible = false;
    this.root.visible = true;
  }

  reveal(): void {
    this.eve.visible = !!this.round?.eve;
  }

  hide(): void {
    this.root.visible = false;
    this.t = -1;
  }

  /** Has every photon arrived? */
  get arrived(): boolean {
    return !!this.round && this.t >= (this.round.photons.length - 1) * GAP + TRAVEL;
  }

  update(dt: number): void {
    const r = this.round;
    if (!r || this.t < 0) return;
    this.t += dt;
    let flying = 0, landed = 0;
    r.photons.forEach((p, i) => {
      const u = (this.t - i * GAP) / TRAVEL;
      if (u >= 1) {
        // Bob's reading, stacked in two rows above his station
        this.v.set(0.3 - 0.06 + (landed % 8) * 0.017, 0.16 + Math.floor(landed / 8) * 0.017, -0.02);
        this.m.compose(this.v, this.q.identity(), this.one);
        this.reads.setMatrixAt(landed, this.m);
        this.reads.setColorAt(landed, p.bobBit ? BIT1 : BIT0);
        landed++;
        return;
      }
      if (u <= 0) return;
      this.fibre.getPointAt(u, this.v);
      this.m.compose(this.v, this.q.identity(), this.one);
      this.beads.setMatrixAt(flying, this.m);
      this.beads.setColorAt(flying, p.bit ? BIT1 : BIT0);
      // the polarisation bar: + basis upright (0) or flat (1); x basis slanted one way or the other
      const angle = (p.alice === '+' ? 0 : Math.PI / 4) + (p.bit ? Math.PI / 2 : 0);
      this.q.setFromAxisAngle(Z, angle);
      this.m.compose(this.v, this.q, this.one);
      this.bars.setMatrixAt(flying, this.m);
      flying++;
    });
    this.beads.count = this.bars.count = flying;
    this.reads.count = landed;
    for (const im of [this.beads, this.bars, this.reads]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
