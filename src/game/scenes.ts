import { AtomVisual } from '../lab/atom-3d';
import { feedback } from '../lab/feedback';
import { atomFigure, galtonFigure, moleculeFigure, tunnelFigure, type Figure } from '../lab/figures';
import { lab } from '../lab/instance';
import type { LabSystem } from '../lab/lab-system';
import type { RailFrame } from '../lab/rails-3d';
import { blochVector } from '../quantum/bloch';
import { run, type Op } from '../quantum/circuit';
import { pairStrength } from '../quantum/entanglement';
import { classicalBoard, marblePath, quantumBoard, spreadOf, walkerLanding } from '../quantum/galton';
import { meanRadius, ORBITALS, radialCurve } from '../quantum/hydrogen';
import { mulberry32 } from '../quantum/measure';
import { dissociationCurves, moleculeAt, R_EQ, R_MAX, R_MIN } from '../quantum/molecule';
import type { QState } from '../quantum/state';
import { Packet, packetT } from '../quantum/tunnel';
import { explainOp } from './partner';

/**
 * Five scenes that take over the desk: an atom's electron cloud, a quantum
 * Galton board, tunnelling through a wall, pulling a molecule apart, and
 * riding your own circuit as a railway. Each owns its 3D object in the lab
 * system and drives the card and the board through one small interface, so
 * the UI treats them all the same way.
 */

export type SceneId = 'atom' | 'galton' | 'tunnel' | 'molecule' | 'rails';

export interface SceneCard {
  eyebrow: string;
  title: string;
  body: string;
  goal: string;
  done?: boolean;
  next: string;
  choices: (string | null)[];
  /** The choice shown as on (-1: none). */
  active?: number;
}

export interface SceneHost {
  lab(): LabSystem | undefined;
  /** Ket says it; `urgent` interrupts, otherwise it waits its turn. */
  say(text: string, urgent?: boolean): void;
  /** Record a feature used (achievements, quests). */
  use(key: string): void;
  /** Redraw the card and the board. */
  refresh(): void;
  celebrate(): void;
}

export interface Scene {
  readonly id: SceneId;
  /** Its Play tab name. */
  readonly play: string;
  start(): void;
  next(): void;
  choice(i: number): void;
  update(dt: number): void;
  card(): SceneCard;
  figure(): Figure | null;
  stop(): void;
}

const rng = mulberry32((Date.now() & 0xffff) + 11);
const pct = (x: number) => (x >= 0.995 || x < 0.005 ? `${Math.round(x * 100)}%` : x < 0.1 ? `${(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`);

// ---------------------------------------------------------------- inside an atom

class AtomScene implements Scene {
  readonly id = 'atom';
  readonly play = 'Inside an atom';
  private k = 0;
  private found: number[] = [];
  private readonly seen = new Set<string>();
  private trueSize = false;

  constructor(private readonly host: SceneHost) {}

  private get orbital() {
    return ORBITALS[this.k];
  }

  start(): void {
    const v = this.host.lab()?.atom;
    if (!v) return;
    v.root.visible = true;
    this.show(true);
    this.host.say('A hydrogen atom: one electron around one proton. Each dot is a place it could be found. Tap Find the electron to look.', true);
  }

  private show(instant = false): void {
    const v = this.host.lab()?.atom;
    if (!v) return;
    v.show(this.orbital, rng, instant);
    // true sizes: every orbital on the 4f scale, so the 1s is tiny and the 4f fills the space
    const o = this.orbital;
    v.root.scale.setScalar(this.trueSize ? meanRadius(o.n, o.l) / meanRadius(4, 3) : 1);
    this.seen.add(o.id);
    if (this.seen.size === ORBITALS.length) this.host.use('atom:all');
    this.found = [];
    this.host.refresh();
  }

