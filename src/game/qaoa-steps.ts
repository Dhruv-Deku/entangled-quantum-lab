import { blochVector } from '../quantum/bloch';
import { approximationRatio, bestCut, optimize, qaoaOps, SQUARE } from '../quantum/qaoa';
import type { Step } from './chapters';

/**
 * The MaxCut steps, shared by Chapter 12 and the course: superposition over
 * every split, one optimised QAOA layer, shots, then a second layer. The board
 * shows the graph and the energy landscape the optimiser walks across.
 */

const xOf = (state: Parameters<typeof blochVector>[0], q: number) => blochVector(state, q)[0];
const g = SQUARE;
const best = bestCut(g).states;

type QaoaMemory = { graph: string; p: number; gammas: number[]; betas: number[]; path: [number, number, number][]; ratio: number; energy: number };

function run(memory: Record<string, unknown>, gammas: number[], betas: number[], steps: number): QaoaMemory {
  const path = optimize(g, gammas, betas, steps);
  const last = path[path.length - 1];
  const result: QaoaMemory = {
    graph: g.name,
    p: gammas.length,
    gammas: last.gammas,
    betas: last.betas,
    // the board draws the first layer's dials
    path: path.map((s) => [s.gammas[0], s.betas[0], s.energy]),
    ratio: approximationRatio(g, last.energy),
    energy: last.energy,
  };
  memory.qaoa = result;
  return result;
}

const shotsLine = (shots: Uint32Array) => {
  const total = shots.reduce((a, b) => a + b, 0);
  const hit = best.reduce((a, k) => a + shots[k], 0);
  return `0101 and 1010, the two best cuts, came up ${Math.round((100 * hit) / total)}% of the time; a random split would be 12.5%.`;
};

export function maxcutSteps(): Step[] {
  const allSpread = (state: Parameters<typeof blochVector>[0]) => [0, 1, 2, 3].every((q) => xOf(state, q) > 0.95);
  return [
    {
      text: 'Four people sit in a ring and each pair of neighbours are rivals. Split them into two teams so every rivalry crosses teams. Each qubit is a person; 0 and 1 are the teams. Spread over all four.',
      goal: 'Superposition on all four qubits',
      keys: 'Press 1, H, 2, H, 3, H, 4, H',
      board: 'landscape',
      hint: ({ state }) => {
        const q = [0, 1, 2, 3].find((i) => xOf(state, i) < 0.95);
        return q === undefined ? null : { gesture: 'spread', qubits: [q] };
      },
      done: ({ state }) => allSpread(state),
      solve: (lab) => {
        for (let q = 0; q < 4; q++) if (xOf(lab.state, q) < 0.95) lab.gate('h', q);
      },
      payoff: 'All 16 splits at once, each equally likely. The board shows the ring; the best split cuts all 4 edges.',
    },
    {
      text: 'QAOA turns two dials: gamma runs the cost (it rewards cut edges) and beta mixes. The board maps the average cost over both dials. Tap Optimize: a classical optimizer walks downhill.',
      goal: 'Optimize the dials',
      keys: 'Press Enter',
      board: 'landscape',
      action: {
        label: 'Optimize',
        run: (lab, memory) => {
          const r = run(memory, [0.5], [1.0], 60);
          lab.load(g.n, qaoaOps(g, r.gammas, r.betas));
        },
      },
      done: ({ memory }) => (memory.qaoa as QaoaMemory | undefined)?.p === 1,
      payoff: ({ memory }) => {
        const r = memory.qaoa as QaoaMemory;
        return `The average cost went from ${r.path[0][2].toFixed(2)} to ${r.energy.toFixed(2)}: an approximation ratio of ${r.ratio.toFixed(2)}, where random guessing scores 0.50.`;
      },
      hold: true,
    },
    {
      text: 'The circuit on the orbs is the optimised QAOA circuit. Run 100 shots: each shot is one split.',
      goal: 'Run 100 shots',
      keys: 'Press Space',
      board: 'landscape',
      done: ({ shots }) => !!shots,
      solve: (lab) => void lab.shots(100),
      payoff: ({ shots }) => (shots ? shotsLine(shots) : ''),
      hold: true,
    },
    {
      text: 'One layer reaches 0.75 on a ring, a known limit. More layers mean more dials and a better answer. Tap Deeper for two layers.',
      goal: 'Add a second layer',
      keys: 'Press Enter',
      board: 'landscape',
      action: {
        label: 'Deeper',
        run: (lab, memory) => {
          const r = run(memory, [0.4, 0.8], [0.6, 0.3], 120);
          lab.load(g.n, qaoaOps(g, r.gammas, r.betas));
        },
      },
      done: ({ memory }) => (memory.qaoa as QaoaMemory | undefined)?.p === 2,
      payoff: ({ memory }) => `Two layers: approximation ratio ${(memory.qaoa as QaoaMemory).ratio.toFixed(2)}. Run the shots again.`,
    },
    {
      text: 'Run 100 shots with two layers.',
      goal: 'Run 100 shots',
      keys: 'Press Space',
      board: 'landscape',
      done: ({ shots }) => !!shots,
      solve: (lab) => void lab.shots(100),
      payoff: ({ shots }) => (shots ? shotsLine(shots) : ''),
      hold: true,
    },
  ];
}
