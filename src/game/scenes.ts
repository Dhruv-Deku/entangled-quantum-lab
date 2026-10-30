import { AtomVisual } from '../lab/atom-3d';
import { feedback } from '../lab/feedback';
import { atomFigure, bellRoomFigure, boxFigure, galtonFigure, moleculeFigure, tunnelFigure, wavesFigure, type BoxView, type Figure } from '../lab/figures';
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
import { Vector3 } from '@iwsdk/core';
import { TANK_D, TANK_W, SCREEN_Z } from '../lab/wave-tank-3d';
import { detect, screenIntensity } from '../quantum/waves';
import { handsToNm, levelEv, lightName, photonNm, spectrumRgb } from '../quantum/box';
import { addRound, bellRound, emptyTally, score, type BellMode } from '../quantum/bell-room';
import { fingerCurl, handFrame, J } from '../gestures/hand';

/**
 * Five scenes that take over the desk: an atom's electron cloud, a quantum
 * Galton board, tunnelling through a wall, pulling a molecule apart, and
 * riding your own circuit as a railway. Each owns its 3D object in the lab
 * system and drives the card and the board through one small interface, so
 * the UI treats them all the same way.
 */

export type SceneId = 'atom' | 'galton' | 'tunnel' | 'molecule' | 'rails' | 'waves' | 'box' | 'bell';

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
  /** This frame's tracked hand joints (world space), null for a hand not tracked. */
  hands(): { left: Float32Array | null; right: Float32Array | null };
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

// ---------------------------------------------------------------- wave hands

const FINGERTIPS = [J.thumbTip, J.indexTip, J.middleTip, J.ringTip, J.pinkyTip];
const SPACINGS = [0.06, 0.035, 0.1];
const SPACING_NAMES = ['medium', 'narrow', 'wide'];
const WAVELENGTHS = [0.024, 0.016, 0.034];
const WAVE_NAMES = ['medium', 'short', 'long'];
const SCREEN_BINS = 96;
const SCREEN_XS = Array.from({ length: SCREEN_BINS }, (_, i) => -TANK_W / 2 + ((i + 0.5) / SCREEN_BINS) * TANK_W);

class WavesScene implements Scene {
  readonly id = 'waves';
  readonly play = 'Wave hands';
  private count = 2;
  private si = 0;
  private wi = 0;
  private sources: [number, number][] = [];
  private fromHands = false;
  private key = '';
  private intensity: number[] = new Array(SCREEN_BINS).fill(0);
  private hits: number[] = new Array(SCREEN_BINS).fill(0);
  private toFire = 0;
  private clock = 0;
  private cardClock = 0;
  private saidHands = false;
  private readonly v = new Vector3();

  constructor(private readonly host: SceneHost) {}

  start(): void {
    const t = this.host.lab()?.waveTank;
    if (!t) return;
    t.root.visible = true;
    this.key = '';
    this.saidHands = false;
    this.host.say('A tank of quantum waves. Dip your fingertips in: each one sends out ripples, and where they meet they add up or cancel. No hands? The two posts make waves for you.', true);
  }

  private get wavelength(): number {
    return WAVELENGTHS[this.wi];
  }

  /** Fingertips touching the water (tank coordinates), or the posts. */
  private findSources(): [number, number][] {
    const t = this.host.lab()?.waveTank;
    const hands = this.host.hands();
    const out: [number, number][] = [];
    if (t) {
      for (const p of [hands.left, hands.right]) {
        if (!p) continue;
        for (const j of FINGERTIPS) {
          t.root.worldToLocal(this.v.set(p[j * 3], p[j * 3 + 1], p[j * 3 + 2]));
          if (Math.abs(this.v.x) < TANK_W / 2 && Math.abs(this.v.z) < TANK_D / 2 && this.v.y > -0.02 && this.v.y < 0.06) out.push([this.v.x, this.v.z]);
        }
      }
    }
    this.fromHands = out.length > 0;
    if (out.length) return out.slice(0, 10);
    const d = SPACINGS[this.si];
    return Array.from({ length: this.count }, (_, i) => [(i - (this.count - 1) / 2) * d, TANK_D / 2 - 0.06] as [number, number]);
  }

  next(): void {
    this.toFire += 300;
    this.host.use('waves:fired');
    feedback('shots');
  }