  next(): void {
    const v = this.host.lab()?.atom;
    if (!v || v.measuring) return;
    const at = v.pick(rng);
    v.measure(at);
    // back in Bohr radii for the board
    this.found.push(Math.hypot(...at) / AtomVisual.scaleFor(this.orbital));
    feedback('measure');
    if (this.found.length === 6) this.host.say('Somewhere new each time. Keep looking: on the board, the places you found it build up the curve the wavefunction predicts.', true);
    this.host.refresh();
  }

  choice(i: number): void {
    if (i === 2) {
      this.trueSize = !this.trueSize;
      if (this.trueSize) this.host.say('True sizes: every orbital on one scale. A 4f electron sits about twelve times farther out than a 1s.', true);
    } else this.k = (this.k + (i === 0 ? 1 : ORBITALS.length - 1)) % ORBITALS.length;
    feedback('select');
    this.show();
  }

  update(dt: number): void {
    this.host.lab()?.atom.update(dt);
  }

  card(): SceneCard {
    const o = this.orbital;
    const mean = meanRadius(o.n, o.l);
    const nxt = ORBITALS[(this.k + 1) % ORBITALS.length], prev = ORBITALS[(this.k + ORBITALS.length - 1) % ORBITALS.length];
    return {
      eyebrow: `Play  /  Inside an atom  /  ${this.seen.size} of ${ORBITALS.length} orbitals`,
      title: `Hydrogen ${o.name}`,
      body: `${o.note} On average ${mean} Bohr radii out (${Math.round(mean * 52.9)} pm).`,
      goal: this.found.length ? `Found it ${this.found.length} time${this.found.length === 1 ? '' : 's'}` : 'Look for the electron',
      done: this.seen.size === ORBITALS.length,
      next: 'Find the electron',
      choices: [`Next: ${nxt.name}`, `Back: ${prev.name}`, this.trueSize ? 'True sizes: on' : 'True sizes: off'],
      active: this.trueSize ? 2 : -1,
    };
  }

  figure(): Figure {
    const o = this.orbital;
    return atomFigure({ name: o.name, curve: radialCurve(o.n, o.l), mean: meanRadius(o.n, o.l), found: this.found });
  }

  stop(): void {
    const v = this.host.lab()?.atom;
    if (v) v.root.visible = false;
  }
}

// ---------------------------------------------------------------- the quantum Galton board

const GALTON_ROWS = [10, 14, 6];

class GaltonScene implements Scene {
  readonly id = 'galton';
  readonly play = 'Quantum Galton board';
  private ri = 0;
  private classical: number[] = [];
  private quantum: number[] = [];
  private walk: number[] = [];
  /** Still to drop. */
  private marbles = 0;
  private walkers = 0;
  private clock = 0;
  private cardClock = 0;
  private dirty = false;
  private said = false;

  constructor(private readonly host: SceneHost) {}

  private get rows(): number {
    return GALTON_ROWS[this.ri];
  }

  start(): void {
    const v = this.host.lab()?.galton;
    if (!v) return;
    v.root.visible = true;
    this.reset();
    this.host.say('Left, a marble picks left or right at every peg. Right, a quantum walker has a qubit for a coin. Drop both and see where they land.', true);
  }

  private reset(): void {
    const v = this.host.lab()?.galton;
    this.classical = new Array(this.rows + 1).fill(0);
    this.quantum = new Array(this.rows + 1).fill(0);
    this.walk = quantumBoard(this.rows);
    this.marbles = this.walkers = 0;
    this.said = false;
    if (v) {
      v.setRows(this.rows);
      v.setWave(Array.from({ length: this.rows }, (_, t) => quantumBoard(t)), 0);
      v.setBins(this.classical, this.quantum);
    }
    this.host.refresh();
  }

  private drop(count: number): void {
    const v = this.host.lab()?.galton;
    if (!v) return;
    // the wave spreads down the right board first; walkers land once it reaches the bottom
    v.setWave(Array.from({ length: this.rows }, (_, t) => quantumBoard(t)), this.rows);
    this.marbles += count;
    this.walkers += count;
    feedback('shots');
  }

