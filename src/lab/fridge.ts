import {
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Pulse } from '../quantum/pulses';
import { Cans, finishes, formatKelvin, Kit, LabelCard } from './machine-kit';
import { MINT, qubitColor } from './visuals';

/**
 * Cooling stages, top to bottom, in real metres: height of each plate above
 * the floor, its radius, the temperature it reaches and what lives there.
 */
const STAGES: { y: number; r: number; kelvin: number; name: string }[] = [
  { y: 1.7, r: 0.27, kelvin: 50, name: 'Radiation shield' },
  { y: 1.45, r: 0.25, kelvin: 4, name: 'Pulse tube, amplifiers' },
  { y: 1.22, r: 0.22, kelvin: 0.8, name: 'Still' },
  { y: 1.02, r: 0.2, kelvin: 0.1, name: 'Cold plate' },
  { y: 0.82, r: 0.19, kelvin: 0.015, name: 'Mixing chamber' },
];
const FLANGE_Y = 1.95;
const FLANGE_R = 0.3;
const CHIP_Y = 0.6;
/** Half the frame's width. */
const S = 0.42;
/** Seconds a pulse takes to travel from the top flange to the chip. */
const TRAVEL = 0.9;
const MAX_BEADS = 64;
/** Seconds the cooldown takes on the thermometers after the cans slide away. */
const COOLDOWN = 3.2;

interface Bead {
  line: CatmullRomCurve3;
  /** 0 = top, 1 = chip; readout beads travel back up. */
  t: number;
  up: boolean;
  color: Color;
}

/**
 * A dilution refrigerator at real size: the copper "chandelier" a
 * superconducting chip lives in. Five plates step down from 50 K to 15 mK,
 * hung from a steel top flange on fibreglass standoffs; the pulse-tube cooler
 * and the still's pumping line come down the middle, a heat-exchanger coil
 * feeds the mixing chamber, and a dozen semi-rigid coaxial lines loop their
 * way down through attenuators, amplifiers and circulators to the chip in its
 * magnetic shield. Coming into view, it closes its vacuum cans and slides
 * them away, and the stage thermometers cool down from room temperature.
 *
 * Built in metres: the desk shows it scaled down, Full size shows it 1:1.
 * During a run, each drive pulse travels down its qubit's line as a bead of
 * that qubit's colour, and readout tones travel back up in white.
 */
export class FridgeVisual {
  readonly root = new Group();
  /** Built at real size: a fifth of it on the desk, 1:1 at full size, standing on its own frame. */
  readonly size = { deskScale: 0.2, fullScale: 1, lift: 0 };
  /** At full size it stands in a glass display case, like IBM's Quantum System One. */
  readonly stand = new Group();
  private drive: CatmullRomCurve3[] = [];
  private readIn!: CatmullRomCurve3;
  private readOut!: CatmullRomCurve3;
  private beads: Bead[] = [];
  private beadMesh: InstancedMesh;
  private beadGlow: InstancedMesh;
  private pending: { at: number; bead: Bead }[] = [];
  private clock = 0;
  private led: MeshBasicMaterial;
  private ledTimer = 0;
  /** physical -> logical qubit (-1: unused), for colouring lines and pulses. */
  private holder: number[] = [];
  private bands: MeshStandardMaterial[] = [];
  private cans = new Cans();
  private labels: LabelCard[] = [];
  private cool = -1;
  private readonly m = new Matrix4();
  private readonly v = new Vector3();

