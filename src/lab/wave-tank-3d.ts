import { BoxGeometry, CanvasTexture, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, ShaderMaterial, SRGBColorSpace, TorusGeometry, Vector2 } from '@iwsdk/core';

/** The tank, in metres: x across, z away from you. */
export const TANK_W = 0.46;
export const TANK_D = 0.32;
export const MAX_SOURCES = 10;
/** The detector screen runs along the far edge. */
export const SCREEN_Z = -TANK_D / 2;
const SCREEN_H = 0.075;

const vertex = /* glsl */ `
uniform vec2 uSrc[${MAX_SOURCES}];
uniform int uCount;
uniform float uK;
uniform float uPhase;
uniform float uLift;
varying float vRe;
varying float vInt;
varying vec2 vXZ;
void main() {
  vec2 xz = vec2(position.x, position.z);
  float re = 0.0, im = 0.0, sr = 0.0, si = 0.0;
  for (int i = 0; i < ${MAX_SOURCES}; i++) {
    if (i >= uCount) break;
    float r = length(xz - uSrc[i]);
    float a = 1.0 / sqrt(r + 0.004);
    // the wave now (for the ripples), and its time-free part (for the brightness)
    re += a * cos(uK * r - uPhase);
    sr += a * cos(uK * r);
    si += a * sin(uK * r);
  }
  float norm = max(1.0, float(uCount));
  vRe = re / (norm * 4.0);
  vInt = (sr * sr + si * si) / (norm * norm * 16.0);
  vXZ = xz;
  vec3 p = position;
  p.y += vRe * uLift;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const fragment = /* glsl */ `
uniform vec2 uHalf;
varying float vRe;
varying float vInt;
varying vec2 vXZ;
void main() {
  vec3 deep = vec3(0.07, 0.09, 0.13);
  vec3 crest = vec3(0.50, 0.68, 0.98);
  vec3 c = mix(deep, crest, clamp(0.5 + vRe * 1.6, 0.0, 1.0));
  // where the waves add up (bright fringes) the water glows a little
  c += vec3(0.18, 0.32, 0.62) * clamp(vInt * 1.4, 0.0, 1.0);
  // soft edges
  vec2 e = uHalf - abs(vXZ);
  float edge = clamp(min(e.x, e.y) / 0.012, 0.0, 1.0);
  gl_FragColor = vec4(c, 0.92 * edge);
}`;

/**
 * Wave hands: a shallow tank of quantum waves on the desk. Every source (a
 * fingertip dipped in, or the posts when no hands are tracked) sends out
 * circular waves; where they meet they add or cancel, drawn live on the
 * GPU. The far wall is a detector screen: its glow is |psi|^2 there, and
 * photons fired at it land one at a time, building the fringes.
 */
export class WaveTankVisual {
  readonly root = new Group();
  private readonly mat: ShaderMaterial;
  private readonly rings: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private phase = 0;
  private omega = 7;

  constructor() {
    this.root.name = 'WaveTank';
    const geo = new PlaneGeometry(TANK_W, TANK_D, 220, 150).rotateX(-Math.PI / 2);
    this.mat = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      uniforms: {
        uSrc: { value: Array.from({ length: MAX_SOURCES }, () => new Vector2()) },
        uCount: { value: 0 },
        uK: { value: (2 * Math.PI) / 0.024 },
        uPhase: { value: 0 },
        uLift: { value: 0.006 },
        uHalf: { value: new Vector2(TANK_W / 2, TANK_D / 2) },
      },
    });
    const water = new Mesh(geo, this.mat);
    water.position.y = 0.022;
    water.frustumCulled = false;
    this.root.add(water);
    // the tank itself: a dark tray with a lip
    const tray = new Mesh(new BoxGeometry(TANK_W + 0.02, 0.018, TANK_D + 0.02), new MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.5, metalness: 0.2 }));
    tray.position.y = 0.009;
    this.root.add(tray);
    // where each source touches the water
    this.rings = new InstancedMesh(new TorusGeometry(0.007, 0.0012, 8, 24).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: '#f2f3f5', toneMapped: false }), MAX_SOURCES);
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    this.root.add(this.rings);
    // the detector screen along the far edge
    this.canvas.width = 1024;
    this.canvas.height = 168;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    const screen = new Mesh(new PlaneGeometry(TANK_W, SCREEN_H), new MeshBasicMaterial({ map: this.tex, transparent: true, side: DoubleSide }));
    screen.position.set(0, 0.022 + SCREEN_H / 2, SCREEN_Z - 0.004);
    this.root.add(screen);
    this.root.visible = false;
  }

  /** Sources in tank coordinates (x, z), and the wavelength in metres. */
  setSources(src: readonly [number, number][], wavelength: number): void {
    const u = this.mat.uniforms;
    const n = Math.min(MAX_SOURCES, src.length);
    for (let i = 0; i < n; i++) (u.uSrc.value as Vector2[])[i].set(src[i][0], src[i][1]);
    u.uCount.value = n;
    u.uK.value = (2 * Math.PI) / wavelength;
    this.rings.count = n;
    for (let i = 0; i < n; i++) {
      this.m.makeTranslation(src[i][0], 0.024, src[i][1]);
      this.rings.setMatrixAt(i, this.m);
    }
    this.rings.instanceMatrix.needsUpdate = true;
  }

  /** The screen: the expected intensity across it (0..1 scaled) and the photons counted in each bin so far. */
  drawScreen(intensity: readonly number[], hits: readonly number[]): void {
    const g = this.canvas.getContext('2d')!;
    const W = this.canvas.width, H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(20,21,24,0.92)';
    g.fillRect(0, 0, W, H);
    const max = Math.max(1e-9, ...intensity);
    const bw = W / intensity.length;
    // the glow: where the waves say the photons go
    intensity.forEach((v, i) => {
      const a = Math.min(1, v / max);
      g.fillStyle = `rgba(127,169,245,${0.08 + 0.55 * a})`;
      g.fillRect(i * bw, 0, bw + 0.5, H);
    });
    // the photons that came: a white tally from the bottom
    const hmax = Math.max(8, ...hits);
    g.fillStyle = '#f2f3f5';
    hits.forEach((c, i) => {
      if (!c) return;
      const h = (c / hmax) * (H - 16);
      g.fillRect(i * bw + 1, H - h, Math.max(1, bw - 2), h);
    });
    this.tex.needsUpdate = true;
  }

  update(dt: number): void {
    this.phase = (this.phase + dt * this.omega) % (Math.PI * 2);
    this.mat.uniforms.uPhase.value = this.phase;
  }
}
