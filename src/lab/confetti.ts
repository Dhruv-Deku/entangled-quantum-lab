import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from '@iwsdk/core';
import { MINT, QUBIT_COLORS } from './visuals';

const MAX = 160;
const LIFE = 2.6;
const GRAVITY = -1.6;

interface Piece {
  p: Vector3;
  v: Vector3;
  spin: Vector3;
  rot: Quaternion;
  t: number;
  life: number;
  color: Color;
}

/**
 * A celebration: small flat pieces in the qubit colours and mint burst out of
 * the orbs, tumble, land and bounce on the desk, then shrink away. Fired when
 * a chapter, puzzle or daily is finished, a Rush best is set or an
 * achievement unlocks (a smaller burst).
 */
export class Confetti {
  readonly root = new Group();
  private readonly mesh: InstancedMesh;
  private pieces: Piece[] = [];
  private readonly m = new Matrix4();
  private readonly s = new Vector3();
  private readonly q = new Quaternion();

  constructor() {
    this.root.name = 'Confetti';
    this.mesh = new InstancedMesh(new BoxGeometry(0.012, 0.0016, 0.007), new MeshStandardMaterial({ roughness: 0.45, metalness: 0.2 }), MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new Color('#ffffff'));
    this.root.add(this.mesh);
    this.root.visible = false;
  }

  /** Burst from `at` (desk-local); big bursts throw more, higher. */
  burst(at: Vector3, big = true): void {
    const n = big ? 110 : 40;
    const palette = [...QUBIT_COLORS, `#${MINT.getHexString()}`, '#e4e6eb'];
    for (let i = 0; i < n && this.pieces.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2, up = (big ? 0.9 : 0.6) + Math.random() * 0.6, out = 0.15 + Math.random() * (big ? 0.35 : 0.2);
      this.pieces.push({
        p: at.clone().add(new Vector3((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06)),
        v: new Vector3(Math.cos(a) * out, up, Math.sin(a) * out),
        spin: new Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7),
        rot: new Quaternion().setFromAxisAngle(new Vector3(Math.random(), Math.random(), Math.random()).normalize(), Math.random() * 6),
        t: 0,
        life: LIFE * (0.75 + Math.random() * 0.5),
        color: new Color(palette[i % palette.length]),
      });
    }
    this.root.visible = true;
  }

  update(dt: number): void {
    if (!this.pieces.length) return;
    for (const c of this.pieces) {
      c.t += dt;
      c.v.y += GRAVITY * dt;
      // air drag: flat pieces flutter down
      c.v.multiplyScalar(1 - Math.min(0.9, dt * (c.v.y < 0 ? 2.2 : 0.6)));
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < 0.001) {
        // land on the desk: bounce a little, then lie flat and slide to a stop
        c.p.y = 0.001;
        c.v.y = Math.abs(c.v.y) > 0.2 ? -c.v.y * 0.3 : 0;
        c.v.x *= 0.6;
        c.v.z *= 0.6;
        c.spin.multiplyScalar(0.5);
      }
      this.q.setFromAxisAngle(this.s.copy(c.spin).normalize(), c.spin.length() * dt);
      if (c.p.y > 0.0011) c.rot.multiply(this.q);
    }
    this.pieces = this.pieces.filter((c) => c.t < c.life);
    this.pieces.forEach((c, i) => {
      const fade = Math.min(1, (c.life - c.t) / 0.5);
      this.m.compose(c.p, c.rot, this.s.setScalar(fade));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, c.color);
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = this.pieces.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!this.pieces.length) this.root.visible = false;
  }
}
