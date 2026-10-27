import { CircleGeometry, Color, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';
import type { SlitSetup } from '../quantum/experiments';
import { Kit, finishes } from './machine-kit';
import { GLOW } from './visuals';

const Y = 0.06;
const EMIT = new Vector3(0, Y, 0.13);
const BARRIER_Z = -0.06;
const SCREEN_Z = -0.3;
const SCREEN_W = 0.36;
const SCREEN_H = 0.13;
const SLIT_X = 0.012;
const MAX_HITS = 3000;
const PHOTON = '#8fb7ff';

interface Flight {
  bead: Mesh;
  t: number;
  /** Where it lands on the screen (-1..1), and through which slit it was seen (watched only). */
  x: number;
  y: number;
  seen: -1 | 1 | 0;
}

/**
 * The double slit on the desk: a photon source at the front, a plate with two
 * slits, and a dark detector screen at the back where every photon leaves a
 * dot. Unwatched, each photon crosses as a wave (two sets of ripples spread
 * from the slits and overlap); watched, a ring at one slit blinks and the
 * photon goes through that one. Dot by dot the screen shows stripes, or not.
 */
export class SlitBench {
  readonly root = new Group();
  setup: SlitSetup = 'both';
  hitCount = 0;
  private readonly hits: InstancedMesh;
  private readonly flights: Flight[] = [];
  private readonly pool: Mesh[] = [];
  private readonly ripples: { mesh: Mesh; t: number }[] = [];
  private readonly rings: Mesh[] = [];
  private readonly ringMat: MeshBasicMaterial[] = [];
  private readonly cover: Mesh;
  private readonly m = new Matrix4();

  constructor() {
    this.root.name = 'DoubleSlit';
    const f = finishes();
    const kit = new Kit();
    // the rail and the source
    kit.box(0.024, 0.008, 0.5, f.anodised, new Vector3(0, 0.004, -0.09));
    kit.box(0.05, 0.04, 0.06, f.black, new Vector3(0, Y, 0.16));
    kit.ring(0.009, 0.002, f.steel, new Vector3(0, Y, 0.129));
    kit.cyl(0.006, Y - 0.02, f.brushed, new Vector3(0, (Y - 0.02) / 2, 0.16));
    // the plate with two slits (8 mm wide, 24 mm apart)
    const h = 0.11, gap = 0.008, half = 0.11;
    const inner = SLIT_X - gap / 2, outer = SLIT_X + gap / 2;
    kit.box(half - outer, h, 0.005, f.dark, new Vector3(-(outer + (half - outer) / 2), Y, BARRIER_Z));
    kit.box(half - outer, h, 0.005, f.dark, new Vector3(outer + (half - outer) / 2, Y, BARRIER_Z));
    kit.box(2 * inner, h, 0.005, f.dark, new Vector3(0, Y, BARRIER_Z));
    kit.box(2 * half, 0.012, 0.005, f.dark, new Vector3(0, Y + h / 2 + 0.006, BARRIER_Z));
    kit.box(0.008, Y - h / 2, 0.02, f.brushed, new Vector3(-half + 0.01, (Y - h / 2) / 2, BARRIER_Z));
    kit.box(0.008, Y - h / 2, 0.02, f.brushed, new Vector3(half - 0.01, (Y - h / 2) / 2, BARRIER_Z));
    // the screen: dark, in a steel frame, on two feet
    const sy = 0.02 + SCREEN_H / 2;
    kit.box(SCREEN_W, SCREEN_H, 0.004, f.black, new Vector3(0, sy, SCREEN_Z));
    kit.box(SCREEN_W + 0.012, 0.006, 0.008, f.steel, new Vector3(0, sy + SCREEN_H / 2 + 0.003, SCREEN_Z));
    kit.box(SCREEN_W + 0.012, 0.006, 0.008, f.steel, new Vector3(0, sy - SCREEN_H / 2 - 0.003, SCREEN_Z));
    kit.box(0.006, SCREEN_H, 0.008, f.steel, new Vector3(-SCREEN_W / 2 - 0.003, sy, SCREEN_Z));
    kit.box(0.006, SCREEN_H, 0.008, f.steel, new Vector3(SCREEN_W / 2 + 0.003, sy, SCREEN_Z));
    kit.box(0.04, 0.02, 0.04, f.brushed, new Vector3(-0.13, 0.01, SCREEN_Z));
    kit.box(0.04, 0.02, 0.04, f.brushed, new Vector3(0.13, 0.01, SCREEN_Z));
    kit.build(this.root);
    // a cover over the right slit (one slit open)
    this.cover = new Mesh(new CircleGeometry(0.012, 24), new MeshBasicMaterial({ color: '#2a2c30' }));
    this.cover.position.set(SLIT_X, Y, BARRIER_Z + 0.004);
    this.cover.scale.set(1, 4, 1);
    this.root.add(this.cover);
    // which-path detectors: a ring at each slit
    for (const side of [-1, 1]) {
      const mat = new MeshBasicMaterial({ color: '#8a8d93', transparent: true, opacity: 0.9, toneMapped: false });
      const ring = new Mesh(new TorusGeometry(0.009, 0.0015, 8, 32), mat);
      ring.position.set(side * SLIT_X, Y, BARRIER_Z + 0.008);
      this.root.add(ring);
      this.rings.push(ring);
      this.ringMat.push(mat);
    }
    // hits on the screen
    this.hits = new InstancedMesh(new CircleGeometry(0.0016, 8), new MeshBasicMaterial({ color: PHOTON, transparent: true, opacity: 0.95, ...GLOW, toneMapped: false }), MAX_HITS);
    this.hits.count = 0;
    this.hits.frustumCulled = false;
    this.root.add(this.hits);
    // photons in flight, and ripples
    const beadMat = new MeshBasicMaterial({ color: PHOTON, transparent: true, ...GLOW, toneMapped: false });
    for (let i = 0; i < 16; i++) {
      const b = new Mesh(new SphereGeometry(0.0045, 12, 8), beadMat);
      b.visible = false;
      this.root.add(b);
      this.pool.push(b);
    }
    for (let i = 0; i < 12; i++) {
      // a 120 degree wavefront in the desk plane, centred on the way to the screen
      const mesh = new Mesh(new TorusGeometry(1, 0.012, 4, 32, (2 * Math.PI) / 3), new MeshBasicMaterial({ color: PHOTON, transparent: true, opacity: 0, depthWrite: false, ...GLOW, toneMapped: false }));
      mesh.rotation.copy(new Euler(Math.PI / 2, 0, Math.PI + Math.PI / 6));
      mesh.visible = false;
      this.root.add(mesh);
      this.ripples.push({ mesh, t: -1 });
    }
    this.setSetup('both');
    this.root.visible = false;
  }

  setSetup(s: SlitSetup): void {
    this.setup = s;
    this.cover.visible = s === 'one';
    for (const r of this.rings) r.visible = s === 'watched';
  }

  clear(): void {
    this.hitCount = 0;
    this.hits.count = 0;
    for (const f of this.flights) f.bead.visible = false;
    this.flights.length = 0;
  }

  /**
   * One photon that will land at x (-1..1). With `animate`, it flies; without
   * (a fast stream), it just appears on the screen.
   */
  fire(x: number, animate: boolean, rnd: () => number): void {
    const y = (rnd() - 0.5) * 0.85;
    const seen: -1 | 1 | 0 = this.setup === 'watched' ? (rnd() < 0.5 ? -1 : 1) : this.setup === 'one' ? -1 : 0;
    const bead = animate ? this.pool.find((b) => !b.visible) : undefined;
    if (!bead) return this.land(x, y);
    bead.visible = true;
    this.flights.push({ bead, t: 0, x, y, seen });
  }

  private land(x: number, y: number): void {
    if (this.hitCount >= MAX_HITS) return;
    this.m.makeTranslation(x * (SCREEN_W / 2 - 0.004), 0.02 + SCREEN_H / 2 + y * (SCREEN_H / 2 - 0.004), SCREEN_Z + 0.0025);
    this.hits.setMatrixAt(this.hitCount++, this.m);
    this.hits.count = this.hitCount;
    this.hits.instanceMatrix.needsUpdate = true;
  }

  private ripple(): void {
    const free = this.ripples.filter((r) => r.t < 0).slice(0, 2);
    free.forEach((r, i) => {
      r.t = 0;
      r.mesh.visible = true;
      r.mesh.position.set((i ? 1 : -1) * SLIT_X, Y, BARRIER_Z - 0.004);
    });
  }

  update(dt: number): void {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      const before = f.t;
      f.t += dt;
      const p = f.bead.position;
      if (f.t < 0.3) {
        // source to the slits
        p.copy(EMIT).lerp(new Vector3(f.seen * SLIT_X, Y, BARRIER_Z), f.t / 0.3);
      } else {
        if (before < 0.3) {
          if (f.seen && this.setup === 'watched') {
            const k = f.seen < 0 ? 0 : 1;
            this.ringMat[k].color.set('#3ddc97');
          }
          if (!f.seen) this.ripple();
        }
        const u = Math.min(1, (f.t - 0.3) / 0.35);
        const end = new Vector3(f.x * (SCREEN_W / 2), 0.02 + SCREEN_H / 2 + f.y * (SCREEN_H / 2), SCREEN_Z + 0.003);
        p.set(f.seen * SLIT_X, Y, BARRIER_Z).lerp(end, u);
        // unwatched, the photon is a wave in between: only the ripples show it
        f.bead.visible = !!f.seen || u > 0.9;
        if (u >= 1) {
          this.land(f.x, f.y);
          f.bead.visible = false;
          this.flights.splice(i, 1);
        }
      }
    }
    for (const r of this.ripples) {
      if (r.t < 0) continue;
      r.t += dt;
      const u = r.t / 0.5;
      const s = 0.01 + u * (BARRIER_Z - SCREEN_Z);
      r.mesh.scale.setScalar(s);
      (r.mesh.material as MeshBasicMaterial).opacity = 0.5 * (1 - u);
      if (u >= 1) {
        r.t = -1;
        r.mesh.visible = false;
      }
    }
    for (const mat of this.ringMat) mat.color.lerp(new Color('#8a8d93'), 1 - Math.exp(-dt * 5));
  }
}
