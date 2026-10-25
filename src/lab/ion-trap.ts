import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Op } from '../quantum/circuit';
import { GOLD, qubitColor, textTexture } from './visuals';

/** Metres between ions along the chain. */
const SPACING = 0.022;
/** Height of the trap axis above the mount. */
const AXIS = 0.05;
const LENGTH = 0.17;
/** Seconds per op when a run plays back. */
const STEP = 0.24;
/** Half the distance between opposite rods; the beams come in from the front, tilted down from above. */
const ROD = 0.016;
const TILT = 0.5;
const WHITE = new Color('#ffffff');

/** A soft round glow (one texture for every ion). */
function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

interface Ion {
  body: Mesh;
  mat: MeshBasicMaterial;
  halo: Sprite;
  haloMat: SpriteMaterial;
  beam: Mesh;
  beamMat: MeshBasicMaterial;
  label: Mesh;
  /** 0..1: a laser is on it (single-qubit gate), or the readout beam. */
  flash: number;
  gold: boolean;
  read: number;
}

/**
 * A linear Paul trap, the heart of a trapped-ion quantum computer: four gold
 * rods carry the radio-frequency field that holds a chain of ions in a line,
 * two needle endcaps keep them from drifting out, and a lens above images their
 * glow. Each ion is a qubit in its qubit's colour. During a run a laser beam
 * lights each ion a gate addresses; a two-qubit (Molmer-Sorensen) gate lights
 * both in gold and sets the whole chain swaying, because the ions talk through
 * their shared motion; readout makes them fluoresce.
 */
export class IonTrapVisual {
  readonly root = new Group();
  private ions: Ion[] = [];
  private queue: Op[] = [];
  private timer = 0;
  /** Chain sway after a two-qubit gate: amplitude and phase. */
  private sway = 0;
  private swayPhase = 0;
  private readonly chain = new Group();
  private readonly glow = glowTexture();