  constructor(readonly qubits: number) {
    this.root.name = 'Fridge';
    const f = finishes();
    const kit = new Kit();
    const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const polar = (a: number, r: number, y: number) => P(Math.sin(a) * r, y, Math.cos(a) * r);

    // ---- the frame it hangs from: four posts and a square top ----
    const TOPF = 2.12;
    for (const [x, z] of [[-S, -S], [S, -S], [S, S], [-S, S]]) {
      kit.box(0.045, TOPF, 0.045, f.anodised, P(x, TOPF / 2, z));
      kit.box(0.14, 0.012, 0.14, f.anodised, P(x, 0.006, z));
    }
    const corners = [[-S, -S], [S, -S], [S, S], [-S, S]];
    for (let k = 0; k < 4; k++) {
      const [a, b] = [corners[k], corners[(k + 1) % 4]];
      kit.rod(P(a[0], TOPF, a[1]), P(b[0], TOPF, b[1]), 0.024, f.anodised, 4);
      kit.rod(P(a[0], 0.3, a[1]), P(b[0], 0.3, b[1]), 0.016, f.anodised, 4);
    }
    // cross beams carry the top flange
    kit.rod(P(-S, TOPF - 0.06, 0), P(S, TOPF - 0.06, 0), 0.03, f.anodised, 4);
    kit.rod(P(0, TOPF - 0.06, -S), P(0, TOPF - 0.06, S), 0.03, f.anodised, 4);

    // ---- top flange (room temperature), with its bolts and ports ----
    kit.cyl(FLANGE_R, 0.035, f.steel, P(0, FLANGE_Y, 0), 64);
    kit.ring(FLANGE_R, 0.006, f.steel, P(0, FLANGE_Y - 0.017, 0), 64);
    for (let k = 0; k < 24; k++) kit.cyl(0.006, 0.02, f.dark, polar((k / 24) * Math.PI * 2, FLANGE_R - 0.018, FLANGE_Y + 0.02), 6);
    kit.cyl(0.065, 0.1, f.steel, P(0, FLANGE_Y + 0.07, 0), 32); // still pumping port
    kit.cyl(0.08, 0.018, f.steel, P(0, FLANGE_Y + 0.125, 0), 32);
    kit.cyl(0.04, 0.15, f.brushed, P(0, FLANGE_Y + 0.2, 0), 24);
    // pulse-tube cold head and its motor, off centre at the back
    const PT = polar(-2.2, 0.15, 0);
    kit.cyl(0.055, 0.2, f.brushed, P(PT.x, FLANGE_Y + 0.12, PT.z), 32);
    kit.box(0.12, 0.09, 0.09, f.dark, P(PT.x, FLANGE_Y + 0.26, PT.z));

    // ---- the plates ----
    STAGES.forEach((s, i) => {
      kit.cyl(s.r, 0.014, f.copper, P(0, s.y, 0), 64);
      kit.ring(s.r, 0.004, f.copper, P(0, s.y, 0), 64);
      // standoffs up to the plate above: fibreglass at the warm end, steel lower down
      const above = i === 0 ? { y: FLANGE_Y, r: FLANGE_R } : STAGES[i - 1];
      const rr = s.r * 0.86;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        kit.rod(polar(a, rr, s.y + 0.007), polar(a, Math.min(rr, above.r * 0.86), above.y - 0.007), i < 2 ? 0.013 : 0.009, i < 3 ? f.g10 : f.steel, 12);
        kit.cyl(0.018, 0.008, f.steel, polar(a, rr, s.y + 0.011), 12);
      }
    });

    // ---- pulse tube down to 4 K, with its two copper cold stages ----
    kit.cyl(0.035, FLANGE_Y - STAGES[0].y, f.brushed, P(PT.x, (FLANGE_Y + STAGES[0].y) / 2, PT.z), 24);
    kit.cyl(0.05, 0.03, f.copper, P(PT.x, STAGES[0].y - 0.022, PT.z), 24);
    kit.cyl(0.02, STAGES[0].y - STAGES[1].y, f.brushed, P(PT.x + 0.02, (STAGES[0].y + STAGES[1].y) / 2, PT.z), 16);
    kit.cyl(0.035, 0.03, f.copper, P(PT.x + 0.02, STAGES[1].y - 0.022, PT.z), 24);
    // braided copper straps from the cold stages to the plates
    for (const [y0, y1, dx] of [[STAGES[0].y - 0.03, STAGES[0].y - 0.007, 0.09], [STAGES[1].y - 0.03, STAGES[1].y - 0.007, 0.08]]) {
      const a = P(PT.x, y0, PT.z), b = P(PT.x + dx, y1, PT.z + 0.05);
      kit.tube(new CatmullRomCurve3([a, a.clone().lerp(b, 0.5).add(P(0, -0.04, 0)), b]), 0.008, f.copper, 16, 6);
    }

