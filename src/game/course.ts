import type { Op } from '../quantum/circuit';
import { pairStrength } from '../quantum/entanglement';
import { type Chapter, has, isCnot, isGate, isMeasure, type Step, total, twist, spread, fist, touch, x, z } from './chapters';
import { PRESETS } from './presets';
import { maxcutSteps } from './qaoa-steps';

/**
 * The Course: everything, in order, from a single bit to a variational
 * algorithm on real hardware. Each module mixes three kinds of step:
 *
 * - pages: a short explanation, often with a live demo on the orbs and the
 *   maths board showing the matrices; Next moves on;
 * - tasks: do it yourself with the gestures (Show me does it for you);
 * - quizzes: three answers on the card; a wrong one turns red and you try again,
 *   the right one explains why.
 *
 * Card text is plain ASCII: the panel font has no maths symbols.
 */

let uid = 0;

function page(text: string, more: Partial<Step> = {}): Step {
  const id = `page-${uid++}`;
  return {
    text,
    goal: 'Read, then tap Next',
    keys: 'Press Enter',
    id,
    action: { label: 'Next', run: (_lab, memory) => void (memory[id] = true) },
    done: ({ memory }) => memory[id] === true,
    ...more,
  };
}

function quiz(text: string, choices: [string, string, string], answer: number, why: string, more: Partial<Step> = {}): Step {
  const id = `quiz-${uid++}`;
  return {
    text,
    goal: 'Pick an answer',
    keys: 'Press 1, 2 or 3',
    id,
    choices,
    answer,
    hold: true,
    done: ({ memory }) => memory[id] === true,
    payoff: `Right. ${why}`,
    ...more,
  };
}

const h = (q: number): Op => ({ kind: 'gate', gate: 'h', target: q });
const cx = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });
const preset = (label: string) => PRESETS.find((p) => p.label === label)!;
const count = (ops: readonly Op[], gate: string) => ops.filter((o) => isGate(o, gate)).length;

