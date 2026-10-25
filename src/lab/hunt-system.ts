import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from '@iwsdk/core';
import { HuntGame, huntStatus, HUNT_TITLE } from '../game/hunt';
import { campaign } from '../game/instance';
import { feedback } from './feedback';
import { LabSystem } from './lab-system';
import { pickHidingSpots } from './room';
import { GOLD, qubitColor } from './visuals';

/** Surfaces the hunt never hides qubits on. */
const NOT_HERE = new Set(['ceiling', 'global mesh', 'screen', 'wall art', 'window', 'door', 'wall']);
const REACH = 0.13;
const WHITE = new Color('#ffffff');

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

function digitTexture(text: string, color: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '700 96px Inter, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(20,21,24,0.85)';
  g.strokeText(text, 64, 70);
  g.fillStyle = color;
  g.fillText(text, 64, 70);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** One escaped qubit: a translucent shell, two ghost cores (0 and 1 at once) that merge into one when measured, a glow. */
class JellyQubit {
  readonly root = new Group();
  readonly home = new Vector3();
  readonly shellMat: MeshStandardMaterial;
  private readonly cores: Mesh[] = [];
  private readonly coreMats: MeshBasicMaterial[] = [];
  private readonly halo: Sprite;
  private readonly haloMat: SpriteMaterial;
  private label: Sprite | null = null;
  private phase = Math.random() * 10;
  value: 0 | 1 | null = null;
  flash = 0;
  /** Where it is going once caught: following the hand, then to the tray. */
  follow: Vector3 | null = null;
  followT = 0;
  tray: Vector3 | null = null;

  constructor(readonly color: string, glow: CanvasTexture) {
    this.shellMat = new MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.32, emissive: new Color(color), emissiveIntensity: 0.25, depthWrite: false });
    const shell = new Mesh(new SphereGeometry(0.06, 32, 24), this.shellMat);
    this.root.add(shell);
    for (let k = 0; k < 2; k++) {
      const mat = new MeshBasicMaterial({ color: k ? color : '#ffffff' });
      const core = new Mesh(new SphereGeometry(0.015, 16, 12), mat);
      this.cores.push(core);
      this.coreMats.push(mat);
      this.root.add(core);
    }
    this.haloMat = new SpriteMaterial({ map: glow, color, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending });
    this.halo = new Sprite(this.haloMat);
    this.halo.scale.setScalar(0.3);
    this.root.add(this.halo);
  }

  /** Measured: one core, and the value floating above it. */
  collapse(value: 0 | 1): void {
    this.value = value;
    this.flash = 1;
    this.label = new Sprite(new SpriteMaterial({ map: digitTexture(String(value), '#ffffff'), transparent: true, depthWrite: false }));
    this.label.scale.setScalar(0.06);
    this.label.position.y = 0.085;
    this.root.add(this.label);
  }

  update(dt: number, t: number): void {
    this.phase += dt;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    if (this.value === null) {
      // superposition: two cores circling each other inside the shell
      const a = this.phase * 2.2;
      this.cores[0].position.set(Math.cos(a) * 0.018, Math.sin(a * 1.3) * 0.006, Math.sin(a) * 0.018);
      this.cores[1].position.set(-Math.cos(a) * 0.018, -Math.sin(a * 1.3) * 0.006, -Math.sin(a) * 0.018);
      this.root.position.copy(this.home);
      this.root.position.y += Math.sin(t * 1.6 + this.phase * 0.3) * 0.012;
    } else {
      this.cores[0].position.lerp(new Vector3(), Math.min(1, dt * 6));
      this.cores[1].position.lerp(new Vector3(), Math.min(1, dt * 6));
      this.cores[1].visible = false;
      this.shellMat.opacity = 0.5;
    }
    this.coreMats[0].color.set('#ffffff').lerp(new Color(this.color), this.value === null ? 0.5 + 0.5 * Math.sin(this.phase * 5) : 0.2);
    this.haloMat.opacity = 0.45 + 0.5 * this.flash;
    this.halo.scale.setScalar(0.3 * (1 + this.flash));
    this.shellMat.emissiveIntensity = 0.25 + 1.2 * this.flash;
    this.shellMat.color.set(this.color).lerp(WHITE, this.flash * 0.6);
  }
}

/** A gold thread across the room between two partners; a bead runs along it when the pair collapses, then it fades. */
class Thread {
  readonly mesh: Mesh;
  readonly mat: MeshBasicMaterial;
  readonly bead: Mesh;
  private curve: QuadraticBezierCurve3;
  /** 0..1 along the thread from the caught qubit, or -1. */
  run = -1;
  fade = 1;
  private reverse = false;