    // ---- the dilution unit down the middle ----
    kit.cyl(0.032, FLANGE_Y - STAGES[2].y, f.steel, P(0, (FLANGE_Y + STAGES[2].y) / 2, 0), 24); // still pumping line
    kit.cyl(0.06, 0.08, f.steel, P(0, STAGES[2].y - 0.05, 0), 32); // the still
    kit.cyl(0.062, 0.006, f.copper, P(0, STAGES[2].y - 0.092, 0), 32);
    // continuous heat exchanger: a coil from the still down to the mixing chamber
    const coil: Vector3[] = [];
    const cTop = STAGES[2].y - 0.1, cBottom = STAGES[3].y + 0.02;
    for (let k = 0; k <= 120; k++) {
      const u = k / 120;
      coil.push(polar(u * Math.PI * 2 * 7, 0.045, cTop + (cBottom - cTop) * u));
    }
    kit.tube(new CatmullRomCurve3(coil), 0.0045, f.steel, 480, 6);
    // step heat exchangers: a stack of silver discs above the mixing chamber
    for (let k = 0; k < 5; k++) kit.cyl(0.05, 0.012, f.steel, P(0, STAGES[3].y - 0.03 - k * 0.022, 0), 32);
    kit.cyl(0.06, 0.06, f.steel, P(0, STAGES[4].y + 0.04, 0), 32); // the mixing chamber itself
    kit.ring(0.06, 0.003, f.copper, P(0, STAGES[4].y + 0.07, 0), 32);

    // ---- the chip in its magnetic shield, under the mixing chamber plate ----
    kit.cyl(0.012, STAGES[4].y - CHIP_Y - 0.12, f.copper, P(0, (STAGES[4].y + CHIP_Y + 0.12) / 2, 0), 16); // cold finger
    kit.box(0.08, 0.03, 0.08, f.copper, P(0, CHIP_Y, 0)); // sample box
    kit.box(0.05, 0.002, 0.05, f.dark, P(0, CHIP_Y, 0.041), new Euler(Math.PI / 2, 0, 0));
    for (let k = 0; k < 8; k++) kit.cyl(0.004, 0.014, f.steel, P(-0.035 + k * 0.01, CHIP_Y + 0.022, -0.03), 8);
    const mu = new MeshStandardMaterial({ color: '#5b5f66', roughness: 0.65, metalness: 0.5, side: DoubleSide });
    // the shield is cut away at the front so the sample box shows
    kit.add(new CylinderGeometry(0.075, 0.075, 0.2, 48, 1, true, Math.PI / 2 - 0.2, Math.PI + 0.4), mu, P(0, CHIP_Y + 0.01, 0));
    kit.cyl(0.078, 0.012, mu, P(0, CHIP_Y + 0.115, 0), 48);
    kit.cyl(0.078, 0.008, mu, P(0, CHIP_Y - 0.094, 0), 48);