export const COURSE: Chapter[] = [
  {
    title: 'Bits and qubits',
    chip: 'Qubits',
    qubits: 1,
    steps: [
      page('A bit is 0 or 1. A qubit is an arrow on a sphere: up is 0, down is 1, and every other direction is a mix of both. The orb in front of you is one qubit.'),
      {
        text: 'Pinch the orb and turn your wrist. The arrow tilts with your hand.',
        goal: 'Tilt the arrow',
        keys: 'Hold the left or right arrow key',
        hint: twist(0),
        done: ({ state }) => z(state, 0) < 0.75,
        solve: (lab) => void lab.gate('ry', 0, [1.2]),
        payoff: 'Every direction on the sphere is a valid state, not just top and bottom.',
      },
      page('The arrow is two complex numbers: |psi> = a|0> + b|1>. The board above shows them as a column vector, before and after each step.', { board: 'maths' }),
      quiz('You measure a qubit. What can you get?', ['Any number between 0 and 1', '0 or 1, nothing else', 'Always 0'], 1, 'A measurement always gives one bit. The arrow only sets the odds.'),
    ],
    outro: 'A qubit is an arrow; a measurement turns it into a bit.',
  },
  {
    title: 'Superposition',
    chip: 'Superpose',
    qubits: 1,
    steps: [
      page('The odds come from the amplitudes: P(0) = |a|^2 and P(1) = |b|^2, and the two always add up to 1.', { board: 'maths' }),
      {
        text: 'Open your hand over the orb: a Hadamard puts the arrow on the equator, exactly between 0 and 1.',
        goal: 'Spread your fingers over the orb',
        keys: 'Press H',
        hint: spread(0),
        board: 'maths',
        done: ({ state, stepOps }) => has(stepOps, (o) => isGate(o, 'h')) && Math.abs(z(state, 0)) < 0.05,
        solve: (lab) => void lab.gate('h', 0),
        payoff: 'Now a = b = 1/sqrt(2). The board shows the matrix that did it: H = [[1, 1], [1, -1]] / sqrt(2).',
        hold: true,
      },
      quiz('a = b = 1/sqrt(2). What is P(1)?', ['1/sqrt(2)', '1/2', '1'], 1, 'P(1) = |1/sqrt(2)|^2 = 1/2. Always square the amplitude.'),
      page('Superposition is not "secretly 0 or secretly 1". The proof is interference, two modules from now.'),
    ],
    outro: 'Amplitudes, squared, are probabilities.',
  },
  {
    title: 'Measurement',
    chip: 'Measure',
    qubits: 1,
    setup: [h(0)],
    steps: [
      page('This qubit is in |+>, half 0 and half 1. Looking forces a choice, and the arrow jumps to the answer. That jump is called collapse.'),
      {
        text: 'Make a fist over the orb to measure it.',
        goal: 'Measure the qubit',
        keys: 'Press M',
        hint: fist(0),
        done: ({ stepOps }) => has(stepOps, (o) => isMeasure(o)),
        solve: (lab) => void lab.measure(0),
        payoff: ({ stepOps }) => {
          const m = stepOps.find((o) => isMeasure(o));
          return `It chose ${m && m.kind === 'measure' ? m.outcome : 0}, and the arrow now points straight at that answer.`;
        },
      },
      {
        text: 'Back to |+>. Tap 100 shots: 100 fresh copies, each measured once.',
        goal: 'Run 100 shots',
        keys: 'Press Space',
        enter: (lab) => lab.load(1, [h(0)]),
        done: ({ shots }) => !!shots && total(shots) > 0,
        solve: (lab) => void lab.shots(100),
        payoff: ({ shots }) => (shots ? `${shots[0]} zeros and ${shots[1]} ones: close to half and half, never exactly. That is the Born rule.` : ''),
        hold: true,
      },
      quiz('You measured 1. You measure the same qubit again straight away. You get:', ['0 or 1, half and half', '1, for sure', 'Nothing: it is used up'], 1, 'After a measurement the qubit is in the state it showed, so it shows it again.'),
    ],
    outro: 'Measurement picks one answer at random, by the squared amplitudes, and the state collapses to it.',
  },
  {
    title: 'Gates are matrices',
    chip: 'Matrices',
    qubits: 1,
    steps: [
      page('Every gate is a 2x2 matrix, and a step multiplies the state by it: |psi> becomes U|psi>. Watch the board as you go.', { board: 'maths', enter: (lab) => lab.load(1, []) }),
      {
        text: 'Press X: the bit flip. Its matrix swaps the two amplitudes, so |0> becomes |1>.',
        goal: 'Apply X',
        keys: 'Press X',
        board: 'maths',
        done: ({ state, stepOps }) => has(stepOps, (o) => isGate(o, 'x')) && z(state, 0) < -0.99,
        solve: (lab) => void lab.gate('x', 0),
      },
      {
        text: 'Now Z. It keeps |1> but flips its sign. The arrow does not move; the maths does.',
        goal: 'Apply Z',
        keys: 'Press Z',
        board: 'maths',
        done: ({ stepOps }) => has(stepOps, (o) => isGate(o, 'z')),
        solve: (lab) => void lab.gate('z', 0),
        payoff: 'Now the state is -|1>. A sign on the whole state is invisible to any measurement; a sign on one part of a superposition is not.',
        hold: true,
      },
      quiz('What does Z do to |0>?', ['Flips it to |1>', 'Nothing at all', 'Turns it into -|0>'], 1, 'Z = diag(1, -1): the |0> part keeps its plus sign.'),
      quiz('Which matrix is X?', ['[[0, 1], [1, 0]]', '[[1, 0], [0, -1]]', '[[1, 1], [1, -1]] / sqrt(2)'], 0, 'X swaps the amplitudes. The second is Z, the third is H.'),
    ],
    outro: 'Gates are matrices, and running a circuit is matrix multiplication.',
  },
  {
    title: 'Phase and interference',
    chip: 'Interfere',
    qubits: 1,
    steps: [
      page('Amplitudes can be negative, or even complex. When two paths lead to the same answer their amplitudes add, and opposite signs cancel. That is interference.'),
      {
        text: 'Hadamard twice: H, then H again.',
        goal: 'Two Hadamards',
        keys: 'Press H twice',
        hint: spread(0),
        board: 'maths',
        enter: (lab) => lab.load(1, []),
        done: ({ state, stepOps }) => count(stepOps, 'h') >= 2 && z(state, 0) > 0.99,
        solve: (lab) => {
          lab.gate('h', 0);
          lab.gate('h', 0);
        },
        payoff: 'Back to |0>, every time. The two paths to |1> carried +1/2 and -1/2, and cancelled.',
        hold: true,
      },
      {
        text: 'Now H, then Z, then H.',
        goal: 'H, Z, H',
        keys: 'Press H, Z, H',
        board: 'maths',
        enter: (lab) => lab.load(1, []),
        done: ({ state, stepOps }) => has(stepOps, (o) => isGate(o, 'z')) && z(state, 0) < -0.99,
        solve: (lab) => {
          lab.gate('h', 0);
          lab.gate('z', 0);
          lab.gate('h', 0);
        },
        payoff: 'Now it lands on |1>, every time: one sign flip in the middle changed which path cancels.',
        hold: true,
      },
      quiz('H then H always gives |0>. Why?', ['The qubit was never in superposition', 'The two paths to |1> have opposite signs and cancel', 'Measuring resets it'], 1, 'Amplitudes add with their signs first, then you square. Every quantum algorithm uses this.'),
    ],
    outro: 'Interference is how quantum algorithms steer probability toward the right answer.',
  },
  {
    title: 'Many qubits',
    chip: 'Many',
    qubits: 3,
    steps: [
      page('Two qubits have 4 amplitudes, one for each outcome 00, 01, 10, 11. n qubits have 2^n. Fifty qubits already need more numbers than any computer can hold.'),
      {
        text: 'Spread over all three qubits.',
        goal: 'Superposition on q0, q1 and q2',
        keys: 'Press 1, H, 2, H, 3, H',
        board: 'maths',
        hint: ({ state }) => {
          const q = [0, 1, 2].find((i) => x(state, i) < 0.95);
          return q === undefined ? null : spread(q);
        },
        done: ({ state }) => [0, 1, 2].every((q) => x(state, q) > 0.95),
        solve: (lab) => {
          for (const q of [0, 1, 2]) if (x(lab.state, q) < 0.95) lab.gate('h', q);
        },
        payoff: 'Eight outcomes, each with amplitude 1/(2 sqrt 2). This state is a tensor product: |+> (x) |+> (x) |+>.',
        hold: true,
      },
      quiz('How many amplitudes describe 5 qubits?', ['10', '25', '32'], 2, '2^5 = 32. Each extra qubit doubles the count.'),
      page('A gate on one qubit is a big matrix too: U = I (x) H (x) I means H on the middle qubit and nothing on the others. The board writes every step that way.', { board: 'maths' }),
    ],
    outro: 'n qubits, 2^n amplitudes: that is where the power, and the difficulty, comes from.',
  },
  {
    title: 'Entanglement',
    chip: 'Entangle',
    qubits: 2,
    steps: [
      page('Entangled qubits share one state. Neither has an arrow of its own: the arrows shrink into the centre, and a gold thread joins the orbs.'),
      {
        text: 'Make a Bell pair: spread over q0, then touch q0 to q1 (a CNOT).',
        goal: 'H on q0, then CNOT q0 to q1',
        keys: 'Press H, then C',
        board: 'maths',
        control: 0,
        hint: ({ stepOps }) => (has(stepOps, (o) => isGate(o, 'h', 0)) ? touch(0, 1) : spread(0)),
        done: ({ state, stepOps }) => has(stepOps, (o) => isCnot(o, 0, 1)) && pairStrength(state, 0, 1) > 0.95,
        solve: (lab) => {
          lab.gate('h', 0);
          lab.entangle(0, 1);
        },
        payoff: '1/sqrt(2) (|00> + |11>). It cannot be written as one qubit times the other: that is entanglement.',
        hold: true,
      },
      {
        text: 'Run 100 shots.',
        goal: 'Run 100 shots',
        keys: 'Press Space',
        done: ({ shots }) => !!shots,
        solve: (lab) => void lab.shots(100),
        payoff: 'Only 00 and 11. Each qubit alone is a coin flip, yet the two always agree.',
        hold: true,
      },
      quiz('You measure q0 of a Bell pair and get 1. What will q1 show?', ['0 or 1, half and half', '1', '0'], 1, 'They always agree. It sends no message: you cannot choose the result you get.'),
    ],
    outro: 'Entanglement: correlations stronger than any classical system can make.',
  },
  {
    title: 'Algorithms',
    chip: 'Algorithms',
    qubits: 2,
    steps: [
      page('A quantum algorithm is a circuit built so wrong answers cancel and right answers add up. Deutsch, Bernstein-Vazirani and Grover all work this way.'),
      {
        text: "This is one round of Grover's search over 4 boxes, with the prize in box 11. Run 100 shots.",
        goal: 'Run 100 shots',
        keys: 'Press Space',
        board: 'maths',
        enter: (lab) => lab.load(preset('Grover').qubits, preset('Grover').ops),
        done: ({ shots }) => !!shots,
        solve: (lab) => void lab.shots(100),
        payoff: 'All 100 find box 11 after one look. For N boxes Grover needs about sqrt(N) looks instead of N.',
        hold: true,
      },
      quiz('For a million boxes, Grover needs about how many looks?', ['A million', 'A thousand', 'One'], 1, 'The square root: sqrt(1,000,000) = 1,000.'),
    ],
    outro: 'The Chapters play Deutsch, Grover and Bernstein-Vazirani step by step.',
  },
  {
    title: 'Teleportation',
    chip: 'Teleport',
    qubits: 3,
    steps: [
      page('Teleportation moves a qubit\'s state onto another qubit with one Bell pair and two ordinary bits. The orbs hold a finished teleport: tap timeline steps to replay it.', {
        enter: (lab) => lab.load(preset('Teleport').qubits, preset('Teleport').ops),
      }),
      quiz('Can teleportation send a message faster than light?', ['Yes, it is instant', 'No: the two ordinary bits must travel normally', 'Only for one qubit'], 1, 'Without the two bits, the receiving qubit looks like pure noise.'),
      quiz('After teleporting, is the original state still there?', ['Yes, now there are two copies', 'No: measuring it destroyed it', 'Half of it is'], 1, 'No cloning: an unknown quantum state can be moved, never copied.'),
    ],
    outro: 'Chapter 4 lets you teleport a state of your own.',
  },
  {
    title: 'Noise and errors',
    chip: 'Noise',
    qubits: 3,
    steps: [
      page('Real qubits drift: heat, stray fields and imperfect pulses nudge them. That noise is why today\'s quantum computers make mistakes.'),
      page('Error correction spreads one qubit over several. With three, a single flip shows up as a disagreement, found without ever reading the message. Chapter 7, The Storm, does it by hand.'),
      quiz('Why not protect a qubit by copying it three times?', ['Copies are too slow', 'An unknown qubit cannot be copied', 'That works fine'], 1, 'The no-cloning theorem. The code spreads the qubit with CNOTs instead of copying it.'),
    ],
    outro: 'Error correction is the road from noisy chips to large quantum computers.',
  },
  {
    title: 'Quantum hardware',
    chip: 'Hardware',
    qubits: 3,
    steps: [
      page('Meet the machine. Upper right: a 5-qubit superconducting chip, each cross one qubit. Only neighbours are wired together.', {
        hardware: true,
        enter: (lab) => lab.load(3, [h(0), cx(0, 1), cx(1, 2)]),
      }),
      page('Left: the dilution refrigerator it lives in. Each copper stage is colder, down to 15 millikelvin, far colder than outer space, so heat cannot flip the qubits.', { hardware: true }),
      page('Above: the pulse schedule. Each gate is a microwave pulse down a cable: 36 ns for one qubit, about 280 ns for two. Z gates are free: the electronics just shift the phase.', { hardware: true }),
      quiz('Why is the chip kept at 15 mK?', ['To save power', 'Heat would flip the qubits and wash out superposition', 'Superconductors only look good cold'], 1, 'At room temperature, heat carries far more energy than a qubit can hold on to.', { hardware: true }),
      quiz('A two-qubit gate takes about 280 ns; a qubit stays coherent for about 100 microseconds. About how many two-qubit gates fit?', ['About 3', 'About 350', 'Millions'], 1, '100 us / 280 ns is about 357, which is why short circuits matter.', { hardware: true }),
    ],
    outro: 'Run on chip, in the code window, sends your own circuits through this machine.',
  },
  {
    title: 'Compiling',
    chip: 'Compiling',
    qubits: 3,
    steps: [
      page('Your circuit rarely fits the chip as written. The compiler places your qubits, adds SWAPs where they are not wired together, and simplifies: H H cancels, T T becomes S.'),
      quiz('One SWAP costs how many CNOTs?', ['1', '2', '3'], 2, 'SWAP = three CNOTs, so routing SWAPs are expensive.'),
      page('Try it in the sandbox: the code window\'s On chip tab shows the routed circuit, and Simplify runs a compiler\'s first passes.'),
    ],
    outro: 'Compilers turn the circuit you mean into the circuit the chip can run.',
  },
  {
    title: 'Variational algorithms',
    chip: 'QAOA',
    qubits: 4,
    steps: [
      page('Some problems are about choices, like splitting people into two teams. QAOA solves them with a quantum circuit that has dials, tuned by an ordinary computer.', { board: 'landscape' }),
      ...maxcutSteps(),
      quiz("Who sets QAOA's dials, gamma and beta?", ['The quantum computer, on its own', 'A classical optimizer, from measured costs', 'They are fixed constants'], 1, 'It is a loop: the circuit estimates the cost, a classical computer turns the dials. The PennyLane tab has the code.', { board: 'landscape' }),
    ],
    outro: 'Variational algorithms are how today\'s noisy machines tackle optimisation and chemistry.',
  },
  {
    title: 'What next',
    chip: 'Next',
    qubits: 1,
    steps: [
      page('You have seen it all: qubits, gates as matrices, measurement, entanglement, interference, algorithms, noise, hardware, compiling and variational algorithms.'),
      page('Everything you build exports to Qiskit, OpenQASM and PennyLane: open the code window and take your circuits to a real quantum computer.'),
    ],
    outro: 'Course complete. The Chapters, Puzzles and Build tabs are waiting.',
  },
];
