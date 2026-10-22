import { blochVector } from '../quantum/bloch';
import type { Op } from '../quantum/circuit';
import { pairStrength } from '../quantum/entanglement';
import type { Vec3 } from '../quantum/gates';
import { fist, has, isGate, isMeasure, spread, touch, twist, x, z, type Chapter } from './chapters';

/**
 * The Learn shelf: one short lesson per gate or idea. Each is a one-step
 * chapter with a challenge, a target arrow drawn inside the orb, and the same
 * ghost-hand hints, payoffs and autosave as the campaign.
 */

const H0: Op = { kind: 'gate', gate: 'h', target: 0 };
const y = (s: Parameters<typeof x>[0], q: number) => blochVector(s, q)[1];
const onlyGates = (ops: readonly Op[], allowed: string[]) =>
  ops.every((o) => o.kind === 'gate' && allowed.includes(o.gate) && !o.controls?.length);
const count = (ops: readonly Op[], gate: string) => ops.filter((o) => isGate(o, gate)).length;

const UP: Vec3 = [0, 0, 1];
const DOWN: Vec3 = [0, 0, -1];
const PLUS: Vec3 = [1, 0, 0];
const MINUS: Vec3 = [-1, 0, 0];
const RIGHT: Vec3 = [0, 1, 0];
/** Ry(60 degrees)|0>: reads 1 a quarter of the time. */
const QUARTER: Vec3 = [Math.sin(Math.PI / 3), 0, Math.cos(Math.PI / 3)];

