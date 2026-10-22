import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  QuadraticBezierCurve3,
  ShaderMaterial,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Vec3 } from '../quantum/gates';

export const ORB_RADIUS = 0.055;
export const GOLD = new Color('#E2B04A');
/** "Done" / "on target" colour, shared with the panels. */
export const MINT = new Color('#3DDC97');

/**
 * Each qubit keeps one colour everywhere: its arrow, trail, desk label, and its
 * steps on the timeline. Gold is never used here; it only means entanglement.
 */
export const QUBIT_COLORS = ['#FF7759', '#3FC6C9', '#9B87F5', '#7BCB6A', '#FF8FB6'];
export const qubitColor = (i: number) => QUBIT_COLORS[i % QUBIT_COLORS.length];

/** Small text on a transparent canvas, for labels that live in the 3D scene. */
export function textTexture(parts: { text: string; color: string }[], weight = 600): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.font = `${weight} 58px Inter, system-ui, sans-serif`;
  g.textBaseline = 'middle';
  const width = parts.reduce((w, p) => w + g.measureText(p.text).width, 0);
  let x = 128 - width / 2;
  for (const p of parts) {
    g.fillStyle = p.color;
    g.fillText(p.text, x, 50);
    x += g.measureText(p.text).width;
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft round shadow texture, shared by every orb. */
function shadowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.32)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

/** Bloch (x, y, z) -> three.js local direction: Bloch z is up, x toward the viewer, y to the right. */
export function blochToLocal(v: Vec3, out: Vector3): Vector3 {
  return out.set(v[1], v[2], v[0]);
}

// ---- shared resources (one set for every orb) ----
const sphereGeo = new SphereGeometry(1, 48, 32);
const glassMat = new MeshPhysicalMaterial({
  color: '#d9e2ef', roughness: 0.06, metalness: 0, transparent: true, opacity: 0.12,
  clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false,
});
/** Fresnel rim: bright at grazing angles, clear in the middle, like the edge of a glass ball. */
const rimMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  uniforms: { uColor: { value: new Color('#cfe0ff') }, uStrength: { value: 0.55 } },
  vertexShader: /* glsl */ `
    varying vec3 vN; varying vec3 vV;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uStrength;
    varying vec3 vN; varying vec3 vV;
    void main() {
      float f = pow(1.0 - abs(dot(vN, vV)), 3.0);
      gl_FragColor = vec4(uColor * f * uStrength, f * uStrength);
    }`,
});
const ringGeo = new TorusGeometry(1, 0.004, 6, 96);
const ringMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2, depthWrite: false });
const meridianMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.08, depthWrite: false });
const shaftGeo = new CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0);
const headGeo = new ConeGeometry(1, 1, 16).translate(0, 0.5, 0);
const tipMat = new MeshBasicMaterial({ color: '#ffffff' });
const coreMat = new MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(1.6), toneMapped: false });
const haloMat = new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.18, depthWrite: false, blending: AdditiveBlending });
const axisMat = new MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0, depthWrite: false });
const selectMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
const shadowGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
let shadowMat: MeshBasicMaterial | null = null;
const labelGeo = new PlaneGeometry(0.04, 0.015).rotateX(-Math.PI / 2.6);
/** Pole labels: the same two sprites for every orb, always facing the viewer. */
let poleMats: [SpriteMaterial, SpriteMaterial] | null = null;
function poleMaterials(): [SpriteMaterial, SpriteMaterial] {
  poleMats ??= ['0', '1'].map(
    (t) => new SpriteMaterial({ map: textTexture([{ text: t, color: '#c9ccd1' }], 600), transparent: true, opacity: 0.7, depthWrite: false }),
  ) as [SpriteMaterial, SpriteMaterial];
  return poleMats;
}
const targetRingGeo = new TorusGeometry(1, 0.12, 8, 40);
const Z_AXIS = new Vector3(0, 0, 1);
const X_AXIS = new Vector3(1, 0, 0);

/** Text on a dark pill, for the gate name that rises out of an orb. */
function pillTexture(text: string, color: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '700 50px Inter, system-ui, sans-serif';
  const w = Math.min(240, g.measureText(text).width + 44);
  const x = 128 - w / 2;
  g.beginPath();
  g.moveTo(x + 40, 8);
  g.arcTo(x + w, 8, x + w, 88, 40);
  g.arcTo(x + w, 88, x, 88, 40);
  g.arcTo(x, 88, x, 8, 40);
  g.arcTo(x, 8, x + w, 8, 40);
  g.closePath();
  g.fillStyle = 'rgba(24,25,27,0.88)';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = color;
  g.stroke();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 50);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
