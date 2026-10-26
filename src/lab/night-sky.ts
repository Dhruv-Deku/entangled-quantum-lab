import { BackSide, BufferAttribute, BufferGeometry, CylinderGeometry, Group, Mesh, Points, PointsMaterial, ShaderMaterial, SphereGeometry } from '@iwsdk/core';
import { GLOW } from './visuals';

const STARS = 2600;

/**
 * Night sky: the room gives way to a deep blue dome full of stars, with a
 * slow aurora drifting low over the horizon. A calm place to think about
 * qubits; the lab and its panels stay exactly where they are.
 */
export class NightSky {
  readonly root = new Group();
  private readonly aurora: ShaderMaterial;
  private readonly starMat: PointsMaterial;
  private t = 0;

  constructor() {
    this.root.name = 'NightSky';
    const dome = new Mesh(
      new SphereGeometry(30, 48, 24),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        vertexShader: /* glsl */ `varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `varying vec3 vP;
          void main() {
            float h = normalize(vP).y;
            vec3 top = vec3(0.012, 0.018, 0.05), mid = vec3(0.03, 0.05, 0.12), low = vec3(0.07, 0.06, 0.14);
            vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.7, h)) : mix(mid, low * 0.5, smoothstep(0.0, -0.4, h));
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    dome.renderOrder = -10;
    this.root.add(dome);
    // stars on the upper sky, a few brighter ones
    const pos = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.02, r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 28, y * 28, Math.sin(a) * r * 28], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    this.starMat = new PointsMaterial({ color: '#e8eeff', size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
    this.root.add(new Points(g, this.starMat));
    // the aurora: a soft curtain over part of the horizon, rippling slowly
    this.aurora = new ShaderMaterial({
      ...GLOW,
      transparent: true,
      depthWrite: false,
      side: BackSide,
      uniforms: { uT: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `varying vec2 vUv; uniform float uT;
        void main() {
          float wave = 0.5 + 0.5 * sin(vUv.x * 18.0 + uT * 0.4 + sin(vUv.x * 5.0 - uT * 0.25) * 2.0);
          float fall = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
          float edge = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
          vec3 c = mix(vec3(0.24, 0.86, 0.6), vec3(0.45, 0.4, 0.95), vUv.y);
          gl_FragColor = vec4(c, 0.32 * wave * fall * edge);
        }`,
    });
    const curtain = new Mesh(new CylinderGeometry(24, 24, 9, 96, 1, true, -0.9, 2.2), this.aurora);
    curtain.position.y = 9;
    curtain.renderOrder = -9;
    this.root.add(curtain);
    this.root.visible = false;
  }

  update(dt: number): void {
    this.t += dt;
    this.aurora.uniforms.uT.value = this.t;
    this.starMat.opacity = 0.82 + 0.08 * Math.sin(this.t * 0.7);
  }
}
