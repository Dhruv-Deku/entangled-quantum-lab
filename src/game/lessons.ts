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
  {
    title: 'Interference',
    chip: 'Interfere',
    group: 'Qubiting',
    qubits: 1,
    steps: [{
      text: 'H splits a qubit into two paths, to 0 and to 1. Do H twice: the two paths to 1 arrive with opposite signs and cancel. Try the Many worlds view to watch it.',
      goal: 'H twice, back to 0',
      keys: 'Press H twice',
      hint: spread(0),
      target: [UP],
      done: ({ state, stepOps }) => count(stepOps, 'h') >= 2 && z(state, 0) > 0.99,
      payoff: 'Back to a sure 0. Not because H undid itself by magic: the paths to 1 wiped each other out.',
    }],
    outro: 'Interference is how quantum algorithms make wrong answers cancel and right ones add up.',
  },
  {
    title: 'Minus state',
    chip: 'Minus',
    group: 'Qubiting',
    qubits: 1,
    steps: [{
      text: 'The equator has a back as well as a front. Reach |-> = |0> - |1>: the same 50/50 odds as |+>, but the opposite sign.',
      goal: 'Point the arrow at the back',
      keys: 'Press X, then H',
      hint: ({ state }) => (z(state, 0) > 0 ? null : spread(0)),
      target: [MINUS],
      done: ({ state }) => x(state, 0) < -0.99,
      payoff: 'Same coin toss as |+>, different sign. Measuring cannot tell them apart; an H can.',
    }],
    outro: '|+> and |-> are the two answers an H turns back into 0 and 1: phase becomes something you can measure.',
  },
  {
    title: 'The +i state',
    chip: '+i',
    group: 'Qubiting',
    qubits: 1,
    steps: [{
      text: 'There is a third axis, pointing right: |0> + i|1>. Get there with an H and a quarter turn of phase.',
      goal: 'Point the arrow to the right',
      keys: 'Press H, then S',
      hint: spread(0),
      target: [RIGHT],
      done: ({ state }) => y(state, 0) > 0.99,
      payoff: 'The complex number i is a real direction on the sphere. Phases are rotations about the vertical.',
    }],
    outro: 'The six poles (0, 1, +, -, +i, -i) are the stations every single-qubit circuit travels between.',
  },
  {
    title: 'Phi minus',
    chip: 'Phi-',
    group: 'Qubiting',
    qubits: 2,
    steps: [{
      text: 'A Bell pair can carry a hidden sign: |00> - |11>. The odds look the same as |00> + |11>; only the phase differs. Make it.',
      goal: 'Entangle with a minus sign',
      keys: 'Press 1, H, Z, then C',
      control: 0,
      hint: ({ state }) => (x(state, 0) < -0.95 ? touch(0, 1) : spread(0)),
      done: ({ state }) => {
        const p = state.probabilities();
        return pairStrength(state, 0, 1) > 0.95 && p[0] + p[3] > 0.99 && state.re[0] * state.re[3] + state.im[0] * state.im[3] < -0.4;
      },
      payoff: 'The same 00 or 11 every time, yet a different state: in teleportation that sign is the Z correction.',
    }],
    outro: 'All four Bell states look alike in shots. Telling them apart takes a Bell measurement: a CNOT and an H first.',
  },
  {
    title: 'All at once',
    chip: 'H x3',
    group: 'Qubiting',
    qubits: 3,
    steps: [{
      text: 'Put every qubit in superposition: three Hs make all eight answers, 000 to 111, equally likely at once.',
      goal: 'H on all three',
      keys: 'Press 1, H, 2, H, 3, H',
      hint: ({ state }) => (x(state, 0) < 0.95 ? spread(0) : x(state, 1) < 0.95 ? spread(1) : spread(2)),
      done: ({ state }) => state.probabilities().every((p) => Math.abs(p - 1 / 8) < 1e-3),
      payoff: 'Eight answers with three gates; n qubits would hold 2^n. This is where Grover and the QFT begin.',
    }],
    outro: 'A uniform superposition is the starting line of most algorithms: then interference picks the winners.',
  },
  {
    title: 'Welcome tour',
    chip: 'Tour',
    group: 'Start',
    qubits: 2,
    steps: [
      {
        text: 'Welcome! Each glass orb is a qubit, and its arrow is its state. Pinch q0 and twist your wrist to turn the arrow.',
        goal: 'Turn q0',
        keys: 'Press 1, then hold the Right arrow',
        hint: twist(0),
        done: ({ state }) => z(state, 0) < 0.9,
        solve: (lab) => void lab.gate('ry', 0, [1.0]),
        payoff: 'The arrow tips from 0 toward 1: the odds of each change as it turns.',
      },
      {
        text: 'Spread your fingers over q0: that is H, the Hadamard gate. The arrow lies down on the equator, 0 and 1 at once.',
        goal: 'H on q0',
        keys: 'Press 1, then H',
        enter: (lab) => lab.reset(),
        hint: spread(0),
        done: ({ state }) => x(state, 0) > 0.99,
        solve: (lab) => void lab.gate('h', 0),
        payoff: 'A superposition: a coin in mid-air.',
      },
      {
        text: 'Close your fist over q0 to measure it. Looking makes it choose: 0 or 1, half the time each.',
        goal: 'Measure q0',
        keys: 'Press M',
        hint: fist(0),
        done: ({ stepOps }) => has(stepOps, isMeasure),
        solve: (lab) => void lab.measure(0),
        payoff: 'It landed. Measuring is the one move that cannot be undone.',
      },
      {
        text: 'Now the magic: H on q0, then touch q0 to q1. A gold thread appears: the two qubits are entangled.',
        goal: 'Entangle q0 and q1',
        keys: 'Press 1, H, then C',
        control: 0,
        enter: (lab) => lab.reset(),
        hint: ({ state }) => (x(state, 0) > 0.95 ? touch(0, 1) : spread(0)),
        done: ({ state }) => pairStrength(state, 0, 1) > 0.95,
        solve: (lab) => {
          lab.select(0);
          lab.gate('h', 0);
          lab.entangleSelected();
        },
        payoff: 'Gold means entanglement. Neither qubit has a state of its own any more.',
      },
      {
        text: 'Run 100 shots: measure the pair a hundred times over. Only 00 and 11 ever come up: the two always agree.',
        goal: 'Run 100 shots',
        keys: 'Press Space',
        done: ({ shots }) => !!shots,
        solve: (lab) => void lab.shots(100),
        payoff: 'Your first Bell pair. Next: Chapters for the story, the Play tab for games, the Code Lab for your own programs.',
      },
    ],
    outro: 'That is the whole toolkit: turn, H, measure, entangle, run. Everything else in Entangled is built from these.',
  },
];