  next(): void {
    this.drop(50);
  }

  choice(i: number): void {
    if (i === 0) return this.drop(1);
    if (i === 1) this.ri = (this.ri + 1) % GALTON_ROWS.length;
    this.reset();
    feedback('select');
  }

  update(dt: number): void {
    const v = this.host.lab()?.galton;
    if (!v) return;
    v.update(dt);
    this.clock += dt;
    while (this.clock >= 0.05) {
      this.clock -= 0.05;
      if (this.marbles > 0) {
        this.marbles--;
        const path = marblePath(this.rows, rng);
        const bin = (path.reduce((a, b) => a + b, 0) + this.rows) / 2;
        v.drop(path, () => {
          this.classical[bin]++;
          this.dirty = true;
        });
      }
      if (this.walkers > 0 && v.waveDown) {
        this.walkers--;
        // a walker has no path to show: it is simply found in a bin
        const bin = Math.round(walkerLanding(this.walk, rng) / 2);
        v.land(bin);
        this.quantum[bin]++;
        this.dirty = true;
      }
    }
    this.cardClock += dt;
    if (this.dirty && this.cardClock > 0.25) {
      this.dirty = false;
      this.cardClock = 0;
      v.setBins(this.classical, this.quantum);
      const nq = this.quantum.reduce((a, b) => a + b, 0);
      if (nq >= 100 && !this.said) {
        this.said = true;
        this.host.use('galton:100');
        this.host.say(`A hundred each. The marbles crowd the middle; the walkers pile up near the edges, spread ${spreadOf(this.walk).toFixed(1)} wide against ${spreadOf(classicalBoard(this.rows)).toFixed(1)}. Quantum walks explore faster: that is how quantum-walk search algorithms work.`, true);
      }
      this.host.refresh();
    }
  }

  card(): SceneCard {
    const nc = this.classical.reduce((a, b) => a + b, 0), nq = this.quantum.reduce((a, b) => a + b, 0);
    return {
      eyebrow: `Play  /  Quantum Galton board  /  ${this.rows} rows`,
      title: nc || nq ? `${nc} marbles, ${nq} walkers` : 'A coin against a qubit',
      body: 'A marble takes one path, and the bars grow a bell curve that spreads like the square root of the rows. A quantum walker takes every path at once; they interfere, the middle cancels, and it spreads in proportion to the rows.',
      goal: `Spread: coin ${spreadOf(classicalBoard(this.rows)).toFixed(1)}, qubit ${spreadOf(this.walk).toFixed(1)}`,
      done: nq >= 100,
      next: 'Drop 50 of each',
      choices: ['Drop one', `Rows: ${this.rows}`, 'Empty the bins'],
    };
  }

  figure(): Figure {
    const coin = classicalBoard(this.rows);
    return galtonFigure({ rows: this.rows, classical: this.classical, quantum: this.quantum, coin, walk: this.walk, coinSpread: spreadOf(coin), walkSpread: spreadOf(this.walk) });
  }

  stop(): void {
    const v = this.host.lab()?.galton;
    if (v) v.root.visible = false;
    this.marbles = this.walkers = 0;
  }
}

// ---------------------------------------------------------------- tunnelling

const ENERGIES = [0.6, 0.8, 0.4, 1.0, 1.2];
const WIDTHS = [1, 2, 3];
const WIDTH_NAMES = ['thin', 'medium', 'thick'];
/** Solver steps per frame: about two to three seconds a shot. */
const STEPS_PER_FRAME = 5;

class TunnelScene implements Scene {
  readonly id = 'tunnel';
  readonly play = 'Tunnelling';
  private ei = 0;
  private wi = 0;
  private packet: Packet | null = null;
  private shots: Record<number, [number, number][]> = {};
  private last: { e: number; a: number; t: number } | null = null;
  private curves = new Map<number, [number, number][]>();