  choice(i: number): void {
    if (i === 0) this.count = (this.count % 4) + 1;
    else if (i === 1) this.si = (this.si + 1) % SPACINGS.length;
    else this.wi = (this.wi + 1) % WAVELENGTHS.length;
    feedback('select');
    this.host.refresh();
  }

  update(dt: number): void {
    const t = this.host.lab()?.waveTank;
    if (!t) return;
    t.update(dt);
    this.sources = this.findSources();
    t.setSources(this.sources, this.wavelength);
    if (this.fromHands && this.sources.length >= 2 && !this.saidHands) {
      this.saidHands = true;
      this.host.use('waves:hands');
      this.host.say('Those are your fingertips making the waves. Spread them and the bright lines crowd together; close them and the lines spread out. Fire photons to see where they land.', true);
    }
    // the pattern changed enough to matter: a new screen, and the old photons no longer apply
    const key = `${this.wi}:${this.sources.map(([x, z]) => `${Math.round(x * 200)},${Math.round(z * 200)}`).join(';')}`;
    if (key !== this.key) {
      this.key = key;
      this.intensity = screenIntensity(this.sources, SCREEN_XS, SCREEN_Z, (2 * Math.PI) / this.wavelength);
      this.hits = new Array(SCREEN_BINS).fill(0);
      t.drawScreen(this.intensity, this.hits);
      this.host.refresh();
    }
    if (this.toFire > 0) {
      this.clock += dt;
      // about 150 a second
      const n = Math.min(this.toFire, Math.floor(this.clock * 150));
      if (n > 0) {
        this.clock -= n / 150;
        this.toFire -= n;
        for (let k = 0; k < n; k++) {
          const x = detect(SCREEN_XS, this.intensity, rng);
          this.hits[Math.min(SCREEN_BINS - 1, Math.max(0, Math.round(((x + TANK_W / 2) / TANK_W) * SCREEN_BINS - 0.5)))]++;
        }
        t.drawScreen(this.intensity, this.hits);
        this.cardClock += dt;
        if (this.cardClock > 0.2 || this.toFire === 0) {
          this.cardClock = 0;
          this.host.refresh();
        }
      }
    }
  }

  card(): SceneCard {
    const n = this.sources.length;
    const two = n === 2 ? Math.hypot(this.sources[0][0] - this.sources[1][0], this.sources[0][1] - this.sources[1][1]) : 0;
    const fired = this.hits.reduce((a, b) => a + b, 0);
    return {
      eyebrow: `Play  /  Wave hands  /  ${this.fromHands ? 'your fingertips' : 'the posts'}`,
      title: this.fromHands ? `${n} fingertip${n === 1 ? '' : 's'} in the water` : n === 1 ? 'One source' : `${n} sources, one tank`,
      body: 'Every source sends out circular waves. Where crest meets crest they add up (bright); where crest meets trough they cancel (dark). Dip your fingertips in the tank and each becomes a source; move them and the pattern follows.',
      goal: two ? `Bright lines ${((this.wavelength * Math.abs(SCREEN_Z - this.sources[0][1])) / two * 100).toFixed(1)} cm apart on the screen` : fired ? `${fired} photons on the screen` : 'Fire photons at the screen',
      done: fired > 0,
      next: 'Fire 300 photons',
      choices: [`Posts: ${this.count}`, `Spacing: ${SPACING_NAMES[this.si]}`, `Waves: ${WAVE_NAMES[this.wi]}`],
    };
  }

  figure(): Figure {
    const n = this.sources.length;
    const spacing = n === 2 ? Math.hypot(this.sources[0][0] - this.sources[1][0], this.sources[0][1] - this.sources[1][1]) : null;
    return wavesFigure({ sources: n, hands: this.fromHands, intensity: this.intensity, hits: this.hits, spacing, distance: n ? Math.abs(SCREEN_Z - this.sources[0][1]) : 0, wavelength: this.wavelength });
  }

  stop(): void {
    const t = this.host.lab()?.waveTank;
    if (t) t.root.visible = false;
    this.toFire = 0;
  }
}

// ---------------------------------------------------------------- light from a box

const BOX_LEVELS = 4;

class BoxScene implements Scene {
  readonly id = 'box';
  readonly play = 'Light from a box';
  private n = 2;
  private half = 0.1;
  private wantHalf = 0.1;
  private handsMode = false;
  private lengthNm = 0.7;
  private photon: BoxView['photon'] = null;
  private colours = new Set<string>();
  private fingers = 0;
  private fingersFor = 0;
  private cardClock = 0;
  private said = new Set<string>();
  private readonly a = new Vector3();
  private readonly b = new Vector3();

