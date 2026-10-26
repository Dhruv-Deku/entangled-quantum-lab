import { Group, Mesh, MeshStandardMaterial, OctahedronGeometry, Quaternion, Vector3 } from '@iwsdk/core';
import { LabelCard } from './machine-kit';

/**
 * Quantum dice: an eight-sided die tumbles above the desk while three qubits
 * in superposition are measured, and lands on the number they give (1 to 8).
 * The randomness is the Born rule on the orbs, not Math.random.
 */
export class DiceVisual {
  readonly root = new Group();
  private readonly die: Mesh;
  private readonly card = new LabelCard(0.18, '', '');
  private t = -1;
  private result: number | null = null;
  private readonly spin = new Vector3(5, 7, 3);
  private readonly q = new Quaternion();
  private readonly rest = new Quaternion();

  constructor() {
    this.root.name = 'QuantumDice';
    this.die = new Mesh(new OctahedronGeometry(0.045, 0), new MeshStandardMaterial({ color: '#e8ecf2', roughness: 0.15, metalness: 0.1, flatShading: true }));
    this.root.add(this.die);
    this.card.mesh.position.set(0, 0.13, 0);
    this.root.add(this.card.mesh);
    this.root.visible = false;
  }

  /** Throw the die; `land` puts it on a number once the measurement is in. */
  roll(): void {
    this.t = 0;
    this.result = null;
    this.card.set('Rolling...', 'three qubits, half and half each');
    this.root.visible = true;
    this.spin.set(Math.random() * 8 + 4, Math.random() * 8 + 4, Math.random() * 6 + 2);
  }

  land(value: number, bits: string): void {
    this.result = value;
    this.card.set(`${value}`, `measured |${bits}>: 1 in 8, by the Born rule`);
  }

  hide(): void {
    this.root.visible = false;
    this.t = -1;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const air = this.result === null || this.t < 1.1;
    // hops while tumbling, then settles point-up
    const h = air ? 0.05 + Math.abs(Math.sin(this.t * 5)) * 0.07 * Math.max(0.2, 1 - this.t / 1.6) : 0.045;
    this.die.position.y += (h - this.die.position.y) * Math.min(1, dt * 12);
    if (air) {
      this.q.setFromAxisAngle(this.spin.clone().normalize(), this.spin.length() * dt);
      this.die.quaternion.multiply(this.q);
    } else this.die.quaternion.slerp(this.rest, Math.min(1, dt * 6));
  }
}
