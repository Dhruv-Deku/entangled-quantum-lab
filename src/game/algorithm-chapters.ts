import type { Lab } from '../lab/lab';
import {
  controlledPowers, energy, groverDiffuser, groverOracle, h2At, qftOps, shorFactors, shorModExp, simonOracle, simonSecret, vqeAnsatz, vqeOptimize,
} from '../quantum/algorithms2';
import { blochVector } from '../quantum/bloch';
import { run, type Op } from '../quantum/circuit';
import { H2 } from '../quantum/h2-data';
import type { QState } from '../quantum/state';
import type { Chapter, Step } from './chapters';

/**
 * Chapters 13 to 18: the quantum Fourier transform, phase estimation, Shor
 * factoring 15, VQE for the H2 molecule, Grover on eight boxes, and Simon's
 * algorithm. (Self-contained helpers: chapters.ts imports this file.)
 */

const bx = (s: QState, q: number) => blochVector(s, q)[0];
const bz = (s: QState, q: number) => blochVector(s, q)[2];
const bits = (k: number, n: number) => k.toString(2).padStart(n, '0');
const apply = (lab: Lab, ops: Op[]) => ops.forEach((op) => lab.apply(op));
const spreadHint = (qs: number[]) => ({ state }: { state: QState }) => {
  const q = qs.find((i) => bx(state, i) < 0.95);
  return q === undefined ? null : { gesture: 'spread' as const, qubits: [q] };
};
const spreadAll = (qs: number[]) => ({ state }: { state: QState }) => qs.every((q) => bx(state, q) > 0.95);
const solveSpread = (qs: number[]) => (lab: Lab) => qs.forEach((q) => bx(lab.state, q) < 0.95 && lab.gate('h', q));
const shotsStep = (text: string, payoff: Step['payoff'], board?: Step['board']): Step => ({
  text,
  goal: 'Run 100 shots',
  keys: 'Press Space',
  board,
  done: ({ shots }) => !!shots,
  solve: (lab) => void lab.shots(100),
  payoff,
  hold: true,
});
const readings = (shots: Uint32Array, mask: number) => {
  const seen = new Set<number>();
  shots.forEach((c, i) => c > 0 && seen.add(i & mask));
  return [...seen].sort((a, b) => a - b);
};
const exactRun = (n: number) => (ops: Op[]) => run(n, ops, () => 0.5).state;

export interface VqeMemory {
  r: number;
  theta: number;
  energy: number;
  hf: number;
  fci: number;
  path: [number, number][];
  curve: [number, number][] | null;
}