  constructor(a: Vector3, b: Vector3) {
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 0.35 + a.distanceTo(b) * 0.12;
    this.curve = new QuadraticBezierCurve3(a.clone(), mid, b.clone());
    this.mat = new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.4, depthWrite: false });
    this.mesh = new Mesh(new TubeGeometry(this.curve, 64, 0.0045, 6), this.mat);
    this.bead = new Mesh(new SphereGeometry(0.024, 16, 12), new MeshBasicMaterial({ color: '#fff3d1' }));
    this.bead.visible = false;
  }

  fire(fromStart: boolean): void {
    this.run = 0;
    this.reverse = !fromStart;
    this.bead.visible = true;
  }

  /** Returns true the frame the bead arrives. */
  update(dt: number, t: number): boolean {
    let arrived = false;
    if (this.run >= 0) {
      this.run += dt / 0.7;
      const u = Math.min(1, this.run);
      this.bead.position.copy(this.curve.getPoint(this.reverse ? 1 - u : u));
      if (this.run >= 1) {
        this.run = -1;
        this.bead.visible = false;
        arrived = true;
      }
    } else if (this.fade < 1) {
      this.fade = Math.max(0, this.fade - dt * 0.8);
    }
    this.mat.opacity = this.fade < 1 && this.run < 0 ? 0.6 * this.fade : 0.48 + 0.14 * Math.sin(t * 3);
    this.mesh.visible = this.mat.opacity > 0.01;
    return arrived;
  }
}

/** The small floating task card (canvas on a plane) that lazily follows the player's gaze. */
class TaskCard {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private readonly target = new Vector3();
  private readonly targetQ = new Quaternion();
  private key = '';

  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 360;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(new PlaneGeometry(0.34, 0.12), new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.mesh.renderOrder = 20;
  }

  draw(eyebrow: string, title: string, body: string, pairs: number, caught: number): void {
    const key = [eyebrow, title, body, pairs, caught].join('|');
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext('2d')!;
    const W = 1024, H = 360;
    g.clearRect(0, 0, W, H);
    g.beginPath();
    g.roundRect(4, 4, W - 8, H - 8, 44);
    g.fillStyle = 'rgba(27,28,31,0.94)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#34363b';
    g.stroke();
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#8a8d93';
    g.font = '600 30px Inter, system-ui, sans-serif';
    g.fillText(eyebrow.toUpperCase(), 48, 70);
    g.fillStyle = '#e4e6eb';
    g.font = '700 54px Inter, system-ui, sans-serif';
    g.fillText(title, 48, 136);
    g.fillStyle = '#b8bbc1';
    g.font = '500 32px Inter, system-ui, sans-serif';
    const words = body.split(' ');
    let line = '', y = 196;
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (g.measureText(next).width > W - 96) {
        g.fillText(line, 48, y);
        line = w;
        y += 42;
      } else line = next;
    }
    if (line) g.fillText(line, 48, y);
    // the counter: one dot per pair, filled once caught
    for (let p = 0; p < pairs; p++) {
      g.beginPath();
      g.arc(W - 64 - (pairs - 1 - p) * 40, 62, 13, 0, Math.PI * 2);
      g.fillStyle = p < caught ? '#3ddc97' : '#34363b';
      g.fill();
    }
    this.tex.needsUpdate = true;
  }

  /** Ease toward a spot in front of the head; move only when it has drifted out of comfortable view. */
  follow(head: Vector3, headQ: Quaternion, dt: number, snap = false): void {
    const fwd = new Vector3(0, 0, -1).applyQuaternion(headQ);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const want = head.clone().addScaledVector(fwd, 0.55);
    want.y = head.y - 0.14;
    const toCard = this.mesh.position.clone().sub(head);
    toCard.y = 0;
    const off = toCard.lengthSq() > 1e-4 ? toCard.normalize().angleTo(fwd) : Math.PI;
    if (snap || off > 0.6 || this.mesh.position.distanceTo(want) > 0.5) {
      this.target.copy(want);
      this.targetQ.setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(-fwd.x, -fwd.z));
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 3);
    this.mesh.position.lerp(this.target, k);
    this.mesh.quaternion.slerp(this.targetQ, k);
  }
}

/**
 * The Quantum Hunt in the real room. While the chapter runs: three entangled
 * pairs are hidden on real surfaces (from the headset's room scan), joined by
 * gold threads; a hand (or controller) that reaches one catches it, which
 * measures it, and its partner collapses that instant. Caught qubits gather
 * above the desk; the big panels step aside for a small task card.
 */