    // ---- coaxial lines: a drive and a flux line per qubit, readout in and out, and spares ----
    // each line passes every plate at its own angle, with a thermal loop between plates;
    // they fill the ring except behind, where the pulse tube comes down
    const used = qubits * 2 + 2;
    const nLines = Math.max(24, used);
    const lineAngles = Array.from({ length: nLines }, (_, k) => -1.8 + (k / (nLines - 1)) * (Math.PI * 2 - 0.95));
    const ringOf = (k: number) => 0.125 + (k % 3) * 0.028;
    const coax = new MeshStandardMaterial({ color: '#d2d5da', roughness: 0.18, metalness: 1 });
    const atten = new MeshStandardMaterial({ color: '#d9b26b', roughness: 0.3, metalness: 1 });
    const lineCurve = (a: number, r: number, toChip: number) => {
      const pts: Vector3[] = [polar(a, r, FLANGE_Y + 0.06), polar(a, r, FLANGE_Y)];
      const hang = [{ y: FLANGE_Y }, ...STAGES];
      for (let i = 1; i < hang.length; i++) {
        const yA = hang[i - 1].y, yB = hang[i].y;
        // a sideways loop between plates takes up thermal contraction
        pts.push(polar(a + 0.06, r + 0.025, yA - (yA - yB) * 0.35));
        pts.push(polar(a - 0.06, r + 0.035, yA - (yA - yB) * 0.6));
        pts.push(polar(a, r, yB + 0.015));
        pts.push(polar(a, r, yB - 0.015));
      }
      // the last run, from under the mixing chamber plate into the sample box
      const end = polar(toChip, 0.042, CHIP_Y + 0.02);
      pts.push(polar(a, r * 0.75, STAGES[4].y - 0.09));
      pts.push(polar(toChip, 0.07, CHIP_Y + 0.1));
      pts.push(end);
      return new CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
    };
    for (let k = 0; k < nLines; k++) {
      const a = lineAngles[k];
      const r = ringOf(k);
      const kind = k < qubits ? 'drive' : k < 2 * qubits ? 'flux' : k === 2 * qubits ? 'in' : k === 2 * qubits + 1 ? 'out' : 'spare';
      const curve = lineCurve(a, r, -1.3 + (k / (nLines - 1)) * 2.6);
      kit.tube(curve, 0.0042, coax, 260, 6);
      // a bulkhead connector at every plate it passes, attenuators on the way down
      for (const s of [{ y: FLANGE_Y }, ...STAGES]) kit.cyl(0.009, 0.03, f.steel, polar(a, r, s.y), 6);
      if (kind !== 'out') for (const i of [1, 2, 4]) kit.cyl(0.0085, 0.045, atten, polar(a, r, STAGES[i].y - 0.045), 12);
      if (kind === 'in') this.readIn = curve;
      if (kind === 'out') this.readOut = curve;
      if (kind === 'drive') {
        this.drive.push(curve);
        // a coloured band above the flange says which logical qubit the line drives
        const bandMat = new MeshStandardMaterial({ color: '#55585e', roughness: 0.4, metalness: 0.3 });
        this.bands.push(bandMat);
        const band = new Mesh(new CylinderGeometry(0.0075, 0.0075, 0.022, 12), bandMat);
        band.position.copy(polar(a, r, FLANGE_Y + 0.05));
        this.root.add(band);
      }
    }
    // the readout chain: circulators under the mixing chamber, a parametric amplifier, a HEMT at 4 K
    const outA = lineAngles[used - 1], outR = ringOf(used - 1);
    for (let k = 0; k < 2; k++) kit.box(0.045, 0.03, 0.04, f.copper, polar(outA - 0.45 - k * 0.32, 0.115, STAGES[4].y - 0.03));
    kit.box(0.07, 0.03, 0.05, f.copper, polar(outA - 0.45, 0.13, STAGES[3].y + 0.022));
    kit.box(0.06, 0.035, 0.05, atten, polar(outA - 0.3, outR - 0.02, STAGES[1].y + 0.025));

    kit.build(this.root);

