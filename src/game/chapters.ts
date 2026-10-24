import type { Lab } from '../lab/lab';
import { bb84, grover2 } from '../quantum/algorithms';
import { blochVector } from '../quantum/bloch';
import type { Op } from '../quantum/circuit';
import type { Vec3 } from '../quantum/gates';
import { pairStrength } from '../quantum/entanglement';
import type { QState } from '../quantum/state';
import { maxcutSteps } from './qaoa-steps';
import { ALGORITHM_CHAPTERS } from './algorithm-chapters';
import { ADVANCED_CHAPTERS } from './advanced-chapters';
import type { Figure } from '../lab/figures';

/** What a goal can look at. */
export interface GoalContext {
  lab: Lab;
  /** Live state, including an unreleased wrist rotation. */
  state: QState;
  /** Ops committed since this step started. */
  stepOps: readonly Op[];
  /** Last 100-shot result since this step started, if any. */
  shots: Uint32Array | null;
  /** Scratch space a chapter can use across its steps. */
  memory: Record<string, unknown>;
}

/** A gesture the ghost hand demonstrates, on these qubits. */
export type Gesture = 'twist' | 'spread' | 'fist' | 'touch';
export interface Hint {
  gesture: Gesture;
  qubits: number[];
}

export interface Step {
  /** One or two plain sentences: what to do (a function when it depends on earlier steps). */
  text: string | ((memory: Record<string, unknown>) => string);
  /** Short goal line next to the status dot. */
  goal: string | ((memory: Record<string, unknown>) => string);
  /** Desktop equivalent, shown when not in a headset. */
  keys?: string;
  /** Which qubit acts as control when two orbs touch. */
  control?: number;
  done: (ctx: GoalContext) => boolean;
  /** Runs when the step starts. */
  enter?: (lab: Lab, memory: Record<string, unknown>) => void;
  /** Runs when the goal is met (before the next step). */
  complete?: (ctx: GoalContext) => void;
  /** Shown after the goal is met. */
  payoff?: string | ((ctx: GoalContext) => string);
  /**
   * A card button for something no gesture does (an oracle, a storm).
   * It replaces Continue until the goal is met; Enter presses it on desktop.
   */
  action?: { label: string; run: (lab: Lab, memory: Record<string, unknown>) => void };
  /** What the ghost hand shows; a function when the step has several moves. */
  hint?: Hint | ((ctx: GoalContext) => Hint | null);
  /** Course quizzes: the answers shown on the card, and which one is right. */
  choices?: string[];
  answer?: number;
  /** Unique key a page or quiz marks in memory when it is done. */
  id?: string;
  /** What the circuit board shows during this step (default: the circuit). */
  board?: 'maths' | 'landscape' | 'wheel' | 'vqe';
  /** A chapter's own figure on the board (a Bell score, a syndrome table ...), from its memory and the live state. */
  figure?: (memory: Record<string, unknown>, state: QState) => Figure | null;
  /** Show the chip, the fridge and the pulse schedule during this step. */
  hardware?: boolean;
  /** Show me: do the task for the player, with the same actions the gestures make. */
  solve?: (lab: Lab) => void;
  /** Keep the payoff up until Continue instead of moving on by itself (long explanations). */
  hold?: boolean;
  /** Target Bloch vector per qubit, drawn as a ghost arrow inside the orb (null: none); a function when it depends on earlier steps. */
  target?: (Vec3 | null)[] | ((memory: Record<string, unknown>) => (Vec3 | null)[]);
}

export interface Chapter {
  title: string;
  /** Lessons only: which shelf of the Learn panel it sits on, and its short chip label. */
  group?: string;
  chip?: string;
  /** Puzzles only: the reference solution (it defines the target) and its length. */
  solution?: Op[];
  par?: number;
  qubits: number;
  setup?: Op[];
  steps: Step[];
  /** Shown when the chapter is finished. */
  outro: string;
}

export const z = (s: QState, q: number) => blochVector(s, q)[2];
export const x = (s: QState, q: number) => blochVector(s, q)[0];
export const has = (ops: readonly Op[], f: (op: Op) => boolean) => ops.some(f);
export const isGate = (op: Op, gate: string, target?: number) =>
  op.kind === 'gate' && op.gate === gate && !op.controls?.length && (target === undefined || op.target === target);
