import { BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Points, PointsMaterial, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import type { MoleculeState } from '../quantum/molecule';
import { LabelCard } from './machine-kit';

/** Metres per angstrom. */
export const PER_ANGSTROM = 0.1;
const BOHR = 0.529177;
/** Slater exponent of hydrogen 1s in the molecule (minimal basis), per bohr. */
const ZETA = 1.24;
const CLOUD = 3600;

function dotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

/**
 * A hydrogen molecule you can pull apart: two protons, the electrons' cloud
 * (sampled from the bonding and antibonding orbitals in the proportions the
 * exact ground state uses), and, as the bond stretches, a gold thread: the
 * two electrons end up one on each atom with their spins in a Bell pair.
 * The right proton sits in a ring you can grab; the left one mirrors it.
 */
export class MoleculeVisual {
  readonly root = new Group();
  /** The right atom's grab handle; its x is half the bond length. */
  readonly handle: Mesh;
  private readonly left: Mesh;
  private readonly right: Mesh;
  private readonly thread: Mesh;
  private readonly threadMat: MeshBasicMaterial;
  private readonly bell = new LabelCard(0.16, 'Spins: a Bell pair', 'one electron on each atom');
  private readonly geo = new BufferGeometry();
  private readonly pos = new Float32Array(CLOUD * 3);
  private cloudFor = { r: -1, cHF: -1 };

  constructor() {
    this.root.name = 'Molecule';
    const proton = new SphereGeometry(0.0075, 20, 14);
    const mat = new MeshStandardMaterial({ color: '#f2f3f5', roughness: 0.3, metalness: 0.1 });
    this.left = new Mesh(proton, mat);
    this.right = new Mesh(proton, mat);
    this.root.add(this.left);
    // the handle: an invisible ball to grab, holding the right proton and a ring that says "pull me"
    this.handle = new Mesh(new SphereGeometry(0.035, 12, 8), new MeshBasicMaterial({ visible: false }));
    this.handle.name = 'MoleculeHandle';
    this.handle.add(this.right);
    const ring = new Mesh(new TorusGeometry(0.022, 0.0016, 8, 40), new MeshBasicMaterial({ color: '#8a8d93', transparent: true, opacity: 0.8 }));
    this.handle.add(ring);
    this.root.add(this.handle);
    this.threadMat = new MeshBasicMaterial({ color: '#e2b04a', transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    this.thread = new Mesh(new CylinderGeometry(0.0016, 0.0016, 1, 10).rotateZ(Math.PI / 2), this.threadMat);
    this.root.add(this.thread);
    this.bell.mesh.position.set(0, 0.1, 0);
    this.root.add(this.bell.mesh);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    const cloud = new Points(this.geo, new PointsMaterial({ size: 0.003, color: '#9fc0ff', map: dotTexture(), transparent: true, opacity: 0.75, depthWrite: false, alphaTest: 0.05 }));
    cloud.frustumCulled = false;
    this.root.add(cloud);
    this.root.visible = false;
  }

  /** Half the bond length the handle shows now, in angstroms. */
  get handleHalf(): number {
    return this.handle.position.x / PER_ANGSTROM;
  }

  /** Put the atoms at bond length r (angstroms); `moveHandle` false while a hand holds it. */
  set(m: MoleculeState, rng: () => number, moveHandle = true): void {
    const half = (m.r / 2) * PER_ANGSTROM;
    if (moveHandle) this.handle.position.set(half, 0, 0);
    this.left.position.set(-half, 0, 0);
    this.thread.scale.set(m.r * PER_ANGSTROM, 1, 1);
    // the thread and its label come in as the electrons pair up across the gap
    const bell = Math.max(0, Math.min(1, (m.covalent - 0.66) / 0.3));
    this.threadMat.opacity = bell;
    this.thread.visible = bell > 0.02;
    (this.bell.mesh.material as MeshBasicMaterial).opacity = bell;
    this.bell.mesh.visible = bell > 0.05;
    // re-drawing the cloud is the costly part: only when the bond has moved enough to see
    if (Math.abs(m.r - this.cloudFor.r) > 0.025 || Math.abs(m.cHF - this.cloudFor.cHF) > 0.015) {
      this.cloudFor = { r: m.r, cHF: m.cHF };
      this.sampleCloud(m, rng);
    }
  }

  /** Electron positions: bonding orbital with weight cHF^2, antibonding with cD^2, each by rejection from the two atoms' 1s. */
  private sampleCloud(m: MoleculeState, rng: () => number): void {
    const R = m.r / BOHR;
    const s = BOHR * PER_ANGSTROM;
    const pBond = m.cHF * m.cHF;
    const a1s = (d: number) => Math.exp(-ZETA * d);
    for (let i = 0; i < CLOUD; i++) {
      const bonding = rng() < pBond;
      let x = 0, y = 0, z = 0;
      for (let tries = 0; tries < 60; tries++) {
        // a point from one atom's 1s: radius by Gamma(3), direction uniform
        const r = -(Math.log(1 - rng()) + Math.log(1 - rng()) + Math.log(1 - rng())) / (2 * ZETA);
        const cz = 2 * rng() - 1, ang = 2 * Math.PI * rng(), sq = Math.sqrt(1 - cz * cz);
        const cx = (rng() < 0.5 ? -R : R) / 2;
        x = cx + r * sq * Math.cos(ang);
        y = r * sq * Math.sin(ang);
        z = r * cz;
        const a = a1s(Math.hypot(x + R / 2, y, z)), b = a1s(Math.hypot(x - R / 2, y, z));
        const num = bonding ? (a + b) ** 2 : (a - b) ** 2;
        if (rng() * 2 * (a * a + b * b) <= num) break;
      }
      this.pos[i * 3] = x * s;
      this.pos[i * 3 + 1] = y * s;
      this.pos[i * 3 + 2] = z * s;
    }
    this.geo.getAttribute('position').needsUpdate = true;
  }
}