    // ---- vacuum cans: closed at first, then sliding away to reveal the inside ----
    const cans = new Kit();
    const can300 = new MeshStandardMaterial({ color: '#c3c8cf', roughness: 0.3, metalness: 0.95 });
    const can50 = new MeshStandardMaterial({ color: '#d3d6da', roughness: 0.35, metalness: 0.9 });
    const can4 = new MeshStandardMaterial({ color: '#b98a62', roughness: 0.3, metalness: 1 });
    this.cans.add(FLANGE_R + 0.012, FLANGE_Y - 0.017, 0.38, can300, cans, true, 0);
    this.cans.add(STAGES[0].r - 0.004, STAGES[0].y - 0.007, 0.42, can50, cans, false, 0.25);
    this.cans.add(STAGES[1].r - 0.004, STAGES[1].y - 0.007, 0.45, can4, cans, false, 0.5);
    this.cans.add(STAGES[2].r - 0.004, STAGES[2].y - 0.007, 0.47, can50, cans, false, 0.75);
    cans.build(this.root);
    this.root.add(this.cans.root);

    // ---- the display case (full size only): a black plinth and cap, glass walls in a slim frame ----
    const C = 0.66, TOP = 2.5;
    const caseKit = new Kit();
    const black = new MeshStandardMaterial({ color: '#111214', roughness: 0.35, metalness: 0.7 });
    caseKit.box(2 * C + 0.06, 0.08, 2 * C + 0.06, black, P(0, 0.04, 0));
    caseKit.box(2 * C + 0.06, 0.05, 2 * C + 0.06, black, P(0, TOP + 0.025, 0));
    for (const [x, z] of [[-C, -C], [C, -C], [C, C], [-C, C]]) caseKit.box(0.028, TOP - 0.08, 0.028, black, P(x, (TOP + 0.08) / 2, z));
    caseKit.box(0.008, TOP - 0.1, 0.012, black, P(0, (TOP + 0.08) / 2, C + 0.002)); // the door seam
    caseKit.build(this.stand);
    const glassMat = new MeshStandardMaterial({ color: '#dfe8f2', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, side: DoubleSide, depthWrite: false });
    for (let k = 0; k < 4; k++) {
      const pane = new Mesh(new PlaneGeometry(2 * C, TOP - 0.08), glassMat);
      const a = (k * Math.PI) / 2;
      pane.position.set(Math.sin(a) * C, (TOP + 0.08) / 2, Math.cos(a) * C);
      pane.rotation.y = a;
      this.stand.add(pane);
    }
    this.stand.visible = false;
    this.root.add(this.stand);

    // ---- status light, thermometers and names ----
    this.led = new MeshBasicMaterial({ color: '#2d7ff9' });
    const led = new Mesh(new SphereGeometry(0.011, 16, 10), this.led);
    led.position.set(0, FLANGE_Y + 0.02, FLANGE_R - 0.02);
    this.root.add(led);
    STAGES.forEach((s) => {
      const card = new LabelCard(0.34, formatKelvin(s.kelvin), s.name);
      card.mesh.position.set(S + 0.24, s.y, S * 0.2);
      this.root.add(card.mesh);
      this.labels.push(card);
    });
    const name = new LabelCard(0.4, 'Dilution refrigerator', 'Superconducting qubits at 15 mK');
    name.mesh.position.set(0, 0.48, S + 0.03);
    this.root.add(name.mesh);
    const chip = new LabelCard(0.2, 'T5 chip', 'in its magnetic shield');
    chip.mesh.position.set(0.2, CHIP_Y - 0.02, 0.16);
    this.root.add(chip.mesh);

