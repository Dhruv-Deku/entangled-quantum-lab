import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Pulse } from '../quantum/pulses';
import { MINT, qubitColor, textTexture } from './visuals';

/** Cooling stages, top to bottom: radius (m) and temperature. */
const STAGES: { r: number; label: string }[] = [
  { r: 0.074, label: '50 K' },
  { r: 0.066, label: '4 K' },
  { r: 0.058, label: '800 mK' },
  { r: 0.05, label: '100 mK' },
  { r: 0.044, label: '15 mK' },
];
const TOP = 0.34;
const GAP = 0.064;
/** Seconds a pulse takes to travel from the top flange to the chip. */
const TRAVEL = 0.7;
const MAX_BEADS = 48;

interface Bead {
  line: number;
  /** 0 = top, 1 = chip; readout beads travel back up. */
  t: number;
  up: boolean;
  color: Color;
}

/**
 * A dilution refrigerator, the "chandelier" a superconducting chip lives in:
 * five copper cooling stages from 50 K down to 15 mK on steel rods, a coaxial
 * line per qubit coiling down to the chip package at the bottom, and a status
 * light on the top flange (blue: ready, mint: the run finished). During a run,
 * each drive pulse travels down its qubit's line as a bead of that qubit's
 * colour, and readout tones travel back up in white.
 */
export class FridgeVisual {
  readonly root = new Group();
  private lines: CatmullRomCurve3[] = [];
  private beads: Bead[] = [];
  private beadMesh: InstancedMesh;
  private pending: { at: number; bead: Bead }[] = [];
  private clock = 0;
  private led: MeshBasicMaterial;
  private ledTimer = 0;
  /** physical -> logical qubit (-1: unused), for colouring lines and pulses. */
  private holder: number[] = [];
  private bands: MeshStandardMaterial[] = [];
  private readonly m = new Matrix4();
  private readonly v = new Vector3();