export const ALGORITHM_CHAPTERS: Chapter[] = [
  {
    title: 'Phase Wheel',
    chip: 'QFT',
    qubits: 3,
    steps: [
      {
        text: 'The quantum Fourier transform turns a number into angles. Write 5 on the qubits: 5 is 101 in binary, so flip q0 and q2.',
        goal: 'Write 5 = 101',
        keys: 'Press 1, X, 3, X',
        board: 'wheel',
        done: ({ state }) => state.probabilities()[5] > 0.99,
        solve: (lab) => {
          if (bz(lab.state, 0) > 0) lab.gate('x', 0);
          if (bz(lab.state, 2) > 0) lab.gate('x', 2);
        },
      },
      {
        text: 'Tap QFT. Watch the arrows: each qubit swings onto the equator.',
        goal: 'Run the QFT',
        keys: 'Press Enter',
        board: 'wheel',
        action: { label: 'QFT', run: (lab, m) => { apply(lab, qftOps([0, 1, 2])); m.qft = true; } },
        done: ({ memory }) => memory.qft === true,
        payoff: 'The number became angles: q0 turned 5/8 of a full turn, q1 twice that, q2 twice again. The wheels on the board show each one.',
        hold: true,
      },
      shotsStep('Run 100 shots.', 'All 8 outcomes, about equally often: the number now lives in phases, and one measurement cannot see a phase.', 'wheel'),
      {
        text: 'Tap Inverse QFT to turn the angles back into a number.',
        goal: 'Undo the QFT',
        keys: 'Press Enter',
        board: 'wheel',
        action: { label: 'Inverse QFT', run: (lab, m) => { apply(lab, qftOps([0, 1, 2], true)); m.iqft = true; } },
        done: ({ memory, state }) => memory.iqft === true && state.probabilities()[5] > 0.99,
        payoff: 'Back to 101, every time. Phase estimation and Shor use the inverse QFT to read angles as numbers.',
        hold: true,
      },
    ],
    outro: 'The QFT is the engine of phase estimation and Shor\'s algorithm.',
  },
  {
    title: 'Phase Estimation',
    chip: 'Phase est.',
    qubits: 4,
    steps: [
      {
        text: 'A box holds a gate U that turns |1> by a secret angle. Put the target q3 in |1>: U leaves it alone apart from that angle.',
        goal: 'Flip q3 to |1>',
        keys: 'Press 4, X',
        board: 'wheel',
        done: ({ state }) => bz(state, 3) < -0.99,
        solve: (lab) => void lab.gate('x', 3),
      },
      {
        text: 'Spread over the three counting qubits q0, q1 and q2.',
        goal: 'Superposition on q0, q1, q2',
        keys: 'Press 1, H, 2, H, 3, H',
        board: 'wheel',
        hint: spreadHint([0, 1, 2]),
        done: spreadAll([0, 1, 2]),
        solve: solveSpread([0, 1, 2]),
      },
      {
        text: 'Tap Controlled U: q0 runs U once on the target, q1 twice, q2 four times.',
        goal: 'Run the controlled gates',
        keys: 'Press Enter',
        board: 'wheel',
        action: {
          label: 'Controlled U',
          run: (lab, m) => {
            m.k = 1 + Math.floor(lab.random() * 7);
            apply(lab, controlledPowers([0, 1, 2], 3, (m.k as number) / 8));
          },
        },
        done: ({ memory }) => memory.k !== undefined,
        payoff: 'Phase kickback: the target stayed put, and each counting qubit picked up the angle, doubled each time. The wheels show it.',
        hold: true,
      },
      {
        text: 'Tap Inverse QFT to turn those angles into a number.',
        goal: 'Inverse QFT on q0, q1, q2',
        keys: 'Press Enter',
        board: 'wheel',
        action: { label: 'Inverse QFT', run: (lab, m) => { apply(lab, qftOps([0, 1, 2], true)); m.iqft = true; } },
        done: ({ memory }) => memory.iqft === true,
      },
      shotsStep('Run 100 shots and read q2 q1 q0.', ({ memory }) => `Every shot reads ${bits(memory.k as number, 3)}: the secret angle is ${memory.k}/8 of a turn. Bigger registers read finer angles.`, 'wheel'),
    ],
    outro: 'Phase estimation reads a gate\'s eigenvalue; it sits inside Shor\'s algorithm and quantum chemistry.',
  },
  {
    title: 'Factoring 15',
    chip: 'Shor',
    qubits: 5,
    steps: [
      {
        text: 'Shor factors a number by finding a period. Powers of 7 mod 15 repeat: 1, 7, 4, 13, 1 ... Spread over the counting qubits q0, q1, q2.',
        goal: 'Superposition on q0, q1, q2',
        keys: 'Press 1, H, 2, H, 3, H',
        hint: spreadHint([0, 1, 2]),
        done: spreadAll([0, 1, 2]),
        solve: solveSpread([0, 1, 2]),
      },
      {
        text: 'Tap Exponent: the work qubits q3 and q4 get 7^x mod 15 for every x at once.',
        goal: 'Compute 7^x mod 15',
        keys: 'Press Enter',
        action: { label: 'Exponent', run: (lab, m) => { apply(lab, shorModExp([0, 1, 2], [3, 4])); m.exp = true; } },
        done: ({ memory }) => memory.exp === true,
        payoff: 'Done for all 8 values of x together. (This compiled circuit is built knowing the pattern; a full Shor circuit computes it with more qubits.)',
        hold: true,
      },
      {
        text: 'Tap Inverse QFT: it turns the repeating pattern into peaks.',
        goal: 'Inverse QFT on the counting qubits',
        keys: 'Press Enter',
        action: { label: 'Inverse QFT', run: (lab, m) => { apply(lab, qftOps([0, 1, 2], true)); m.iqft = true; } },
        done: ({ memory }) => memory.iqft === true,
      },
      shotsStep('Run 100 shots and read the counting qubits q2 q1 q0.', ({ shots }) => {
        if (!shots) return '';
        const seen = readings(shots, 7);
        const { r, factors } = shorFactors(seen);
        return `Readings ${seen.join(', ')}: steps of ${8 / r}, so the period is ${r}. 7^2 = 49 = 4 (mod 15); gcd(3, 15) = ${factors[0]}, gcd(5, 15) = ${factors[1]}. 15 = 3 x 5.`;
      }),
    ],
    outro: 'Run on large numbers, this is the algorithm that threatens RSA encryption.',
  },
  {
    title: 'The H2 Molecule',
    chip: 'VQE',
    qubits: 4,
    steps: [
      {
        text: 'A molecule\'s energy is a Hamiltonian: a sum of Pauli terms. For H2 it takes 4 qubits. Tap Hartree-Fock: both electrons in the lowest orbital.',
        goal: 'Start from Hartree-Fock',
        keys: 'Press Enter',
        board: 'vqe',
        action: {
          label: 'Hartree-Fock',
          run: (lab, m) => {
            const p = h2At(0.74);
            lab.load(4, vqeAnsatz(Math.PI));
            m.vqe = { r: p.r, theta: Math.PI, energy: energy(p, exactRun(4)(vqeAnsatz(Math.PI))), hf: p.hf, fci: p.fci, path: [], curve: null } satisfies VqeMemory;
          },
        },
        done: ({ memory }) => memory.vqe !== undefined,
        payoff: ({ memory }) => `Hartree-Fock energy: ${(memory.vqe as VqeMemory).energy.toFixed(4)} hartree. Close, but it ignores how the two electrons avoid each other.`,
        hold: true,
      },
      {
        text: 'VQE turns one dial in the circuit to lower the energy measured from the Pauli terms. Tap Optimize.',
        goal: 'Optimize the dial',
        keys: 'Press Enter',
        board: 'vqe',
        action: {
          label: 'Optimize',
          run: (lab, m) => {
            const v = m.vqe as VqeMemory;
            const best = vqeOptimize(h2At(v.r), exactRun(4), Math.PI, 40);
            lab.load(4, vqeAnsatz(best.theta));
            m.vqe = { ...v, theta: best.theta, energy: best.energy, path: best.path };
          },
        },
        done: ({ memory }) => ((memory.vqe as VqeMemory | undefined)?.path.length ?? 0) > 0,
        payoff: ({ memory }) => {
          const v = memory.vqe as VqeMemory;
          return `VQE: ${v.energy.toFixed(4)} hartree, within ${Math.abs(v.energy - v.fci).toExponential(1)} of the exact answer. The ${(v.hf - v.energy).toFixed(4)} below Hartree-Fock is electron correlation.`;
        },
        hold: true,
      },
      {
        text: 'Tap Stretch: VQE runs again at every bond length from 0.3 to 2.5 Angstrom and draws the energy curve.',
        goal: 'Map the bond',
        keys: 'Press Enter',
        board: 'vqe',
        action: {
          label: 'Stretch',
          run: (_lab, m) => {
            const v = m.vqe as VqeMemory;
            const curve = H2.map((p) => [p.r, vqeOptimize(p, exactRun(4), Math.PI, 60).energy] as [number, number]);
            m.vqe = { ...v, curve };
          },
        },
        done: ({ memory }) => !!(memory.vqe as VqeMemory | undefined)?.curve,
        payoff: 'The lowest point sits at 0.74 Angstrom, the real H2 bond length. Pulled apart, Hartree-Fock (dashed) goes badly wrong; VQE follows the exact curve.',
        hold: true,
      },
    ],
    outro: 'Chemistry is one of the first places quantum computers are expected to help. The Hamiltonians here come from PennyLane\'s quantum chemistry.',
  },
  {
    title: 'Search 8 Boxes',
    chip: 'Grover x3',
    qubits: 3,
    steps: [
      {
        text: 'Eight boxes, one prize. Spread over all three qubits: every box at once.',
        goal: 'Superposition on q0, q1, q2',
        keys: 'Press 1, H, 2, H, 3, H',
        hint: spreadHint([0, 1, 2]),
        done: spreadAll([0, 1, 2]),
        solve: solveSpread([0, 1, 2]),
        payoff: 'Each box has amplitude 1/(2 sqrt 2): a 1 in 8 chance.',
      },
      {
        text: 'Tap Oracle: the box marks the prize by flipping its sign.',
        goal: 'Ask the oracle',
        keys: 'Press Enter',
        board: 'maths',
        action: { label: 'Oracle', run: (lab, m) => { m.secret = Math.floor(lab.random() * 8); apply(lab, groverOracle(m.secret as number)); } },
        done: ({ memory }) => memory.secret !== undefined,
        payoff: 'One amplitude is now negative. The probabilities have not changed yet.',
        hold: true,
      },
      {
        text: 'Tap Amplify: reflect every amplitude about the average.',
        goal: 'Amplify',
        keys: 'Press Enter',
        board: 'maths',
        action: { label: 'Amplify', run: (lab, m) => { apply(lab, groverDiffuser()); m.round1 = true; } },
        done: ({ memory }) => memory.round1 === true,
        payoff: ({ state, memory }) => `The prize grew to ${Math.round(100 * state.probabilities()[memory.secret as number])}% after one round.`,
        hold: true,
      },
      {
        text: 'Tap Round 2: oracle and amplify once more.',
        goal: 'Second round',
        keys: 'Press Enter',
        action: { label: 'Round 2', run: (lab, m) => { apply(lab, [...groverOracle(m.secret as number), ...groverDiffuser()]); m.round2 = true; } },
        done: ({ memory }) => memory.round2 === true,
        payoff: ({ state, memory }) => `${(100 * state.probabilities()[memory.secret as number]).toFixed(1)}% now. For 8 boxes two rounds is best; a third would overshoot.`,
        hold: true,
      },
      shotsStep('Run 100 shots.', ({ shots, memory }) => (shots ? `Box ${bits(memory.secret as number, 3)} came up ${shots[memory.secret as number]} times out of 100, after looking twice. Opening boxes one by one takes 4 on average.` : '')),
    ],
    outro: 'Grover needs about sqrt(N) rounds: 2 for 8 boxes, 1,000 for a million.',
  },
  {
    title: "Simon's Secret",
    chip: 'Simon',
    qubits: 4,
    steps: [
      {
        text: 'A box hides a 2-bit secret s: it gives the same answer for x and for x xor s. Spread over the inputs q0 and q1.',
        goal: 'Superposition on q0 and q1',
        keys: 'Press 1, H, 2, H',
        hint: spreadHint([0, 1]),
        done: spreadAll([0, 1]),
        solve: solveSpread([0, 1]),
      },
      {
        text: 'Tap Ask: one question, on all four inputs at once. The answers land on q2 and q3.',
        goal: 'Ask the box',
        keys: 'Press Enter',
        action: { label: 'Ask', run: (lab, m) => { m.s = 1 + Math.floor(lab.random() * 3); apply(lab, simonOracle(m.s as number)); } },
        done: ({ memory }) => memory.s !== undefined,
      },
      {
        text: 'Spread over q0 and q1 again: interference keeps only the inputs that agree with the secret.',
        goal: 'Hadamard on q0 and q1',
        keys: 'Press 1, H, 2, H',
        hint: ({ stepOps }) => ({ gesture: 'spread', qubits: [stepOps.some((o) => o.kind === 'gate' && o.gate === 'h' && o.target === 0) ? 1 : 0] }),
        done: ({ stepOps }) => [0, 1].every((q) => stepOps.some((o) => o.kind === 'gate' && o.gate === 'h' && o.target === q && !o.controls?.length)),
        solve: (lab) => {
          lab.gate('h', 0);
          lab.gate('h', 1);
        },
      },
      shotsStep('Run 100 shots and read q1 q0.', ({ shots, memory }) => {
        if (!shots) return '';
        const seen = readings(shots, 3);
        const s = simonSecret(seen) ?? (memory.s as number);
        return `Readings ${seen.map((y) => bits(y, 2)).join(', ')}: each y has an even overlap with the secret. Only s = ${bits(s, 2)} fits.`;
      }),
    ],
    outro: "Simon's algorithm was the first exponential quantum speedup, and the idea that led Shor to factoring.",
  },
];
