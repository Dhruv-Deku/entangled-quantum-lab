import { CatmullRomCurve3, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, TorusGeometry, Vector3 } from '@iwsdk/core';
import { LabelCard } from './machine-kit';
import { GLOW } from './visuals';

const FLY = 1.4;
const A = new Vector3(-0.18, 0, -0.063);
const B = new Vector3(0.18, 0, -0.063);

/**
 * Teleportation booths: a sending pad under q0 and a receiving pad under q2.
 * After the Bell measurement two ordinary bits fly across from one booth to
 * the other (the only thing that travels); when q2 has been fixed with them,
 * a column of light rises from the receiving pad.
 */
export class Teleporter {
  readonly root = new Group();
  private readonly bits: LabelCard[] = [];
  private readonly arc = new CatmullRomCurve3([A.clone().setY(0.03), new Vector3(0, 0.3, -0.08), B.clone().setY(0.03)]);
  private readonly beamMat: MeshBasicMaterial;
  private t = -1;
  private beam = 0;

  constructor() {
    this.root.name = 'Teleporter';
    const pad = new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.35, metalness: 0.7 });
    const ring = new MeshStandardMaterial({ color: '#3ddc97', emissive: '#3ddc97', emissiveIntensity: 0.7, roughness: 0.3 });
    for (const [at, title, sub] of [[A, 'Sender', 'q0 holds the message'], [B, 'Receiver', 'q2 will get it']] as const) {
      const disc = new Mesh(new CylinderGeometry(0.07, 0.075, 0.008, 40), pad);
      disc.position.copy(at).setY(0.004);
      const glow = new Mesh(new TorusGeometry(0.064, 0.0025, 8, 48), ring);
      glow.rotation.x = Math.PI / 2;
      glow.position.copy(at).setY(0.009);
      const card = new LabelCard(0.12, title, sub);
      card.mesh.position.copy(at).add(new Vector3(0, 0.03, 0.1));
      card.mesh.rotation.x = -0.6;
      this.root.add(disc, glow, card.mesh);
    }
    for (let i = 0; i < 2; i++) {
      const c = new LabelCard(0.05, '0', '');
      c.mesh.visible = false;
      this.root.add(c.mesh);
      this.bits.push(c);
    }
    this.beamMat = new MeshBasicMaterial({ color: '#8fb7ff', transparent: true, opacity: 0, depthWrite: false, ...GLOW, toneMapped: false });
    const beam = new Mesh(new CylinderGeometry(0.06, 0.06, 0.32, 32, 1, true), this.beamMat);
    beam.position.copy(B).setY(0.16);
    this.root.add(beam);
    this.root.visible = false;
  }

  /** The two measured bits take off from the sender. */
  sendBits(m0: number, m1: number): void {
    this.bits[0].set(`${m0}`, '');
    this.bits[1].set(`${m1}`, '');
    this.t = 0;
  }

  get arrived(): boolean {
    return this.t >= FLY + 0.3;
  }

  /** Light rises on the receiving pad. */
  arrive(): void {
    this.beam = 1;
  }

  reset(): void {
    this.t = -1;
    this.beam = 0;
    for (const b of this.bits) b.mesh.visible = false;
  }

  update(dt: number): void {
    if (this.t >= 0) {
      this.t += dt;
      this.bits.forEach((b, i) => {
        const u = Math.min(1, Math.max(0, (this.t - i * 0.25) / FLY));
        b.mesh.visible = u > 0 && u < 1;
        this.arc.getPointAt(u, b.mesh.position);
        b.mesh.position.x += (i - 0.5) * 0.03;
      });
    }
    this.beam = Math.max(0, this.beam - dt * 0.5);
    this.beamMat.opacity = 0.35 * this.beam;
  }
}