const pillCache = new Map<string, CanvasTexture>();
function pill(text: string, color: string): CanvasTexture {
  const key = `${text}|${color}`;
  let t = pillCache.get(key);
  if (!t) pillCache.set(key, (t = pillTexture(text, color)));
  return t;
}

const TRAIL = 90;
const UP = new Vector3(0, 1, 0);

/** One sphere geometry per orb radius, so the grabbable root mesh needs no scale. */
const orbGeoCache = new Map<number, SphereGeometry>();
function orbGeometry(r: number): SphereGeometry {
  let g = orbGeoCache.get(r);
  if (!g) orbGeoCache.set(r, (g = new SphereGeometry(r, 48, 32)));
  return g;
}

export class OrbVisual {
  /** The glass body is the root: grab and ray pointers hit-test this mesh directly. */
  readonly root: Mesh;
  private readonly arrow = new Group();
  private readonly shaft: Mesh;
  private readonly head: Mesh;
  private readonly tip: Mesh;
  private readonly core: Mesh;
  private readonly halo: Mesh;
  private readonly axis: Mesh;
  private readonly select: Mesh;
  /** Gate effects: the rotation's path drawn ahead of the arrow, and the gate's name rising. */
  private readonly arc: Mesh;
  private readonly arcHead: Mesh;
  private readonly arcMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  private readonly glyph: Sprite;
  private readonly glyphMat = new SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false });
  private arcT = 0;
  private glyphT = 0;
  /** Where a lesson wants the arrow: a faint arrow and a ring on the sphere. */
  private readonly target = new Group();
  private readonly targetMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false });
  private readonly targetRingMat = new MeshBasicMaterial({ color: MINT, transparent: true, opacity: 0.7, depthWrite: false });
  private readonly targetDir = new Vector3();
  private hasTarget = false;
  private onTarget = 0;
  private readonly flashMat: MeshBasicMaterial;
  private readonly flashMesh: Mesh;
  private readonly trail: Line;
  private readonly trailPos: Float32Array;
  private readonly trailCol: Float32Array;
  private trailCount = 0;
  private flashT = 0;
  /** Measurement ripple: a ring that leaves the equator and fades. */
  private readonly ripple: Mesh;
  private readonly rippleMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  private rippleT = 0;
  private readonly tmp = new Vector3();
  private readonly lastTip = new Vector3(0, 1, 0);
  private readonly tint: Color;
  private readonly label: Mesh;
  private readonly shadow: Mesh;
  private readonly ground: number;

  constructor(readonly index = 0, readonly radius = ORB_RADIUS, groundOffset = 0.15) {
    const r = radius;
    this.ground = groundOffset;
    this.tint = new Color(qubitColor(index));
    const arrowMat = new MeshPhysicalMaterial({ color: this.tint, roughness: 0.35, metalness: 0.1, clearcoat: 0.6, emissive: this.tint, emissiveIntensity: 0.35 });
    this.root = new Mesh(orbGeometry(r), glassMat);
    this.root.renderOrder = 1;
    const rim = new Mesh(sphereGeo, rimMat);
    rim.scale.setScalar(r * 1.002);
    rim.renderOrder = 3;
    const equator = new Mesh(ringGeo, ringMat.clone());
    (equator.material as MeshBasicMaterial).color.copy(this.tint).lerp(new Color('#ffffff'), 0.35);
    (equator.material as MeshBasicMaterial).opacity = 0.45;
    equator.scale.set(r, r, r * 0.25);
    equator.rotation.x = Math.PI / 2;
    const meridian = new Mesh(ringGeo, meridianMat);
    meridian.scale.set(r, r, r * 0.25);
    const pole = new Mesh(sphereGeo, tipMat);
    pole.scale.setScalar(r * 0.03);
    pole.position.y = r;

    this.shaft = new Mesh(shaftGeo, arrowMat);
    this.head = new Mesh(headGeo, arrowMat);
    this.tip = new Mesh(sphereGeo, tipMat);
    this.arrow.add(this.shaft, this.head, this.tip);

    this.core = new Mesh(sphereGeo, coreMat);
    this.halo = new Mesh(sphereGeo, haloMat);
    this.axis = new Mesh(shaftGeo, axisMat.clone());
    this.axis.scale.set(0.0012, r * 2.6, 0.0012);
    this.axis.visible = false;
    // selection: a soft ring on the desk under the orb
    this.select = new Mesh(ringGeo, selectMat.clone());
    (this.select.material as MeshBasicMaterial).color.copy(this.tint);
    this.select.scale.set(r * 0.85, r * 0.85, r * 0.2);
    this.select.rotation.x = Math.PI / 2;
    this.select.position.y = -groundOffset + 0.001;
    // contact shadow and name on the desk, so the orb reads as sitting in the room
    shadowMat ??= new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
    this.shadow = new Mesh(shadowGeo, shadowMat);
    this.shadow.position.y = -groundOffset + 0.0005;
    this.shadow.scale.setScalar(r * 1.9);
    this.label = new Mesh(labelGeo, new MeshBasicMaterial({ map: textTexture([{ text: `q${index}`, color: qubitColor(index) }], 700), transparent: true, depthWrite: false }));
    this.label.position.set(0, -groundOffset + 0.002, r * 0.15);
    this.flashMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
    this.flashMesh = new Mesh(sphereGeo, this.flashMat);
    this.flashMesh.scale.setScalar(r * 1.05);

    this.trailPos = new Float32Array(TRAIL * 3);
    this.trailCol = new Float32Array(TRAIL * 4);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.trailPos, 3));
    g.setAttribute('color', new BufferAttribute(this.trailCol, 4));
    this.trail = new Line(g, new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    this.trail.frustumCulled = false;

    this.root.add(equator, meridian, pole, this.arrow, this.trail, this.core, this.halo, this.axis, this.select, this.shadow, this.label, this.flashMesh, rim);
    // only the glass body takes pointer input; decorations must not steal grabs or rays
    this.root.traverse((o) => {
      if (o !== this.root) (o as unknown as { pointerEvents: string }).pointerEvents = 'none';
    });
    // poles: which end is 0 and which is 1
    const [m0, m1] = poleMaterials();
    for (const [mat, y] of [[m0, 1], [m1, -1]] as const) {
      const sp = new Sprite(mat);
      sp.scale.set(r * 0.85, r * 0.32, 1);
      sp.position.y = y * r * 1.28;
      (sp as unknown as { pointerEvents: string }).pointerEvents = 'none';
      this.root.add(sp);
    }

    const ghostShaft = new Mesh(shaftGeo, this.targetMat);
    ghostShaft.scale.set(r * 0.022, r * 0.86, r * 0.022);
    const ring = new Mesh(targetRingGeo, this.targetRingMat);
    ring.scale.setScalar(r * 0.14);
    ring.position.y = r;
    ring.rotation.x = Math.PI / 2;
    this.target.add(ghostShaft, ring);
    this.target.visible = false;
    this.target.traverse((o) => ((o as unknown as { pointerEvents: string }).pointerEvents = 'none'));
    this.root.add(this.target);

    this.ripple = new Mesh(ringGeo, this.rippleMat);
    this.ripple.rotation.x = Math.PI / 2;
    this.ripple.visible = false;
    (this.ripple as unknown as { pointerEvents: string }).pointerEvents = 'none';
    this.root.add(this.ripple);

    this.arc = new Mesh(new BufferGeometry(), this.arcMat);
    this.arcHead = new Mesh(headGeo, this.arcMat);
    this.arc.add(this.arcHead);
    this.arc.visible = false;
    this.glyph = new Sprite(this.glyphMat);
    this.glyph.visible = false;
    for (const o of [this.arc, this.arcHead, this.glyph]) (o as unknown as { pointerEvents: string }).pointerEvents = 'none';
    this.root.add(this.arc, this.glyph);

    this.setBloch([0, 0, 1]);
  }

  /** Point the arrow along the Bloch vector; its length is |r| (shrinks when entangled). */
  setBloch(v: Vec3): void {
    const r = this.radius;
    const len = Math.hypot(v[0], v[1], v[2]);
    blochToLocal(v, this.tmp);
    if (len > 1e-6) this.arrow.quaternion.setFromUnitVectors(UP, this.tmp.clone().divideScalar(len));
    const L = len * r;
    const headLen = Math.min(r * 0.18, L * 0.35);
    const visible = len > 0.04;
    this.arrow.visible = visible;
    this.shaft.scale.set(r * 0.035, Math.max(0.0001, L - headLen), r * 0.035);
    this.head.position.y = L - headLen;
    this.head.scale.set(r * 0.08, headLen, r * 0.08);
    this.tip.position.y = L;
    this.tip.scale.setScalar(r * 0.07 * Math.min(1, len * 2));

    // gold core grows as the qubit loses its own state (mixedness = 1 - |r|^2)
    const mixed = Math.max(0, 1 - len * len);
    const c = r * (0.025 + 0.06 * mixed);
    this.core.visible = mixed > 0.02;
    this.core.scale.setScalar(c);
    this.halo.visible = mixed > 0.02;
    this.halo.scale.setScalar(c * 3.2);

    // trail: append the tip when it has moved
    this.tmp.multiplyScalar(r);
    if (this.trailCount === 0 || this.tmp.distanceTo(this.lastTip) > r * 0.02) {
      this.trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
      this.trailPos[0] = this.tmp.x;
      this.trailPos[1] = this.tmp.y;
      this.trailPos[2] = this.tmp.z;
      this.trailCount = Math.min(TRAIL, this.trailCount + 1);
      this.lastTip.copy(this.tmp);
    }
    const { r: tr, g: tg, b: tb } = this.tint;
    for (let i = 0; i < TRAIL; i++) {
      const a = i < this.trailCount ? Math.pow(1 - i / TRAIL, 1.6) * 0.9 : 0;
      // newest points lean toward white, older ones settle into the qubit's colour
      const w = 0.45 * Math.pow(1 - i / TRAIL, 4);
      this.trailCol.set([tr + (1 - tr) * w, tg + (1 - tg) * w, tb + (1 - tb) * w, a], i * 4);
    }
    (this.trail.geometry.attributes.position as BufferAttribute).needsUpdate = true;
    (this.trail.geometry.attributes.color as BufferAttribute).needsUpdate = true;
    this.trail.geometry.setDrawRange(0, this.trailCount);
  }

  /** Show a lesson's target state (null hides it). The ring brightens as the arrow arrives. */
  setTarget(v: Vec3 | null): void {
    this.hasTarget = !!v;
    this.target.visible = !!v;
    if (!v) return;
    blochToLocal(v, this.targetDir).normalize();
    this.target.quaternion.setFromUnitVectors(UP, this.targetDir);
  }

  clearTrail(): void {
    this.trailCount = 0;
  }

  /** Show the rotation axis of the gate being applied (null hides it). */
  setAxis(axis: Vec3 | null, strength = 1): void {
    const m = this.axis.material as MeshBasicMaterial;
    if (!axis) {
      this.axis.visible = false;
      return;
    }
    this.axis.visible = true;
    blochToLocal(axis, this.tmp).normalize();
    this.axis.quaternion.setFromUnitVectors(UP, this.tmp);
    this.axis.position.copy(this.tmp).multiplyScalar(-this.radius * 1.3);
    m.opacity = 0.75 * strength;
  }

  setSelected(on: boolean): void {
    (this.select.material as MeshBasicMaterial).opacity = on ? 0.8 : 0;
  }

  /**
   * Keep the shadow, label and selection ring on the desk while the orb is
   * moved by hand. `height` is the orb centre's height above the desk.
   */
  setHeight(height: number): void {
    const y = -height;
    this.shadow.position.y = y + 0.0005;
    this.label.position.y = y + 0.002;
    this.select.position.y = y + 0.001;
    // lifted higher, the shadow spreads out; well above the desk it is gone
    const lift = Math.max(0, height - this.ground);
    this.shadow.scale.setScalar(this.radius * 1.9 * (1 + lift * 3));
    this.shadow.visible = height > 0 && lift < 0.3;
    this.label.visible = height > 0;
  }

  /** A ring that spreads out from the orb: the moment a measurement collapses it. */
  /**
   * A gate starts: draw the circle the arrow tip is about to travel (axis and
   * angle from the gate's rotation, starting at the current state `from`), and
   * float the gate's name above the orb. `axis` null shows only the name.
   */
  showGate(label: string, axis: Vec3 | null, angle: number, from: Vec3, color: string = qubitColor(this.index)): void {
    this.glyphMat.map = pill(label, color);
    this.glyphMat.needsUpdate = true;
    this.glyph.visible = true;
    this.glyphT = 1;
    const r = this.radius;
    const len = Math.hypot(from[0], from[1], from[2]);
    if (!axis || angle < 1e-3 || len < 0.2) {
      this.arc.visible = false;
      return;
    }
    const n = blochToLocal(axis, new Vector3()).normalize();
    const v0 = blochToLocal(from, new Vector3()).multiplyScalar(r);
    const along = v0.dot(n);
    const radial = v0.clone().addScaledVector(n, -along);
    const rad = radial.length();
    if (rad < r * 0.08) {
      // the arrow lies on the axis: it will not move, so there is no path to draw
      this.arc.visible = false;
      return;
    }
    // a torus lies in its XY plane starting on +X and sweeping toward +Y (right-handed about +Z),
    // which matches the direction a rotation about the axis turns the Bloch vector
    this.arc.geometry.dispose();
    this.arc.geometry = new TorusGeometry(rad, r * 0.018, 6, Math.max(8, Math.round(48 * angle / Math.PI)), angle);
    const q = new Quaternion().setFromUnitVectors(Z_AXIS, n);
    const xNow = X_AXIS.clone().applyQuaternion(q);
    const spin = new Quaternion().setFromUnitVectors(xNow, radial.clone().normalize());
    this.arc.quaternion.copy(spin.multiply(q));
    this.arc.position.copy(n).multiplyScalar(along);
    // arrowhead at the end of the arc, pointing along the motion
    const end = new Vector3(Math.cos(angle) * rad, Math.sin(angle) * rad, 0);
    const tangent = new Vector3(-Math.sin(angle), Math.cos(angle), 0);
    this.arcHead.position.copy(end);
    this.arcHead.quaternion.setFromUnitVectors(UP, tangent);
    this.arcHead.scale.set(r * 0.07, r * 0.16, r * 0.07);
    this.arcMat.color.set(color).lerp(new Color('#ffffff'), 0.4);
    this.arc.visible = true;
    this.arcT = 1;
  }

  pulseRipple(color: Color | string = '#ffffff'): void {
    this.rippleMat.color.set(color);
    this.rippleT = 1;
    this.ripple.visible = true;
  }

  /** Brief glow: white for a measurement, gold for entanglement. */
  flash(color: Color | string = '#ffffff'): void {
    this.flashMat.color.set(color);
    this.flashT = 1;
  }

  update(dt: number): void {
    if (this.hasTarget) {
      // how close the arrow tip is to the target, 0..1 (1 = on it)
      const close = Math.max(0, this.lastTip.clone().normalize().dot(this.targetDir));
      const want = close > 0.99 ? 1 : 0;
      this.onTarget += (want - this.onTarget) * Math.min(1, dt * 6);
      const pulse = 1 + 0.25 * this.onTarget * Math.sin(performance.now() / 160);
      this.target.children[1].scale.setScalar(this.radius * 0.14 * (1 + 0.6 * this.onTarget) * pulse);
      this.targetRingMat.opacity = 0.55 + 0.45 * this.onTarget;
      this.targetMat.opacity = 0.3 * (1 - this.onTarget);
    }
    if (this.arcT > 0) {
      // fade in fast, hold while the gate plays, fade out
      this.arcT = Math.max(0, this.arcT - dt * 0.9);
      const k = 1 - this.arcT;
      this.arcMat.opacity = 0.75 * Math.min(1, k * 8) * Math.min(1, this.arcT * 2.5);
      this.arc.visible = this.arcT > 0;
    }
    if (this.glyphT > 0) {
      this.glyphT = Math.max(0, this.glyphT - dt * 0.85);
      const k = 1 - this.glyphT;
      this.glyph.position.y = this.radius * (1.55 + 0.9 * (1 - Math.pow(1 - k, 3)));
      this.glyph.scale.set(this.radius * 1.5, this.radius * 0.56, 1);
      this.glyphMat.opacity = Math.min(1, k * 10) * Math.min(1, this.glyphT * 2.5);
      this.glyph.visible = this.glyphT > 0;
    }
    if (this.rippleT > 0) {
      this.rippleT = Math.max(0, this.rippleT - dt * 1.8);
      const k = 1 - this.rippleT;
      const ease = 1 - Math.pow(1 - k, 3);
      this.ripple.scale.set(this.radius * (1 + 1.1 * ease), this.radius * (1 + 1.1 * ease), this.radius * 0.6);
      this.rippleMat.opacity = 0.7 * this.rippleT * this.rippleT;
      this.ripple.visible = this.rippleT > 0;
    }
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 2.2);
      this.flashMat.opacity = 0.45 * this.flashT * this.flashT;
    }
  }
}

