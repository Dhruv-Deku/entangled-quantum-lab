import { BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import { standing } from '../quantum/box';

const N = 96;
/** Height of the wave at full swing, metres. */
const SWING = 0.035;
const MAX_LEVEL = 4;
const PHOTON_BEADS = 28;

/**
 * Light from a box: two walls (your palms, or two glass plates on the desk)
 * with an electron's standing wave between them. The curtain swings at a
 * speed that grows with its energy, so squeezing the box makes it frantic.
 * Beside it, the energy ladder; when the electron drops a level, a photon
 * flies out in the colour its wavelength really is (or pale, dashed, when
 * it is ultraviolet or infrared and the eye could not see it).
 */
export class BoxVisual {
  readonly root = new Group();
  /** The right wall's grab handle (desk mode): its x is half the box. */
  readonly handle: Mesh;
  private readonly frame = new Group();
  private readonly wallL: Mesh;
  private readonly wallR: Mesh;
  private readonly wallMat: MeshStandardMaterial;
  private readonly geo = new BufferGeometry();
  private readonly pos = new Float32Array(N * 2 * 3);
  private readonly glowGeo = new BufferGeometry();
  private readonly glowPos = new Float32Array(N * 2 * 3);
  private readonly rungs: InstancedMesh;
  private readonly beads: InstancedMesh;
  private readonly beadMat: MeshBasicMaterial;
  private readonly m = new Matrix4();
  private readonly v = new Vector3();
  private n = 1;
  private t = 0;
  /** Swing frequency: proportional to the level's energy. */
  private omega = 4;
  private length = 0.2;
  private photon: { t: number; color: Color; visible: boolean } | null = null;
  private flash = 0;
  private readonly flashColor = new Color();

  constructor() {
    this.root.name = 'LightBox';
    this.root.add(this.frame);
    this.wallMat = new MeshStandardMaterial({ color: '#b8bbc2', transparent: true, opacity: 0.45, roughness: 0.15, emissive: '#000000', depthWrite: false });
    const plate = new BoxGeometry(0.005, 0.11, 0.08);
    this.wallL = new Mesh(plate, this.wallMat);
    this.wallR = new Mesh(plate, this.wallMat);
    this.frame.add(this.wallL);
    // desk mode: the right wall is grabbable
    this.handle = new Mesh(new BoxGeometry(0.04, 0.13, 0.1), new MeshBasicMaterial({ visible: false }));
    this.handle.name = 'BoxHandle';
    this.handle.add(this.wallR);
    this.root.add(this.handle);
    const idx: number[] = [];
    for (let j = 0; j < N - 1; j++) {
      const a = j * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    const curtain = new Mesh(this.geo, new MeshBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0.8, side: DoubleSide, depthWrite: false, toneMapped: false }));
    curtain.frustumCulled = false;
    this.frame.add(curtain);
    this.glowGeo.setIndex(idx);
    this.glowGeo.setAttribute('position', new BufferAttribute(this.glowPos, 3));
    const glow = new Mesh(this.glowGeo, new MeshBasicMaterial({ color: '#2d7ff9', transparent: true, opacity: 0.28, side: DoubleSide, depthWrite: false }));
    glow.frustumCulled = false;
    this.frame.add(glow);
    // the energy ladder, beside the box
    this.rungs = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), MAX_LEVEL);
    this.rungs.frustumCulled = false;
    this.frame.add(this.rungs);
    // the photon: a string of beads along a wave
    this.beadMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, toneMapped: false });
    this.beads = new InstancedMesh(new SphereGeometry(0.0032, 8, 6), this.beadMat, PHOTON_BEADS);
    this.beads.count = 0;
    this.beads.frustumCulled = false;
    this.frame.add(this.beads);
    this.root.visible = false;
  }

  /** Lay the box between two points (in the root's space): walls there, the wave between. */
  span(a: Vector3, b: Vector3): void {
    const mid = this.v.copy(a).add(b).multiplyScalar(0.5);
    this.length = Math.max(0.02, a.distanceTo(b));
    this.frame.position.copy(mid);
    const dir = b.clone().sub(a).normalize();
    // keep the box upright: turn about the vertical only, so the wave swings up and down
    const flat = new Vector3(dir.x, 0, dir.z);
    if (flat.lengthSq() < 1e-6) flat.set(1, 0, 0);
    flat.normalize();
    this.frame.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), flat);
    this.wallL.position.set(-this.length / 2, 0, 0);
  }

  /** Between your hands the right wall rides the frame's right end (on the desk a hand or the buttons move it instead). */
  followFrame(): void {
    this.handle.position.set(this.length / 2, 0, 0).applyQuaternion(this.frame.quaternion).add(this.frame.position);
    this.handle.quaternion.copy(this.frame.quaternion);
  }

  setLevel(n: number, energyScale: number, levels: readonly number[]): void {
    this.n = n;
    // swing faster at higher energy (clamped so it stays watchable)
    this.omega = Math.min(26, 2.5 + 3 * energyScale);
    // rungs: one per level, the current one long and bright
    const top = Math.max(...levels);
    levels.forEach((e, i) => {
      const h = 0.012 + (e / top) * 0.1;
      const w = i + 1 === n ? 0.03 : 0.018;
      this.m.makeScale(w, 0.0016, 0.0016).setPosition(this.length / 2 + 0.035, h - 0.055, 0);
      this.rungs.setMatrixAt(i, this.m);
      this.rungs.setColorAt(i, new Color(i + 1 === n ? '#2d7ff9' : '#8a8d93'));
    });
    this.rungs.count = levels.length;
    this.rungs.instanceMatrix.needsUpdate = true;
    if (this.rungs.instanceColor) this.rungs.instanceColor.needsUpdate = true;
  }

  /** A photon leaves: its colour, or null when the eye could not see it. */
  emit(rgb: [number, number, number] | null): void {
    const color = rgb ? new Color(rgb[0], rgb[1], rgb[2]) : new Color('#8a8d93');
    this.photon = { t: 0, color, visible: !!rgb };
    this.beadMat.color.copy(color);
    this.flash = rgb ? 1 : 0;
    this.flashColor.copy(color);
  }

  update(dt: number): void {
    this.t += dt;
    const L = this.length;
    const swing = Math.cos(this.omega * this.t);
    for (let j = 0; j < N; j++) {
      const u = j / (N - 1);
      const x = -L / 2 + u * L;
      const s = standing(this.n, u);
      const y = (s / Math.SQRT2) * SWING * swing;
      this.pos[j * 6] = this.pos[j * 6 + 3] = x;
      this.pos[j * 6 + 1] = 0;
      this.pos[j * 6 + 4] = y;
      // the glow: where the electron is likely to be, |psi|^2, standing still
      const g = ((s * s) / 2) * SWING * 0.9;
      this.glowPos[j * 6] = this.glowPos[j * 6 + 3] = x;
      this.glowPos[j * 6 + 1] = -g;
      this.glowPos[j * 6 + 4] = g;
      this.pos[j * 6 + 2] = this.pos[j * 6 + 5] = 0.001;
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.glowGeo.getAttribute('position').needsUpdate = true;
    // the walls glow in the colour of the light just given out, then fade
    this.flash = Math.max(0, this.flash - dt * 1.2);
    this.wallMat.emissive.copy(this.flashColor).multiplyScalar(this.flash * 0.8);
    // the photon: up and toward you along a little wave, over a second and a half
    const p = this.photon;
    if (p) {
      p.t += dt;
      const travel = p.t / 1.5;
      if (travel >= 1) {
        this.photon = null;
        this.beads.count = 0;
      } else {
        for (let i = 0; i < PHOTON_BEADS; i++) {
          const f = travel * 0.5 - i * 0.012;
          if (f < 0) {
            this.m.makeScale(0, 0, 0);
          } else {
            const along = f * 0.7;
            // dashed (every other bead hidden) when invisible to the eye
            const hide = !p.visible && i % 2 === 1;
            this.m.makeTranslation(Math.sin(along * 90) * 0.008, 0.02 + along * 0.6, along * 0.5);
            if (hide) this.m.makeScale(0, 0, 0);
          }
          this.beads.setMatrixAt(i, this.m);
        }
        this.beads.count = PHOTON_BEADS;
        this.beads.instanceMatrix.needsUpdate = true;
        this.beadMat.opacity = 1 - travel * 0.6;
      }
    }
  }
}
