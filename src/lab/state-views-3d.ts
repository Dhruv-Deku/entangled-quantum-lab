import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import type { QState } from '../quantum/state';
import { phaseColor, qsphere, type DensityLike } from '../quantum/state-views';
import { textTexture } from './visuals';

const RING = new Color('#4a4c52');
const LABEL_W = 0.036;

/** A flat text label facing the player (+z). */
function label(): Mesh {
  const m = new Mesh(new PlaneGeometry(LABEL_W, (LABEL_W * 96) / 256), new MeshBasicMaterial({ transparent: true, depthWrite: false }));
  m.renderOrder = 2;
  return m;
}

function circlePoints(r: number, y: number, segments = 64): number[] {
  const pts: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  return pts;
}

/**
 * The Q-sphere: every basis state as a dot on a sphere. |00..0> sits at the
 * north pole and |11..1> at the south; states with the same number of 1s
 * share a latitude. A dot's size is the probability and its colour the phase,
 * so a GHZ state is two dots at the poles and a uniform superposition a
 * sphere evenly sprinkled with dots of one colour.
 */
export class QSphereVisual {
  readonly root = new Group();
  private readonly ball = new Group();
  private readonly tilt = new Euler(0.32, 0, 0);
  private readonly radius: number;
  private dots: { mesh: Mesh; stick: Mesh; size: number; target: number }[] = [];
  private labels: Mesh[] = [];
  private tex = new Map<string, CanvasTexture>();
  private rings: LineLoop[] = [];
  private n = -1;
  private readonly v = new Vector3();

  constructor(radius = 0.085) {
    this.radius = radius;
    this.ball.rotation.copy(this.tilt);
    this.root.add(this.ball);
    // a faint wire sphere: the equator, two meridians, and the poles' axis
    const wire = new LineBasicMaterial({ color: RING, transparent: true, opacity: 0.45 });
    const eq = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(circlePoints(radius, 0), 3));
    this.ball.add(new LineLoop(eq, wire));
    for (const rot of [0, Math.PI / 2]) {
      const m = new LineLoop(eq, wire);
      m.rotation.set(Math.PI / 2, 0, rot, 'ZXY');
      this.ball.add(m);
    }
    const axis = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, -radius, 0, 0, radius, 0], 3));
    this.ball.add(new LineSegments(axis, wire));
  }

  /** Rebuild the latitude rings and the dot pool for n qubits. */
  private build(n: number): void {
    this.n = n;
    for (const r of this.rings) this.ball.remove(r);
    this.rings = [];
    const mat = new LineBasicMaterial({ color: RING, transparent: true, opacity: 0.25 });
    for (let w = 1; w < n; w++) {
      const theta = (Math.PI * w) / n;
      const g = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(circlePoints(Math.sin(theta) * this.radius, Math.cos(theta) * this.radius), 3));
      const ring = new LineLoop(g, mat);
      this.rings.push(ring);
      this.ball.add(ring);
    }
    const dim = 1 << n;
    while (this.dots.length < dim) {
      const mesh = new Mesh(new SphereGeometry(1, 20, 14), new MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 }));
      const stick = new Mesh(new CylinderGeometry(0.0007, 0.0007, 1, 6), new MeshBasicMaterial({ transparent: true, opacity: 0.5 }));
      this.ball.add(mesh, stick);
      this.dots.push({ mesh, stick, size: 0, target: 0 });
    }
    while (this.labels.length < 8) {
      const l = label();
      this.root.add(l);
      this.labels.push(l);
    }
    this.dots.forEach((d, i) => {
      d.mesh.visible = d.stick.visible = i < dim;
      d.size = 0;
    });
  }

  private labelTex(text: string, color: string): CanvasTexture {
    const key = `${text}|${color}`;
    let t = this.tex.get(key);
    if (!t) {
      t = textTexture([{ text: `|${text}>`, color }], 700);
      this.tex.set(key, t);
    }
    return t;
  }

  set(s: QState): void {
    if (s.n !== this.n) this.build(s.n);
    const pts = qsphere(s);
    const shown = pts.filter((p) => p.p > 0.02).sort((a, b) => b.p - a.p).slice(0, this.labels.length);
    this.labels.forEach((l) => (l.visible = false));
    for (const p of pts) {
      const d = this.dots[p.k];
      d.target = p.p > 1e-4 ? 0.003 + 0.011 * Math.sqrt(p.p) : 0;
      const col = new Color(phaseColor(p.phase));
      (d.mesh.material as MeshStandardMaterial).color.copy(col);
      (d.stick.material as MeshBasicMaterial).color.copy(col);
      const r = this.radius;
      d.mesh.position.set(p.pos[0] * r, p.pos[1] * r, p.pos[2] * r);
      // the stick from the centre out to the dot
      this.v.set(p.pos[0], p.pos[1], p.pos[2]);
      d.stick.position.copy(this.v).multiplyScalar(r / 2);
      d.stick.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), this.v.clone().normalize());
      d.stick.scale.set(1, r, 1);
    }
    shown.forEach((p, i) => {
      const l = this.labels[i];
      const mat = l.material as MeshBasicMaterial;
      mat.map = this.labelTex(p.label, '#e4e6eb');
      mat.needsUpdate = true;
      // beside the dot as the tilted sphere places it: to its side, away from the axis (alternating near the poles)
      this.v.set(p.pos[0], p.pos[1], p.pos[2]).applyEuler(this.tilt).multiplyScalar(this.radius);
      const side = Math.abs(p.pos[0]) > 0.2 ? Math.sign(p.pos[0]) : i % 2 ? -1 : 1;
      l.position.set(this.v.x + side * (LABEL_W / 2 + 0.01), this.v.y, this.v.z + 0.01);
      l.visible = true;
    });
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 10);
    for (const d of this.dots) {
      if (!d.mesh.visible) continue;
      d.size += (d.target - d.size) * k;
      const s = Math.max(1e-5, d.size);
      d.mesh.scale.setScalar(s);
      d.stick.visible = d.size > 0.001;
    }
  }
}

