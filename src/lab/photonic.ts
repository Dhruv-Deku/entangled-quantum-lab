import { BoxGeometry, CatmullRomCurve3, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from '@iwsdk/core';
import type { Op } from '../quantum/circuit';
import { Kit, LabelCard } from './machine-kit';
import { GOLD, qubitColor } from './visuals';

const LENGTH = 0.22;
const PITCH = 0.022;
/** Seconds per op when a run plays back. */
const STEP = 0.2;
const WHITE = new Color('#ffffff');

/**
 * A photonic quantum chip: each qubit is a single photon travelling down its
 * own waveguide etched in silicon. Light flows left to right, from the photon
 * sources through a mesh of beam splitters (where two waveguides come close)
 * and phase shifters (the copper heaters), to the single-photon detectors.
 * During a run each gate lights its photons; a two-qubit gate bridges two
 * waveguides in gold, the colour of entanglement.
 */
export class PhotonicChipVisual {
  readonly root = new Group();
  private n = 0;
  private lines: { bead: Mesh; mat: MeshBasicMaterial; z: number; flash: number }[] = [];
  private readonly lineGroup = new Group();
  private bridges: { mesh: Mesh; mat: MeshBasicMaterial; t: number }[] = [];
  private queue: Op[] = [];
  private timer = 0;
  private flow = 0;

  constructor() {
    this.root.name = 'PhotonicChip';
    const kit = new Kit();
    const si = new MeshStandardMaterial({ color: '#1c2129', roughness: 0.3, metalness: 0.5 });
    kit.box(LENGTH + 0.04, 0.004, 0.14, si, new Vector3(0, 0.002, 0));
    kit.build(this.root);
    this.root.add(this.lineGroup);
    const caption = new LabelCard(0.1, 'Photonic chip', 'light in silicon');
    caption.mesh.rotation.x = -Math.PI / 2;
    caption.mesh.position.set(-0.06, 0.0045, 0.06);
    this.root.add(caption.mesh);
    this.setQubits(3);
  }

  /** One waveguide (one photon) per qubit, with its couplers, heaters, source and detector. */
  setQubits(n: number): void {
    if (n === this.n) return;
    this.n = n;
    this.lineGroup.clear();
    this.lines = [];
    const kit = new Kit();
    const guide = new MeshStandardMaterial({ color: '#7fa9f5', emissive: '#2d7ff9', emissiveIntensity: 0.35, roughness: 0.3 });
    const heater = new MeshStandardMaterial({ color: '#c47c4e', roughness: 0.25, metalness: 1 });
    const source = new MeshStandardMaterial({ color: '#8fb7ff', emissive: '#8fb7ff', emissiveIntensity: 0.5 });
    const det = new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.4, metalness: 0.6 });
    const zOf = (q: number) => (q - (n - 1) / 2) * PITCH;
    for (let q = 0; q < n; q++) {
      const z = zOf(q);
      kit.box(LENGTH, 0.0016, 0.0016, guide, new Vector3(0, 0.0048, z));
      kit.box(0.008, 0.006, 0.008, source, new Vector3(-LENGTH / 2 - 0.006, 0.006, z));
      kit.cyl(0.0055, 0.008, det, new Vector3(LENGTH / 2 + 0.007, 0.007, z), 16);
      for (const x of [-0.06, 0.02, 0.07]) kit.box(0.012, 0.001, 0.005, heater, new Vector3(x, 0.006, z));
    }
    // beam splitters: where neighbouring waveguides bow toward each other
    for (let layer = 0; layer < 4; layer++) {
      const x = -0.085 + layer * 0.05;
      for (let q = layer % 2; q + 1 < n; q += 2) {
        const za = zOf(q), zb = zOf(q + 1), mid = (za + zb) / 2;
        for (const [from, side] of [[za, -1], [zb, 1]] as const) {
          const curve = new CatmullRomCurve3([new Vector3(x - 0.014, 0.0048, from), new Vector3(x - 0.004, 0.0048, mid + side * 0.002), new Vector3(x + 0.004, 0.0048, mid + side * 0.002), new Vector3(x + 0.014, 0.0048, from)]);
          kit.tube(curve, 0.0009, guide, 16, 4);
        }
      }
    }
    kit.build(this.lineGroup);
    for (let q = 0; q < n; q++) {
      const mat = new MeshBasicMaterial({ color: qubitColor(q), toneMapped: false });
      const bead = new Mesh(new SphereGeometry(0.0032, 12, 8), mat);
      bead.position.set(0, 0.006, zOf(q));
      this.lineGroup.add(bead);
      this.lines.push({ bead, mat, z: zOf(q), flash: 0 });
    }
  }

  play(ops: readonly Op[]): void {
    this.queue = ops.slice();
    this.timer = 0;
  }

  private fire(op: Op): void {
    const qs = op.kind === 'gate' ? [...(op.controls ?? []), op.target] : op.kind === 'swap' || op.kind === 'iswap' ? [op.a, op.b] : [op.qubit];
    for (const q of qs) if (this.lines[q]) this.lines[q].flash = 1;
    if (qs.length === 2 && this.lines[qs[0]] && this.lines[qs[1]]) {
      // a gold bridge between the two waveguides, at the photons
      const x = this.lines[qs[0]].bead.position.x;
      const a = new Vector3(x, 0.007, this.lines[qs[0]].z), b = new Vector3(x, 0.007, this.lines[qs[1]].z);
      const curve = new CatmullRomCurve3([a, a.clone().lerp(b, 0.5).setY(0.018), b]);
      const mat = new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 1, toneMapped: false });
      const mesh = new Mesh(new TubeGeometry(curve, 16, 0.0014, 6), mat);
      this.lineGroup.add(mesh);
      this.bridges.push({ mesh, mat, t: 0 });
    }
  }

  update(dt: number): void {
    if (this.queue.length) {
      this.timer += dt;
      while (this.queue.length && this.timer >= STEP) {
        this.timer -= STEP;
        this.fire(this.queue.shift()!);
      }
    }
    // the photons flow along their waveguides, over and over
    this.flow = (this.flow + dt * 0.18) % 1;
    this.lines.forEach((l, q) => {
      l.flash = Math.max(0, l.flash - dt * 1.8);
      l.bead.position.x = -LENGTH / 2 + ((this.flow + q * 0.13) % 1) * LENGTH;
      l.mat.color.set(qubitColor(q)).lerp(WHITE, l.flash * 0.7);
      l.bead.scale.setScalar(1 + l.flash * 0.8);
    });
    for (const b of this.bridges) {
      b.t += dt;
      b.mat.opacity = Math.max(0, 1 - b.t / 1.2);
    }
    for (const b of this.bridges.filter((x) => x.t >= 1.2)) {
      this.lineGroup.remove(b.mesh);
      b.mesh.geometry.dispose();
    }
    this.bridges = this.bridges.filter((x) => x.t < 1.2);
  }
}