  constructor(readonly qubits: number) {
    this.root.name = 'Fridge';
    const copper = new MeshStandardMaterial({ color: '#b87346', roughness: 0.32, metalness: 0.9 });
    const steel = new MeshStandardMaterial({ color: '#9aa0a8', roughness: 0.35, metalness: 0.85 });
    const dark = new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.5, metalness: 0.6 });

    // top flange, darker steel, with the status light
    const flange = new Mesh(new CylinderGeometry(0.084, 0.084, 0.012, 48), dark);
    flange.position.y = TOP + 0.022;
    this.root.add(flange);
    this.led = new MeshBasicMaterial({ color: '#2d7ff9' });
    const led = new Mesh(new SphereGeometry(0.0035, 12, 8), this.led);
    led.position.set(0, TOP + 0.029, 0.07);
    this.root.add(led);

    STAGES.forEach((s, i) => {
      const y = TOP - i * GAP;
      const plate = new Mesh(new CylinderGeometry(s.r, s.r, 0.006, 48), copper);
      plate.position.y = y;
      this.root.add(plate);
      // a bevel ring catches the light on each plate's rim
      const rim = new Mesh(new TorusGeometry(s.r, 0.0018, 8, 48), copper);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = y;
      this.root.add(rim);
      // rods down to the next plate
      if (i < STAGES.length - 1) {
        const rr = STAGES[i + 1].r * 0.82;
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + 0.5;
          const rod = new Mesh(new CylinderGeometry(0.0022, 0.0022, GAP, 10), steel);
          rod.position.set(Math.cos(a) * rr, y - GAP / 2, Math.sin(a) * rr);
          this.root.add(rod);
        }
      }
      // temperature, on the side facing the player
      const label = new Mesh(new PlaneGeometry(0.05, 0.01875), new MeshBasicMaterial({ map: textTexture([{ text: s.label, color: i === STAGES.length - 1 ? '#ffffff' : '#c9ccd1' }]), transparent: true, depthWrite: false }));
      label.position.set(s.r + 0.03, y, 0);
      this.root.add(label);
    });
    // the flange's tie to the first plate
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      const rod = new Mesh(new CylinderGeometry(0.0026, 0.0026, 0.022, 10), steel);
      rod.position.set(Math.cos(a) * 0.06, TOP + 0.011, Math.sin(a) * 0.06);
      this.root.add(rod);
    }

    // chip package under the last plate
    const bottom = TOP - (STAGES.length - 1) * GAP;
    const pkg = new Mesh(new BoxGeometry(0.03, 0.022, 0.03), copper);
    pkg.position.y = bottom - 0.022;
    this.root.add(pkg);
    const lid = new Mesh(new BoxGeometry(0.02, 0.0015, 0.02), dark);
    lid.position.set(0, bottom - 0.022, 0.0152);
    lid.rotation.x = Math.PI / 2;
    this.root.add(lid);
    const tag = new Mesh(new PlaneGeometry(0.03, 0.01125), new MeshBasicMaterial({ map: textTexture([{ text: 'T5', color: '#e4e6eb' }], 700), transparent: true, depthWrite: false }));
    tag.position.set(0, bottom - 0.022, 0.0165);
    this.root.add(tag);

    // a coaxial line per qubit, spiralling gently down to the package
    const coax = new MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.3, metalness: 0.9 });
    for (let q = 0; q < qubits; q++) {
      const a0 = (q / qubits) * Math.PI * 2 + 1.2;
      const pts: Vector3[] = [];
      for (let i = 0; i <= STAGES.length; i++) {
        const r = (i < STAGES.length ? STAGES[i].r : 0.02) * 0.62;
        const a = a0 + i * 0.35;
        pts.push(new Vector3(Math.cos(a) * r, TOP + 0.02 - i * GAP, Math.sin(a) * r));
      }
      pts.push(new Vector3(Math.cos(a0) * 0.012, bottom - 0.012, Math.sin(a0) * 0.012));
      const curve = new CatmullRomCurve3(pts);
      this.lines.push(curve);
      this.root.add(new Mesh(new TubeGeometry(curve, 64, 0.0012, 6), coax));
      // a coloured band at the top says which logical qubit the line drives
      const bandMat = new MeshStandardMaterial({ color: '#55585e', roughness: 0.5, metalness: 0.2 });
      this.bands.push(bandMat);
      const band = new Mesh(new CylinderGeometry(0.0024, 0.0024, 0.007, 10), bandMat);
      band.position.copy(pts[0]).add(new Vector3(0, -0.006, 0));
      this.root.add(band);
    }

    this.beadMesh = new InstancedMesh(new SphereGeometry(0.0048, 12, 8), new MeshBasicMaterial({ color: '#ffffff' }), MAX_BEADS);
    this.beadMesh.count = 0;
    this.root.add(this.beadMesh);
  }

  /** Colour each line's band by the logical qubit its physical qubit holds (holder[p] = logical or -1). */
  setHolders(holder: readonly number[]): void {
    this.holder = holder.slice();
    this.bands.forEach((m, p) => m.color.set(holder[p] >= 0 ? qubitColor(holder[p]) : '#55585e'));
  }

  /**
   * Send a run's pulses down the lines over `seconds`: drive and two-qubit
   * pulses go down in the line's qubit colour, readouts come back up in white.
   */
  play(pulses: readonly Pulse[], durationNs: number, seconds: number): void {
    this.beads = [];
    this.pending = [];
    this.clock = 0;
    const scale = durationNs > 0 ? (seconds - TRAVEL) / durationNs : 0;
    for (const p of pulses) {
      if (p.kind === 'virtual' || p.qubit >= this.lines.length) continue;
      const l = this.holder[p.qubit] ?? -1;
      const color = new Color(p.kind === 'readout' ? '#ffffff' : p.kind === 'cross' ? '#e2b04a' : l >= 0 ? qubitColor(l) : '#c9ccd1');
      this.pending.push({ at: Math.max(0, p.start * scale), bead: { line: p.qubit, t: p.kind === 'readout' ? 1 : 0, up: p.kind === 'readout', color } });
    }
    this.pending.sort((a, b) => a.at - b.at);
    this.led.color.set('#2d7ff9');
    this.ledTimer = seconds;
  }

  update(dt: number): void {
    this.clock += dt;
    while (this.pending.length && this.pending[0].at <= this.clock) {
      if (this.beads.length < MAX_BEADS) this.beads.push(this.pending.shift()!.bead);
      else this.pending.shift();
    }
    for (const b of this.beads) b.t += ((b.up ? -1 : 1) * dt) / TRAVEL;
    this.beads = this.beads.filter((b) => b.t >= 0 && b.t <= 1);
    this.beads.forEach((b, i) => {
      this.lines[b.line].getPointAt(Math.min(1, Math.max(0, b.t)), this.v);
      this.m.makeTranslation(this.v.x, this.v.y, this.v.z);
      this.beadMesh.setMatrixAt(i, this.m);
      this.beadMesh.setColorAt(i, b.color);
    });
    this.beadMesh.count = this.beads.length;
    this.beadMesh.instanceMatrix.needsUpdate = true;
    if (this.beadMesh.instanceColor) this.beadMesh.instanceColor.needsUpdate = true;
    // the light turns mint once the run is done, then back to blue
    if (this.ledTimer > 0) {
      this.ledTimer -= dt;
      if (this.ledTimer <= 0) {
        this.led.color.copy(MINT);
        this.ledTimer = -2.5;
      }
    } else if (this.ledTimer < 0) {
      this.ledTimer = Math.min(0, this.ledTimer + dt);
      if (this.ledTimer === 0) this.led.color.set('#2d7ff9');
    }
  }
}
