import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Curve,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Texture,
  type WebGLRenderer,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLOW } from './visuals';

/**
 * Shared parts for the 3D quantum computers: a studio light the metal can
 * reflect, a builder that merges every static part into one mesh per material
 * (a whole machine costs a handful of draw calls on the headset), label cards,
 * and the cans that slide away to reveal the inside.
 */

let studio: Texture | null = null;

/** A soft studio environment (three.js RoomEnvironment), made once and shared. */
export function studioEnvironment(renderer: WebGLRenderer): Texture {
  if (!studio) {
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    studio = pmrem.fromScene(room, 0.04).texture;
    room.dispose?.();
    pmrem.dispose();
  }
  return studio;
}

/** Let every standard material under `root` reflect the studio, so steel and copper read as metal. */
export function useStudio(root: Object3D, env: Texture, intensity = 1): void {
  root.traverse((o) => {
    const mats = (o as Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      if (m instanceof MeshStandardMaterial && !m.envMap) {
        m.envMap = env;
        m.envMapIntensity = intensity;
        m.needsUpdate = true;
      }
    }
  });
}

const up = new Vector3(0, 1, 0);
const q = new Quaternion();
const mx = new Matrix4();
const sc = new Vector3(1, 1, 1);

/** Collects static parts and merges them per material. */
export class Kit {
  private parts = new Map<Material, BufferGeometry[]>();

  /** Add a geometry, moved to `pos` and turned by `rot` (the geometry is consumed). */
  add(geo: BufferGeometry, mat: Material, pos?: Vector3, rot?: Euler | Quaternion): void {
    if (rot) (rot instanceof Euler ? q.setFromEuler(rot) : q.copy(rot));
    else q.identity();
    mx.compose(pos ?? new Vector3(), q, sc);
    geo.applyMatrix4(mx);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(geo);
  }

  box(w: number, h: number, d: number, mat: Material, pos: Vector3, rot?: Euler): void {
    this.add(new BoxGeometry(w, h, d), mat, pos, rot);
  }

  /** A vertical cylinder centred at `pos` (or turned by `rot`). */
  cyl(r: number, h: number, mat: Material, pos: Vector3, seg = 24, rot?: Euler, rBottom = r): void {
    this.add(new CylinderGeometry(r, rBottom, h, seg), mat, pos, rot);
  }

  /** A rod from a to b. */
  rod(a: Vector3, b: Vector3, r: number, mat: Material, seg = 10): void {
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-6) return;
    this.add(new CylinderGeometry(r, r, len, seg), mat, a.clone().lerp(b, 0.5), new Quaternion().setFromUnitVectors(up, dir.normalize()));
  }

  /** A horizontal ring (torus) at `pos`. */
  ring(r: number, thick: number, mat: Material, pos: Vector3, seg = 48): void {
    this.add(new TorusGeometry(r, thick, 8, seg), mat, pos, new Euler(Math.PI / 2, 0, 0));
  }

  tube(curve: Curve<Vector3>, r: number, mat: Material, segs = 64, radial = 6): void {
    this.add(new TubeGeometry(curve, segs, r, radial), mat);
  }

  /** Merge everything into `parent`, one mesh per material. */
  build(parent: Object3D): void {
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      parent.add(new Mesh(merged, mat));
      for (const g of geos) g.dispose();
    }
    this.parts.clear();
  }
}

/** Common finishes. */
export const finishes = () => ({
  steel: new MeshStandardMaterial({ color: '#b8bdc4', roughness: 0.22, metalness: 0.95 }),
  brushed: new MeshStandardMaterial({ color: '#9da3ab', roughness: 0.4, metalness: 0.9 }),
  copper: new MeshStandardMaterial({ color: '#c47c4e', roughness: 0.24, metalness: 1 }),
  dark: new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.5, metalness: 0.6 }),
  black: new MeshStandardMaterial({ color: '#141517', roughness: 0.55, metalness: 0.3 }),
  anodised: new MeshStandardMaterial({ color: '#3a3d43', roughness: 0.35, metalness: 0.8 }),
  g10: new MeshStandardMaterial({ color: '#c9c49b', roughness: 0.6, metalness: 0.05 }),
  glass: new MeshStandardMaterial({ color: '#8ea6c8', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }),
});

/** A two-line label on a small dark card, like the panels: a bold title and a dim subtitle; it can be redrawn. */
export class LabelCard {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private shown = '';

