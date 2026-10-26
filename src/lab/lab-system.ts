import {
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  OneHandGrabbable,
  Pressed,
  Quaternion,
  RayInteractable,
  Vector3,
  VisibilityState,
  type Entity,
} from '@iwsdk/core';
import { blochVector } from '../quantum/bloch';
import type { Op } from '../quantum/circuit';
import { mixedness, pairStrength } from '../quantum/entanglement';
import { decompose, gateMatrix, type Vec3 } from '../quantum/gates';
import { gateLabel } from './gate-label';
import { QState } from '../quantum/state';
import { Qubit, VirtualRoom } from './components';
import { lab } from './instance';
import { partialState, type LabEvent } from './lab';
import { RainVisual } from './rain';
import { CircuitBoard, type LandscapeView, type PulseView } from './circuit-board';
import { FridgeVisual } from './fridge';
import { studioEnvironment, useStudio } from './machine-kit';
import { noiseLab } from './noise-lab';
import { runNoisy } from '../quantum/density';
import { ChipVisual } from './chip';
import { IonChamberVisual, IonTrapVisual } from './ion-trap';
import { AtomArrayVisual, OpticsTableVisual } from './atom-array';
import type { PlatformId } from '../quantum/platforms';
import type { Routed } from '../quantum/routing';
import { drawCertificate, type CertificateInfo } from './certificate';
import { unitaryFigure } from './figures';
import { circuitUnitary, describeUnitary } from '../quantum/advanced';
import { QSphereVisual, StateCityVisual } from './state-views-3d';
import { ManyWorldsVisual } from './worlds-3d';
import { RushFx } from './rush-fx';
import { Confetti } from './confetti';
import { TrophyShelf, type TrophyItem } from './trophies';
import { SurfaceCodeVisual } from './surface-3d';
import type { SurfaceView } from './figures';
import { manyWorlds } from '../quantum/paths';
import { pureDensity, type StateView } from '../quantum/state-views';
import { T5 } from '../quantum/routing';
import { feedback } from './feedback';
import { GOLD, GroupVisual, ORB_RADIUS, OrbVisual, setOrbEnvironment, StrikeVisual, ThreadVisual, type OrbSkinId } from './visuals';

/** Desk-top workspace origin when there is no head pose to place it from (desktop view). */
const DESK = new Vector3(0, 0.74, -0.42);
const ORB_HEIGHT = 0.15;
const GATE_SECONDS = 0.65;
const STORM_RED = '#ff5a4f';

interface Orb {
  entity: Entity;
  visual: OrbVisual;
}

interface Anim {
  before: QState;
  op: Op;
  t: number;
  scratch: QState;
}

/**
 * Keeps the 3D desk in sync with the lab: one glass orb per qubit with its
 * Bloch arrow, gold threads between entangled pairs, gate animations along
 * their true rotation path, and the probability rain.
 */