  constructor(private readonly host: SceneHost) {}

  private get energy(): number {
    return ENERGIES[this.ei];
  }

  private get width(): number {
    return WIDTHS[this.wi];
  }

  start(): void {
    const v = this.host.lab()?.tunnel;
    if (!v) return;
    v.root.visible = true;
    this.packet = null;
    this.setup();
    this.host.say('A particle flies at a wall taller than its energy: the blue line is how high it can reach. A ball would bounce back every time. Tap Fire.', true);
  }

  private setup(): void {
    const v = this.host.lab()?.tunnel;
    v?.setup(this.energy, this.width);
    v?.setWave(null, null);
    this.host.refresh();
  }

  next(): void {
    if (this.packet) return;
    this.packet = new Packet(this.energy, this.width);
    this.last = null;
    feedback('shots');
    this.host.refresh();
  }

  choice(i: number): void {
    if (i === 2) return;
    this.packet = null;
    if (i === 0) this.ei = (this.ei + 1) % ENERGIES.length;
    else this.wi = (this.wi + 1) % WIDTHS.length;
    feedback('select');
    this.setup();
  }

  update(): void {
    const p = this.packet;
    if (!p) return;
    p.step(STEPS_PER_FRAME);
    this.host.lab()?.tunnel.setWave(p.re, p.im);
    if (!p.done) return;
    const t = p.parts().through;
    const e = this.energy, a = this.width;
    (this.shots[a] ??= []).push([e, t]);
    this.last = { e, a, t };
    this.packet = null;
    if (a === 3 && e < 1 && t > 0.001) this.host.use('tunnel:thick');
    feedback(t > 0.05 ? 'success' : 'measure');
    const expected = packetT(e, a);
    this.host.say(
      e < 1
        ? `${pct(t)} came through a wall it could not climb. A ball: none, ever. The Schrodinger equation predicts ${pct(expected)}.`
        : `Over the top of the wall, and still ${pct(1 - t)} bounced back. Waves reflect at any sudden change.`,
      true,
    );
    this.host.refresh();
  }

  card(): SceneCard {
    const e = this.energy, a = this.width;
    const flying = !!this.packet;
    return {
      eyebrow: `Play  /  Tunnelling  /  ${WIDTH_NAMES[this.wi]} wall`,
      title: flying ? 'In flight...' : this.last ? `${pct(this.last.t)} came through` : 'Through a wall',
      body: 'The curtain is where the particle might be (height) and its quantum phase (colour). The wall is taller than the blue line, the most energy it has. Past the wall the grey trace is drawn ten times taller, so even a little shows.',
      goal: `A ball: ${e < 1 ? '0%' : '100%'}. Quantum: ${pct(packetT(e, a))} expected`,
      done: !!this.last && this.last.t > 0.001 && this.last.e < 1,
      next: flying ? 'In flight...' : 'Fire',
      choices: [`Energy: ${Math.round(e * 100)}% of wall`, `Wall: ${WIDTH_NAMES[this.wi]}`, null],
    };
  }

  figure(): Figure {
    const a = this.width;
    let curve = this.curves.get(a);
    if (!curve) {
      curve = Array.from({ length: 70 }, (_, i) => {
        const e = 0.02 + (1.38 * i) / 69;
        return [e, packetT(e, a)] as [number, number];
      });
      this.curves.set(a, curve);
    }
    return tunnelFigure({ width: a, energy: this.energy, curve, shots: this.shots[a] ?? [], flying: !!this.packet });
  }

  stop(): void {
    const v = this.host.lab()?.tunnel;
    if (v) v.root.visible = false;
    this.packet = null;
  }
}

// ---------------------------------------------------------------- pull a molecule apart

/** Spring strength (per hartree per angstrom) and damping, tuned for about a 0.8 s wobble at the bond. */
const PULL = 47;
const DAMP = 2.2;