export class HuntSystem extends createSystem({}) {
  private readonly root = new Group();
  private game: HuntGame | null = null;
  private qubits: JellyQubit[] = [];
  private threads: Thread[] = [];
  private card = new TaskCard();
  private readonly glow = glowTexture();
  private clock = 0;
  private message: [string, string, string] = ['', '', ''];
  /** The qubits were placed before the room scan arrived (a ring around the player). */
  private guessed = false;

  init(): void {
    this.root.name = 'QuantumHunt';
    this.root.visible = false;
    this.root.add(this.card.mesh);
    this.world.createTransformEntity(this.root);
    huntStatus.catchNext = () => this.catchNearest();
  }

  private get running(): boolean {
    const v = campaign.view;
    return v.mode === 'campaign' && !v.intro && v.chapter?.title === HUNT_TITLE;
  }

  private headPose(): { pos: Vector3; quat: Quaternion } {
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    return { pos: new Vector3().setFromMatrixPosition(head.matrixWorld), quat: head.getWorldQuaternion(new Quaternion()) };
  }

  private beginHunt(): void {
    const labSys = this.world.getSystem(LabSystem);
    const { pos } = this.headPose();
    const surfaces = (labSys?.surfaces ?? []).filter((s) => !NOT_HERE.has(s.label));
    const rng = Math.random;
    this.guessed = surfaces.length === 0;
    const spots = pickHidingSpots(surfaces, pos, 6, rng);
    // pair each spot with the remaining one farthest from it, so partners sit across the room
    const free = spots.slice();
    const ordered: Vector3[] = [];
    while (free.length >= 2) {
      const a = free.shift()!;
      let bi = 0;
      free.forEach((s, i) => {
        if (s.distanceTo(a) > free[bi].distanceTo(a)) bi = i;
      });
      ordered.push(a, free.splice(bi, 1)[0]);
    }
    this.game = new HuntGame(['same', 'same', 'opposite']);
    this.qubits = ordered.map((p, i) => {
      const q = new JellyQubit(qubitColor(Math.floor(i / 2)), this.glow);
      q.home.copy(p);
      q.root.position.copy(p);
      this.root.add(q.root);
      return q;
    });
    this.threads = [0, 1, 2].map((p) => {
      const t = new Thread(ordered[2 * p], ordered[2 * p + 1]);
      this.root.add(t.mesh, t.bead);
      return t;
    });
    // the tray: above the desk the lab was placed on, a column per pair
    const ws = labSys?.workspaceObject;
    this.qubits.forEach((q, i) => {
      const p = Math.floor(i / 2), side = i % 2;
      const local = new Vector3(-0.14 + p * 0.14, 0.22 + side * 0.13, -0.05);
      q.tray = ws ? local.applyMatrix4(ws.matrixWorld) : pos.clone().add(new Vector3(-0.14 + p * 0.14, -0.3 + side * 0.13, -0.5));
    });
    huntStatus.active = true;
    huntStatus.done = false;
    huntStatus.caught = 0;
    this.message = ['Task 1 / The escape', 'Find the glowing qubits', 'Three entangled pairs got loose in your room, each tied to its partner by a gold thread. Reach out and catch one.'];
    this.card.follow(this.headPose().pos, this.headPose().quat, 0, true);
    this.root.visible = true;
  }

  private endHunt(): void {
    for (const q of this.qubits) this.root.remove(q.root);
    for (const t of this.threads) this.root.remove(t.mesh, t.bead);
    this.qubits = [];
    this.threads = [];
    this.game = null;
    this.root.visible = false;
    huntStatus.active = false;
  }

  /** Palms, fingertips and controllers, in world space. */
  private reachPoints(): Vector3[] {
    const frame = this.world.xrFrame, ref = this.world.xrReferenceSpace, session = this.world.xrSession;
    if (!frame || !ref || !session) return [];
    const out: Vector3[] = [];
    const m = this.player.matrixWorld;
    for (const s of session.inputSources) {
      const spaces: (XRSpace | undefined)[] = s.hand ? [s.hand.get('middle-finger-metacarpal'), s.hand.get('index-finger-tip')] : [s.gripSpace];
      for (const space of spaces) {
        if (!space) continue;
        const pose = s.hand ? frame.getJointPose?.(space as XRJointSpace, ref) : frame.getPose(space, ref);
        if (!pose) continue;
        const p = pose.transform.position;
        out.push(new Vector3(p.x, p.y, p.z).applyMatrix4(m));
      }
    }
    return out;
  }

