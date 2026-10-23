import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  QuadraticBezierCurve3,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Op } from '../quantum/circuit';
import type { Chip, Routed } from '../quantum/routing';
import { GOLD, qubitColor, textTexture } from './visuals';

/** Metres between neighbouring qubit pads. */
const PITCH = 0.03;
const DIE = 0.112;
const BOARD = 0.17;
/** Seconds per op when a run is played back on the chip. */
const STEP = 0.16;

const ALUMINIUM = new Color('#b9bdc4');
const DIM = new Color('#6f737a');
const WHITE = new Color('#ffffff');

/** Directions the readout resonators leave each pad in (die units), away from the neighbours. */
const OUTWARD: Record<number, [number, number]> = { 0: [-1, 0], 1: [0, 1], 2: [1, 0], 3: [1, 0], 4: [0, -1] };

/** Die units (x right, y away from the player) to local metres on the desk. */
const at = (x: number, y: number, h = 0) => new Vector3(x * PITCH, h, -y * PITCH);

interface Coupler {
  a: number;
  b: number;
  mat: MeshStandardMaterial;
  /** 0..1 flash: gold for an entangling gate, white for a routing SWAP. */
  flash: number;
  swap: boolean;
}

/**
 * A 5-qubit superconducting chip on the desk: a silicon die with aluminium
 * cross-shaped qubits (Xmons), the couplers between neighbours, a meandering
 * readout resonator per qubit, and wire bonds out to the carrier board. Each
 * physical qubit is tinted with the colour of the logical qubit it holds, so
 * routing SWAPs visibly move qubits around; couplers flash gold when a
 * two-qubit gate runs on them (gold means entanglement everywhere in the app).
 */
export class ChipVisual {
  readonly root = new Group();
  private pads: { mat: MeshStandardMaterial; flash: number }[] = [];
  private couplers: Coupler[] = [];
  private labels: Mesh[] = [];
  private labelTex = new Map<string, CanvasTexture>();
  /** physical -> logical (-1: unused), as currently shown */
  private holder: number[];
  private queue: Op[] = [];
  private timer = 0;
  private finalLayout: number[] | null = null;