class MoleculeScene implements Scene {
  readonly id = 'molecule';
  readonly play = 'Pull a molecule apart';
  private r = R_EQ;
  private v = 0;
  private pulling = false;
  private said = new Set<string>();
  private cardClock = 0;
  private shownR = -1;
  private readonly curves = dissociationCurves();

  constructor(private readonly host: SceneHost) {}

  start(): void {
    const v = this.host.lab()?.molecule;
    if (!v) return;
    v.root.visible = true;
    this.r = R_EQ;
    this.v = 0;
    this.pulling = false;
    this.said.clear();
    v.set(moleculeAt(this.r), rng);
    this.host.say('A hydrogen molecule: two protons sharing two electrons. Grab the ring on the right atom and pull, or tap Pull it apart.', true);
  }

  next(): void {
    if (this.r > 1.6) {
      this.pulling = false;
      this.v = 0;
    } else this.pulling = true;
    feedback('select');
    this.host.refresh();
  }

  choice(i: number): void {
    this.pulling = false;
    this.v = 0;
    this.r = i === 0 ? 0.45 : i === 1 ? 2.2 : R_EQ;
    feedback('select');
  }

  update(dt: number): void {
    const ls = this.host.lab();
    const vis = ls?.molecule;
    if (!ls || !vis) return;
    const held = ls.moleculeHeld;
    if (held) {
      this.r = Math.min(R_MAX, Math.max(R_MIN, 2 * vis.handleHalf));
      this.v = 0;
      this.pulling = false;
    } else if (this.pulling) {
      this.r = Math.min(R_MAX, this.r + 0.7 * dt);
      if (this.r >= R_MAX) this.pulling = false;
    } else {
      // let go: the energy curve pulls it back (or apart), and it wobbles to rest
      const h = 0.01;
      const force = -(moleculeAt(this.r + h).energy - moleculeAt(this.r - h).energy) / (2 * h);
      this.v += (PULL * force - DAMP * this.v) * Math.min(dt, 0.05);
      this.r += this.v * Math.min(dt, 0.05);
      if (this.r <= R_MIN || this.r >= R_MAX) {
        this.r = Math.min(R_MAX, Math.max(R_MIN, this.r));
        this.v = 0;
      }
    }
    const m = moleculeAt(this.r);
    vis.set(m, rng, !held);
    if (this.r > 2.0 && !this.said.has('far')) {
      this.said.add('far');
      this.host.use('molecule:broken');
      this.host.say('The bond is breaking. Each atom keeps one electron, and their spins are left in a Bell pair: two entangled atoms. That is the gold thread. Mean-field chemistry gets this badly wrong.', true);
    }
    if (this.r < 0.5 && !this.said.has('near')) {
      this.said.add('near');
      this.host.say('Squeezed: the protons repel and the energy shoots up. Let go and it springs back.', true);
    }
    this.cardClock += dt;
    if (this.cardClock > 0.15 && Math.abs(this.r - this.shownR) > 0.004) {
      this.cardClock = 0;
      this.shownR = this.r;
      this.host.refresh();
    }
  }

  card(): SceneCard {
    const m = moleculeAt(this.r);
    const off = (m.hf - m.energy) * 27.2114;
    return {
      eyebrow: 'Play  /  Pull a molecule apart  /  H2',
      title: `${this.r.toFixed(2)} A apart`,
      body: m.covalent > 0.9
        ? 'Stretched: one electron on each atom, their spins a Bell pair (the gold thread). The simple mean-field picture cannot describe it.'
        : this.r < 0.6
          ? 'Squeezed: the two protons repel. Let go and it springs back to its bond.'
          : 'Both electrons share the bond between the protons. Pull the right atom along the line and watch the cloud split.',
      goal: `Energy ${m.energy.toFixed(3)} Ha; mean field off by ${off.toFixed(2)} eV`,
      done: this.said.has('far'),
      next: this.r > 1.6 ? 'Let go' : 'Pull it apart',
      choices: ['Squeeze', 'Stretch', 'Back to the bond'],
    };
  }

