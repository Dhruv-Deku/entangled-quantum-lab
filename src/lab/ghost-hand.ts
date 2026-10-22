import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import type { JointPositions } from '../gestures/hand';

/** Bones as joint index pairs (WebXR hand order): thumb, four fingers, and the knuckle line. */
const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  ...[5, 10, 15, 20].flatMap((b): [number, number][] => [[0, b], [b, b + 1], [b + 1, b + 2], [b + 2, b + 3], [b + 3, b + 4]]),
  [6, 11], [11, 16], [16, 21], [2, 6],
];
const TIPS = new Set([4, 9, 14, 19, 24]);

/** Fresnel shell: bright edges, see-through middle. Reads as a hint, not a hand you own. */
const ghostMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  uniforms: { uColor: { value: new Color('#dfe9ff') }, uOpacity: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec3 vN; varying vec3 vV;
    void main() {
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uOpacity;
    varying vec3 vN; varying vec3 vV;
    void main() {
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
      float a = (0.12 + 0.88 * f) * uOpacity;
      gl_FragColor = vec4(uColor * a, a);
    }`,
});

const jointGeo = new SphereGeometry(1, 14, 10);
const boneGeo = new CylinderGeometry(1, 1, 1, 10, 1, true);
const Y = new Vector3(0, 1, 0);

/**
 * A translucent hand that demonstrates a gesture. It takes the same 25 joint
 * positions the gesture tracker reads, so a demo can never show a pose the
 * tracker would not recognise.
 */
export class GhostHand {
  readonly root = new Group();
  private readonly joints: InstancedMesh;
  private readonly bones: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly s = new Vector3();

  constructor() {
    this.joints = new InstancedMesh(jointGeo, ghostMat, 25);
    this.bones = new InstancedMesh(boneGeo, ghostMat, BONES.length);
    for (const mesh of [this.joints, this.bones]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      (mesh as unknown as { pointerEvents: string }).pointerEvents = 'none';
    }
    this.root.add(this.bones, this.joints);
    this.root.visible = false;
  }

  /** Shared by every ghost hand, so two-handed demos fade together. */
  static set opacity(v: number) {
    ghostMat.uniforms.uOpacity.value = v;
  }

  /** Joint positions in this hand's root space. */
  setPose(p: JointPositions): void {
    for (let i = 0; i < 25; i++) {
      const r = TIPS.has(i) ? 0.0065 : i === 0 ? 0.012 : 0.0085;
      this.m.makeScale(r, r, r).setPosition(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      this.joints.setMatrixAt(i, this.m);
    }
    BONES.forEach(([i, j], k) => {
      this.a.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      this.b.set(p[j * 3], p[j * 3 + 1], p[j * 3 + 2]);
      const len = this.a.distanceTo(this.b);
      const r = i === 0 ? 0.0055 : 0.0068;
      this.q.setFromUnitVectors(Y, this.b.clone().sub(this.a).divideScalar(Math.max(len, 1e-6)));
      this.s.set(r, len, r);
      this.m.compose(this.a.add(this.b).multiplyScalar(0.5), this.q, this.s);
      this.bones.setMatrixAt(k, this.m);
    });
    this.joints.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
  }
}