  constructor(readonly chip: Chip) {
    this.holder = new Array(chip.qubits).fill(-1);
    this.root.name = 'Chip';
    const metal = (color: Color | string, rough = 0.3, metalness = 0.9) => new MeshStandardMaterial({ color, roughness: rough, metalness });

    const board = new Mesh(new BoxGeometry(BOARD, 0.004, BOARD), new MeshStandardMaterial({ color: '#232427', roughness: 0.75, metalness: 0.1 }));
    board.position.y = 0.002;
    this.root.add(board);
    const die = new Mesh(new BoxGeometry(DIE, 0.0016, DIE), new MeshStandardMaterial({ color: '#2b3139', roughness: 0.22, metalness: 0.55 }));
    die.position.y = 0.0048;
    this.root.add(die);
    const top = 0.0057;

    // wire bonds: die edge pads to carrier pads, seven a side
    const bondMat = metal('#c9ccd1', 0.35);
    const padMat = metal('#9a9ea6', 0.4);
    const padGeo = new BoxGeometry(0.004, 0.0004, 0.0025);
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k < 7; k++) {
        const u = (k - 3) * 0.013;
        const rot = (v: Vector3) => {
          const c = Math.cos((side * Math.PI) / 2), s = Math.sin((side * Math.PI) / 2);
          return new Vector3(v.x * c - v.z * s, v.y, v.x * s + v.z * c);
        };
        const inner = rot(new Vector3(u, top, DIE / 2 - 0.004));
        const outer = rot(new Vector3(u, 0.0042, BOARD / 2 - 0.012));
        for (const p of [inner, outer]) {
          const pad = new Mesh(padGeo, padMat);
          pad.position.copy(p);
          pad.rotation.y = (side * Math.PI) / 2;
          this.root.add(pad);
        }
        const mid = inner.clone().lerp(outer, 0.5);
        mid.y += 0.005;
        const wire = new Mesh(new TubeGeometry(new QuadraticBezierCurve3(inner, mid, outer), 10, 0.00022, 4), bondMat);
        this.root.add(wire);
      }
    }

    // couplers between neighbouring qubits
    for (const [a, b] of chip.edges) {
      const pa = at(...(chip.pads[a] as [number, number]), top), pb = at(...(chip.pads[b] as [number, number]), top);
      const len = pa.distanceTo(pb) - 0.02;
      const mat = metal(ALUMINIUM.clone(), 0.28);
      const bar = new Mesh(new BoxGeometry(0.0024, 0.0005, len), mat);
      bar.position.copy(pa).lerp(pb, 0.5);
      bar.rotation.set(0, Math.atan2(pb.x - pa.x, pb.z - pa.z), 0);
      this.root.add(bar);
      this.couplers.push({ a, b, mat, flash: 0, swap: false });
    }

    // qubits: aluminium crosses with a readout meander each
    for (let q = 0; q < chip.qubits; q++) {
      const [x, y] = chip.pads[q] as [number, number];
      const c = at(x, y, top);
      const mat = metal(ALUMINIUM.clone(), 0.25);
      for (const [w, d] of [[0.019, 0.0034], [0.0034, 0.019]]) {
        const arm = new Mesh(new BoxGeometry(w, 0.0007, d), mat);
        arm.position.copy(c);
        this.root.add(arm);
      }
      this.pads.push({ mat, flash: 0 });
      const [ox, oy] = OUTWARD[q] ?? [1, 0];
      const dir = new Vector3(ox, 0, -oy), side = new Vector3(oy, 0, ox);
      const resMat = metal('#8d9199', 0.4);
      for (let k = 0; k < 5; k++) {
        const along = 0.0095 + k * 0.0016;
        const seg = new Mesh(new BoxGeometry(0.0005, 0.0004, 0.006), resMat);
        seg.position.copy(c).addScaledVector(dir, along);
        seg.rotation.y = Math.atan2(side.x, side.z);
        this.root.add(seg);
      }
      // physical name, and the logical qubit it holds
      const name = new Mesh(new PlaneGeometry(0.014, 0.00525), new MeshBasicMaterial({ map: textTexture([{ text: `Q${q}`, color: '#8a8d93' }]), transparent: true, depthWrite: false }));
      name.rotation.x = -Math.PI / 2;
      name.position.copy(c).add(new Vector3(-0.0085, 0.0003, 0.0085));
      this.root.add(name);
      const label = new Mesh(new PlaneGeometry(0.016, 0.006), new MeshBasicMaterial({ transparent: true, depthWrite: false }));
      label.rotation.x = -Math.PI / 2;
      label.position.copy(c).add(new Vector3(0.0085, 0.0003, 0.0085));
      this.root.add(label);
      this.labels.push(label);
    }

    const caption = new Mesh(new PlaneGeometry(0.05, 0.01875), new MeshBasicMaterial({ map: textTexture([{ text: `${chip.name} chip`, color: '#8a8d93' }], 500), transparent: true, depthWrite: false }));
    caption.rotation.x = -Math.PI / 2;
    caption.position.set(-BOARD / 2 + 0.03, 0.0041, BOARD / 2 - 0.006);
    this.root.add(caption);
    this.showLayout(null);
  }

  private labelFor(logical: number): CanvasTexture {
    const key = String(logical);
    let t = this.labelTex.get(key);
    if (!t) {
      t = textTexture([{ text: logical >= 0 ? `q${logical}` : '', color: logical >= 0 ? qubitColor(logical) : '#55585e' }], 700);
      this.labelTex.set(key, t);
    }
    return t;
  }

  /** Tint each physical qubit by the logical qubit on it (layout[i] = physical home of logical i), or clear. */
  showLayout(layout: readonly number[] | null): void {
    this.holder.fill(-1);
    layout?.forEach((p, i) => (this.holder[p] = i));
    this.refreshLabels();
  }

  private refreshLabels(): void {
    this.labels.forEach((m, p) => {
      const mat = m.material as MeshBasicMaterial;
      mat.map = this.labelFor(this.holder[p]);
      mat.needsUpdate = true;
    });
  }

  /** Play a routed run on the chip: qubits pulse as gates hit them, couplers flash, SWAPs move the colours. */
  play(routed: Routed): void {
    this.showLayout(routed.initial);
    this.queue = routed.ops.slice();
    this.finalLayout = routed.final;
    this.timer = 0;
  }

  get playing(): boolean {
    return this.queue.length > 0;
  }

  private fire(op: Op): void {
    const qs = op.kind === 'gate' ? [...(op.controls ?? []), op.target] : op.kind === 'swap' || op.kind === 'iswap' ? [op.a, op.b] : [op.qubit];
    for (const q of qs) if (this.pads[q]) this.pads[q].flash = 1;
    if (qs.length === 2) {
      const c = this.couplers.find((k) => (k.a === qs[0] && k.b === qs[1]) || (k.a === qs[1] && k.b === qs[0]));
      const routingSwap = op.kind === 'swap' && !op.controls?.length;
      if (c) {
        c.flash = 1;
        c.swap = routingSwap;
      }
      if (routingSwap) {
        [this.holder[qs[0]], this.holder[qs[1]]] = [this.holder[qs[1]], this.holder[qs[0]]];
        this.refreshLabels();
      }
    }
  }

  update(dt: number): void {
    if (this.queue.length) {
      this.timer += dt;
      while (this.queue.length && this.timer >= STEP) {
        this.timer -= STEP;
        this.fire(this.queue.shift()!);
        if (!this.queue.length && this.finalLayout) this.showLayout(this.finalLayout);
      }
    }
    this.pads.forEach((p, q) => {
      p.flash = Math.max(0, p.flash - dt * 3);
      const l = this.holder[q];
      const base = l >= 0 ? ALUMINIUM.clone().lerp(new Color(qubitColor(l)), 0.6) : DIM;
      p.mat.color.copy(base).lerp(WHITE, p.flash * 0.6);
    });
    for (const c of this.couplers) {
      c.flash = Math.max(0, c.flash - dt * 1.8);
      c.mat.color.copy(ALUMINIUM).lerp(c.swap ? WHITE : GOLD, c.flash);
    }
  }
}