  figure(): Figure {
    const m = moleculeAt(this.r);
    return moleculeFigure({ r: this.r, energy: m.energy, hf: m.hf, covalent: m.covalent, curves: this.curves });
  }

  stop(): void {
    const v = this.host.lab()?.molecule;
    if (v) v.root.visible = false;
  }
}

// ---------------------------------------------------------------- ride your circuit

/** When the lab is empty: superposition, entanglement, a turn, a three-way thread, and back. */
const DEMO: Op[] = [
  { kind: 'gate', gate: 'h', target: 0 },
  { kind: 'gate', gate: 'x', target: 1, controls: [0] },
  { kind: 'gate', gate: 'ry', target: 2, params: [1.1] },
  { kind: 'gate', gate: 'x', target: 2, controls: [1] },
  { kind: 'gate', gate: 'h', target: 0 },
  { kind: 'gate', gate: 'x', target: 1, controls: [0] },
];

const opName = (op: Op): string => {
  if (op.kind === 'measure') return `Measure q${op.qubit}`;
  if (op.kind === 'reset') return `Reset q${op.qubit}`;
  if (op.kind === 'swap' || op.kind === 'iswap') return `${op.kind === 'swap' ? 'SWAP' : 'iSWAP'} q${op.a}, q${op.b}`;
  const c = op.controls ?? [];
  const name = op.gate === 'x' && c.length === 1 ? 'CNOT' : op.gate === 'x' && c.length === 2 ? 'Toffoli' : `${'C'.repeat(c.length)}${op.gate.toUpperCase()}`;
  const angle = op.params?.[0] !== undefined ? ` ${Math.round((op.params[0] * 180) / Math.PI)} deg` : '';
  return c.length ? `${name}${angle}: q${c.join(', q')} -> q${op.target}` : `${name}${angle} on q${op.target}`;
};

class RailsScene implements Scene {
  readonly id = 'rails';
  readonly play = 'Ride your circuit';
  private n = 0;
  private ops: Op[] = [];
  private states: QState[] = [];
  private own = false;
  private time = 0;
  private speed = 0.9;
  private playing = false;
  private passed = -1;
  private line = '';
  private savedCursor = 0;

  constructor(private readonly host: SceneHost) {}

  start(): void {
    const ls = this.host.lab();
    if (!ls) return;
    const h = lab.history;
    this.savedCursor = h.cursor;
    const ops = h.ops.slice(0, h.cursor);
    this.own = ops.some((o) => o.kind !== 'measure');
    if (this.own) {
      this.n = lab.n;
      this.ops = ops.slice(0, 64);
      this.states = this.ops.map((_, k) => h.stateAt(k)).concat([h.stateAt(this.ops.length)]);
    } else {
      this.n = 3;
      this.ops = DEMO;
      lab.load(3, DEMO);
      this.savedCursor = DEMO.length;
      this.states = Array.from({ length: DEMO.length + 1 }, (_, k) => run(3, DEMO.slice(0, k), () => 0.5).state);
    }
    const frames: RailFrame[] = this.states.map((s) => {
      const pairs: [number, number, number][] = [];
      for (let a = 0; a < this.n; a++) for (let b = a + 1; b < this.n; b++) pairs.push([a, b, pairStrength(s, a, b)]);
      return { bloch: Array.from({ length: this.n }, (_, q) => blochVector(s, q)), pairs };
    });
    ls.rails.build(this.n, this.ops, frames);
    ls.rails.root.visible = true;
    this.time = 0;
    this.passed = -1;
    this.playing = true;
    this.line = '';
    this.host.say(this.own ? 'Your circuit as a railway: a lane per qubit. Each gate passes under the riders and turns them; gold threads join the qubits it entangles.' : 'An empty lab, so here is a short ride: a Hadamard, a CNOT, a turn. Build your own circuit and ride that next.', true);
    this.seek(0);
  }