export const isMeasure = (op: Op, q?: number) => op.kind === 'measure' && (q === undefined || op.qubit === q);
export const isCnot = (op: Op, control: number, target: number) =>
  op.kind === 'gate' && op.gate === 'x' && op.target === target && op.controls?.length === 1 && op.controls[0] === control;
export const twist = (q: number): Hint => ({ gesture: 'twist', qubits: [q] });
export const spread = (q: number): Hint => ({ gesture: 'spread', qubits: [q] });
export const fist = (q: number): Hint => ({ gesture: 'fist', qubits: [q] });
export const touch = (a: number, b: number): Hint => ({ gesture: 'touch', qubits: [a, b] });
export const total = (shots: Uint32Array) => shots.reduce((a, b) => a + b, 0);
const bits = (k: number, n: number) => k.toString(2).padStart(n, '0');
/** Agreement between a pure message (Bloch vector m) and qubit q now. */
const fidelity = (m: [number, number, number], s: QState, q: number) => {
  const r = blochVector(s, q);
  return (1 + m[0] * r[0] + m[1] * r[1] + m[2] * r[2]) / 2;
};

export const CHAPTERS: Chapter[] = [
  {
    title: 'Superposition',
    chip: 'Superpose',
    qubits: 1,
    steps: [
      {
        text: 'This orb is a qubit. Pinch it and turn your wrist. The arrow is its state.',
        goal: 'Tilt the arrow away from 0',
        keys: 'Hold the left or right arrow key',
        hint: twist(0),
        done: ({ state }) => z(state, 0) < 0.75,
        payoff: 'Anywhere on the sphere is a valid state, not just top and bottom.',
      },
      {
        text: 'Open your hand wide over the orb. A Hadamard puts it exactly between 0 and 1.',
        goal: 'Spread your fingers over the orb',
        keys: 'Press H',
        hint: spread(0),
        enter: (lab) => lab.load(1, []),
        done: ({ state, stepOps }) => has(stepOps, (o) => isGate(o, 'h')) && Math.abs(z(state, 0)) < 0.05,
        payoff: 'Half 0, half 1. Not unknown: genuinely both.',
      },
      {
        text: 'Close your fist around it to look.',
        goal: 'Measure the qubit',
        keys: 'Press M',
        hint: fist(0),
        done: ({ stepOps }) => has(stepOps, (o) => isMeasure(o)),
        payoff: ({ stepOps }) => {
          const m = stepOps.find((o) => isMeasure(o));
          const out = m && m.kind === 'measure' ? m.outcome : 0;
          return `It chose ${out}. Undo and try again: you cannot predict it.`;
        },
      },
    ],
    outro: 'You put a qubit in superposition and watched it collapse.',
  },
  {
    title: 'Interference',
    chip: 'Interfere',
    qubits: 1,
    steps: [
      {
        text: 'Spread over the orb once, like before.',
        goal: 'One Hadamard',
        keys: 'Press H',
        hint: spread(0),
        done: ({ state, stepOps }) => has(stepOps, (o) => isGate(o, 'h')) && Math.abs(z(state, 0)) < 0.05,
      },
      {
        text: 'Now spread again. Split it a second time.',
        goal: 'A second Hadamard',
        keys: 'Press H',
        hint: spread(0),
        done: ({ state, stepOps }) => has(stepOps, (o) => isGate(o, 'h')) && z(state, 0) > 0.99,
        payoff: 'It came back to 0. The two paths cancelled out: interference.',
      },
      {
        text: 'Run it a hundred times to be sure.',
        goal: 'Tap 100 shots',
        keys: 'Press Space',
        done: ({ shots }) => !!shots && shots[0] === shots.reduce((a, b) => a + b, 0),
        payoff: '100 out of 100 land on 0. No randomness left.',
      },
    ],
    outro: 'Split twice and it comes back. Quantum chance can cancel itself.',
  },
  {
    title: 'Entanglement',
    chip: 'Entangle',
    qubits: 2,
    steps: [
      {
        text: 'Spread your hand over the left qubit.',
        goal: 'Superposition on q0',
        keys: 'Press 1, then H',
        hint: spread(0),
        done: ({ state }) => x(state, 0) > 0.95,
      },
      {
        text: 'Pick up both orbs and touch them together.',
        goal: 'Entangle the pair',
        keys: 'Press C',
        hint: touch(0, 1),
        control: 0,
        done: ({ state }) => pairStrength(state, 0, 1) > 0.95,
        payoff: 'Both arrows vanished. Neither qubit has a state of its own now. Only the pair does.',
      },
      {
        text: 'Run 100 shots.',
        goal: 'Tap 100 shots',
        keys: 'Press Space',
        done: ({ shots }) => !!shots && shots[1] === 0 && shots[2] === 0,
        payoff: 'Always 00 or 11. Never mixed.',
      },
      {
        text: 'Make a fist over one qubit. Watch the other one.',
        goal: 'Measure one qubit',
        keys: 'Press M',
        hint: fist(0),
        done: ({ stepOps }) => has(stepOps, (o) => isMeasure(o)),
        payoff: 'Measuring one decided both, instantly.',
      },
    ],
    outro: 'Two qubits, one shared state. That is entanglement.',
  },
  {
    title: 'Teleportation',
    chip: 'Teleport',
    qubits: 3,
    steps: [
      {
        text: 'q0 holds a message. Pinch it and turn it to any state you like.',
        goal: 'Write the message on q0',
        keys: 'Press 1, then hold an arrow key',
        hint: twist(0),
        done: ({ state }) => z(state, 0) < 0.8,
        complete: ({ lab, memory }) => {
          lab.commitRotation();
          memory.message = blochVector(lab.history.state, 0);
        },
      },
      {
        text: 'Spread over q1, then touch q1 to q2. They become a shared pair.',
        goal: 'Entangle q1 and q2',
        keys: 'Press 2, H, then C',
        hint: ({ state }) => (x(state, 1) > 0.95 ? touch(1, 2) : spread(1)),
        control: 1,
        done: ({ state }) => pairStrength(state, 1, 2) > 0.95,
      },
      {
        text: 'Now touch q0 to q1.',
        goal: 'Link the message to the pair',
        keys: 'Press 1, then C',
        hint: touch(0, 1),
        control: 0,
        done: ({ stepOps }) => has(stepOps, (o) => isCnot(o, 0, 1)),
      },
      {
        text: 'Spread over q0.',
        goal: 'Hadamard on q0',
        keys: 'Press 1, then H',
        hint: spread(0),
        done: ({ stepOps }) => has(stepOps, (o) => isGate(o, 'h', 0)),
      },
      {
        text: 'Make a fist over q0, then over q1. Two plain bits come out.',
        goal: 'Measure q0 and q1',
        keys: 'Press 1, M, 2, M',
        hint: ({ stepOps }) => fist(has(stepOps, (o) => isMeasure(o, 0)) ? 1 : 0),
        done: ({ stepOps }) => has(stepOps, (o) => isMeasure(o, 0)) && has(stepOps, (o) => isMeasure(o, 1)),
        complete: ({ lab, stepOps }) => {
          // the two classical bits travel to q2 and fix it up
          const bit = (q: number) => {
            const m = [...stepOps].reverse().find((o) => isMeasure(o, q));
            return m && m.kind === 'measure' ? m.outcome : 0;
          };
          if (bit(1)) lab.gate('x', 2);
          if (bit(0)) lab.gate('z', 2);
        },
        payoff: ({ lab, memory }) => {
          const m = memory.message as [number, number, number] | undefined;
          const f = m ? fidelity(m, lab.history.state, 2) : 1;
          return `q2 now holds your message (fidelity ${f.toFixed(3)}). q0 lost it: states move, they never copy.`;
        },
      },
    ],
    outro: 'You teleported a quantum state with one shared pair and two ordinary bits.',
  },
  {
    title: 'Quantum Spy',
    chip: 'Spy',
    qubits: 1,
    steps: [
      {
        text: 'Alice sends Bob a secret bit on one photon. She hides it on the diagonal: spread over the orb.',
        goal: 'Encode on the diagonal',
        keys: 'Press H',
        hint: spread(0),
        done: ({ state }) => x(state, 0) > 0.95,
        payoff: 'Read straight on, it looks like a coin toss. Only the right basis reads it back.',
      },
      {
        text: 'Bob knows the basis. He spreads again to turn it back, then reads it 100 times.',
        goal: 'Spread, then 100 shots',
        keys: 'Press H, then Space',
        hint: ({ stepOps }) => (has(stepOps, (o) => isGate(o, 'h')) ? null : spread(0)),
        done: ({ stepOps, shots }) => has(stepOps, (o) => isGate(o, 'h')) && !!shots && shots[0] === total(shots),
        payoff: '100 of 100 read 0. Same basis, perfect copy of the bit.',
      },
      {
        text: 'Again, but Eve intercepts the photon. She does not know the basis, so she looks straight on. Make a fist.',
        goal: 'Eve measures',
        keys: 'Press M',
        hint: fist(0),
        enter: (lab) => lab.load(1, [{ kind: 'gate', gate: 'h', target: 0 }]),
        done: ({ stepOps }) => has(stepOps, (o) => isMeasure(o)),
        payoff: 'Looking forced a choice. The diagonal state is gone, and Eve cannot put it back.',
      },
      {
        text: 'Bob reads exactly as before: spread, then 100 shots.',
        goal: 'Spread, then 100 shots',
        keys: 'Press H, then Space',
        hint: ({ stepOps }) => (has(stepOps, (o) => isGate(o, 'h')) ? null : spread(0)),
        done: ({ stepOps, shots }) => has(stepOps, (o) => isGate(o, 'h')) && !!shots && shots[0] < total(shots),
        payoff: ({ shots }) => `Only ${shots ? shots[0] : 50} of 100 read 0 now. Eve's look left errors behind.`,
      },
      {
        text: 'Real keys use many photons in random bases. Send 400 and compare the error rates.',
        goal: 'Send 400 photons',
        keys: 'Press Enter',
        action: {
          label: 'Send 400',
          run: (lab, memory) => {
            const rng = () => lab.random();
            memory.clean = bb84(400, false, rng).qber;
            memory.spied = bb84(400, true, rng).qber;
          },
        },
        done: ({ memory }) => memory.spied !== undefined,
        payoff: ({ memory }) =>
          `Without Eve: ${Math.round((memory.clean as number) * 100)}% errors. With Eve: ${Math.round((memory.spied as number) * 100)}%. A spy always shows up.`,
      },
    ],
    outro: 'Measuring changes what it measures. That is why quantum keys can catch a spy.',
  },
  {
    title: 'The Search',
    chip: 'Search',
    qubits: 2,
    steps: [
      {
        text: 'Four boxes, 00 to 11. One hides a prize. Spread over both orbs to open all four at once.',
        goal: 'Superposition on q0 and q1',
        keys: 'Press 1, H, 2, H',
        hint: ({ state }) => (x(state, 0) > 0.95 ? (x(state, 1) > 0.95 ? null : spread(1)) : spread(0)),
        enter: (lab, memory) => {
          memory.marked = Math.floor(lab.random() * 4);
        },
        done: ({ state }) => x(state, 0) > 0.95 && x(state, 1) > 0.95,
        payoff: 'Every box is equally likely now: 25% each.',
      },
      {
        text: 'A hidden oracle knows the prize. It marks it by flipping its sign. Tap Oracle.',
        goal: 'Run the oracle',
        keys: 'Press Enter',
        action: {
          label: 'Oracle',
          run: (lab, memory) => {
            // X on the 0 bits, CZ, X again: flips the sign of the marked box only
            const m = memory.marked as number;
            const flip = [0, 1].filter((q) => !((m >> q) & 1));
            for (const q of flip) lab.gate('x', q);
            lab.gate('z', 1, undefined, [0]);
            for (const q of flip) lab.gate('x', q);
            memory.oracle = true;
          },
        },
        done: ({ memory }) => memory.oracle === true,
        payoff: 'The arrows vanished: marking one box tied the qubits together. The odds did not change.',
      },
      {
        text: 'Check the odds. Run 100 shots.',
        goal: 'Tap 100 shots',
        keys: 'Press Space',
        done: ({ shots }) => !!shots,
        payoff: 'Still about 25 each. The mark is in the phase, where no measurement can see it.',
      },
      {
        text: 'Tap Amplify. It turns the hidden sign into probability.',
        goal: 'Amplify the marked box',
        keys: 'Press Enter',
        action: {
          label: 'Amplify',
          run: (lab, memory) => {
            // the second half of one Grover iteration: reflect about the average
            for (const op of grover2(memory.marked as number).slice(-9)) lab.apply(op);
            memory.amplified = true;
          },
        },
        done: ({ memory }) => memory.amplified === true,
        payoff: 'Both arrows point straight at an answer.',
      },
      {
        text: 'Run 100 shots one more time.',
        goal: 'Tap 100 shots',
        keys: 'Press Space',
        done: ({ shots, memory }) => !!shots && shots[memory.marked as number] === total(shots),
        payoff: ({ memory }) => `All 100 open box ${bits(memory.marked as number, 2)}. One look found it; checking box by box can take three.`,
      },
    ],
    outro: "That was Grover's search. With a million boxes it needs about a thousand looks, not a million.",
  },
  {
    title: 'The Storm',
    chip: 'Storm',
    qubits: 3,
    steps: [
      {
        text: 'q0 holds a message. Pinch it and turn it to any state.',
        goal: 'Write the message on q0',
        keys: 'Press 1, then hold an arrow key',
        hint: twist(0),
        done: ({ state }) => z(state, 0) < 0.8,
        complete: ({ lab, memory }) => {
          lab.commitRotation();
          memory.message = blochVector(lab.history.state, 0);
        },
      },
      {
        text: 'Spread it out: touch q0 to q1, then q0 to q2.',
        goal: 'Link q0 to q1 and q2',
        keys: 'Press 1, C, then 3, C',
        hint: ({ stepOps }) => (has(stepOps, (o) => isCnot(o, 0, 1)) ? touch(0, 2) : touch(0, 1)),
        control: 0,
        done: ({ stepOps }) => has(stepOps, (o) => isCnot(o, 0, 1)) && has(stepOps, (o) => isCnot(o, 0, 2)),
        payoff: 'Three qubits now carry one message together. Not copies: a qubit cannot be copied.',
      },
      {
        text: 'A storm is coming. It will flip one qubit at random. Tap Storm.',
        goal: 'Let the storm hit',
        keys: 'Press Enter',
        action: {
          label: 'Storm',
          run: (lab, memory) => {
            const q = Math.floor(lab.random() * 3);
            memory.hit = q;
            lab.strike(q);
          },
        },
        done: ({ memory }) => memory.hit !== undefined,
        payoff: 'Something flipped. Measuring to find it would destroy the message.',
      },
      {
        text: 'Undo the spreading: touch q0 to q1 and q0 to q2 again.',
        goal: 'Link q0 to q1 and q2 again',
        keys: 'Press 1, C, then 3, C',
        hint: ({ stepOps }) => (has(stepOps, (o) => isCnot(o, 0, 1)) ? touch(0, 2) : touch(0, 1)),
        control: 0,
        done: ({ stepOps }) => has(stepOps, (o) => isCnot(o, 0, 1)) && has(stepOps, (o) => isCnot(o, 0, 2)),
        payoff: ({ state }) => {
          const b = (q: number) => (z(state, q) < 0 ? 1 : 0);
          const hit = b(1) && b(2) ? 0 : b(1) ? 1 : b(2) ? 2 : -1;
          return hit < 0
            ? 'q1 and q2 read 00: nothing to fix.'
            : `q1 and q2 read ${b(1)}${b(2)}: the storm hit q${hit}. They know where, not what the message says.`;
        },
      },
      {
        text: 'If both helpers read 1, q0 was hit. Tap Repair: it flips q0 back only in that case.',
        goal: 'Repair q0',
        keys: 'Press Enter',
        action: {
          label: 'Repair',
          run: (lab, memory) => {
            // majority vote: X on q0 controlled by both helpers (a Toffoli)
            lab.gate('x', 0, undefined, [1, 2]);
            memory.repaired = true;
          },
        },
        done: ({ memory }) => memory.repaired === true,
        payoff: ({ lab, memory }) => {
          const m = memory.message as [number, number, number] | undefined;
          const f = m ? fidelity(m, lab.history.state, 0) : 1;
          return `q0 has your message back (fidelity ${f.toFixed(3)}). Nobody ever looked at it.`;
        },
      },
    ],
    outro: 'You protected a qubit from noise without measuring it. Every quantum computer needs this.',
  },
  {
    title: 'Two Bits, One Qubit',
    chip: 'Superdense',
    qubits: 2,
    steps: [
      {
        text: 'Alice and Bob share an entangled pair. Spread over q0, then touch q0 to q1.',
        goal: 'Share a pair',
        keys: 'Press 1, H, then C',
        control: 0,
        hint: ({ state }) => (x(state, 0) > 0.95 ? touch(0, 1) : spread(0)),
        done: ({ state }) => {
          const p = state.probabilities();
          return pairStrength(state, 0, 1) > 0.95 && p[0] > 0.45 && p[3] > 0.45;
        },
        payoff: 'Bob takes q1 far away. Alice keeps q0.',
      },
      {
        text: 'Alice wants to send Bob two bits, but she may only send him one qubit. Tap Message to pick the bits.',
        goal: 'Pick a message',
        keys: 'Press Enter',
        action: {
          label: 'Message',
          run: (lab, memory) => {
            memory.msg = Math.floor(lab.random() * 4);
          },
        },
        done: ({ memory }) => memory.msg !== undefined,
        payoff: ({ memory }) => `The message is ${bits(memory.msg as number, 2)}.`,
      },
      {
        text: (m) => {
          const k = m.msg as number;
          const xb = (k >> 1) & 1, zb = k & 1;
          const how = !xb && !zb ? 'do nothing' : [xb ? 'X' : '', zb ? 'Z' : ''].filter(Boolean).join(', then ');
          return `Message ${bits(k, 2)}. Alice encodes it on q0 alone: X if the left bit is 1, Z if the right bit is 1. Here: ${how}. Then tap Send.`;
        },
        goal: (m) => `Encode ${bits(m.msg as number, 2)} on q0`,
        keys: 'Press 1, then X or Z; Enter to send',
        action: {
          label: 'Send',
          run: (_lab, memory) => {
            memory.sent = true;
          },
        },
        done: ({ memory }) => memory.sent === true,
        payoff: 'One qubit is on its way to Bob. On its own it carries no information at all.',
      },
      {
        text: 'Bob now holds both qubits. He undoes the pair: touch q0 to q1, then spread over q0.',
        goal: 'Decode',
        keys: 'Press 1, C, then H',
        control: 0,
        hint: ({ stepOps }) => (has(stepOps, (o) => isCnot(o, 0, 1)) ? spread(0) : touch(0, 1)),
        done: ({ stepOps }) => {
          const c = stepOps.findIndex((o) => isCnot(o, 0, 1));
          return c >= 0 && stepOps.slice(c + 1).some((o) => isGate(o, 'h', 0));
        },
      },
      {
        text: 'Run 100 shots.',
        goal: 'Tap 100 shots',
        keys: 'Press Space',
        done: ({ shots }) => !!shots && Math.max(...shots) === total(shots),
        payoff: ({ shots, memory }) => {
          const got = shots ? shots.indexOf(Math.max(...shots)) : -1;
          return got === memory.msg
            ? `All 100 read ${bits(got, 2)}: two bits arrived on one qubit. Entanglement doubled the channel.`
            : `All 100 read ${bits(got, 2)}, not ${bits(memory.msg as number, 2)}. Check the encoding gates and replay.`;
        },
      },
    ],
    outro: 'Superdense coding: a shared pair lets one qubit carry two bits.',
  },
  {
    title: 'One Question',
    chip: 'Deutsch',
    qubits: 2,
    steps: [
      {
        text: 'A sealed box hides a rule: constant (always the same answer) or balanced (one of each). Classically you must ask it twice. Flip q1 with X, then spread over both.',
        goal: 'Prepare both qubits',
        keys: 'Press 2, X, H, then 1, H',
        hint: ({ state }) => (x(state, 1) < -0.95 ? (x(state, 0) > 0.95 ? null : spread(0)) : z(state, 1) < 0 ? spread(1) : null),
        done: ({ state }) => x(state, 0) > 0.95 && x(state, 1) < -0.95,
        payoff: 'q1 points away from you. Its minus sign will catch the answer.',
      },
      {
        text: 'Ask the box once, with both answers in superposition.',
        goal: 'Ask once',
        keys: 'Press Enter',
        action: {
          label: 'Ask',
          run: (lab, memory) => {
            const f = Math.floor(lab.random() * 4);
            memory.f = f;
            // 0: always 0, 1: always 1, 2: copies the input, 3: flips the input
            if (f >= 2) lab.gate('x', 1, undefined, [0]);
            if (f === 1 || f === 3) lab.gate('x', 1);
          },
        },
        done: ({ memory }) => memory.f !== undefined,
        payoff: 'Nothing visible happened to q1. The answer went somewhere else: into the phase of q0.',
      },
      {
        text: 'Spread over q0 again, then make a fist over it.',
        goal: 'Read q0',
        keys: 'Press 1, H, then M',
        hint: ({ stepOps }) => (has(stepOps, (o) => isGate(o, 'h', 0)) ? fist(0) : spread(0)),
        done: ({ stepOps }) => has(stepOps, (o) => isMeasure(o, 0)),
        payoff: ({ stepOps, memory }) => {
          const m = [...stepOps].reverse().find((o) => isMeasure(o, 0));
          const out = m && m.kind === 'measure' ? m.outcome : 0;
          const names = ['always 0', 'always 1', 'a copy of the input', 'the input flipped'];
          const truth = (memory.f as number) >= 2 ? 'balanced' : 'constant';
          return `q0 read ${out}: ${out ? 'balanced' : 'constant'}. The box was ${names[memory.f as number]}, so ${truth}. One question instead of two.`;
        },
      },
    ],
    outro: "Deutsch's algorithm: the first proof that a quantum computer can beat every classical one at something.",
  },
  {
    title: 'Hidden Number',
    chip: 'Hidden No.',
    qubits: 4,
    steps: [
      {
        text: 'A box hides a 3-bit number. Each classical question reveals one bit, so it takes three. q3 is a helper: flip it with X, then spread over it.',
        goal: 'Prepare the helper q3',
        keys: 'Press 4, X, then H',
        hint: ({ state }) => (z(state, 3) < 0 ? spread(3) : null),
        done: ({ state }) => x(state, 3) < -0.95,
      },
      {
        text: 'Spread over q0, q1 and q2.',
        goal: 'Superposition on q0, q1, q2',
        keys: 'Press 1, H, 2, H, 3, H',
        hint: ({ state }) => {
          const q = [0, 1, 2].find((i) => x(state, i) < 0.95);
          return q === undefined ? null : spread(q);
        },
        done: ({ state }) => [0, 1, 2].every((q) => x(state, q) > 0.95),
        payoff: 'All eight possible questions, asked at once.',
      },
      {
        text: 'Ask the box one single time.',
        goal: 'Ask once',
        keys: 'Press Enter',
        action: {
          label: 'Ask',
          run: (lab, memory) => {
            const secret = 1 + Math.floor(lab.random() * 7);
            memory.secret = secret;
            for (let q = 0; q < 3; q++) if ((secret >> q) & 1) lab.gate('x', 3, undefined, [q]);
          },
        },
        done: ({ memory }) => memory.secret !== undefined,
        payoff: 'Every 1 in the number flipped the sign of its qubit. Look for arrows that now point away.',
      },
      {
        text: 'Spread over all four qubits again.',
        goal: 'Hadamard on every qubit',
        keys: 'Press 1, H, 2, H, 3, H, 4, H',
        hint: ({ state }) => {
          const q = [0, 1, 2, 3].find((i) => Math.abs(z(state, i)) < 0.99);
          return q === undefined ? null : spread(q);
        },
        done: ({ state }) => [0, 1, 2, 3].every((q) => Math.abs(z(state, q)) > 0.99),
      },
      {
        text: 'Run 100 shots.',
        goal: 'Tap 100 shots',
        keys: 'Press Space',
        done: ({ shots }) => !!shots && Math.max(...shots) === total(shots),
        payoff: ({ shots, memory }) => {
          const got = shots ? shots.indexOf(Math.max(...shots)) & 7 : 0;
          return `Every shot reads ${bits(got, 3)} on q2 q1 q0 (q3 is just the helper). The number was ${bits(memory.secret as number, 3)}. One question, not three.`;
        },
      },
    ],
    outro: 'Bernstein-Vazirani: n questions become one. The same trick sits inside larger quantum algorithms.',
  },
  {
    title: 'The Mystery Qubit',
    chip: 'Mystery',
    qubits: 1,
    steps: [
      {
        text: 'A sealed box makes copies of a qubit nobody will describe. Looking destroys a copy and gives one bit, so look at 100 copies along Z.',
        goal: 'Look along Z',
        keys: 'Press Enter',
        enter: (lab, memory) => {
          memory.mystery ??= mysteryState(lab.random(), lab.random());
        },
        action: { label: 'Look Z', run: look('z') },
        done: ({ memory }) => memory.z !== undefined,
        payoff: ({ memory }) => `${readout(memory, 'z')} The arrow sits at about ${signed(estimate(memory, 'z'))} on the Z axis.`,
      },
      {
        text: 'Z alone cannot tell sideways arrows apart: they all give 50/50. Look along X: each copy gets a Hadamard first, which swings X onto Z.',
        goal: 'Look along X',
        keys: 'Press Enter',
        action: { label: 'Look X', run: look('x') },
        done: ({ memory }) => memory.x !== undefined,
        payoff: ({ memory }) => `${readout(memory, 'x')} So x is about ${signed(estimate(memory, 'x'))}.`,
      },
      {
        text: 'One axis left. For Y, each copy gets S dagger and then a Hadamard, which swings Y onto Z.',
        goal: 'Look along Y',
        keys: 'Press Enter',
        action: { label: 'Look Y', run: look('y') },
        done: ({ memory }) => memory.y !== undefined,
        payoff: ({ memory }) => `${readout(memory, 'y')} So y is about ${signed(estimate(memory, 'y'))}. Three numbers: the whole state.`,
      },
      {
        text: 'Your estimate is the faint arrow. Rebuild it on your own qubit: turn your wrist to tilt it, then T turns it around the vertical axis.',
        goal: 'Match the faint arrow',
        keys: 'Hold an arrow key, then press T',
        hint: ({ state, memory }) => (fidelity(guess(memory), state, 0) < 0.95 ? twist(0) : null),
        target: (memory) => [guess(memory)],
        done: ({ state, memory }) => fidelity(guess(memory), state, 0) >= 0.95,
        complete: ({ lab }) => lab.commitRotation(),
        payoff: ({ state, memory }) => `Your qubit matches your estimate (fidelity ${fidelity(guess(memory), state, 0).toFixed(2)}).`,
      },
      {
        text: 'Moment of truth: tap Reveal to compare your rebuilt qubit with the real one.',
        goal: 'Reveal the mystery state',
        keys: 'Press Enter',
        target: (memory) => (memory.revealed ? [memory.mystery as Vec3] : [guess(memory)]),
        action: {
          label: 'Reveal',
          run: (lab, memory) => {
            memory.revealed = true;
          },
        },
        done: ({ memory }) => memory.revealed === true,
        payoff: ({ state, memory }) =>
          `The real state is the new faint arrow. Your copy matches it with fidelity ${fidelity(memory.mystery as Vec3, state, 0).toFixed(2)}, from 300 copies and nothing else.`,
      },
    ],
    outro: 'That was quantum state tomography: rebuilding an unknown state from many measurements. Labs use it to check every new qubit they make.',
  },
  {
    title: 'Max Cut',
    chip: 'MaxCut',
    qubits: 4,
    steps: maxcutSteps(),
    outro: 'That was QAOA, a variational algorithm: a quantum circuit with dials, tuned by a classical optimizer. The PennyLane tab in the code window has the same program.',
  },
  ...ALGORITHM_CHAPTERS,
  ...ADVANCED_CHAPTERS,
];