/**
 * The machine around the chip: a rack of control electronics and lasers, the
 * detectors in a small cryostat (single-photon detectors work at a couple of
 * kelvin), and spools of optical fibre. Coming into view its status lights
 * come on one by one. Model units: on the desk 1:1, at full size six times.
 */
export class PhotonicRackVisual {
  readonly root = new Group();
  readonly size = { deskScale: 1, fullScale: 6, lift: 0 };
  readonly stand = new Group();
  private leds: MeshBasicMaterial[] = [];
  private t = 99;
  private pulse = 0;

  constructor() {
    this.root.name = 'PhotonicRack';
    const kit = new Kit();
    const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const dark = new MeshStandardMaterial({ color: '#1f2125', roughness: 0.45, metalness: 0.6 });
    const panel = new MeshStandardMaterial({ color: '#2c2f34', roughness: 0.35, metalness: 0.7 });
    const white = new MeshStandardMaterial({ color: '#e4e6eb', roughness: 0.3, metalness: 0.4 });
    const fibre = new MeshStandardMaterial({ color: '#e2c25a', roughness: 0.5, metalness: 0.1 });
    // the rack: a cabinet with six units of electronics
    kit.box(0.13, 0.32, 0.1, dark, P(0, 0.16, 0));
    for (let u = 0; u < 6; u++) kit.box(0.118, 0.04, 0.004, panel, P(0, 0.035 + u * 0.048, 0.051));
    // the detector cryostat beside it, and its compressor line
    kit.cyl(0.03, 0.14, white, P(0.13, 0.07, 0.01), 32);
    kit.cyl(0.034, 0.012, white, P(0.13, 0.146, 0.01), 32);
    kit.cyl(0.012, 0.05, white, P(0.13, 0.175, 0.01), 16);
    // fibre spools on top of the rack, and a fibre bundle down to the cryostat
    for (const x of [-0.035, 0.035]) {
      kit.add(new TorusGeometry(0.022, 0.008, 10, 32), fibre, P(x, 0.335, 0.0));
      kit.cyl(0.014, 0.018, dark, P(x, 0.335, 0), 16);
    }
    kit.tube(new CatmullRomCurve3([P(0.05, 0.3, 0.04), P(0.1, 0.28, 0.05), P(0.13, 0.2, 0.03)]), 0.004, fibre, 24, 6);
    kit.build(this.root);
    // status lights down each unit
    for (let u = 0; u < 6; u++)
      for (let k = 0; k < 6; k++) {
        const mat = new MeshBasicMaterial({ color: '#2a2c30', toneMapped: false });
        const led = new Mesh(new BoxGeometry(0.006, 0.004, 0.002), mat);
        led.position.set(-0.045 + k * 0.012, 0.035 + u * 0.048, 0.054);
        this.root.add(led);
        this.leds.push(mat);
      }
    const name = new LabelCard(0.16, 'Photonic computer', 'light, at room temperature');
    name.mesh.position.set(0, 0.4, 0.04);
    const cryo = new LabelCard(0.1, 'Detectors', 'kept at 2 K');
    cryo.mesh.position.set(0.17, 0.22, 0.05);
    this.root.add(name.mesh, cryo.mesh);
    this.stand.visible = false;
    this.root.add(this.stand);
  }

  /** The lights come on, unit by unit. */
  reveal(): void {
    this.t = 0;
  }

  play(seconds: number): void {
    this.pulse = seconds;
  }

  update(dt: number): void {
    this.t += dt;
    this.pulse = Math.max(0, this.pulse - dt);
    const now = performance.now() / 1000;
    this.leds.forEach((m, i) => {
      const on = this.t > 0.15 + Math.floor(i / 6) * 0.18;
      const blink = this.pulse > 0 ? Math.sin(now * 12 + i * 1.7) > 0 : Math.sin(now * 1.3 + i * 2.3) > -0.6;
      m.color.set(!on ? '#2a2c30' : i % 6 === 0 ? '#3ddc97' : blink ? '#8fb7ff' : '#26324a');
    });
  }
}