/** Gold thread between two entangled qubits, brightness = entanglement strength. */
export class ThreadVisual {
  readonly mesh: Mesh;
  /** A small bead that travels along the thread: the pair is one system, always in touch. */
  private readonly bead: Mesh;
  private curve: QuadraticBezierCurve3 | null = null;
  private phase = Math.random();
  private readonly mat = new MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(1.3), toneMapped: false, transparent: true });
  private readonly a = new Vector3(Infinity, 0, 0);
  private readonly b = new Vector3();
  private readonly mid = new Vector3();

  constructor() {
    this.mesh = new Mesh(new BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.bead = new Mesh(sphereGeo, this.mat);
    this.bead.scale.setScalar(0.0028);
    this.mesh.add(this.bead);
  }

  /** Move the bead; call every frame. */
  update(dt: number, strength: number): void {
    this.bead.visible = this.mesh.visible && !!this.curve && strength > 0.5;
    if (!this.bead.visible) return;
    this.phase = (this.phase + dt * 0.45) % 1;
    // there and back, easing at the ends
    const u = 0.5 - 0.5 * Math.cos(this.phase * Math.PI * 2);
    this.curve!.getPoint(u, this.bead.position);
  }

  /** Endpoints in the mesh's parent space; strength 0..1. */
  set(from: Vector3, to: Vector3, strength: number): void {
    this.mesh.visible = strength > 0.01;
    if (!this.mesh.visible) return;
    this.mat.opacity = Math.min(1, 0.25 + strength);
    if (from.distanceTo(this.a) < 0.0005 && to.distanceTo(this.b) < 0.0005) return;
    this.a.copy(from);
    this.b.copy(to);
    this.mid.copy(from).lerp(to, 0.5);
    this.mid.y -= from.distanceTo(to) * 0.12;
    const curve = new QuadraticBezierCurve3(this.a.clone(), this.mid.clone(), this.b.clone());
    this.curve = curve;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new TubeGeometry(curve, 40, 0.0009 + 0.0005 * strength, 6, false);
  }
}