  private catchQubit(i: number, hand: Vector3 | null): boolean {
    const game = this.game;
    if (!game) return false;
    const r = game.catch(i, Math.random);
    if (!r) return false;
    const q = this.qubits[i];
    q.follow = hand ? hand.clone() : this.headPose().pos.clone().add(new Vector3(0, -0.25, -0.35).applyQuaternion(this.headPose().quat));
    feedback('measure');
    if (r.collapsedNow) {
      q.collapse(r.value);
      const t = this.threads[Math.floor(i / 2)];
      t.fire(i % 2 === 0);
      const same = game.pairs[Math.floor(i / 2)].kind === 'same';
      this.message = same
        ? ['Spooky action', `You caught a ${r.value}`, `At that instant its partner across the room became a ${r.partnerValue} too. Nothing travelled between them. Go and catch it.`]
        : ['Opposites', `You caught a ${r.value}`, `This pair is anti-correlated: its partner just became a ${r.partnerValue}, at the same instant. Go and catch it.`];
    } else {
      const caught = game.caughtPairs;
      this.message = game.done
        ? ['Hunt complete', 'All three pairs caught', 'Every pair matched (or mismatched) perfectly, though the two qubits were metres apart. That is entanglement: one shared state, not two.']
        : ['Pair caught', `${caught} of 3 pairs`, `Its value was decided the moment you caught its partner: a ${r.value}, as promised. Find the next glowing qubit.`];
      if (game.done) feedback('success');
    }
    huntStatus.caught = game.caughtPairs;
    huntStatus.done = game.done;
    return true;
  }

  /** Show me: catch the next qubit (the partner of a half-caught pair first, otherwise the nearest). */
  private catchNearest(): boolean {
    const game = this.game;
    if (!game) return false;
    let i = game.nextTarget();
    if (i === null) return false;
    if (!game.qubits[game.partnerOf(i)].caught) {
      const head = this.headPose().pos;
      let best = Infinity;
      game.qubits.forEach((q, k) => {
        const d = this.qubits[k].home.distanceTo(head);
        if (!q.caught && d < best) {
          best = d;
          i = k;
        }
      });
    }
    return this.catchQubit(i, null);
  }

  update(delta: number): void {
    const running = this.running;
    if (running && !this.game) this.beginHunt();
    if (!running && this.game) this.endHunt();
    if (!this.game) return;
    // the room scan arrived after the qubits were placed: hide them on real surfaces instead (if none is caught yet)
    if (this.guessed && (this.world.getSystem(LabSystem)?.surfaces.length ?? 0) > 0 && this.game.qubits.every((q) => !q.caught)) {
      this.endHunt();
      this.beginHunt();
    }
    const dt = Math.min(delta, 0.05);
    this.clock += dt;
    const head = this.headPose();
    // reach out and catch
    const hands = this.reachPoints();
    this.game.qubits.forEach((g, i) => {
      if (g.caught) return;
      const q = this.qubits[i];
      const hit = hands.find((h) => h.distanceTo(q.root.position) < REACH);
      if (hit) this.catchQubit(i, hit);
    });
    this.qubits.forEach((q, i) => {
      q.update(dt, this.clock);
      const g = this.game!.qubits[i];
      if (!g.caught) return;
      // caught: stay with the hand a moment, then float to the tray above the desk
      if (q.follow) {
        const hand = hands.length ? hands.reduce((a, b) => (a.distanceTo(q.root.position) < b.distanceTo(q.root.position) ? a : b)) : q.follow;
        q.root.position.lerp(hand, Math.min(1, dt * 10));
        q.flash = Math.max(q.flash, 0.3);
        q.followT += dt;
        if (q.followT > 1.2) q.follow = null;
      } else if (q.tray) q.root.position.lerp(q.tray, Math.min(1, dt * 2.5));
    });
    this.threads.forEach((t, p) => {
      if (t.update(dt, this.clock)) {
        // the bead has crossed the room: the partner collapses where it stands
        const a = this.qubits[2 * p], b = this.qubits[2 * p + 1];
        const target = a.value === null ? a : b.value === null ? b : null;
        const g = this.game!.qubits[target === a ? 2 * p : 2 * p + 1];
        if (target && g.value !== null) target.collapse(g.value);
        feedback('entangle');
        t.fade = 0.999;
      }
    });
    if (import.meta.env.DEV)
      (globalThis as { __entangledHunt?: unknown }).__entangledHunt = this.qubits.map((q, i) => ({ i, x: +q.root.position.x.toFixed(3), y: +q.root.position.y.toFixed(3), z: +q.root.position.z.toFixed(3), caught: this.game!.qubits[i].caught, value: this.game!.qubits[i].value }));
    const [eyebrow, title, body] = this.message;
    this.card.draw(eyebrow, title, body, 3, this.game.caughtPairs);
    this.card.follow(head.pos, head.quat, dt);
  }
}