  constructor(private readonly host: SceneHost) {}

  start(): void {
    const v = this.host.lab()?.lightBox;
    if (!v) return;
    v.root.visible = true;
    this.n = 2;
    this.photon = null;
    this.said.clear();
    this.half = this.wantHalf = 0.1;
    v.handle.position.set(this.half, 0, 0);
    this.host.say('An electron trapped in a box. Only standing waves that fit can live here, so its energy comes in steps. Drop a level and it gives out light. Hold up both hands, palms facing: your hands become the walls.', true);
  }

  private levels(): number[] {
    return Array.from({ length: BOX_LEVELS }, (_, i) => levelEv(i + 1, this.lengthNm));
  }

  /** Down from level n to n-1: a photon with exactly the difference. */
  private drop(to: number): void {
    if (to < 1 || to >= this.n) return;
    const from = this.n;
    this.n = to;
    const nm = photonNm(from, to, this.lengthNm);
    const rgb = spectrumRgb(nm);
    const name = lightName(nm);
    this.photon = { from, to, nm, rgb, name };
    this.host.lab()?.lightBox.emit(rgb);
    feedback(rgb ? 'success' : 'measure');
    if (rgb) this.colours.add(name);
    if (this.colours.size >= 3) this.host.use('box:rainbow');
    const key = rgb ? 'seen' : 'unseen';
    if (!this.said.has(key)) {
      this.said.add(key);
      this.host.say(
        rgb
          ? `${name[0].toUpperCase()}${name.slice(1)} light, ${Math.round(nm)} nm: exactly the energy between level ${from} and level ${to}. Squeeze the box and drop again: smaller boxes shine bluer. Quantum dots in QLED screens get their colours this way.`
          : `${Math.round(nm)} nm: ${name}. Your eyes cannot see it. Change the size of the box until the light comes out visible.`,
        true,
      );
    }
    this.host.refresh();
  }

  next(): void {
    this.drop(this.n - 1);
  }

  choice(i: number): void {
    if (i === 0) {
      if (this.n < BOX_LEVELS) this.n++;
      feedback('select');
    } else this.wantHalf = Math.max(0.03, Math.min(0.2, this.wantHalf + (i === 1 ? -0.025 : 0.025)));
    this.host.refresh();
  }

  update(dt: number): void {
    const ls = this.host.lab();
    const v = ls?.lightBox;
    if (!ls || !v) return;
    const hands = this.host.hands();
    let between: [Vector3, Vector3] | null = null;
    if (hands.left && hands.right) {
      const l = handFrame(hands.left, 'left').center, r = handFrame(hands.right, 'right').center;
      this.a.set(l[0], l[1], l[2]);
      this.b.set(r[0], r[1], r[2]);
      const d = this.a.distanceTo(this.b);
      if (d > 0.06 && d < 0.6) between = [v.root.worldToLocal(this.a.clone()), v.root.worldToLocal(this.b.clone())];
    }
    this.handsMode = !!between;
    ls.lightBoxOnDesk = !between;
    let lengthM: number;
    if (between) {
      v.span(between[0], between[1]);
      v.followFrame();
      lengthM = between[0].distanceTo(between[1]);
      // fingers raised on the right hand pick the level; fold one to drop and give out light
      const p = hands.right!;
      const up = (['index', 'middle', 'ring', 'pinky'] as const).filter((f) => fingerCurl(p, f) < 0.35).length;
      if (up !== this.fingers) {
        this.fingers = up;
        this.fingersFor = 0;
      } else this.fingersFor += dt;
      if (up >= 1 && this.fingersFor > 0.25 && this.fingersFor - dt <= 0.25 && up !== this.n) {
        if (up < this.n) this.drop(up);
        else {
          this.n = up;
          feedback('select');
        }
      }
      if (!this.said.has('hands')) {
        this.said.add('hands');
        this.host.use('box:hands');
        this.host.say('Your hands are the walls now. Squeeze them together and the wave gets frantic: more energy. Raise fingers on your right hand to pick a level, then fold one down to give out light.', true);
      }
    } else {
      if (ls.boxHeld) this.wantHalf = Math.max(0.03, Math.min(0.2, v.handle.position.x));
      else {
        this.half += (this.wantHalf - this.half) * (1 - Math.exp(-dt * 8));
        v.handle.position.set(this.half, 0, 0);
      }
      this.half = ls.boxHeld ? this.wantHalf : this.half;
      v.span(this.a.set(-this.half, 0, 0), this.b.set(this.half, 0, 0));
      lengthM = this.half * 2;
    }
    this.lengthNm = handsToNm(lengthM);
    const levels = this.levels();
    v.setLevel(this.n, levels[this.n - 1] / levelEv(1, 0.7), levels);
    v.update(dt);
    this.cardClock += dt;
    if (this.cardClock > 0.25) {
      this.cardClock = 0;
      this.host.refresh();
    }
  }

