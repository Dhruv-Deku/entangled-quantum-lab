import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Euler,
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
import { Beam, ease, finishes, Kit, LabelCard } from './machine-kit';
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
 * The machine around the trap, as it stands in a lab: a steel ultra-high
 * vacuum chamber with viewports on every side and a large window on top, a
 * pair of copper Helmholtz coils, an ion pump with its magnets on a side arm,
 * the RF resonator that drives the trap rods, and the imaging objective and
 * camera above. Three lasers come in through the windows: the violet cooling
 * beam, the red repumper and a pair of Raman beams that do the gates. Through
 * the front window you can see the ion chain glowing at the centre.
 *
 * Coming into view, the lasers switch on one at a time and the ions light up.
 * On the desk it is a model; at full size it stands on an optical table.
 */
export class IonChamberVisual {
  readonly root = new Group();
  /** Model units: the desk shows it 1:1, full size at 2.5x on a table 0.3 units tall. */
  readonly size = { deskScale: 1, fullScale: 2.5, lift: 0.3 };
  readonly stand = new Group();
  private beams: { beam: Beam; at: number }[] = [];
  private ions: { mat: MeshBasicMaterial; halo: SpriteMaterial }[] = [];
  private readonly glow = glowTexture();
  private pulse = 0;
  private t = 99;