/**
 * The Mystery Qubit: a random state, kept away from the poles so that X and Y
 * matter (polar angle 35 to 145 degrees, any azimuth).
 */
export function mysteryState(u: number, v: number): Vec3 {
  const theta = (35 + 110 * u) * (Math.PI / 180);
  const phi = 2 * Math.PI * v;
  return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
}

const AXIS = { x: 0, y: 1, z: 2 } as const;

/**
 * Card button: measure 100 fresh copies of the mystery state along one axis and
 * show the counts on the rain. Each copy reads 0 with probability (1 + r)/2,
 * where r is the state's component along that axis.
 */
function look(axis: 'x' | 'y' | 'z') {
  return (lab: Lab, memory: Record<string, unknown>) => {
    const m = memory.mystery as Vec3;
    const p0 = (1 + m[AXIS[axis]]) / 2;
    let zeros = 0;
    for (let i = 0; i < 100; i++) if (lab.random() < p0) zeros++;
    memory[axis] = zeros;
    lab.showShots(Uint32Array.from([zeros, 100 - zeros]));
  };
}

const estimate = (memory: Record<string, unknown>, axis: 'x' | 'y' | 'z') => ((memory[axis] as number) - 50) / 50;
const signed = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(2)}`;
const readout = (memory: Record<string, unknown>, axis: 'x' | 'y' | 'z') => {
  const zeros = memory[axis] as number;
  return `${zeros} read 0, ${100 - zeros} read 1.`;
};

/** The player's estimate as a unit vector (counts are noisy, so the raw vector is rarely length 1). */
export function guess(memory: Record<string, unknown>): Vec3 {
  const v: Vec3 = [estimate(memory, 'x'), estimate(memory, 'y'), estimate(memory, 'z')];
  const len = Math.hypot(...v);
  return len < 1e-9 ? [0, 0, 1] : [v[0] / len, v[1] / len, v[2] / len];
}