/**
 * The state city: the density matrix as two grids of towers, the real part
 * and the imaginary part. Diagonal towers are the probabilities; the others
 * are coherences, which noise wears down while the diagonal survives.
 */
export class StateCityVisual {
  readonly root = new Group();
  private parts: { mesh: InstancedMesh; plate: Mesh; title: Mesh }[] = [];
  private dim = -1;
  private readonly size: number;
  private readonly m = new Matrix4();
  private readonly c = new Color();
  private readonly box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private targets: Float32Array[] = [new Float32Array(0), new Float32Array(0)];
  private heights: Float32Array[] = [new Float32Array(0), new Float32Array(0)];

  constructor(size = 0.15) {
    this.size = size;
    ['Re ρ', 'Im ρ'].forEach((name, i) => {
      const plate = new Mesh(new BoxGeometry(size, 0.002, size), new MeshStandardMaterial({ color: '#232427', roughness: 0.9, transparent: true, opacity: 0.6, depthWrite: false }));
      plate.position.set((i - 0.5) * (size + 0.04), -0.001, 0);
      const title = label();
      (title.material as MeshBasicMaterial).map = textTexture([{ text: name, color: '#c9ccd1' }], 700);
      title.scale.setScalar(1.3);
      title.position.set(plate.position.x, 0.004, size / 2 + 0.018);
      title.rotation.x = -0.6;
      this.root.add(plate, title);
      this.parts.push({ mesh: new InstancedMesh(this.box, new MeshStandardMaterial({ roughness: 0.6 }), 1024), plate, title });
    });
    for (const p of this.parts) {
      // the towers change every update, so skip culling (the bounds would be computed once, while empty)
      p.mesh.frustumCulled = false;
      for (let i = 0; i < 1024; i++) p.mesh.setColorAt(i, this.c.set('#3a3c41'));
      p.mesh.count = 0;
      p.mesh.position.copy(p.plate.position);
      this.root.add(p.mesh);
    }
  }

  set(rho: DensityLike): void {
    const d = rho.dim;
    if (d !== this.dim) {
      this.dim = d;
      this.targets = [new Float32Array(d * d), new Float32Array(d * d)];
      this.heights = [new Float32Array(d * d), new Float32Array(d * d)];
      for (const p of this.parts) p.mesh.count = d * d;
    }
    for (let i = 0; i < d * d; i++) {
      this.targets[0][i] = rho.re[i];
      this.targets[1][i] = rho.im[i];
    }
  }

  update(dt: number): void {
    const d = this.dim;
    if (d < 1) return;
    const k = 1 - Math.exp(-dt * 8);
    const cell = this.size / d;
    const w = cell * 0.72;
    const tall = 0.15;
    this.parts.forEach((part, which) => {
      const tg = this.targets[which], ht = this.heights[which];
      for (let i = 0; i < d; i++)
        for (let j = 0; j < d; j++) {
          const idx = i * d + j;
          ht[idx] += (tg[idx] - ht[idx]) * k;
          const v = ht[idx];
          const h = Math.max(0.0006, Math.abs(v) * tall);
          // row i runs away from the player, column j to the right
          this.m.makeScale(w, h, w).setPosition(-this.size / 2 + (j + 0.5) * cell, v < 0 ? -h : 0, -this.size / 2 + (i + 0.5) * cell);
          part.mesh.setMatrixAt(idx, this.m);
          // diagonal towers (probabilities) light grey, coherences Horizon blue, negative values coral
          this.c.set(Math.abs(v) < 1e-3 ? '#3a3c41' : v < 0 ? '#ff8a7a' : i === j ? '#d6d8dc' : '#7fa9f5');
          part.mesh.setColorAt(idx, this.c);
        }
      part.mesh.instanceMatrix.needsUpdate = true;
      if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
    });
  }
}