  constructor() {
    this.root.name = 'IonChamber';
    const f = finishes();
    const kit = new Kit();
    const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const H = 0.2;
    // the breadboard it sits on, and three posts up to the chamber
    kit.cyl(0.11, 0.008, f.dark, P(0, 0.004, 0), 48);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      kit.cyl(0.006, H - 0.06, f.steel, P(Math.cos(a) * 0.055, (H - 0.06) / 2 + 0.008, Math.sin(a) * 0.055), 12);
      kit.cyl(0.012, 0.006, f.steel, P(Math.cos(a) * 0.055, 0.011, Math.sin(a) * 0.055), 12);
    }
    // the chamber: an octagon with heavy flanges top and bottom
    kit.cyl(0.07, 0.08, f.steel, P(0, H, 0), 8);
    for (const dy of [-0.045, 0.045]) {
      kit.cyl(0.082, 0.012, f.steel, P(0, H + dy, 0), 48);
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * Math.PI * 2;
        kit.cyl(0.0022, 0.018, f.dark, P(Math.cos(a) * 0.076, H + dy, Math.sin(a) * 0.076), 6);
      }
    }
    // a viewport on each face; the window glass is a separate see-through part
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const dir = P(Math.cos(a), 0, Math.sin(a));
      const rot = new Euler(0, -a, Math.PI / 2);
      kit.cyl(0.016, 0.03, f.steel, dir.clone().multiplyScalar(0.078).setY(H), 24, rot);
      kit.cyl(0.022, 0.008, f.steel, dir.clone().multiplyScalar(0.094).setY(H), 24, rot);
      for (let b = 0; b < 6; b++) {
        const side = P(-dir.z, 0, dir.x);
        const ang = (b / 6) * Math.PI * 2;
        const p = dir.clone().multiplyScalar(0.0985).addScaledVector(side, Math.cos(ang) * 0.019).setY(H + Math.sin(ang) * 0.019);
        kit.cyl(0.0016, 0.004, f.dark, p, 6, rot);
      }
      kit.cyl(0.0145, 0.002, f.glass, dir.clone().multiplyScalar(0.0985).setY(H), 24, rot);
    }
    // the big top window, and the imaging objective and camera above it
    kit.cyl(0.05, 0.01, f.steel, P(0, H + 0.056, 0), 48);
    kit.cyl(0.04, 0.002, f.glass, P(0, H + 0.062, 0), 48);
    kit.cyl(0.022, 0.05, f.black, P(0, H + 0.09, 0), 32, undefined, 0.016);
    kit.ring(0.022, 0.002, f.steel, P(0, H + 0.115, 0), 32);
    kit.cyl(0.012, 0.07, f.anodised, P(0, H + 0.15, 0), 24);
    kit.box(0.06, 0.05, 0.06, f.dark, P(0, H + 0.21, 0));
    kit.box(0.04, 0.004, 0.03, f.anodised, P(0, H + 0.237, 0));
    // a gantry holds the camera
    for (const sx of [-1, 1]) kit.box(0.008, H + 0.22, 0.012, f.anodised, P(sx * 0.12, (H + 0.22) / 2, -0.06));
    kit.box(0.25, 0.012, 0.012, f.anodised, P(0, H + 0.22, -0.06));
    kit.box(0.012, 0.012, 0.06, f.anodised, P(0, H + 0.22, -0.03));
    // Helmholtz coils either side: copper windings on a dark former, the front window left clear
    for (const sx of [-1, 1]) {
      kit.add(new TorusGeometry(0.085, 0.01, 12, 64), f.copper, P(sx * 0.112, H, 0), new Euler(0, Math.PI / 2, 0));
      kit.add(new TorusGeometry(0.085, 0.004, 8, 64), f.dark, P(sx * 0.123, H, 0), new Euler(0, Math.PI / 2, 0));
    }
    // ion pump on a side arm: the steel body between two dark magnets, and a valve
    kit.cyl(0.018, 0.08, f.steel, P(-0.12, H - 0.03, -0.04), 24, new Euler(0, 0, Math.PI / 2));
    kit.box(0.07, 0.09, 0.06, f.brushed, P(-0.185, H - 0.04, -0.04));
    for (const sz of [-1, 1]) kit.box(0.075, 0.095, 0.012, f.black, P(-0.185, H - 0.04, -0.04 + sz * 0.036));
    kit.box(0.03, 0.025, 0.03, f.dark, P(-0.185, H + 0.018, -0.04));
    kit.cyl(0.014, 0.03, f.steel, P(-0.11, H - 0.075, 0.03), 16);
    kit.cyl(0.02, 0.012, f.dark, P(-0.11, H - 0.095, 0.03), 6);
    // the RF helical resonator on the back port: a copper can
    kit.cyl(0.03, 0.09, f.copper, P(0.07, H, -0.16), 32, new Euler(Math.PI / 2, 0, 0));
    kit.cyl(0.032, 0.006, f.copper, P(0.07, H, -0.115), 32, new Euler(Math.PI / 2, 0, 0));
    kit.rod(P(0.07, H, -0.115), P(Math.cos(-Math.PI * 0.375) * 0.1, H, Math.sin(-Math.PI * 0.375) * 0.1), 0.006, f.steel);

    // three lasers on the breadboard's edge, each into its own window
    const port = (k: number) => {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      return P(Math.cos(a) * 0.1, H, Math.sin(a) * 0.1);
    };
    const lasers: { at: Vector3; port: number; color: string; r: number; delay: number }[] = [
      { at: P(0.24, H - 0.015, 0.12), port: 0, color: '#8b6cff', r: 0.0014, delay: 0.3 },
      { at: P(0.22, H - 0.02, -0.14), port: 7, color: '#ff5a4f', r: 0.0011, delay: 0.75 },
      { at: P(-0.2, H - 0.02, 0.16), port: 3, color: '#b9a8ff', r: 0.0012, delay: 1.2 },
      { at: P(-0.22, H - 0.02, -0.15), port: 4, color: '#b9a8ff', r: 0.0012, delay: 1.2 },
    ];
    for (const l of lasers) {
      kit.box(0.06, 0.03, 0.035, f.black, l.at);
      // on a post down to the table
      kit.cyl(0.007, l.at.y - 0.015, f.steel, P(l.at.x, (l.at.y - 0.015) / 2, l.at.z), 10);
      kit.cyl(0.016, 0.005, f.anodised, P(l.at.x, 0.0025, l.at.z), 16);
      kit.box(0.03, 0.004, 0.02, f.anodised, l.at.clone().add(P(0, 0.017, 0)));
      // the beam leaves the head toward the window, ending at the centre of the chamber
      const from = l.at.clone().add(port(l.port).sub(l.at).setY(0).normalize().multiplyScalar(0.032));
      const beam = new Beam(from, P(0, H, 0), l.r, l.color, 0.7);
      this.root.add(beam.mesh);
      this.beams.push({ beam, at: l.delay });
    }

    // the ion chain at the centre, seen through the windows
    for (let k = 0; k < 5; k++) {
      const mat = new MeshBasicMaterial({ color: '#8fb7ff', toneMapped: false });
      const ion = new Mesh(new SphereGeometry(0.0022, 10, 8), mat);
      ion.position.set((k - 2) * 0.009, H, 0);
      const halo = new SpriteMaterial({ map: this.glow, color: '#8fb7ff', transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
      // the glow shows through the steel, as the fluorescence does through the windows
      halo.depthTest = false;
      const s = new Sprite(halo);
      s.renderOrder = 5;
      s.scale.setScalar(0.03);
      s.position.copy(ion.position);
      this.root.add(ion, s);
      this.ions.push({ mat, halo });
    }

    // the optical table it stands on at full size
    const top = new Kit();
    top.box(0.56, 0.02, 0.4, f.dark, P(0, -0.01, 0));
    for (const [x, z] of [[-0.24, -0.16], [0.24, -0.16], [0.24, 0.16], [-0.24, 0.16]]) {
      top.cyl(0.028, 0.26, f.anodised, P(x, -0.15, z), 24);
      top.cyl(0.036, 0.02, f.black, P(x, -0.29, z), 24);
    }
    top.build(this.stand);
    this.stand.visible = false;
    this.root.add(this.stand);
    kit.build(this.root);

    const name = new LabelCard(0.16, 'Vacuum chamber', 'a hundred billion times thinner than air');
    name.mesh.position.set(0, 0.07, 0.15);
    const coils = new LabelCard(0.1, 'Helmholtz coils', 'a steady magnetic field');
    coils.mesh.position.set(0.17, H + 0.1, 0.04);
    const chain = new LabelCard(0.1, 'Ion chain', 'seen through the window');
    chain.mesh.position.set(-0.13, H + 0.07, 0.11);
    this.root.add(name.mesh, coils.mesh, chain.mesh);
  }

  /** Switch the lasers on one at a time, then light the ions. */
  reveal(): void {
    this.t = 0;
  }

  /** One ion per qubit glows at the centre. */
  setQubits(n: number): void {
    this.ions.forEach((ion, k) => (ion.mat.visible = k >= (5 - n) / 2 && k < (5 + n) / 2));
  }

  /** The beams brighten while a run plays. */
  play(seconds: number): void {
    this.pulse = seconds;
  }

  update(dt: number): void {
    this.t += dt;
    this.pulse = Math.max(0, this.pulse - dt);
    const flicker = this.pulse > 0 ? 1.2 + 0.25 * Math.sin(performance.now() / 60) : 0.75;
    for (const b of this.beams) b.beam.set(ease((this.t - b.at) / 0.5), flicker);
    const lit = ease((this.t - 1.6) / 0.8);
    for (const ion of this.ions) {
      ion.halo.opacity = ion.mat.visible ? lit * (this.pulse > 0 ? 0.9 : 0.6) : 0;
      ion.mat.color.set('#8fb7ff').multiplyScalar(0.3 + 0.7 * lit);
    }
  }
}
