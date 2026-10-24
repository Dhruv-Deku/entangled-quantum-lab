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
import { noiseLab } from './noise-lab';
import { runNoisy } from '../quantum/density';
import { ChipVisual } from './chip';
import { drawCertificate, type CertificateInfo } from './certificate';
import { QSphereVisual, StateCityVisual } from './state-views-3d';
import { pureDensity, type StateView } from '../quantum/state-views';
import { T5 } from '../quantum/routing';
import { feedback } from './feedback';
import { GOLD, GroupVisual, ORB_RADIUS, OrbVisual, StrikeVisual, ThreadVisual } from './visuals';

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
  /** Big-state views: the Q-sphere and the state city float where the board was; the board shows their legend. */
  private qsphere!: QSphereVisual;
  private city!: StateCityVisual;
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
    this.fridge.root.position.set(-0.37, 0.0, -0.33);
    this.fridge.root.rotation.y = 0.5;
    this.fridge.root.visible = false;
    ws.add(this.fridge.root);
    this.qsphere = new QSphereVisual();
    this.qsphere.root.position.set(0, 0.25, -0.27);
    this.qsphere.root.visible = false;
    ws.add(this.qsphere.root);
    this.city = new StateCityVisual();
    this.city.root.position.set(0, 0.17, -0.3);
    this.city.root.rotation.x = 0.18;
    this.city.root.visible = false;
    ws.add(this.city.root);

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

  /** Recentre the desk in front of the player (also used by the recenter button). */
  recenter(): void {
    this.placePending = true;
  }

  update(delta: number): void {
    const dt = Math.min(delta, 0.05);
    if (this.chip.root.visible) this.chip.update(dt);
    if (this.fridge.root.visible) this.fridge.update(dt);
    if (this.qsphere.root.visible) this.qsphere.update(dt);
    if (this.city.root.visible) this.city.update(dt);
    // on the chip tab the board rises above the code window so the pulse schedule shows
    const boardY = this.boardRaised || (this.stateView && this.stateView !== 'heatmap') || this.pulseView || this.mathsOn || this.landscapeView || this.densityOn || this.wheelsOn || this.vqeView !== undefined || this.overlayKey ? 0.5 : 0.27;
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
      } else if (this.stateView) {
        const rho = noiseLab.on ? noiseLab.rho(lab.n, lab.history.ops) : pureDensity(lab.history.state);
        this.board.renderStateView(this.stateView, lab.history.state, rho, noiseLab.on);
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
    this.fridge.root.visible = !!view;
    if (view) {
      this.fridge.setHolders(view.holders);
      this.board.renderPulses(view, null);
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
  }
}