    this.beadMesh = new InstancedMesh(new SphereGeometry(0.02, 14, 10), new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), MAX_BEADS);
    this.beadMesh.count = 0;
    // a soft glow around each, so a pulse reads from across the room
    this.beadGlow = new InstancedMesh(new SphereGeometry(0.034, 14, 10), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }), MAX_BEADS);
    this.beadGlow.count = 0;
    // the beads travel the whole height: never cull them by the mesh's own (tiny) bounds
    this.beadMesh.frustumCulled = false;
    this.beadGlow.frustumCulled = false;
    this.root.add(this.beadGlow);
    this.root.add(this.beadMesh);
  }

  /** Close the cans and cool down again: played whenever the fridge comes into view. */
  reveal(): void {
    this.cans.reveal();
    this.cool = 0;
    this.labels.forEach((l, i) => l.set('300 K', STAGES[i].name, '#c9ccd1'));
  }

  /** Colour each drive line's band by the logical qubit its physical qubit holds (holder[p] = logical or -1). */
  setHolders(holder: readonly number[]): void {
    this.holder = holder.slice();
    this.bands.forEach((m, p) => m.color.set(holder[p] >= 0 ? qubitColor(holder[p]) : '#55585e'));
  }

  /**
   * Send a run's pulses down the lines over `seconds`: drive and two-qubit
   * pulses go down in the line's qubit colour; a readout tone goes down the
   * readout line and comes back up the amplified line in white.
   */
  play(pulses: readonly Pulse[], durationNs: number, seconds: number): void {
    this.beads = [];
    this.pending = [];
    this.clock = 0;
    const scale = durationNs > 0 ? Math.max(0, seconds - 2 * TRAVEL) / durationNs : 0;
    for (const p of pulses) {
      if (p.kind === 'virtual' || p.qubit >= this.drive.length) continue;
      const at = Math.max(0, p.start * scale);
      if (p.kind === 'readout') {
        this.pending.push({ at, bead: { line: this.readIn, t: 0, up: false, color: new Color('#c9ccd1') } });
        this.pending.push({ at: at + TRAVEL, bead: { line: this.readOut, t: 1, up: true, color: new Color('#ffffff') } });
        continue;
      }
      const l = this.holder[p.qubit] ?? -1;
      const color = new Color(p.kind === 'cross' ? '#e2b04a' : l >= 0 ? qubitColor(l) : '#c9ccd1');
      this.pending.push({ at, bead: { line: this.drive[p.qubit], t: 0, up: false, color } });
    }
    this.pending.sort((a, b) => a.at - b.at);
    this.led.color.set('#2d7ff9');
    this.ledTimer = seconds;
  }

  update(dt: number): void {
    this.cans.update(dt);
    // the thermometers cool from room temperature, each stage to its own floor
    if (this.cool >= 0) {
      this.cool += dt;
      const u = Math.min(1, Math.max(0, (this.cool - 0.6) / COOLDOWN));
      STAGES.forEach((s, i) => {
        const ui = Math.min(1, u * (1 + (STAGES.length - 1 - i) * 0.12));
        const k = Math.exp(Math.log(300) * (1 - ui) + Math.log(s.kelvin) * ui);
        const cold = i === STAGES.length - 1 ? '#8fd3ff' : '#f2f3f5';
        this.labels[i].set(formatKelvin(ui >= 1 ? s.kelvin : k), s.name, ui >= 1 ? cold : '#c9ccd1');
      });
      if (u >= 1) this.cool = -1;
    }
    this.clock += dt;
    while (this.pending.length && this.pending[0].at <= this.clock) {
      if (this.beads.length < MAX_BEADS) this.beads.push(this.pending.shift()!.bead);
      else this.pending.shift();
    }
    for (const b of this.beads) b.t += ((b.up ? -1 : 1) * dt) / TRAVEL;
    this.beads = this.beads.filter((b) => b.t >= 0 && b.t <= 1);
    this.beads.forEach((b, i) => {
      b.line.getPointAt(Math.min(1, Math.max(0, b.t)), this.v);
      this.m.makeTranslation(this.v.x, this.v.y, this.v.z);
      for (const mesh of [this.beadMesh, this.beadGlow]) {
        mesh.setMatrixAt(i, this.m);
        mesh.setColorAt(i, b.color);
      }
    });
    for (const mesh of [this.beadMesh, this.beadGlow]) {
      mesh.count = this.beads.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
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