  card(): SceneCard {
    const e = levelEv(this.n, this.lengthNm);
    const p = this.photon;
    return {
      eyebrow: `Play  /  Light from a box  /  ${this.handsMode ? 'between your hands' : 'on the desk'}`,
      title: p ? `${p.name[0].toUpperCase()}${p.name.slice(1)}: ${Math.round(p.nm)} nm` : `Level ${this.n} in a ${this.lengthNm.toFixed(2)} nm box`,
      body: this.handsMode
        ? 'Your palms are the walls. Squeeze to raise every level (as 1/L^2). Raise 1 to 4 fingers on your right hand to pick the level; fold one down and the electron drops, giving out light in the colour of the energy it lost.'
        : 'An electron between two walls holds only waves that fit, so its energy comes in steps. Drop a level to give out light; squeeze the box (or grab the right wall) and the light turns bluer. Hold up both hands, palms facing, to be the walls yourself.',
      goal: `Level ${this.n}: ${e.toFixed(2)} eV${this.colours.size ? `; colours made: ${this.colours.size}` : ''}`,
      done: this.colours.size >= 3,
      next: this.n > 1 ? 'Drop a level' : 'At the bottom',
      choices: this.handsMode ? [null, null, null] : [this.n < BOX_LEVELS ? 'Level up' : 'Top level', 'Squeeze', 'Widen'],
    };
  }

  figure(): Figure {
    return boxFigure({ n: this.n, lengthNm: this.lengthNm, levels: this.levels(), photon: this.photon, hands: this.handsMode });
  }

  stop(): void {
    const ls = this.host.lab();
    if (ls) {
      ls.lightBox.root.visible = false;
      ls.lightBoxOnDesk = true;
    }
  }
}

// ---------------------------------------------------------------- the Bell test in your room

class BellScene implements Scene {
  readonly id = 'bell';
  readonly play = 'Bell test in your room';
  private mode: BellMode = 'quantum';
  private tally = emptyTally();
  private history: number[] = [];
  private queue = 0;
  private inFlight = 0;
  private clock = 0;
  private rate = 8;
  private cardClock = 0;
  private said = new Set<string>();

  constructor(private readonly host: SceneHost) {}

  start(): void {
    const ls = this.host.lab();
    if (!ls) return;
    const p = ls.bellPlaces();
    ls.bellRoom.place(p.source, p.alice, p.bob, p.face);
    ls.bellRoom.root.visible = true;
    this.mode = 'quantum';
    ls.bellRoom.setMode(this.mode);
    this.reset();
    this.host.say('A Bell test the size of your room. Look left and right: Alice and Bob. Each round a pair flies out, and while it flies each picks a dial setting at random. If the pairs carried hidden instructions, the score could never pass 2. Run it.', true);
  }

  private reset(): void {
    this.tally = emptyTally();
    this.history = [];
    this.queue = 0;
    this.said.delete('passed');
    this.host.refresh();
  }

  next(): void {
    this.queue += 100;
    feedback('shots');
    this.host.refresh();
  }

  choice(i: number): void {
    if (i === 0) {
      this.mode = this.mode === 'quantum' ? 'hidden' : 'quantum';
      this.host.lab()?.bellRoom.setMode(this.mode);
      this.reset();
      if (this.mode === 'hidden') this.host.say('Now each pair carries hidden instructions, fixed when it leaves the desk: the best any classical explanation can do. Run it and watch the score.', true);
    } else if (i === 1) this.rate = this.rate >= 32 ? 8 : this.rate * 2;
    else this.reset();
    feedback('select');
    this.host.refresh();
  }