  constructor() {
    this.root.name = 'IonTrap';
    const gold = new MeshStandardMaterial({ color: '#d4a64a', roughness: 0.28, metalness: 0.95 });
    const steel = new MeshStandardMaterial({ color: '#a7adb5', roughness: 0.3, metalness: 0.9 });
    const ceramic = new MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.6, metalness: 0.05 });
    const dark = new MeshStandardMaterial({ color: '#25272b', roughness: 0.55, metalness: 0.4 });

    // the mount, and ceramic posts holding the rods at each end
    const base = new Mesh(new BoxGeometry(LENGTH + 0.03, 0.006, 0.07), dark);
    base.position.y = 0.003;
    this.root.add(base);
    for (const sx of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.008, AXIS + 0.02, 0.05), ceramic);
      post.position.set(sx * (LENGTH / 2 - 0.004), (AXIS + 0.02) / 2 + 0.006, 0);
      this.root.add(post);
    }
    // four rods around the axis, seen end-on as the corners of a square
    const rodGeo = new CylinderGeometry(0.0028, 0.0028, LENGTH, 20);
    rodGeo.rotateZ(Math.PI / 2);
    for (const [dy, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const rod = new Mesh(rodGeo, gold);
      rod.position.set(0, AXIS + dy * ROD, dz * ROD);
      this.root.add(rod);
    }
    // needle endcaps on the axis
    const capGeo = new CylinderGeometry(0.0006, 0.0028, 0.02, 16);
    for (const sx of [-1, 1]) {
      const cap = new Mesh(capGeo, steel);
      cap.rotation.z = (sx * Math.PI) / 2;
      cap.position.set(sx * (LENGTH / 2 - 0.016), AXIS, 0);
      this.root.add(cap);
    }
    // the imaging lens above the ions
    const lens = new Mesh(new CylinderGeometry(0.013, 0.016, 0.026, 32), dark);
    lens.position.set(0, AXIS + 0.058, 0);
    this.root.add(lens);
    const glass = new Mesh(new CylinderGeometry(0.012, 0.012, 0.002, 32), new MeshStandardMaterial({ color: '#6f8fb8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55 }));
    glass.position.set(0, AXIS + 0.044, 0);
    this.root.add(glass);
    const ring = new Mesh(new TorusGeometry(0.0145, 0.0012, 8, 32), steel);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, AXIS + 0.07, 0);
    this.root.add(ring);
    this.root.add(this.chain);

    const caption = new Mesh(new PlaneGeometry(0.06, 0.0225), new MeshBasicMaterial({ map: textTexture([{ text: 'Ion trap', color: '#8a8d93' }], 500), transparent: true, depthWrite: false }));
    caption.rotation.x = -Math.PI / 2;
    caption.position.set(-LENGTH / 2 + 0.02, 0.0062, 0.028);
    this.root.add(caption);
    this.setQubits(3);
  }

  /** One ion per qubit, centred on the trap. */
  setQubits(n: number): void {
    if (n === this.ions.length) return;
    for (const ion of this.ions) {
      this.chain.remove(ion.body, ion.halo, ion.beam);
      this.root.remove(ion.label);
    }
    this.ions = [];
    const beamGeo = new CylinderGeometry(0.0011, 0.0011, 0.07, 8);
    beamGeo.rotateX(Math.PI / 2);
    for (let q = 0; q < n; q++) {
      const x = (q - (n - 1) / 2) * SPACING;
      const mat = new MeshBasicMaterial({ color: qubitColor(q) });
      const body = new Mesh(new SphereGeometry(0.0034, 16, 12), mat);
      body.position.set(x, AXIS, 0);
      const haloMat = new SpriteMaterial({ map: this.glow, color: qubitColor(q), transparent: true, opacity: 0.5, depthWrite: false, blending: AdditiveBlending });
      const halo = new Sprite(haloMat);
      halo.scale.setScalar(0.024);
      halo.position.copy(body.position);
      // a laser comes in from the front, one per ion
      const beamMat = new MeshBasicMaterial({ color: qubitColor(q), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
      const beam = new Mesh(beamGeo, beamMat);
      beam.rotation.x = -TILT;
      beam.position.set(x, AXIS + Math.sin(TILT) * 0.035, Math.cos(TILT) * 0.035);
      const label = new Mesh(new PlaneGeometry(0.014, 0.00525), new MeshBasicMaterial({ map: textTexture([{ text: `q${q}`, color: qubitColor(q) }], 700), transparent: true, depthWrite: false }));
      label.rotation.x = -Math.PI / 2;
      label.position.set(x, 0.0062, 0.02);
      this.chain.add(body, halo, beam);
      this.root.add(label);
      this.ions.push({ body, mat, halo, haloMat, beam, beamMat, label, flash: 0, gold: false, read: 0 });
    }
  }

  /** Play a run: one op every STEP seconds (ion i is qubit i: no routing on an all-to-all machine). */
  play(ops: readonly Op[]): void {
    this.queue = ops.slice();
    this.timer = 0;
  }

  get playing(): boolean {
    return this.queue.length > 0;
  }

  private fire(op: Op): void {
    if (op.kind === 'measure' || op.kind === 'reset') {
      const ion = this.ions[op.qubit];
      if (ion) ion.read = 1;
      return;
    }
    const qs = op.kind === 'gate' ? [...(op.controls ?? []), op.target] : op.kind === 'swap' || op.kind === 'iswap' ? [op.a, op.b] : [];
    for (const q of qs) {
      const ion = this.ions[q];
      if (!ion) continue;
      ion.flash = 1;
      ion.gold = qs.length > 1;
    }
    if (qs.length > 1) this.sway = 1;
  }

  update(dt: number): void {
    if (this.queue.length) {
      this.timer += dt;
      while (this.queue.length && this.timer >= STEP) {
        this.timer -= STEP;
        this.fire(this.queue.shift()!);
      }
    }
    // the chain sways in its centre-of-mass mode after a two-qubit gate
    this.swayPhase += dt * 14;
    this.sway = Math.max(0, this.sway - dt * 0.9);
    const shift = Math.sin(this.swayPhase) * this.sway * 0.0022;
    const c = new Color();
    this.ions.forEach((ion, q) => {
      ion.flash = Math.max(0, ion.flash - dt * 1.5);
      ion.read = Math.max(0, ion.read - dt * 1.1);
      const n = this.ions.length;
      const x = (q - (n - 1) / 2) * SPACING + shift;
      ion.body.position.x = x;
      ion.halo.position.x = x;
      ion.beam.position.x = x;
      c.set(qubitColor(q)).lerp(WHITE, Math.max(0.25, ion.read, ion.flash * 0.5));
      ion.mat.color.copy(c);
      ion.haloMat.color.copy(c);
      ion.haloMat.opacity = 0.65 + 0.35 * Math.max(ion.flash, ion.read);
      ion.halo.scale.setScalar(0.024 * (1 + 0.8 * ion.read));
      ion.beamMat.color.copy(ion.gold ? GOLD : new Color(qubitColor(q)));
      ion.beamMat.opacity = 0.85 * ion.flash;
    });
  }
}

/**
 * The machine around the trap: a steel ultra-high-vacuum chamber on a stand,
 * with viewports on every side and a violet laser coming in through one.
 */
export class IonChamberVisual {
  readonly root = new Group();
  private readonly beamMat: MeshBasicMaterial;
  private pulse = 0;

  constructor() {
    this.root.name = 'IonChamber';
    const steel = new MeshStandardMaterial({ color: '#b3b8bf', roughness: 0.25, metalness: 0.92 });
    const dark = new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.5, metalness: 0.6 });
    const glass = new MeshStandardMaterial({ color: '#7d93b3', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.5 });
    const H = 0.2;
    // stand: a plate and three legs
    const plate = new Mesh(new CylinderGeometry(0.1, 0.1, 0.008, 40), dark);
    plate.position.y = 0.004;
    this.root.add(plate);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = new Mesh(new CylinderGeometry(0.005, 0.005, H - 0.05, 10), steel);
      leg.position.set(Math.cos(a) * 0.06, (H - 0.05) / 2 + 0.008, Math.sin(a) * 0.06);
      this.root.add(leg);
    }
    // the chamber: a short drum with heavy flanges top and bottom
    const drum = new Mesh(new CylinderGeometry(0.07, 0.07, 0.08, 8), steel);
    drum.position.y = H;
    this.root.add(drum);
    for (const dy of [-0.045, 0.045]) {
      const flange = new Mesh(new CylinderGeometry(0.082, 0.082, 0.012, 40), steel);
      flange.position.y = H + dy;
      this.root.add(flange);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const bolt = new Mesh(new CylinderGeometry(0.0025, 0.0025, 0.016, 6), dark);
        bolt.position.set(Math.cos(a) * 0.076, H + dy, Math.sin(a) * 0.076);
        this.root.add(bolt);
      }
    }
    // a viewport on each face of the octagon
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const port = new Group();
      const tube = new Mesh(new CylinderGeometry(0.016, 0.016, 0.03, 20), steel);
      tube.rotation.z = Math.PI / 2;
      tube.position.x = 0.078;
      const rim = new Mesh(new CylinderGeometry(0.022, 0.022, 0.008, 24), steel);
      rim.rotation.z = Math.PI / 2;
      rim.position.x = 0.094;
      const win = new Mesh(new CylinderGeometry(0.0145, 0.0145, 0.002, 24), glass);
      win.rotation.z = Math.PI / 2;
      win.position.x = 0.0985;
      port.add(tube, rim, win);
      port.rotation.y = -a;
      port.position.y = H;
      this.root.add(port);
    }
    // the ion pump on top, and a cable out
    const pump = new Mesh(new BoxGeometry(0.07, 0.05, 0.05), dark);
    pump.position.y = H + 0.08;
    this.root.add(pump);
    const neck = new Mesh(new CylinderGeometry(0.014, 0.014, 0.03, 16), steel);
    neck.position.y = H + 0.06;
    this.root.add(neck);
    // the laser: a small box on the plate's edge and a violet beam into the nearest window
    const laser = new Mesh(new BoxGeometry(0.05, 0.03, 0.03), dark);
    laser.position.set(0.17, H - 0.02, 0.07);
    this.root.add(laser);
    this.beamMat = new MeshBasicMaterial({ color: '#8b6cff', transparent: true, opacity: 0.6, depthWrite: false, blending: AdditiveBlending });
    const from = new Vector3(0.145, H - 0.02, 0.07), to = new Vector3(Math.cos(Math.PI / 8) * 0.098, H, Math.sin(Math.PI / 8) * 0.098);
    const beamGeo = new CylinderGeometry(0.0012, 0.0012, from.distanceTo(to), 8);
    const beam = new Mesh(beamGeo, this.beamMat);
    beam.position.copy(from).lerp(to, 0.5);
    beam.lookAt(to);
    beam.rotateX(Math.PI / 2);
    this.root.add(beam);
    const caption = new Mesh(new PlaneGeometry(0.1, 0.0375), new MeshBasicMaterial({ map: textTexture([{ text: 'Vacuum', color: '#8a8d93' }], 500), transparent: true, depthWrite: false }));
    caption.rotation.x = -Math.PI / 2;
    caption.position.set(0, 0.0085, 0.07);
    this.root.add(caption);
  }

  /** The beam brightens while a run plays. */
  play(seconds: number): void {
    this.pulse = seconds;
  }

  update(dt: number): void {
    this.pulse = Math.max(0, this.pulse - dt);
    this.beamMat.opacity = this.pulse > 0 ? 0.75 + 0.2 * Math.sin(performance.now() / 60) : 0.45;
  }
}
