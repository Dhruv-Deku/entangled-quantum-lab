import type { Lab } from '../lab/lab';
import { surfaceFigure, type SurfaceView } from '../lab/figures';
import { mulberry32 } from '../quantum/measure';
import { SurfaceCode, thresholdCurves } from '../quantum/surface';
import type { Chapter } from './chapters';

/**
 * Chapter 26, the Surface Code: the error correction Google ran on Willow.
 * A distance-3 lattice floats above the desk; noise flips qubits, the checks
 * light up, the decoder fixes them, and the single orb on the desk is the
 * logical qubit: it only flips when a correction fails. Then the code grows to
 * 49 qubits and runs by itself, a stress test finds the threshold, and a storm
 * pushes the noise past it.
 */

const fresh = (): SurfaceView => ({ d: 3, p: 0.05, round: null, id: 0, decoded: false, auto: false, timer: 0, cycles: 0, fixed: 0, logical: 0, curve: null, curveT: 0 });
function sv(m: Record<string, unknown>): SurfaceView {
  if (!m.surface) m.surface = fresh();
  return m.surface as SurfaceView;
}
const codes = new Map<number, SurfaceCode>();
const codeFor = (d: number) => codes.get(d) ?? (codes.set(d, new SurfaceCode(d)), codes.get(d)!);

/** Seconds between cycles once the code runs by itself. */
const CYCLE = 3;

/** A new round of noise on the lattice; `decode` applies the fix at once (auto cycles), otherwise it waits for Decode. */
function cycle(lab: Lab, v: SurfaceView, decode: boolean, atLeastOne = false): void {
  v.round = codeFor(v.d).round(v.p, () => lab.random(), atLeastOne);
  v.id++;
  v.cycles++;
  v.decoded = false;
  if (decode) applyFix(lab, v);
}

/** The decoder's fix: count what it corrected, and flip the logical qubit (the orb) when it got it wrong. */
function applyFix(lab: Lab, v: SurfaceView): void {
  const r = v.round;
  if (!r || v.decoded) return;
  v.decoded = true;
  v.fixed += r.xErrors.length + r.zErrors.length;
  if (r.logical) {
    v.logical++;
    lab.gate('x', 0);
  }
}

/** Let the code run by itself: a cycle every few seconds, and the threshold plot drawing in. */
function run(lab: Lab, m: Record<string, unknown>, dt: number): void {
  const v = sv(m);
  if (v.curve && v.curveT < 1) v.curveT = Math.min(1, v.curveT + dt / 1.6);
  if (!v.auto) return;
  v.timer += dt;
  if (v.timer >= CYCLE) {
    v.timer = 0;
    cycle(lab, v, true);
  }
}

const figure = (m: Record<string, unknown>) => surfaceFigure(sv(m));
const errorsIn = (v: SurfaceView) => (v.round ? v.round.xErrors.length + v.round.zErrors.length : 0);

export const SURFACE_CHAPTER: Chapter = {
  title: 'Surface Code',
  chip: 'Surface',
  qubits: 1,
  steps: [
    {
      text: 'The orb is now one logical qubit, stored in the grid above it: 9 data qubits (the beads) and 8 measure qubits (the tiles), like a corner of Google\'s Willow chip. Tap Cycle to let noise in.',
      goal: 'Run a cycle',
      keys: 'Press Enter',
      enter: (_lab, m) => void (m.surface = fresh()),
      action: { label: 'Cycle', run: (lab, m) => cycle(lab, sv(m), false, true) },
      done: ({ memory }) => sv(memory).cycles >= 1,
      payoff: ({ memory }) => {
        const n = errorsIn(sv(memory));
        return `${n} qubit${n === 1 ? '' : 's'} flipped (coral: bit flip, violet: phase flip), and the tiles around ${n === 1 ? 'it' : 'them'} lit up. That pattern is the syndrome: it says where errors are, but nothing about the logical qubit, so the orb is untouched.`;
      },
      hold: true,
      tick: run,
      figure,
    },
    {
      text: 'Tap Decode: the decoder pairs up the lit tiles along the shortest paths and flips those qubits back (the mint lines).',
      goal: 'Decode',
      keys: 'Press Enter',
      action: { label: 'Decode', run: (lab, m) => applyFix(lab, sv(m)) },
      done: ({ memory }) => sv(memory).decoded,
      payoff: ({ memory }) =>
        sv(memory).round?.logical
          ? 'The decoder guessed wrong: its fix and the real errors together stretch right across the grid, and the logical qubit flipped. Watch the orb. With this little code it happens; bigger codes make it rarer.'
          : 'Fixed. Every error is undone and the logical qubit never noticed: the orb has not moved. Nobody looked at its state; only parities were measured.',
      hold: true,
      tick: run,
      figure,
    },
    {
      text: 'Make the code bigger: distance 5 is 25 data qubits and 24 measure qubits. Tap Grow; then it runs by itself, a cycle every three seconds, at 3% noise.',
      goal: 'Grow to 49 qubits',
      keys: 'Press Enter',
      action: {
        label: 'Grow',
        run: (lab, m) => {
          const v = sv(m);
          v.d = 5;
          v.p = 0.03;
          v.auto = true;
          v.timer = 0;
          cycle(lab, v, true, true);
        },
      },
      done: ({ memory }) => sv(memory).d === 5,
      payoff: 'Every cycle, noise flips a few qubits somewhere, the tiles light, and the decoder fixes them. The counters on the board keep score; logical errors stay rare.',
      hold: true,
      tick: run,
      figure,
    },
    {
      text: 'Is bigger always better? Tap Stress test: thousands of cycles at each error rate, for 9, 25 and 49 data qubits.',
      goal: 'Find the threshold',
      keys: 'Press Enter',
      action: {
        label: 'Stress test',
        run: (_lab, m) => {
          const v = sv(m);
          // a fixed seed: the same honest Monte Carlo every time, so the plot is steady
          const ps = [0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.14];
          v.curve = thresholdCurves([3, 5, 7], ps, 400, mulberry32(26));
          v.curveT = 0;
        },
      },
      done: ({ memory }) => sv(memory).curve !== null,
      payoff: 'Below about 9% (the threshold), every step up in size cuts the logical error rate; above it, more qubits just mean more errors. In 2024 Willow was the first chip clearly below threshold: from distance 3 to 5 to 7, each step halved its error rate.',
      hold: true,
      tick: run,
      figure,
    },
    {
      text: 'Push it over the edge: tap Storm to raise the noise to 12%, above the threshold, and watch the decoder struggle.',
      goal: 'Raise the noise',
      keys: 'Press Enter',
      action: {
        label: 'Storm',
        run: (lab, m) => {
          const v = sv(m);
          v.p = 0.12;
          v.auto = true;
          v.timer = 0;
          cycle(lab, v, true, true);
        },
      },
      done: ({ memory }) => sv(memory).p > 0.1,
      payoff: 'Now errors outrun the decoder, and the orb starts to flip. Real chips also make errors while they measure, which brings the threshold down to about 1%; that is why every fraction of a percent of qubit quality matters.',
      hold: true,
      tick: run,
      figure,
    },
  ],
  outro: 'That was the surface code, the plan for every big superconducting quantum computer: about a thousand physical qubits for each logical one, cycling a million times a second, with a decoder that keeps up.',
};