  update(dt: number): void {
    const v = this.host.lab()?.bellRoom;
    if (!v) return;
    v.update(dt);
    if (this.queue > 0) {
      this.clock += dt;
      while (this.queue > 0 && this.clock >= 1 / this.rate && this.inFlight < 6) {
        this.clock -= 1 / this.rate;
        this.queue--;
        this.inFlight++;
        const r = bellRound(this.mode, rng);
        v.fire(r, () => {
          this.inFlight--;
          addRound(this.tally, r);
          const s = score(this.tally);
          this.history.push(s.s);
          if (s.rounds % 4 === 0) feedback('measure');
          this.check(s);
        });
      }
    } else this.clock = 0;
    this.cardClock += dt;
    if (this.cardClock > 0.25) {
      this.cardClock = 0;
      this.host.refresh();
    }
  }

  private check(s: ReturnType<typeof score>): void {
    if (this.mode === 'quantum' && s.rounds >= 100 && s.s > 2 + 3 * s.se && !this.said.has('passed')) {
      this.said.add('passed');
      this.host.use('bell:room');
      this.host.celebrate();
      this.host.say(`S = ${s.s.toFixed(2)}, more than three sigma past 2. No hidden instructions can do that: the answers did not exist until each side measured. This experiment won the 2022 Nobel prize in physics.`, true);
    }
    if (this.mode === 'hidden' && s.rounds >= 100 && !this.said.has('hidden')) {
      this.said.add('hidden');
      this.host.say(`S = ${s.s.toFixed(2)}: hidden instructions reach 2 at best, never more. Switch back to entangled pairs and beat it.`, true);
    }
  }

  card(): SceneCard {
    const s = score(this.tally);
    const sigma = s.se > 0 ? (s.s - 2) / s.se : 0;
    return {
      eyebrow: `Play  /  Bell test in your room  /  ${s.rounds} rounds`,
      title: s.rounds ? `S = ${s.s.toFixed(2)} +- ${s.se.toFixed(2)}` : 'Beat the classical limit',
      body: this.mode === 'quantum'
        ? 'Entangled pairs (the gold thread). Each side picks its dial at random while the pair is in flight, then reads +1 (teal) or -1 (red). Any explanation with hidden instructions keeps the score at 2 or below.'
        : 'Hidden instructions: each pair carries its answers from the start, the best a classical world allows. The score cannot pass 2.',
      goal: s.rounds >= 20 ? (s.s > 2 && sigma > 3 ? `${sigma.toFixed(1)} sigma past the classical limit` : `Classical limit 2: ${s.s > 2 ? 'past it, keep going' : 'not past it'}`) : 'Run rounds to score',
      done: this.said.has('passed'),
      next: this.queue > 0 ? `Running... ${this.queue} to go` : 'Run 100 rounds',
      choices: [this.mode === 'quantum' ? 'Pairs: entangled' : 'Pairs: hidden instructions', `Speed: ${this.rate}/s`, 'Start over'],
      active: this.mode === 'hidden' ? 0 : -1,
    };
  }

  figure(): Figure {
    const s = score(this.tally);
    // at most 300 points on the curve
    const step = Math.max(1, Math.ceil(this.history.length / 300));
    const hist = this.history.filter((_, i) => i % step === 0);
    return bellRoomFigure({ mode: this.mode, history: hist, s: s.s, se: s.se, rounds: s.rounds, e: s.e });
  }

  stop(): void {
    const v = this.host.lab()?.bellRoom;
    if (v) v.root.visible = false;
    this.queue = 0;
  }
}

export function makeScenes(host: SceneHost): Record<SceneId, Scene> {
  return {
    atom: new AtomScene(host),
    galton: new GaltonScene(host),
    tunnel: new TunnelScene(host),
    molecule: new MoleculeScene(host),
    rails: new RailsScene(host),
    waves: new WavesScene(host),
    box: new BoxScene(host),
    bell: new BellScene(host),
  };
}

/** Play tab names, in order, with their tags. */
export const SCENE_PLAY: { item: string; id: SceneId; tag: string }[] = [
  { item: 'Bell test in your room', id: 'bell', tag: 'Nobel' },
  { item: 'Wave hands', id: 'waves', tag: 'hands' },
  { item: 'Light from a box', id: 'box', tag: 'QLED' },
  { item: 'Inside an atom', id: 'atom', tag: 'H' },
  { item: 'Quantum Galton board', id: 'galton', tag: 'walk' },
  { item: 'Tunnelling', id: 'tunnel', tag: 'wall' },
  { item: 'Pull a molecule apart', id: 'molecule', tag: 'H2' },
  { item: 'Ride your circuit', id: 'rails', tag: 'ride' },
];