  constructor(width: number, title: string, sub = '') {
    this.canvas.width = 768;
    this.canvas.height = 200;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new Mesh(new PlaneGeometry(width, width * (200 / 768)), new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.set(title, sub);
  }

  set(title: string, sub = '', titleColor = '#f2f3f5'): void {
    const key = `${title}|${sub}|${titleColor}`;
    if (key === this.shown) return;
    this.shown = key;
    const g = this.canvas.getContext('2d')!;
    const W = 768, H = 200, pad = 36;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(27,28,31,0.9)';
    g.beginPath();
    g.roundRect(4, 4, W - 8, H - 8, 44);
    g.fill();
    g.strokeStyle = '#34363b';
    g.lineWidth = 3;
    g.stroke();
    g.textBaseline = 'middle';
    // shrink a line until it fits the card
    const line = (text: string, weight: number, size: number, color: string, y: number) => {
      let s = size;
      g.font = `${weight} ${s}px Inter, system-ui, sans-serif`;
      while (s > 20 && g.measureText(text).width > W - 2 * pad) {
        s -= 2;
        g.font = `${weight} ${s}px Inter, system-ui, sans-serif`;
      }
      g.fillStyle = color;
      g.fillText(text, pad, y);
    };
    line(title, 700, 70, titleColor, sub ? 76 : H / 2);
    if (sub) line(sub, 500, 44, '#9a9da3', 142);
    this.tex.needsUpdate = true;
  }
}

/**
 * The front half of a can around a machine. `reveal()` slides it down and
 * fades it out, outer cans first, to show what is inside.
 */
export class Cans {
  readonly root = new Group();
  private fronts: { mesh: Mesh; mat: MeshStandardMaterial; delay: number; drop: number }[] = [];
  private t = -1;

  /** A can of radius r from yTop down to yBottom; the back half stays, the front half can slide away. */
  add(r: number, yTop: number, yBottom: number, mat: MeshStandardMaterial, kit: Kit, keepBack: boolean, delay: number): void {
    const h = yTop - yBottom, y = (yTop + yBottom) / 2;
    if (keepBack) {
      const back = new CylinderGeometry(r, r, h, 48, 1, true, Math.PI / 2, Math.PI);
      const backMat = mat.clone();
      backMat.side = DoubleSide;
      kit.add(back, backMat, new Vector3(0, y, 0));
      // a bottom lip, so the cut edge reads as a can
      kit.add(new TorusGeometry(r, h * 0.004 + 0.002, 6, 48, Math.PI), backMat, new Vector3(0, yBottom, 0), new Euler(Math.PI / 2, 0, Math.PI));
    }
    const frontMat = mat.clone();
    frontMat.side = DoubleSide;
    frontMat.transparent = true;
    const mesh = new Mesh(new CylinderGeometry(r, r, h, 48, 1, true, -Math.PI / 2, Math.PI), frontMat);
    mesh.position.y = y;
    mesh.userData.y0 = y;
    this.root.add(mesh);
    this.fronts.push({ mesh, mat: frontMat, delay, drop: h * 0.35 });
  }

  /** Close the cans again and play the reveal. */
  reveal(): void {
    this.t = 0;
    for (const f of this.fronts) {
      f.mesh.visible = true;
      f.mat.opacity = 1;
      f.mesh.position.y = f.mesh.userData.y0;
    }
  }

  /** True while the reveal is still playing. */
  get playing(): boolean {
    return this.t >= 0;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    let busy = false;
    for (const f of this.fronts) {
      const u = Math.max(0, Math.min(1, (this.t - f.delay) / 1.3));
      const e = u * u * (3 - 2 * u);
      f.mesh.position.y = f.mesh.userData.y0 - e * f.drop;
      f.mat.opacity = 1 - e;
      f.mat.depthWrite = e < 0.5;
      f.mesh.visible = u < 1;
      if (u < 1) busy = true;
    }
    if (!busy) this.t = -1;
  }
}

/** A temperature as the fridge's thermometers show it. */
export function formatKelvin(k: number): string {
  if (k >= 10) return `${Math.round(k)} K`;
  if (k >= 1) return Math.abs(k - Math.round(k)) < 0.05 ? `${Math.round(k)} K` : `${k.toFixed(1)} K`;
  return `${Math.round(k * 1000)} mK`;
}

/**
 * A laser beam from a to b that can be drawn on: `progress` 0..1 is how far
 * it has reached, `strength` 0..1 its brightness.
 */
export class Beam {
  readonly mesh: Mesh;
  readonly mat: MeshBasicMaterial;
  private readonly base: number;

  constructor(a: Vector3, b: Vector3, r: number, color: string, opacity = 0.6) {
    const len = a.distanceTo(b);
    const geo = new CylinderGeometry(r, r, len, 8, 1, true);
    geo.translate(0, len / 2, 0);
    this.mat = new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, ...GLOW, toneMapped: false });
    this.mesh = new Mesh(geo, this.mat);
    this.mesh.position.copy(a);
    this.mesh.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    this.base = opacity;
  }

  set(progress: number, strength = 1): void {
    this.mesh.visible = progress > 0.001 && strength > 0.001;
    this.mesh.scale.y = Math.max(0.001, Math.min(1, progress));
    this.mat.opacity = this.base * strength;
  }
}

/** Ease in and out. */
export const ease = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};
