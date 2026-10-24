import { blochVector } from '../quantum/bloch';
import { run, type Op } from '../quantum/circuit';
import type { GateName, Vec3 } from '../quantum/gates';
import { QState } from '../quantum/state';
import type { Chapter, GoalContext } from './chapters';

/**
 * Puzzles: "make this state" with as few moves as you can. The target is the
 * state a reference solution makes, so every puzzle is solvable by construction
 * and par is the length of that solution. Stars: 3 at par, 2 within two of par,
 * 1 for any solution.
 */

const g = (gate: GateName, target: number, controls?: number[]): Op => ({
  kind: 'gate',
  gate,
  target,
  ...(controls ? { controls } : {}),
});

/** Moves that count toward par: gates and swaps (not measurements, not shots). */
export function countMoves(ops: readonly Op[]): number {
  return ops.filter((o) => o.kind === 'gate' || o.kind === 'swap' || o.kind === 'iswap').length;
}

export function starsFor(moves: number, par: number): 1 | 2 | 3 {
  return moves <= par ? 3 : moves <= par + 2 ? 2 : 1;
}

export interface PuzzleDef {
  title: string;
  /** Short name for the navigator. */
  chip: string;
  qubits: number;
  /** The reference solution; its length is par. */
  solution: Op[];
  setup?: Op[];
  text: string;
  keys: string;
  /** Which qubit acts as control when two orbs touch (if it matters). */
  control?: number;
  outro: string;
}

const cache = new WeakMap<Chapter, QState>();

/** The state a puzzle asks for. */
export function puzzleTarget(p: Chapter): QState {
  let s = cache.get(p);
  if (!s) {
    s = run(p.qubits, [...(p.setup ?? []), ...(p.solution ?? [])], () => 0.5).state;
    cache.set(p, s);
  }
  return s;
}

/** Per-qubit target arrows, for the qubits whose target state is pure (not entangled). */
function arrows(s: QState): (Vec3 | null)[] {
  return Array.from({ length: s.n }, (_, q) => {
    const v = blochVector(s, q);
    return Math.hypot(v[0], v[1], v[2]) > 0.99 ? v : null;
  });
}

export function makePuzzle(d: PuzzleDef): Chapter {
  const par = d.solution.length;
  const ch: Chapter = {
    title: d.title,
    chip: d.chip,
    group: 'Puzzles',
    qubits: d.qubits,
    setup: d.setup,
    solution: d.solution,
    par,
    steps: [],
    outro: d.outro,
  };
  const target = run(d.qubits, [...(d.setup ?? []), ...d.solution], () => 0.5).state;
  ch.steps.push({
    text: d.text,
    goal: `Match the target in ${par} move${par > 1 ? 's' : ''} or fewer`,
    keys: d.keys,
    control: d.control,
    target: arrows(target),
    done: ({ state }: GoalContext) => state.fidelity(puzzleTarget(ch)) > 0.999,
    complete: ({ stepOps, memory }: GoalContext) => {
      const moves = countMoves(stepOps);
      memory.moves = moves;
      memory.stars = starsFor(moves, par);
    },
    payoff: ({ memory }: GoalContext) => {
      const moves = memory.moves as number, stars = memory.stars as number;
      const verdict = stars === 3 ? (moves < par ? 'Under par!' : 'Par.') : stars === 2 ? 'Close to par.' : 'Solved.';
      return `${verdict} ${moves} move${moves === 1 ? '' : 's'}, par ${par}: ${stars} of 3 stars.`;
    },
  });
  return ch;
}

