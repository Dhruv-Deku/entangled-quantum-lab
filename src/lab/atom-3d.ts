import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, Points, PointsMaterial, SphereGeometry } from '@iwsdk/core';
import { meanRadius, sampleOrbital, type Orbital } from '../quantum/hydrogen';

/** Electrons drawn per orbital. */
export const CLOUD = 9000;
/** Where most of the cloud reaches, in metres. */
const SIZE = 0.115;
const PLUS = new Color('#3fc6c9');
const MINUS = new Color('#ff7759');

/** A soft round dot for each electron (points are squares otherwise). */
function dotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

/**
 * Inside an atom: the hydrogen electron as a cloud of nine thousand places
 * it could be found, each drawn with probability |psi|^2 and coloured by
 * the sign of psi (teal +, red -). Switching orbital flows every dot to its
 * new place. Measuring pulls the whole cloud into the one place the electron
 * was found, then lets it spread again. A tiny nucleus sits in the middle:
 * the atom is almost all empty space.
 */
export class AtomVisual {
  readonly root = new Group();
  private readonly cloud: Points;
  private readonly geo = new BufferGeometry();
  private readonly pos = new Float32Array(CLOUD * 3);
  private readonly col = new Float32Array(CLOUD * 3);
  private from = new Float32Array(CLOUD * 3);
  private to = new Float32Array(CLOUD * 3);
  private toCol = new Float32Array(CLOUD * 3);
  private morph = 1;
  private collapse: { at: [number, number, number]; t: number } | null = null;
  private readonly found: Mesh;
  private spin = 0;

  constructor() {
    this.root.name = 'Atom';
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new BufferAttribute(this.col, 3));
    this.cloud = new Points(this.geo, new PointsMaterial({ size: 0.0034, vertexColors: true, map: dotTexture(), transparent: true, depthWrite: false, alphaTest: 0.05 }));
    this.cloud.frustumCulled = false;
    this.root.add(this.cloud);
    const nucleus = new Mesh(new SphereGeometry(0.0028, 12, 8), new MeshBasicMaterial({ color: '#f2f3f5' }));
    this.root.add(nucleus);
    this.found = new Mesh(new SphereGeometry(0.006, 16, 12), new MeshBasicMaterial({ color: '#ffffff' }));
    this.found.visible = false;
    // a child of the cloud, so it turns with it
    this.cloud.add(this.found);
    this.root.visible = false;
  }

  /** Scale for an orbital: its mean radius lands at a fixed fraction of SIZE. */
  static scaleFor(o: Orbital): number {
    return SIZE / (meanRadius(o.n, o.l) * 1.9);
  }

  /** Show an orbital; the dots flow there from wherever they are. */
  show(o: Orbital, rng: () => number, instant = false): void {
    const { pos, sign } = sampleOrbital(o, CLOUD, rng);
    const s = AtomVisual.scaleFor(o);
    this.from = this.pos.slice();
    for (let i = 0; i < CLOUD; i++) {
      // atom z (the orbital's axis) is up in the room
      this.to[i * 3] = pos[i * 3] * s;
      this.to[i * 3 + 1] = pos[i * 3 + 2] * s;
      this.to[i * 3 + 2] = pos[i * 3 + 1] * s;
      const c = sign[i] > 0 ? PLUS : MINUS;
      this.toCol[i * 3] = c.r;
      this.toCol[i * 3 + 1] = c.g;
      this.toCol[i * 3 + 2] = c.b;
    }
    this.col.set(this.toCol);
    (this.geo.getAttribute('color') as BufferAttribute).needsUpdate = true;
    this.morph = instant ? 1 : 0;
    if (instant) this.pos.set(this.to);
    this.collapse = null;
    this.found.visible = false;
  }

  /** The electron was found here (in the cloud's own coordinates): pull every dot in, then let them go. */
  measure(at: [number, number, number]): void {
    this.collapse = { at, t: 0 };
    this.found.position.set(...at);
  }

  /** One electron position from the cloud as shown (a real draw from |psi|^2). */
  pick(rng: () => number): [number, number, number] {
    const i = Math.floor(rng() * CLOUD);
    return [this.to[i * 3], this.to[i * 3 + 1], this.to[i * 3 + 2]];
  }

  get measuring(): boolean {
    return this.collapse !== null;
  }

  update(dt: number): void {
    this.spin += dt * 0.25;
    this.cloud.rotation.y = this.spin;
    let dirty = false;
    if (this.morph < 1) {
      this.morph = Math.min(1, this.morph + dt / 0.9);
      const u = this.morph * this.morph * (3 - 2 * this.morph);
      for (let i = 0; i < CLOUD * 3; i++) this.pos[i] = this.from[i] + (this.to[i] - this.from[i]) * u;
      dirty = true;
    }
    if (this.collapse) {
      const c = this.collapse;
      c.t += dt;
      // in for 0.45 s, a beat at the spot, out again over 0.8 s
      const k = c.t < 0.45 ? (c.t / 0.45) ** 2 : c.t < 1.1 ? 1 : Math.max(0, 1 - (c.t - 1.1) / 0.8);
      const ux = c.at[0], uy = c.at[1], uz = c.at[2];
      for (let i = 0; i < CLOUD; i++) {
        this.pos[i * 3] = this.to[i * 3] + (ux - this.to[i * 3]) * k;
        this.pos[i * 3 + 1] = this.to[i * 3 + 1] + (uy - this.to[i * 3 + 1]) * k;
        this.pos[i * 3 + 2] = this.to[i * 3 + 2] + (uz - this.to[i * 3 + 2]) * k;
      }
      this.found.visible = c.t > 0.4 && c.t < 1.4;
      dirty = true;
      if (c.t > 1.9) {
        this.collapse = null;
        this.found.visible = false;
        this.pos.set(this.to);
      }
    }
    if (dirty) (this.geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }
}