  /** The board's cursor follows the ride. */
  private seek(k: number): void {
    try {
      lab.seek(k);
    } catch {
      // a circuit the timeline cannot replay: the ride goes on without it
    }
  }

  next(): void {
    if (this.time >= this.ops.length) {
      this.time = 0;
      this.passed = -1;
      this.seek(0);
      this.playing = true;
    } else this.playing = !this.playing;
    feedback('select');
    this.host.refresh();
  }

  choice(i: number): void {
    if (i === 0) this.speed = Math.max(0.25, this.speed / 1.6);
    else if (i === 1) this.speed = Math.min(4, this.speed * 1.6);
    else {
      this.time = 0;
      this.passed = -1;
      this.playing = true;
      this.seek(0);
    }
    feedback('select');
    this.host.refresh();
  }

  update(dt: number): void {
    const v = this.host.lab()?.rails;
    if (!v) return;
    const m = this.ops.length;
    if (this.playing) {
      this.time = Math.min(m, this.time + dt * this.speed);
      // a gate is under the riders half a step after it starts
      const k = Math.floor(this.time - 0.5);
      if (k > this.passed && k < m) {
        this.passed = k;
        this.seek(k + 1);
        const op = this.ops[k];
        const said = explainOp(op, this.states[k], this.states[k + 1]);
        this.line = said?.text ?? '';
        if (said && this.speed <= 1.2) this.host.say(said.text);
        feedback(op.kind === 'gate' && op.controls?.length ? 'entangle' : 'gate');
        this.host.refresh();
      }
      if (this.time >= m) {
        this.playing = false;
        const tangled = this.ops.some((o) => o.kind === 'gate' && (o.controls?.length ?? 0) > 0);
        if (this.own && tangled) this.host.use('rails:own');
        this.host.refresh();
      }
    }
    v.time = this.time;
    v.update();
  }

  card(): SceneCard {
    const m = this.ops.length;
    const k = Math.max(0, Math.min(m - 1, this.passed));
    const atEnd = this.time >= m;
    return {
      eyebrow: `Play  /  Ride your circuit  /  step ${Math.max(0, this.passed + 1)} of ${m}`,
      title: this.passed < 0 ? (this.own ? 'Your circuit' : 'A short ride') : atEnd ? 'End of the line' : opName(this.ops[k]),
      body: this.line || 'One lane per qubit. As each gate passes under the riders, their arrows turn to the new state; an arrow shrinks when its qubit is entangled, and gold threads join the pairs.',
      goal: `${this.n} qubits, ${m} steps, speed ${this.speed.toFixed(1)}x`,
      done: atEnd,
      next: atEnd ? 'Ride again' : this.playing ? 'Pause' : 'Ride',
      choices: ['Slower', 'Faster', 'Back to the start'],
    };
  }

  figure(): null {
    return null;
  }

  stop(): void {
    const v = this.host.lab()?.rails;
    if (v) v.root.visible = false;
    this.seek(this.savedCursor);
  }
}

export function makeScenes(host: SceneHost): Record<SceneId, Scene> {
  return {
    atom: new AtomScene(host),
    galton: new GaltonScene(host),
    tunnel: new TunnelScene(host),
    molecule: new MoleculeScene(host),
    rails: new RailsScene(host),
  };
}

/** Play tab names, in order, with their tags. */
export const SCENE_PLAY: { item: string; id: SceneId; tag: string }[] = [
  { item: 'Inside an atom', id: 'atom', tag: 'H' },
  { item: 'Quantum Galton board', id: 'galton', tag: 'walk' },
  { item: 'Tunnelling', id: 'tunnel', tag: 'wall' },
  { item: 'Pull a molecule apart', id: 'molecule', tag: 'H2' },
  { item: 'Ride your circuit', id: 'rails', tag: 'ride' },
];