export const LESSONS: Chapter[] = [
  {
    title: 'Hadamard',
    chip: 'H',
    group: 'Gates',
    qubits: 1,
    steps: [{
      text: 'H turns a sure 0 into an even mix of 0 and 1, and an even mix back into a sure answer. On the sphere it swaps the top and the front.',
      goal: 'Point the arrow at the target',
      keys: 'Press H',
      hint: spread(0),
      target: [PLUS],
      done: ({ state }) => x(state, 0) > 0.99,
      payoff: 'Halfway between 0 and 1. Press H again and it comes straight back.',
    }],
    outro: 'H is the doorway to superposition. Almost every algorithm starts with it.',
  },
  {
    title: 'X gate',
    chip: 'X',
    group: 'Gates',
    qubits: 1,
    steps: [{
      text: 'X swaps 0 and 1, like the NOT gate in every ordinary computer. On the sphere it is a half turn about the front axis.',
      goal: 'Flip the qubit to 1',
      keys: 'Press X',
      target: [DOWN],
      done: ({ state, stepOps }) => has(stepOps, (o) => isGate(o, 'x')) && z(state, 0) < -0.99,
      payoff: '0 became 1. This is the only gate classical computers and quantum ones share exactly.',
    }],
    outro: 'X is a bit flip. Quantum gates can do much more than flip, as the next lessons show.',
  },
  {
    title: 'Y gate',
    chip: 'Y',
    group: 'Gates',
    qubits: 1,
    steps: [{
      text: 'Y is also a half turn, about the side axis. It flips 0 and 1 too, and adds a phase you cannot see yet.',
      goal: 'Reach 1 with Y',
      keys: 'Press Y',
      target: [DOWN],
      done: ({ state, stepOps }) => has(stepOps, (o) => isGate(o, 'y')) && z(state, 0) < -0.99,
      payoff: 'Same place as X, different phase. The difference only shows when paths interfere.',
    }],
    outro: 'X, Y and Z are the three half turns of the sphere: the Pauli gates.',
  },
  {
    title: 'Z gate',
    chip: 'Z',
    group: 'Gates',
    qubits: 1,
    setup: [H0],
    steps: [{
      text: 'Z is a half turn about the vertical axis. It leaves 0 and 1 alone but flips the sign between them. This qubit starts in an even mix.',
      goal: 'Swing the arrow to the back',
      keys: 'Press Z',
      target: [MINUS],
      done: ({ state }) => x(state, 0) < -0.99,
      payoff: 'The odds did not change: still 50/50. Only the phase did.',
    }],
    outro: 'Z changes phase, not probability. Phase is what makes quantum algorithms work.',
  },
  {
    title: 'S gate',
    chip: 'S',
    group: 'Gates',
    qubits: 1,
    setup: [H0],
    steps: [{
      text: 'S is a quarter turn about the vertical axis: half of a Z.',
      goal: 'Point the arrow at the target',
      keys: 'Press S',
      target: [RIGHT],
      done: ({ state }) => y(state, 0) > 0.99,
      payoff: 'A quarter of the way round the equator. Two S gates make one Z.',
    }],
    outro: 'S adds a phase of i to the 1 part of the qubit.',
  },
  {
    title: 'T gate',
    chip: 'T',
    group: 'Gates',
    qubits: 1,
    setup: [H0],
    steps: [{
      text: 'T is an eighth turn: half of an S. Reach the same target as the S lesson, using only T.',
      goal: 'Reach the target with T alone',
      keys: 'Press T twice',
      target: [RIGHT],
      done: ({ state, stepOps }) => y(state, 0) > 0.99 && count(stepOps, 't') >= 2 && onlyGates(stepOps, ['t']),
      payoff: 'Two T gates make an S. Error-corrected quantum computers build almost everything from H and T.',
    }],
    outro: 'T is the gate that makes a quantum computer universal.',
  },
  {
    title: 'Rotation',
    chip: 'Ry',
    group: 'Gates',
    qubits: 1,
    steps: [{
      text: 'Turning your wrist applies Ry, a turn by any angle. The chance of reading 1 depends on the height of the arrow, not on the angle itself.',
      goal: 'Make 1 come up a quarter of the time',
      keys: 'Hold an arrow key',
      hint: twist(0),
      target: [QUARTER],
      done: ({ state }) => Math.abs(state.prob1(0) - 0.25) < 0.03,
      payoff: 'Only a 60 degree turn, yet a 25% chance. Probability is the square of the amplitude.',
    }],
    outro: 'Any single-qubit state is a point on the sphere, and a rotation can reach every one.',
  },
  {
    title: 'Measurement',
    chip: 'Measure',
    group: 'Gates',
    qubits: 1,
    setup: [{ kind: 'gate', gate: 'ry', target: 0, params: [Math.PI / 3] }],
    steps: [{
      text: 'Measuring forces a plain 0 or 1. The odds come from the height of the arrow: this one reads 1 a quarter of the time.',
      goal: 'Measure, and watch the arrow jump',
      keys: 'Press M',
      hint: fist(0),
      done: ({ stepOps }) => has(stepOps, (o) => isMeasure(o)),
      payoff: ({ stepOps }) => {
        const m = stepOps.find((o) => isMeasure(o));
        const out = m && m.kind === 'measure' ? m.outcome : 0;
        return `It read ${out}, and the arrow now sits on ${out}. Measuring did not just look: it changed the qubit.`;
      },
    }],
    outro: 'Measurement is the only way to get an answer out, and it ends the superposition.',
  },
  {
    title: 'CNOT',
    chip: 'CNOT',
    group: 'Gates',
    qubits: 2,
    steps: [{
      text: 'CNOT flips the second qubit only when the first one is 1. Touching two orbs together applies it.',
      goal: 'Make both qubits read 1',
      keys: 'Press 1, X, then C',
      control: 0,
      hint: ({ state }) => (z(state, 0) < 0 ? touch(0, 1) : null),
      target: [DOWN, DOWN],
      done: ({ state }) => state.probabilities()[3] > 0.99,
      payoff: 'The control was 1, so the target flipped. With a control of 0 nothing happens.',
    }],
    outro: 'CNOT is the gate that makes qubits talk. Fed a superposition, it makes entanglement.',
  },
  {
    title: 'SWAP',
    chip: 'SWAP',
    group: 'Gates',
    qubits: 2,
    setup: [{ kind: 'gate', gate: 'x', target: 0 }],
    steps: [{
      text: 'SWAP exchanges the states of two qubits. q0 holds a 1. Move it to q1.',
      goal: 'Move the 1 from q0 to q1',
      keys: 'SWAP on the dock, or W',
      target: [UP, DOWN],
      done: ({ state }) => state.probabilities()[2] > 0.99,
      payoff: 'Swapped. Three CNOTs in a row (forth, back, forth) do exactly the same.',
    }],
    outro: 'Real chips can only link neighbours, so compilers fill circuits with SWAPs.',
  },
  {
    title: 'Phase',
    chip: 'Phase',
    group: 'Ideas',
    qubits: 1,
    setup: [H0],
    steps: [{
      text: 'Phase is the direction around the equator. A measurement straight on cannot see it, but interference can. This qubit starts in an even mix.',
      goal: 'Make it read 1 for sure, with Z and H only',
      keys: 'Press Z, then H',
      target: [DOWN],
      done: ({ state, stepOps }) => z(state, 0) < -0.99 && onlyGates(stepOps, ['z', 'h']),
      payoff: 'Z changed only the phase, and H turned that phase into a certain 1. That is interference.',
    }],
    outro: 'Hidden phases becoming certain answers: this is how every quantum speed-up works.',
  },
  {
    title: 'Kickback',
    chip: 'Kickback',
    group: 'Ideas',
    qubits: 2,
    setup: [{ kind: 'gate', gate: 'x', target: 1 }, { kind: 'gate', gate: 'h', target: 1 }],
    steps: [{
      text: 'q1 points away from you, the minus state. Spread over q0, then touch q0 to q1. Watch which arrow moves.',
      goal: 'CNOT into the minus state',
      keys: 'Press 1, H, then C',
      control: 0,
      hint: ({ state }) => (x(state, 0) > 0.95 ? touch(0, 1) : spread(0)),
      target: [MINUS, MINUS],
      done: ({ state, stepOps }) => has(stepOps, (o) => o.kind === 'gate' && o.gate === 'x' && o.target === 1 && o.controls?.[0] === 0) && x(state, 0) < -0.99,
      payoff: 'The target stayed put and the control flipped. The minus sign kicked back.',
    }],
    outro: 'Phase kickback is the engine inside Deutsch, Bernstein-Vazirani and Grover.',
  },
  {
    title: 'No cloning',
    chip: 'Clone',
    group: 'Ideas',
    qubits: 2,
    steps: [{
      text: 'Can a qubit be copied? Put q0 in an even mix, then touch q0 to q1, the way you would copy a classical bit.',
      goal: 'Try to copy q0 into q1',
      keys: 'Press 1, H, then C',
      control: 0,
      hint: ({ state }) => (x(state, 0) > 0.95 ? touch(0, 1) : spread(0)),
      done: ({ state }) => pairStrength(state, 0, 1) > 0.95,
      payoff: 'Not two copies: both arrows vanished into one entangled pair.',
    }],
    outro: 'No gate can copy an unknown quantum state. This no-cloning rule is why quantum keys are safe.',
  },
  {
    title: 'Bell states',
    chip: 'Bell',
    group: 'Ideas',
    qubits: 2,
    steps: [{
      text: 'Chapter 3 made a pair that always agrees. Make one that always disagrees: only 01 or 10, never knowing which.',
      goal: 'Entangle a pair that disagrees',
      keys: 'Press 2, X, 1, H, then C',
      control: 0,
      hint: ({ state }) => (z(state, 1) > 0 ? null : x(state, 0) > 0.95 ? touch(0, 1) : spread(0)),
      done: ({ state }) => {
        const p = state.probabilities();
        return pairStrength(state, 0, 1) > 0.95 && p[0] + p[3] < 0.01;
      },
      payoff: 'Always opposite, never decided in advance. There are four such Bell states.',
    }],
    outro: 'Bell states are the basic unit of entanglement, used in teleportation and quantum keys.',
  },
  {
    title: 'GHZ state',
    chip: 'GHZ',
    group: 'Ideas',
    qubits: 3,
    steps: [{
      text: 'Entanglement can tie more than two qubits. Make all three always agree: 000 or 111.',
      goal: 'Entangle all three',
      keys: 'Press 1, H, C, then 2, C',
      hint: ({ state, stepOps }) =>
        !has(stepOps, (o) => o.kind === 'gate' && !!o.controls?.length) ? (x(state, 0) > 0.95 ? touch(0, 1) : spread(0)) : touch(1, 2),
      done: ({ state }) => {
        const p = state.probabilities();
        return p[0] > 0.45 && p[7] > 0.45;
      },
      payoff: 'No pair is entangled by itself, so there are no threads. The gold ring holds the whole group.',
    }],
    outro: 'GHZ states show entanglement is not just between pairs. Quantum sensors use them.',
  },
];