/**
 * Gold ring around a group of qubits that share entanglement no single pair
 * carries (a GHZ state): each pair looks unentangled, but the group is not.
 */
export class GroupVisual {
  readonly mesh: Mesh;
  private readonly mat = new MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(1.1), toneMapped: false, transparent: true, opacity: 0.85 });
  private key = '';

  constructor() {
    this.mesh = new Mesh(new BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Orb centres (parent space) of the group; fewer than three hides the ring. */
  set(points: Vector3[]): void {
    this.mesh.visible = points.length >= 3;
    if (!this.mesh.visible) return;
    const key = points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`).join('|');
    if (key === this.key) return;
    this.key = key;
    // a loop just below the orb centres, bulging outward
    const c = points.reduce((a, p) => a.add(p), new Vector3()).divideScalar(points.length);
    const ring = points.map((p) => p.clone().sub(c).multiplyScalar(1.12).add(c).setY(p.y - ORB_RADIUS * 0.9));
    const curve = new CatmullRomCurve3(ring, true, 'centripetal');
    this.mesh.geometry.dispose();
    this.mesh.geometry = new TubeGeometry(curve, 120, 0.0011, 6, true);
  }
}

/**
 * The Storm's lightning: a jagged bolt from above onto one orb, gone in a
 * third of a second. Redrawn with a new shape every strike.
 */
export class StrikeVisual {
  readonly mesh: Line;
  private readonly mat = new LineBasicMaterial({ color: '#e8f0ff', transparent: true, opacity: 0, depthWrite: false });
  private t = 0;

  constructor() {
    this.mesh = new Line(new BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
  }

  /** `at` is the orb centre in the mesh's parent space. */
  strike(at: Vector3): void {
    const pts: number[] = [];
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const jitter = i === 0 || i === steps ? 0 : (Math.random() - 0.5) * 0.045 * (1 - u * 0.6);
      pts.push(at.x + jitter, at.y + ORB_RADIUS * 0.9 + (1 - u) * 0.38, at.z + (Math.random() - 0.5) * 0.02 * (1 - u));
    }
    this.mesh.geometry.dispose();
    this.mesh.geometry = new BufferGeometry();
    this.mesh.geometry.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    this.mesh.visible = true;
    this.t = 1;
  }

  update(dt: number): void {
    if (this.t <= 0) return;
    this.t = Math.max(0, this.t - dt * 3);
    // two quick flickers, then fade
    const flicker = this.t > 0.75 ? 1 : this.t > 0.6 ? 0.25 : this.t;
    this.mat.opacity = flicker;
    this.mesh.visible = this.t > 0;
  }
}