export const PUZZLES: Chapter[] = [
  makePuzzle({
    title: 'Upside down',
    chip: 'Flip',
    qubits: 1,
    solution: [g('x', 0)],
    text: 'Turn the qubit into a sure 1.',
    keys: 'Gate keys: H X Y Z S T',
    outro: 'The simplest move in quantum computing.',
  }),
  makePuzzle({
    title: 'Minus',
    chip: 'Minus',
    qubits: 1,
    solution: [g('x', 0), g('h', 0)],
    text: 'An even mix, but with the minus sign: the arrow points away from you.',
    keys: 'Gate keys: H X Y Z S T',
    outro: 'Two routes work: X then H, or H then Z.',
  }),
  makePuzzle({
    title: 'Sideways',
    chip: 'Sideways',
    qubits: 1,
    solution: [g('h', 0), g('s', 0)],
    text: 'Point the arrow to the right, on the equator.',
    keys: 'Gate keys: H X Y Z S T',
    outro: 'This state is called |+i>. It needs a complex number to write down.',
  }),
  makePuzzle({
    title: 'Eighth turn',
    chip: 'Eighth',
    qubits: 1,
    solution: [g('h', 0), g('t', 0)],
    text: 'An even mix, turned an eighth of the way round the equator.',
    keys: 'Gate keys: H X Y Z S T',
    outro: 'T gates make the in-between phases.',
  }),
  makePuzzle({
    title: 'Double one',
    chip: 'Two ones',
    qubits: 2,
    solution: [g('x', 0), g('x', 1)],
    text: 'Both qubits a sure 1.',
    keys: 'Press 1 or 2 to pick a qubit',
    outro: 'Or X on one, then a CNOT: also two moves.',
  }),
  makePuzzle({
    title: 'Swap',
    chip: 'Swap',
    qubits: 2,
    setup: [g('x', 0)],
    solution: [{ kind: 'swap', a: 0, b: 1 }],
    text: 'q0 holds a 1 and q1 a 0. Swap them.',
    keys: 'SWAP on the dock',
    outro: 'Without the SWAP button it takes three CNOTs, a classic trick.',
  }),
  makePuzzle({
    title: 'Anti-pair',
    chip: 'Anti-pair',
    qubits: 2,
    solution: [g('x', 1), g('h', 0), g('x', 1, [0])],
    text: 'A pair that always disagrees: 01 or 10, half and half.',
    keys: 'Press 2, X, 1, H, then C',
    control: 0,
    outro: 'One of the four Bell states.',
  }),
  makePuzzle({
    title: 'Minus pair',
    chip: 'Minus pair',
    qubits: 2,
    solution: [g('h', 0), g('x', 1, [0]), g('z', 0)],
    text: 'Always agreeing, 00 or 11, but with a minus sign between them.',
    keys: 'Press 1, H, C, then Z',
    control: 0,
    outro: 'Same odds as the Chapter 3 pair. Only the board tells them apart.',
  }),
  makePuzzle({
    title: 'Singlet',
    chip: 'Singlet',
    qubits: 2,
    solution: [g('x', 0), g('x', 1), g('h', 0), g('x', 1, [0])],
    text: 'Always disagreeing, with a minus sign: the most famous state in physics.',
    keys: 'Press 1, X, 2, X, 1, H, then C',
    control: 0,
    outro: 'The singlet looks the same in every direction. Bell tests use it.',
  }),
  makePuzzle({
    title: 'Three of a kind',
    chip: 'Triple',
    qubits: 3,
    solution: [g('h', 0), g('x', 1, [0]), g('x', 2, [1])],
    text: 'All three always agree: 000 or 111.',
    keys: 'Press 1, H, C, then 2, C',
    outro: 'A GHZ state in three moves.',
  }),
  makePuzzle({
    title: 'Every answer',
    chip: 'All eight',
    qubits: 3,
    solution: [g('h', 0), g('h', 1), g('h', 2)],
    text: 'All eight outcomes equally likely.',
    keys: 'Press 1, H, 2, H, 3, H',
    outro: 'Three gates, eight possibilities at once.',
  }),
  makePuzzle({
    title: 'Twisted pair',
    chip: 'Twist pair',
    qubits: 2,
    solution: [g('h', 0), g('x', 1, [0]), g('s', 0)],
    text: 'Always agreeing, 00 or 11, with a quarter turn of phase between them.',
    keys: 'Press 1, H, C, then S',
    control: 0,
    outro: 'Entangled pairs can carry any phase. The board shows it as the angle of the hand.',
  }),
];