export class LabSystem extends createSystem({
  qubits: { required: [Qubit] },
  pressed: { required: [Qubit, Pressed] },
  rooms: { required: [VirtualRoom] },
}) {
  private workspace!: Entity;
  private orbs: Orb[] = [];
  private threads = new Map<string, ThreadVisual>();
  private rain!: RainVisual;
  private group!: GroupVisual;
  private bolt!: StrikeVisual;
  private board!: CircuitBoard;
  /** The 5-qubit chip on the desk, shown while the code window's Chip tab is open. */
  chip!: ChipVisual;
  /** The dilution refrigerator the chip lives in, shown with it. */
  fridge!: FridgeVisual;
  /** The other two kinds of machine: an ion trap in its vacuum chamber, and an atom array on its optics table. */
  ionTrap!: IonTrapVisual;
  ionChamber!: IonChamberVisual;
  atomArray!: AtomArrayVisual;
  opticsTable!: OpticsTableVisual;
  /** Which machine the hardware views show. */
  machine: PlatformId = 'superconducting';
  /** The UI wants the machine shown (the chip tab, or a course step about hardware). */
  hardwareWanted = false;
  /** Full size: the machine around the qubits (fridge, vacuum chamber, optics table) stands 1:1 on the floor beside the desk. */
  fullSize = false;
  /** The orbs' finish (unlocked by level). */
  private orbSkin: OrbSkinId = 'glass';
  /** 0 on the desk .. 1 full size, eased. */
  private grow = 0;
  private roomShown: object | null = null;
  /** Big-state views: the Q-sphere and the state city float where the board was; the board shows their legend. */
  private qsphere!: QSphereVisual;
  private city!: StateCityVisual;
  private worlds!: ManyWorldsVisual;
  /** Quantum Rush on the desk: the sixty-tick clock and the score pop-ups. */
  rushFx!: RushFx;
  private confetti!: Confetti;
  private trophies!: TrophyShelf;
  /** The Surface Code chapter's lattice, floating between the orb and the board. */
  private surface!: SurfaceCodeVisual;
  private stateView: StateView | null = null;
  /** Chip tab: the board shows the pulse schedule instead of the circuit. */
  private pulseView: PulseView | null = null;
  private pulseKey = '';
  /** A run playing on the board: seconds elapsed and total (-1: none). */
  private pulseClock = -1;
  /** Maths tab: the board shows the current step's matrix and state instead of the circuit. */
  private mathsOn = false;
  /** The library open: thumbnails or a QR code, drawn by the UI, kept until closed. */
  private overlayKey = '';
  /** Phase wheels or the VQE curve on the board (algorithm chapters). */
  private wheelsOn = false;
  private vqeView: Parameters<CircuitBoard['renderVqe']>[1] | undefined = undefined;
  private vqeKey = '';
  /** Noise lab open: the board shows the density matrix. */
  private densityOn = false;
  private noiseVersion = -1;
  /** QAOA steps: the board shows the graph and the cost landscape. */
  private landscapeView: LandscapeView | null = null;
  private landscapeKey = '';
  private pulseSeconds = 0;
  private boardTarget: QState | null = null;
  private boardVersion = -1;
  private boardTimer = 0;
  private sparks: { from: Vector3; to: Vector3; t: number }[] = [];
  private sparkMesh!: Mesh;
  private groupMembers: number[] = [];
  private anim: Anim | null = null;
  private strengths = new Map<string, number>();
  private blochCache: Vec3[] = [];
  private stateVersion = 0;
  private cachedVersion = -1;
  private readonly va = new Vector3();
  private readonly vb = new Vector3();
  /** Re-seat the workspace once the headset reports a real head pose. */
  private placePending = false;

  init(): void {
    const ws = new Group();
    ws.name = 'Workspace';
    ws.position.copy(DESK);
    this.workspace = this.world.createTransformEntity(ws);
    this.rain = new RainVisual();
    this.rain.root.position.set(-0.02, 0, 0.13);
    ws.add(this.rain.root);
    this.group = new GroupVisual();
    ws.add(this.group.mesh);
    this.bolt = new StrikeVisual();
    ws.add(this.bolt.mesh);
    // the circuit board stands at the back of the desk, leaning slightly back
    this.sparkMesh = new Mesh(new SphereGeometry(0.006, 16, 12), new MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(1.4), toneMapped: false }));
    this.sparkMesh.visible = false;
    ws.add(this.sparkMesh);
    this.board = new CircuitBoard();
    this.board.root.position.set(0, 0.27, -0.42);
    this.board.root.rotation.x = -0.12;
    ws.add(this.board.root);
    // the chip floats at the upper right, between the circuit board and the navigator
    this.chip = new ChipVisual(T5);
    this.chip.root.position.set(0.3, 0.2, -0.27);
    // standing up, turned to face the seated player, like a part in a display case
    this.chip.root.rotation.set(1.31, -0.34, 0, 'YXZ');
    this.chip.root.scale.setScalar(1.05);
    this.chip.root.visible = false;
    ws.add(this.chip.root);
    // the fridge stands at the back left, mirroring the chip
    this.fridge = new FridgeVisual(T5.qubits);
    this.fridge.root.visible = false;
    ws.add(this.fridge.root);
    // the ion trap and the atom array take the chip's place; their chamber and optics table the fridge's
    this.ionTrap = new IonTrapVisual();
    this.atomArray = new AtomArrayVisual();
    for (const device of [this.ionTrap.root, this.atomArray.root]) {
      device.position.set(0.3, 0.14, -0.27);
      device.rotation.set(0.42, -0.34, 0, 'YXZ');
      device.scale.setScalar(1.5);
      device.visible = false;
      ws.add(device);
    }
    this.ionChamber = new IonChamberVisual();
    this.opticsTable = new OpticsTableVisual();
    for (const m of [this.ionChamber.root, this.opticsTable.root]) {
      m.visible = false;
      ws.add(m);
    }
    // every machine reflects a soft studio, so steel, copper and glass read as real materials
    const env = studioEnvironment(this.renderer);
    setOrbEnvironment(env);
    for (const m of [this.chip.root, this.fridge.root, this.ionTrap.root, this.ionChamber.root, this.atomArray.root, this.opticsTable.root]) useStudio(m, env);
    this.qsphere = new QSphereVisual();
    this.qsphere.root.position.set(0, 0.25, -0.27);
    this.qsphere.root.visible = false;
    ws.add(this.qsphere.root);
    this.city = new StateCityVisual();
    this.city.root.position.set(0, 0.17, -0.3);
    this.city.root.rotation.x = 0.18;
    this.city.root.visible = false;
    ws.add(this.city.root);
    // many worlds: the paths stand where the board was, leaning back a little
    this.worlds = new ManyWorldsVisual();
    this.worlds.root.position.set(0, 0.19, -0.34);
    this.worlds.root.rotation.x = -0.12;
    this.worlds.root.visible = false;
    ws.add(this.worlds.root);
    this.surface = new SurfaceCodeVisual();
    this.surface.env = env;
    this.surface.root.position.set(0, 0.3, -0.2);
    // held up toward the player like a chip in a display case
    this.surface.root.rotation.x = 1.15;
    this.surface.root.scale.setScalar(1.35);
    this.surface.root.visible = false;
    ws.add(this.surface.root);
    this.confetti = new Confetti();
    ws.add(this.confetti.root);
    // the trophy shelf stands upper right, above the navigator, while the progress board is up
    this.trophies = new TrophyShelf();
    this.trophies.env = env;
    this.trophies.root.position.set(0.5, 0.42, -0.2);
    this.trophies.root.rotation.y = -0.55;
    this.trophies.root.visible = false;
    ws.add(this.trophies.root);
    this.rushFx = new RushFx();
    this.rushFx.root.position.set(0, 0.003, -0.03);
    ws.add(this.rushFx.root);

    // development: the lab system, for probing scenes from the managed browser
    if (import.meta.env.DEV) (globalThis as { __entangledLab?: LabSystem }).__entangledLab = this;
    this.syncOrbs(true);
    this.cleanupFuncs.push(lab.on((e) => this.onLabEvent(e)));

    this.queries.pressed.subscribe('qualify', (entity) => {
      lab.select(entity.getValue(Qubit, 'index') ?? 0);
    });

    // passthrough: hide the virtual room and re-seat the workspace in front of the player
    this.cleanupFuncs.push(
      this.visibilityState.subscribe((v) => {
        const immersive = v !== VisibilityState.NonImmersive;
        const blend = this.world.xrSession?.environmentBlendMode;
        const passthrough = immersive && (blend === 'alpha-blend' || blend === 'additive');
        for (const room of this.queries.rooms.entities) if (room.object3D) room.object3D.visible = !passthrough;
        if (immersive) this.placePending = true;
        else {
          this.placePending = false;
          ws.position.copy(DESK);
          ws.rotation.set(0, 0, 0);
        }
      }),
    );
  }

  /** Put the desk workspace a comfortable seated reach below and in front of the head. */
  private placeWorkspaceFromHead(): void {
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    const pos = new Vector3().setFromMatrixPosition(head.matrixWorld);
    const fwd = new Vector3(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new Quaternion()));
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const ws = this.workspace.object3D!;
    ws.position.copy(pos).addScaledVector(fwd, 0.4);
    ws.position.y = pos.y - 0.42;
    ws.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
  }

  private onLabEvent(e: LabEvent): void {
    this.stateVersion++;
    switch (e.type) {
      case 'op': {
        this.rain.hide();
        const op = e.op;
        if (op.kind === 'gate' && e.live) {
          // a wrist turn was already animated by the hand itself: just name it
          this.anim = null;
          this.orbs[op.target]?.visual.showGate(gateLabel(op), null, 0, [0, 0, 1]);
        } else if (op.kind === 'gate' && !op.condition) {
          this.anim = { before: e.before, op, t: 0, scratch: e.before.clone() };
          this.gateEffects(op, e.before);
        } else {
          this.anim = null;
        }
        if (op.kind === 'swap' || op.kind === 'iswap') {
          this.spark(op.a, op.b);
          this.orbs[op.b]?.visual.showGate(op.kind === 'swap' ? 'SWAP' : 'iSWAP', null, 0, [0, 0, 1], '#e2b04a');
        }
        if (op.kind === 'measure') {
          this.orbs[op.qubit]?.visual.showGate(`M = ${op.outcome ?? '?'}`, null, 0, [0, 0, 1], '#e4e6eb');
          this.orbs[op.qubit]?.visual.flash('#ffffff');
          this.orbs[op.qubit]?.visual.pulseRipple('#ffffff');
          // entangled partners collapse in the same instant
          for (let q = 0; q < e.before.n; q++) {
            if (q !== op.qubit && pairStrength(e.before, op.qubit, q) > 0.05) {
              this.orbs[q]?.visual.flash(GOLD);
              this.orbs[q]?.visual.pulseRipple(GOLD);
            }
          }
        }
        break;
      }
      case 'reset':
      case 'seek':
        this.anim = null;
        this.rain.hide();
        this.syncOrbs(e.type === 'reset');
        for (const o of this.orbs) o.visual.clearTrail();
        break;
      case 'shots': {
        const centre = new Vector3();
        for (const o of this.orbs) centre.add(o.entity.object3D!.position);
        centre.divideScalar(Math.max(1, this.orbs.length)).sub(this.rain.root.position);
        this.rain.play(e.counts, lab.n, centre);
        break;
      }
      case 'select':
        this.orbs.forEach((o, i) => o.visual.setSelected(i === lab.selected));
        break;
      case 'hit': {
        const o = this.orbs[e.qubit];
        if (!o) break;
        this.bolt.strike(o.entity.object3D!.position);
        o.visual.flash(STORM_RED);
        feedback('storm');
        break;
      }
    }
  }

  /** Name and rotation path for a gate; controlled gates also send a spark from control to target. */
  private gateEffects(op: Op & { kind: 'gate' }, before: QState): void {
    const target = this.orbs[op.target]?.visual;
    if (!target) return;
    const controls = op.controls ?? [];
    if (controls.length) {
      const name = op.gate === 'x' ? (controls.length === 1 ? 'CNOT' : 'Toffoli') : `C${op.gate.toUpperCase()}`;
      for (const c of controls) this.spark(c, op.target);
      target.showGate(name, null, 0, [0, 0, 1], '#e2b04a');
      return;
    }
    const { axis, angle } = decompose(gateMatrix(op.gate, op.params));
    target.showGate(gateLabel(op), axis, angle, blochVector(before, op.target));
  }

  /** A gold bead that flies from one orb to another: a two-qubit gate passing between them. */
  private spark(from: number, to: number): void {
    const a = this.orbs[from]?.entity.object3D, b = this.orbs[to]?.entity.object3D;
    if (!a || !b) return;
    this.sparks.push({ from: a.position.clone(), to: b.position.clone(), t: 0 });
  }

  private layout(i: number, n: number, out: Vector3): Vector3 {
    const spacing = n <= 3 ? 0.18 : 0.13;
    const x = (i - (n - 1) / 2) * spacing;
    return out.set(x, ORB_HEIGHT, -Math.abs(x) * 0.35);
  }

  /** Create or remove orb entities so there is one per qubit. */
  private syncOrbs(relayout: boolean): void {
    const n = lab.n;
    // a different qubit count always needs a fresh layout, or old orbs overlap new ones
    if (this.orbs.length !== n) relayout = true;
    while (this.orbs.length > n) {
      const o = this.orbs.pop()!;
      o.entity.dispose();
    }
    while (this.orbs.length < n) {
      const i = this.orbs.length;
      const visual = new OrbVisual(i, ORB_RADIUS, ORB_HEIGHT);
      visual.applySkin(this.orbSkin);
      visual.root.name = `Qubit${i}`;
      if (this.owners[i]) visual.setOwner(this.owners[i]);
      const entity = this.world.createTransformEntity(visual.root, { parent: this.workspace });
      entity.addComponent(Qubit, { index: i });
      entity.addComponent(OneHandGrabbable, { rotate: false });
      entity.addComponent(RayInteractable);
      this.layout(i, n, visual.root.position);
      this.orbs.push({ entity, visual });
    }
    if (relayout) this.orbs.forEach((o, i) => this.layout(i, n, o.entity.object3D!.position));
    for (const [key, t] of this.threads) {
      const [a, b] = key.split('-').map(Number);
      if (a >= n || b >= n) {
        t.mesh.removeFromParent();
        t.mesh.geometry.dispose();
        this.threads.delete(key);
      }
    }
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const key = `${a}-${b}`;
        if (!this.threads.has(key)) {
          const t = new ThreadVisual();
          this.workspace.object3D!.add(t.mesh);
          this.threads.set(key, t);
        }
      }
    }
    this.orbs.forEach((o, i) => o.visual.setSelected(i === lab.selected));
  }

  /** The desk workspace every panel and orb is placed relative to. */
  get workspaceObject() {
    return this.workspace.object3D!;
  }

  orbPosition(i: number, out: Vector3): Vector3 {
    const o = this.orbs[i];
    if (!o) return out.set(0, 0, 0);
    o.entity.object3D!.getWorldPosition(out);
    return out;
  }

  /** Orb centre in workspace space (orbs may have been moved by hand). */
  orbLocal(i: number, out: Vector3): Vector3 {
    const o = this.orbs[i];
    return o ? out.copy(o.entity.object3D!.position) : out.set(0, ORB_HEIGHT, 0);
  }

  /** Target state drawn on the circuit board as mint outlines (puzzles); null hides it. */
  setBoardTarget(target: QState | null): void {
    if (target === this.boardTarget) return;
    this.boardTarget = target;
    this.boardVersion = -1;
  }

  /** Target arrows per qubit (lessons); missing entries hide theirs. */
  setTargets(targets: readonly (Vec3 | null)[] | null): void {
    this.orbs.forEach((o, q) => o.visual.setTarget(targets?.[q] ?? null));
  }

  get orbCount(): number {
    return this.orbs.length;
  }

  /**
   * The machine around the qubits sits at the back left of the desk, scaled
   * down; at full size it grows to 1:1 and stands on the floor beside the desk,
   * turned to face the player. Each time it comes into view (or grows) it
   * plays its reveal.
   */
  private placeRoomMachine(dt: number): void {
    const shown = [this.fridge, this.ionChamber, this.opticsTable].find((m) => m.root.visible) ?? null;
    const target = this.fullSize ? 1 : 0;
    const before = this.grow;
    this.grow += (target - this.grow) * (1 - Math.exp(-dt * 3.2));
    if (Math.abs(this.grow - target) < 1e-3) this.grow = target;
    if (shown && (shown !== this.roomShown || (before < 0.5 && this.grow >= 0.5))) shown.reveal();
    this.roomShown = shown;
    if (!shown) return;
    const g = this.grow, e = g * g * (3 - 2 * g);
    const { deskScale, fullScale, lift } = shown.size;
    const floor = -this.workspace.object3D!.position.y;
    const r = shown.root;
    r.scale.setScalar(Math.exp(Math.log(deskScale) * (1 - e) + Math.log(fullScale) * e));
    r.position.set(-0.37 + (-1.0 + 0.37) * e, (floor + lift * fullScale) * e, -0.33 + (-0.75 + 0.33) * e);
    r.rotation.y = 0.5 + (0.6 - 0.5) * e;
    if (shown.stand) shown.stand.visible = g > 0.02;
  }

  /** A celebration bursting out of the orbs (smaller for an achievement). */
  celebrate(big = true): void {
    this.confetti.burst(new Vector3(0, ORB_HEIGHT, -0.03), big);
  }

  /** The trophy shelf (null hides it). */
  showTrophies(items: readonly TrophyItem[] | null): void {
    this.trophies.root.visible = !!items;
    if (items) this.trophies.set(items);
  }

  /** The Surface Code chapter's lattice (null hides it). */
  showSurface(v: SurfaceView | null): void {
    this.surface.root.visible = !!v;
    if (v) this.surface.set(v);
  }

  /** Dress every orb in a finish. */
  setSkin(id: OrbSkinId): void {
    this.orbSkin = id;
    for (const o of this.orbs) o.visual.applySkin(id);
  }

  /** Recentre the desk in front of the player (also used by the recenter button). */
  recenter(): void {
    this.placePending = true;
  }

  update(delta: number): void {
    // development: slow motion (window.__entangledSlowmo), for recording the animations frame by frame
    const slow = import.meta.env.DEV ? ((globalThis as { __entangledSlowmo?: number }).__entangledSlowmo ?? 1) : 1;
    const dt = Math.min(delta, 0.05) * slow;
    // one machine at a time: the device where the chip floats, its surroundings where the fridge stands
    const device = this.hardwareWanted, room = !!this.pulseView;
    this.chip.root.visible = device && this.machine === 'superconducting';
    this.fridge.root.visible = room && this.machine === 'superconducting';
    this.ionTrap.root.visible = device && this.machine === 'ions';
    this.ionChamber.root.visible = room && this.machine === 'ions';
    this.atomArray.root.visible = device && this.machine === 'atoms';
    this.opticsTable.root.visible = room && this.machine === 'atoms';
    if (this.ionTrap.root.visible || this.atomArray.root.visible) {
      this.ionTrap.setQubits(lab.n);
      this.atomArray.setQubits(lab.n);
      this.ionChamber.setQubits(lab.n);
    }
    this.placeRoomMachine(dt);
    if (this.chip.root.visible) this.chip.update(dt);
    if (this.fridge.root.visible) this.fridge.update(dt);
    if (this.ionTrap.root.visible) this.ionTrap.update(dt);
    if (this.ionChamber.root.visible) this.ionChamber.update(dt);
    if (this.atomArray.root.visible) this.atomArray.update(dt);
    if (this.opticsTable.root.visible) this.opticsTable.update(dt);
    if (this.qsphere.root.visible) this.qsphere.update(dt);
    if (this.city.root.visible) this.city.update(dt);
    if (this.worlds.root.visible) this.worlds.update(dt);
    if (this.rushFx.root.visible) this.rushFx.update(dt);
    if (this.confetti.root.visible) this.confetti.update(dt);
    if (this.trophies.root.visible) this.trophies.update(dt);
    if (this.surface.root.visible) this.surface.update(dt);
    // on the chip tab the board rises above the code window so the pulse schedule shows
    const boardY = this.boardRaised || (this.stateView && this.stateView !== 'heatmap' && this.stateView !== 'unitary') || this.pulseView || this.mathsOn || this.landscapeView || this.densityOn || this.wheelsOn || this.vqeView !== undefined || this.overlayKey ? 0.5 : 0.27;
    this.board.root.position.y += (boardY - this.board.root.position.y) * (1 - Math.exp(-dt * 8));
    if (this.placePending) {
      this.player.head.updateWorldMatrix(true, false);
      // wait for tracking: a seated head is well above the floor
      if (this.player.head.matrixWorld.elements[13] > 0.5) {
        this.placeWorkspaceFromHead();
        this.placePending = false;
      }
    }
    let state = lab.state;
    let animating = false;

    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / GATE_SECONDS);
      const ease = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
      const partial = partialState(a.before, a.op, ease, a.scratch);
      if (partial && a.t < 1) {
        state = partial;
        animating = true;
      }
      if (a.op.kind === 'gate') {
        const target = this.orbs[a.op.target]?.visual;
        if (a.t < 1 && !a.op.controls?.length) target?.setAxis(decompose(gateMatrix(a.op.gate, a.op.params)).axis, Math.sin(Math.PI * a.t));
        else target?.setAxis(null);
        if (a.t >= 1 && a.op.controls?.length) {
          // a controlled gate that created entanglement glows gold
          for (const c of a.op.controls) {
            if (pairStrength(lab.state, c, a.op.target) > 0.05) {
              this.orbs[c]?.visual.flash(GOLD);
              this.orbs[a.op.target]?.visual.flash(GOLD);
            }
          }
        }
      }
      if (a.t >= 1) this.anim = null;
    }

    // Bloch vectors and pair strengths: recompute only when the state can have changed
    const n = Math.min(state.n, this.orbs.length);
    if (animating || lab.rotating || this.cachedVersion !== this.stateVersion || this.noiseVersion !== noiseLab.version) {
      // the noise lab shows the mixed state: arrows shrink inside the spheres
      const rho = noiseLab.on && !animating && !lab.rotating ? noiseLab.rho(lab.n, lab.history.ops) : null;
      for (let q = 0; q < n; q++) this.blochCache[q] = rho ? rho.bloch(q) : blochVector(state, q);
      if (!animating) this.noiseVersion = noiseLab.version;
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) this.strengths.set(`${a}-${b}`, pairStrength(state, a, b));
      // qubits entangled with the rest but with no single entangled partner: a GHZ-style group
      this.groupMembers = [];
      for (let q = 0; q < n; q++) {
        let paired = false;
        for (let o = 0; o < n; o++) if (o !== q && (this.strengths.get(q < o ? `${q}-${o}` : `${o}-${q}`) ?? 0) > 0.05) paired = true;
        if (!paired && mixedness(state, q) > 0.5) this.groupMembers.push(q);
      }
      if (!animating) this.cachedVersion = this.stateVersion;
    }

    for (let q = 0; q < n; q++) {
      const o = this.orbs[q];
      o.visual.setBloch(this.blochCache[q]);
      o.visual.setHeight(o.entity.object3D!.position.y);
      o.visual.update(dt);
    }
    for (const [key, t] of this.threads) {
      const [a, b] = key.split('-').map(Number);
      const oa = this.orbs[a]?.entity.object3D, ob = this.orbs[b]?.entity.object3D;
      if (!oa || !ob) continue;
      const strength = this.strengths.get(key) ?? 0;
      t.set(this.va.copy(oa.position), this.vb.copy(ob.position), strength);
      t.update(dt, strength);
    }
    this.group.set(this.groupMembers.map((q) => this.orbs[q].entity.object3D!.position));
    this.rain.update(dt);
    this.bolt.update(dt);
    // sparks: one at a time is plenty; an arc up and over between the two orbs
    const sp = this.sparks[0];
    if (sp) {
      sp.t = Math.min(1, sp.t + dt / 0.45);
      const u = sp.t * sp.t * (3 - 2 * sp.t);
      this.sparkMesh.position.lerpVectors(sp.from, sp.to, u);
      this.sparkMesh.position.y += Math.sin(Math.PI * u) * 0.05;
      this.sparkMesh.visible = true;
      if (sp.t >= 1) this.sparks.shift();
    } else this.sparkMesh.visible = false;

    // circuit board: redraw when the committed state changes, and a few times a second while turning
    this.boardTimer += dt;
    const turning = lab.rotating && this.boardTimer > 0.08;
    if ((this.boardVersion !== this.stateVersion && !animating) || turning) {
      this.boardVersion = this.stateVersion;
      this.boardTimer = 0;
      const h = lab.history.toJSON();
      if (this.overlayKey) {
        // the library's view stays until it closes
      } else if (this.stateView === 'unitary') {
        // the circuit up to the timeline cursor, as one matrix
        const ops = lab.history.ops.slice(0, lab.history.cursor);
        const u = circuitUnitary(lab.n, ops);
        const fig = unitaryFigure(lab.n, ops.length, u, u ? describeUnitary(u) : 'This circuit measures, so it is not one matrix any more: a measurement is not reversible. Rewind to before the first measurement to see the matrix.');
        this.board.draw(fig.draw);
      } else if (this.stateView) {
        const rho = noiseLab.on ? noiseLab.rho(lab.n, lab.history.ops) : pureDensity(lab.history.state);
        const worlds = this.stateView === 'worlds' ? manyWorlds(lab.n, lab.history.ops) : undefined;
        this.board.renderStateView(this.stateView, lab.history.state, rho, noiseLab.on, worlds);
        if (worlds) this.worlds.set(worlds);
        if (this.stateView === 'qsphere') this.qsphere.set(lab.history.state);
        if (this.stateView === 'city') this.city.set(rho);
      } else if (this.wheelsOn) {
        this.board.renderWheels(lab.history.state);
      } else if (this.vqeView !== undefined) {
        // drawn by showVqe
      } else if (this.densityOn) {
        const rho = noiseLab.on ? noiseLab.rho(lab.n, lab.history.ops) : runNoisy(lab.n, lab.history.ops, { t1: Infinity, t2: Infinity, depol: 0 });
        this.board.renderDensity(rho, noiseLab.noise, noiseLab.on, noiseLab.zne);
      } else if (this.mathsOn) {
        const k = lab.history.cursor;
        const ops = lab.history.ops;
        this.board.renderMaths(lab.n, k > 0 ? ops[k - 1] : null, k, h.ops.length, lab.history.stateAt(Math.max(0, k - 1)), lab.history.state);
      } else if (!this.pulseView && !this.landscapeView && this.vqeView === undefined) this.board.render(lab.n, h.ops, lab.history.cursor, lab.state, this.boardTarget);
    }
    if (this.pulseView && this.pulseClock >= 0) {
      this.pulseClock += dt;
      // about 20 redraws a second is plenty for a sweeping cursor
      if (this.boardTimer > 0.05 || this.pulseClock >= this.pulseSeconds) {
        this.boardTimer = 0;
        const done = this.pulseClock >= this.pulseSeconds;
        this.board.renderPulses(this.pulseView, done ? null : (this.pulseClock / this.pulseSeconds) * this.pulseView.schedule.duration);
        if (done) this.pulseClock = -1;
      }
    }
  }

  /**
   * The chip tab: show the pulse schedule on the board and the fridge beside
   * it (null puts the circuit back). Calling it again with the same view does nothing.
   */
  showHardware(view: PulseView | null): void {
    const key = view ? JSON.stringify([view.title, view.holders, view.schedule.duration, view.schedule.pulses.length]) : '';
    if (key === this.pulseKey) return;
    this.pulseKey = key;
    this.pulseView = view;
    this.pulseClock = -1;
    if (view) {
      this.fridge.setHolders(view.holders);
      // an overlay (the machine comparison) keeps the board until it is put away
      if (!this.overlayKey) this.board.renderPulses(view, null);
    } else {
      this.boardVersion = -1;
    }
  }

  /** Let the UI draw on the board (library thumbnails, a QR code); null gives it back. Same key again does nothing. */
  private owners: (string | null)[] = [];
  /** Shared lab: who holds each qubit (names show on the desk beside the orbs). */
  setOwners(owners: (string | null)[]): void {
    if (owners.length === this.owners.length && owners.every((o, i) => o === this.owners[i])) return;
    this.owners = owners;
    this.orbs.forEach((o, i) => o.visual.setOwner(owners[i] ?? null));
  }

  /** Lift the board above a window open in front of it (the step debugger). */
  boardRaised = false;

  showOverlay(key: string | null, draw?: (board: CircuitBoard) => void): void {
    const k = key ?? '';
    if (k === this.overlayKey) return;
    this.overlayKey = k;
    if (k && draw) draw(this.board);
    else this.boardVersion = -1;
  }

  /** What the board shows right now, as an image. */
  boardImage(): HTMLCanvasElement {
    return this.board.image;
  }

  /** The completion certificate on the board (null puts the circuit back). */
  showCertificate(info: CertificateInfo | null): void {
    this.showOverlay(info ? `cert:${info.name}:${info.modules.join(',')}:${info.context}` : null, info ? (b) => b.draw((g, w, h) => drawCertificate(g, w, h, info)) : undefined);
  }

  /** A big-state view (null puts the circuit back). */
  showStateView(view: StateView | null): void {
    if (view === this.stateView) return;
    this.stateView = view;
    this.qsphere.root.visible = view === 'qsphere';
    this.city.root.visible = view === 'city';
    this.worlds.root.visible = view === 'worlds';
    this.boardVersion = -1;
  }

  /** Phase wheels for the QFT and phase estimation chapters. */
  showWheels(on: boolean): void {
    if (on === this.wheelsOn) return;
    this.wheelsOn = on;
    this.boardVersion = -1;
  }

  /** The VQE chemistry curve (undefined puts the circuit back). */
  showVqe(view: Parameters<CircuitBoard['renderVqe']>[1] | undefined, points: Parameters<CircuitBoard['renderVqe']>[0]): void {
    const key = view === undefined ? '' : JSON.stringify(view ? [view.energy, view.r, view.curve?.length ?? 0] : 'none');
    if (key === this.vqeKey) return;
    this.vqeKey = key;
    this.vqeView = view;
    if (view !== undefined) this.board.renderVqe(points, view);
    else this.boardVersion = -1;
  }

  /** The noise lab's board: the density matrix, Bloch lengths and the ZNE plot. */
  showDensity(on: boolean): void {
    if (on === this.densityOn) return;
    this.densityOn = on;
    this.boardVersion = -1;
  }

  /** Redraw the board now (noise settings changed). */
  refreshBoard(): void {
    this.boardVersion = -1;
  }

  /** QAOA steps: the graph and the landscape (null puts the circuit back). Same view again does nothing. */
  showLandscape(view: LandscapeView | null): void {
    const key = view ? `${view.graph.name}-${view.qaoa ? `${view.qaoa.p}-${view.qaoa.path.length}-${view.qaoa.energy}` : 'none'}` : '';
    if (key === this.landscapeKey) return;
    this.landscapeKey = key;
    this.landscapeView = view;
    if (view) this.board.renderLandscape(view);
    else this.boardVersion = -1;
  }

  /** The maths tab: the board follows the timeline cursor and shows that step's maths. */
  showMaths(on: boolean): void {
    if (on === this.mathsOn) return;
    this.mathsOn = on;
    this.boardVersion = -1;
  }

  /** Play a run: the board's cursor sweeps the schedule and pulses travel down the fridge's lines. */
  playHardware(seconds: number): void {
    if (!this.pulseView) return;
    this.pulseClock = 0;
    this.pulseSeconds = seconds;
    this.fridge.play(this.pulseView.schedule.pulses, this.pulseView.schedule.duration, seconds);
    this.ionChamber.play(seconds);
    this.opticsTable.play(seconds);
  }

  /** Play a compiled run on whichever machine is showing. */
  playMachine(routed: Routed): void {
    if (this.machine === 'superconducting') this.chip.play(routed);
    else if (this.machine === 'ions') this.ionTrap.play(routed.ops);
    else this.atomArray.play(routed.ops);
  }

  /** How long the run takes to play back on the machine, seconds. */
  machineSeconds(routed: Routed): number {
    if (this.machine === 'superconducting') return Math.max(1.6, routed.ops.length * 0.16 + 0.4);
    if (this.machine === 'ions') return Math.max(1.6, routed.ops.length * 0.24 + 0.4);
    const far = routed.ops.filter((o) => o.kind === 'gate' && o.controls?.length === 1 && Math.abs(o.controls[0] - o.target) > 1).length;
    return Math.max(1.6, routed.ops.length * 0.3 + far * 2.0 + 0.4);
  }
}
