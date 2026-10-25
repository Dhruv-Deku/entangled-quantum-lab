import type { Lab } from '../lab/lab';
import { arcsFigure, chshFigure, qecFigure, rbFigure, trotterFigure, walkFigure, zenoFigure, type ChshRun, type QecView, type ZenoView } from '../lab/figures';
import {
  benchmark, rbSequence, rbSurvival, zenoCurve, type RbResult,
  BELL_MEASURE, classicalWalk, exactMagnetization, magnetization, playChsh, qecCurve, QEC_ENCODE, QEC_SYNDROME, spread, swapFix, syndromeQubit, trotterMagnetization,
  TROTTER_DT, TROTTER_MANUAL, TROTTER_STEPS, trotterStepOps, walkDistribution, walkStepOps, WALK_MAX_STEPS, WALK_SETUP, WALK_START,
} from '../quantum/advanced';
import { blochVector } from '../quantum/bloch';
import type { Op } from '../quantum/circuit';
import { pairStrength } from '../quantum/entanglement';
import { entanglementMap } from '../quantum/state-views';
import type { QState } from '../quantum/state';
import type { Chapter, GoalContext, Step } from './chapters';
import { huntStatus, HUNT_TITLE } from './hunt';

/**
 * Chapters 19 to 25: the CHSH Bell test, the bit-flip code, entanglement
 * swapping, a quantum walk, simulating an Ising chain in Trotter steps, the
 * quantum Zeno effect, and randomized benchmarking.
 * Each puts its own figure on the board. (Self-contained helpers, like
 * algorithm-chapters.ts: chapters.ts imports this file.)
 */

const bz = (s: QState, q: number) => blochVector(s, q)[2];
const bx = (s: QState, q: number) => blochVector(s, q)[0];
const apply = (lab: Lab, ops: Op[]) => ops.map((op) => lab.apply(op));
const cnotIn = (ops: readonly Op[], c: number, t: number) => ops.some((o) => o.kind === 'gate' && o.gate === 'x' && o.target === t && o.controls?.length === 1 && o.controls[0] === c);
const hIn = (ops: readonly Op[], q: number) => ops.some((o) => o.kind === 'gate' && o.gate === 'h' && o.target === q && !o.controls?.length);
const measuredIn = (ops: readonly Op[], q: number) => ops.find((o): o is Extract<Op, { kind: 'measure' }> => o.kind === 'measure' && o.qubit === q);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const shotsStep = (text: string, payoff: Step['payoff'], figure?: Step['figure']): Step => ({
  text,
  goal: 'Run 100 shots',
  keys: 'Press Space',
  done: ({ shots }) => !!shots,
  solve: (lab) => void lab.shots(100),
  payoff,
  hold: true,
  figure,
});

/** Make a Bell pair on (a, b): spread a, then touch a to b. */
const pairStep = (a: number, b: number, text: string): Step => ({
  text,
  goal: `Bell pair q${a} and q${b}`,
  keys: `Press ${a + 1}, H, then C`,
  control: a,
  hint: ({ state }) => (bx(state, a) < 0.95 && pairStrength(state, a, b) < 0.5 ? { gesture: 'spread', qubits: [a] } : { gesture: 'touch', qubits: [a, b] }),
  done: ({ state }) => pairStrength(state, a, b) > 0.99,
  solve: (lab) => {
    if (pairStrength(lab.state, a, b) > 0.99) return;
    if (bx(lab.state, a) < 0.95) lab.gate('h', a);
    lab.entangle(a, b);
  },
});

// ---------------------------------------------------------------- figures from memory

const chshFig = (m: Record<string, unknown>) => chshFigure((m.chsh as ChshRun[] | undefined) ?? []);
const qecFig = (m: Record<string, unknown>) => qecFigure((m.qec as QecView | undefined) ?? { syndrome: null, flipped: null, corrected: false, curve: null });
const qec = (m: Record<string, unknown>): QecView => (m.qec as QecView | undefined) ?? { syndrome: null, flipped: null, corrected: false, curve: null };

function swapFig(m: Record<string, unknown>, s: QState) {
  const map = entanglementMap(s);
  const p = (a: number, b: number) => map.pair[a][b];
  const caption =
    p(0, 3) > 0.99 ? 'q0 and q3 are a Bell pair, yet they never touched: the entanglement was swapped onto them.'
    : m.m1 !== undefined ? `The middle qubits read ${m.m1}${m.m2}: q0 and q3 are now linked, up to a fix that depends on those two bits.`
    : p(0, 1) > 0.99 && p(2, 3) > 0.99 ? 'Two separate pairs: q0 with q1, q2 with q3. Nothing links q0 to q3.'
    : 'Build the two pairs.';
  const bracket = m.m1 !== undefined ? { qubits: [1, 2] as [number, number], label: `Bell measurement read ${m.m1}${m.m2}` } : null;
  return arcsFigure(s.n, map.pair, caption, bracket);
}

interface WalkMemory {
  t: number;
  spreads: { t: number; q: number; c: number }[];
}
const walkMem = (m: Record<string, unknown>): WalkMemory => (m.walk as WalkMemory | undefined) ?? { t: 0, spreads: [{ t: 0, q: 0, c: 0 }] };
const walkFig = (m: Record<string, unknown>, s: QState) => {
  const w = walkMem(m);
  return walkFigure(w.t, walkDistribution(s), classicalWalk(w.t), w.spreads, WALK_START);
};

const T_MAX = TROTTER_DT * TROTTER_STEPS;
let exactCurve: [number, number][] | null = null;
function exactPoints(): [number, number][] {
  if (!exactCurve) {
    const ts = Array.from({ length: 121 }, (_, i) => (i / 120) * T_MAX);
    const ms = exactMagnetization(ts);
    exactCurve = ts.map((t, i) => [t, ms[i]]);
  }
  return exactCurve;
}
const zeno = (m: Record<string, unknown>): ZenoView => (m.zeno as ZenoView | undefined) ?? { free: false, trial: null, curve: null };
const zenoFig = (m: Record<string, unknown>) => zenoFigure(zeno(m));
const SLICE = Math.PI / 10;

interface RbOne {
  gates: string;
  survival: number;
}
const rbFig = (m: Record<string, unknown>) => rbFigure((m.rb as RbResult | undefined) ?? null, (m.rbOne as RbOne | undefined) ?? null);

const trotterDone = (m: Record<string, unknown>) => ((m.trotter as unknown[] | undefined)?.length ?? 1) - 1;
/** Apply k more Trotter steps on the orbs, recording the magnetisation after each. */
function trotterSteps(lab: Lab, m: Record<string, unknown>, k: number): void {
  const pts = [...((m.trotter as [number, number][] | undefined) ?? [[0, 1]])];
  for (let i = 0; i < k; i++) {
    apply(lab, trotterStepOps(TROTTER_DT));
    pts.push([pts.length * TROTTER_DT, magnetization(lab.state)]);
  }
  m.trotter = pts;
}
const trotterFig = (m: Record<string, unknown>) => trotterFigure(exactPoints(), (m.trotter as [number, number][] | undefined) ?? [[0, 1]], (m.coarse as [number, number][] | undefined) ?? null, T_MAX);

export const ADVANCED_CHAPTERS: Chapter[] = [
  {
    title: 'Bell Test',
    chip: 'CHSH',
    qubits: 2,
    steps: [
      {
        ...pairStep(0, 1, 'A game: Alice and Bob each get a random question, 0 or 1, and answer with one bit, without talking. They win when their answers differ only if both questions were 1. The best any plan can do is 75%. Make them a Bell pair: spread q0, then touch q0 to q1.'),
        figure: chshFig,
      },
      {
        text: 'Tap Play: 1000 rounds. Each round they share a fresh pair, and each measures at an angle chosen by their question.',
        goal: 'Play 1000 rounds',
        keys: 'Press Enter',
        action: {
          label: 'Play',
          run: (lab, m) => {
            m.chsh = [{ label: 'Entangled pair', result: playChsh(lab.state, 1000, () => lab.random()) }] satisfies ChshRun[];
          },
        },
        done: ({ memory }) => ((memory.chsh as ChshRun[] | undefined)?.length ?? 0) >= 1,
        payoff: ({ memory }) => {
          const r = (memory.chsh as ChshRun[])[0].result;
          return `They won ${pct(r.win)} of the rounds. The score S = ${r.s.toFixed(2)} (give or take ${r.se.toFixed(2)} from luck in 1000 rounds) is over the classical limit of 2: no plan made in advance can do this. Theory says 85% and S = 2.83 at best.`;
        },
        hold: true,
        figure: chshFig,
      },
      {
        text: 'Now measure q0: close your fist on it. The pair turns into two plain bits that still agree.',
        goal: 'Measure q0',
        keys: 'Press 1, M',
        hint: { gesture: 'fist', qubits: [0] },
        done: ({ stepOps }) => !!measuredIn(stepOps, 0),
        solve: (lab) => void lab.measure(0),
        figure: chshFig,
      },
      {
        text: 'Tap Play again with these measured qubits.',
        goal: 'Play without entanglement',
        keys: 'Press Enter',
        action: {
          label: 'Play again',
          run: (lab, m) => {
            m.chsh = [...((m.chsh as ChshRun[] | undefined) ?? []), { label: 'After measuring q0', result: playChsh(lab.state, 1000, () => lab.random()) }];
          },
        },
        done: ({ memory }) => ((memory.chsh as ChshRun[] | undefined)?.length ?? 0) >= 2,
        payoff: ({ memory }) => {
          const r = (memory.chsh as ChshRun[])[1].result;
          return `Only ${pct(r.win)} now, S = ${r.s.toFixed(2)}. Bits that agree are no better than a list of answers agreed in advance. The extra wins came from entanglement.`;
        },
        hold: true,
        figure: chshFig,
      },
    ],
    outro: 'Bell tests with every loophole closed won the 2022 Nobel Prize in Physics. The same test certifies quantum keys and true random numbers.',
  },
  {
    title: 'Error Correction',
    chip: 'Errors',
    qubits: 5,
    steps: [
      {
        text: 'Qubits get knocked over by noise. Protect one. First give q0 a message: turn it part way with your wrist, anywhere between |0> and |1>.',
        goal: 'Tilt q0',
        keys: 'Press 1, then hold Right arrow',
        hint: { gesture: 'twist', qubits: [0] },
        done: ({ state }) => bz(state, 0) < 0.9 && bz(state, 0) > -0.9,
        solve: (lab) => void lab.gate('ry', 0, [1.1]),
        figure: qecFig,
      },
      {
        text: 'Spread the message over three qubits: touch q0 to q1, then q0 to q2. This is not copying (that is impossible): it makes a|000> + b|111>.',
        goal: 'Encode into q0, q1, q2',
        keys: 'Press 2, C, 3, C',
        control: 0,
        hint: ({ stepOps }) => ({ gesture: 'touch', qubits: [0, cnotIn(stepOps, 0, 1) ? 2 : 1] }),
        done: ({ stepOps }) => cnotIn(stepOps, 0, 1) && cnotIn(stepOps, 0, 2),
        solve: (lab) => apply(lab, QEC_ENCODE),
        payoff: 'One logical qubit, stored in three physical ones.',
        figure: qecFig,
      },
      {
        text: 'Tap Storm: noise flips one of the three qubits. We will not be told which.',
        goal: 'Let the storm hit',
        keys: 'Press Enter',
        action: {
          label: 'Storm',
          run: (lab, m) => {
            const q = Math.floor(lab.random() * 3);
            lab.strike(q);
            m.qec = { ...qec(m), flipped: q } satisfies QecView;
          },
        },
        done: ({ memory }) => qec(memory).flipped !== null,
        payoff: 'One qubit flipped. Looking at the three to find it would destroy the message.',
        hold: true,
        figure: qecFig,
      },
      {
        text: 'Tap Check: q3 learns whether q0 and q1 agree, q4 whether q1 and q2 agree. Then both are measured.',
        goal: 'Read the syndrome',
        keys: 'Press Enter',
        action: {
          label: 'Check',
          run: (lab, m) => {
            const done = apply(lab, QEC_SYNDROME);
            const out = (q: number) => {
              const op = done.find((o) => o?.kind === 'measure' && o.qubit === q);
              return op?.kind === 'measure' ? (op.outcome ?? 0) : 0;
            };
            m.qec = { ...qec(m), syndrome: [out(3), out(4)] } satisfies QecView;
          },
        },
        done: ({ memory }) => qec(memory).syndrome !== null,
        payoff: ({ memory }) => {
          const [s0, s1] = qec(memory).syndrome!;
          const q = syndromeQubit(s0, s1);
          return `The checks read ${s0}${s1}: ${q === null ? 'nothing flipped' : `q${q} is the odd one out`}. They only compared neighbours, so a and b are still unknown, and still there.`;
        },
        hold: true,
        figure: qecFig,
      },
      {
        text: 'Tap Correct: flip the qubit the syndrome names back.',
        goal: 'Correct the error',
        keys: 'Press Enter',
        action: {
          label: 'Correct',
          run: (lab, m) => {
            const v = qec(m);
            const q = v.syndrome ? syndromeQubit(v.syndrome[0], v.syndrome[1]) : null;
            if (q !== null) lab.gate('x', q);
            m.qec = { ...v, corrected: true } satisfies QecView;
          },
        },
        done: ({ memory }) => qec(memory).corrected,
        payoff: ({ memory }) => `Fixed: q${qec(memory).flipped} is flipped back, and a|000> + b|111> is exactly as before. The error was found and undone without anyone reading a or b.`,
        hold: true,
        figure: qecFig,
      },
      {
        text: 'Decode: touch q0 to q2, then q0 to q1. The message gathers back onto q0.',
        goal: 'Decode onto q0',
        keys: 'Press 3, C, 2, C',
        control: 0,
        hint: ({ stepOps }) => ({ gesture: 'touch', qubits: [0, cnotIn(stepOps, 0, 2) ? 1 : 2] }),
        done: ({ stepOps }) => cnotIn(stepOps, 0, 1) && cnotIn(stepOps, 0, 2),
        solve: (lab) => {
          lab.entangle(0, 2);
          lab.entangle(0, 1);
        },
        payoff: ({ state }) => `q0 stands on its own again, tilted where you left it (z = ${bz(state, 0).toFixed(2)}), as if the storm never happened.`,
        hold: true,
        figure: qecFig,
      },
      {
        text: 'Tap Stress test: run the whole code 300 times at each noise level and count how often the message is lost.',
        goal: 'Stress test the code',
        keys: 'Press Enter',
        action: {
          label: 'Stress test',
          run: (lab, m) => {
            const ps = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
            m.qec = { ...qec(m), curve: qecCurve(ps, 300, () => lab.random()) } satisfies QecView;
          },
        },
        done: ({ memory }) => qec(memory).curve !== null,
        payoff: 'Below p = 0.5 the code loses the message less often than a bare qubit: about 3% instead of 10% at p = 0.1. Above it, the code makes things worse.',
        hold: true,
        figure: qecFig,
      },
    ],
    outro: 'This code only catches bit flips. Real codes like the surface code catch phase flips too, using many more qubits; in 2024 Google showed one getting better as it grew.',
  },
  {
    title: 'Entanglement Swapping',
    chip: 'Swapping',
    qubits: 4,
    steps: [
      { ...pairStep(0, 1, 'Two labs each make a Bell pair. First pair: spread q0, then touch q0 to q1.'), figure: swapFig },
      { ...pairStep(2, 3, 'Second pair: spread q2, then touch q2 to q3. Alice holds q1 and q2; q0 and q3 are far apart.'), figure: swapFig },
      {
        text: 'Alice joins her two qubits in a Bell measurement: touch q1 to q2, then spread q1.',
        goal: 'CNOT q1 to q2, then H on q1',
        keys: 'Press 3, C, 2, H',
        control: 1,
        hint: ({ stepOps }) => (cnotIn(stepOps, 1, 2) ? { gesture: 'spread', qubits: [1] } : { gesture: 'touch', qubits: [1, 2] }),
        done: ({ stepOps }) => cnotIn(stepOps, 1, 2) && hIn(stepOps, 1),
        solve: (lab) => {
          lab.entangle(1, 2);
          lab.gate('h', 1);
        },
        figure: swapFig,
      },
      {
        text: 'Measure q1 and q2: close your fist on each.',
        goal: 'Measure q1 and q2',
        keys: 'Press 2, M, 3, M',
        hint: ({ stepOps }) => ({ gesture: 'fist', qubits: [measuredIn(stepOps, 1) ? 2 : 1] }),
        done: ({ stepOps }) => !!measuredIn(stepOps, 1) && !!measuredIn(stepOps, 2),
        complete: ({ stepOps, memory }) => {
          memory.m1 = measuredIn(stepOps, 1)?.outcome ?? 0;
          memory.m2 = measuredIn(stepOps, 2)?.outcome ?? 0;
        },
        solve: (lab) => {
          lab.measure(1);
          lab.measure(2);
        },
        figure: swapFig,
      },
      {
        text: (m) => `Alice phones the two bits, ${m.m1}${m.m2}, to whoever holds q3. Tap Fix: they apply ${m.m2 ? 'X' : ''}${m.m1 && m.m2 ? ' and ' : ''}${m.m1 ? 'Z' : ''}${!m.m1 && !m.m2 ? 'nothing' : ''} to q3.`,
        goal: 'Fix up q3',
        keys: 'Press Enter',
        action: {
          label: 'Fix',
          run: (lab, m) => {
            apply(lab, swapFix(m.m1 as number, m.m2 as number));
            m.fixed = true;
          },
        },
        done: ({ memory }) => memory.fixed === true,
        payoff: ({ state }) => `q0 and q3: entanglement ${pairStrength(state, 0, 3).toFixed(2)}. They never met, and no qubit travelled between them: only two ordinary bits did.`,
        hold: true,
        figure: swapFig,
      },
      shotsStep('Run 100 shots and compare q0 with q3.', ({ shots }) => {
        if (!shots) return '';
        let same = 0, all = 0;
        shots.forEach((c, k) => {
          all += c;
          if ((k & 1) === ((k >> 3) & 1)) same += c;
        });
        return `q0 and q3 agreed in ${same} of ${all} shots, even though each one alone is a coin toss.`;
      }, swapFig),
    ],
    outro: 'Entanglement swapping is how quantum repeaters will stretch entanglement across a future quantum internet, one hop at a time.',
  },
  {
    title: 'Quantum Walk',
    chip: 'Walk',
    qubits: 5,
    setup: WALK_SETUP,
    steps: [
      {
        text: 'A walker stands in the middle of 16 sites (q0 to q3 hold where it is) and q4 is its coin. Each step it tosses the quantum coin and moves left or right, both ways at once. Tap Step.',
        goal: (m) => `Step ${walkMem(m).t} of ${WALK_MAX_STEPS}`,
        keys: 'Press Enter',
        action: {
          label: 'Step',
          run: (lab, m) => {
            apply(lab, walkStepOps());
            const w = walkMem(m), t = w.t + 1;
            m.walk = { t, spreads: [...w.spreads, { t, q: spread(walkDistribution(lab.state)), c: spread(classicalWalk(t)) }] } satisfies WalkMemory;
          },
        },
        done: ({ memory }) => walkMem(memory).t >= WALK_MAX_STEPS,
        payoff: ({ state }) => {
          const q = spread(walkDistribution(state)), c = spread(classicalWalk(WALK_MAX_STEPS));
          return `After ${WALK_MAX_STEPS} steps the walker is most likely far out, not in the middle: paths back to the start cancelled. Its spread is ${q.toFixed(2)} sites; a coin-flipping walker's is ${c.toFixed(2)}.`;
        },
        hold: true,
        figure: walkFig,
      },
      shotsStep('Run 100 shots to find the walker.', ({ shots }) => {
        if (!shots) return '';
        let far = 0;
        shots.forEach((c, k) => {
          if (Math.abs((k & 15) - WALK_START) >= 4) far += c;
        });
        const classical = classicalWalk(WALK_MAX_STEPS).reduce((s, p, i) => s + (Math.abs(i - WALK_START) >= 4 ? p : 0), 0);
        return `${far} of 100 shots found it 4 or more sites out. A classical walker gets that far ${pct(classical)} of the time.`;
      }, walkFig),
    ],
    outro: 'A quantum walk spreads in proportion to the number of steps; a random walk only by its square root. Quantum walks are the basis of several fast search algorithms.',
  },
  {
    title: 'Time Evolution',
    chip: 'Trotter',
    qubits: 3,
    steps: [
      {
        text: 'Three magnets in a chain: each pulls its neighbours into line (ZZ) while a sideways field tips them over (X). All start pointing up. A quantum computer follows this in small time steps. Tap Step.',
        goal: (m) => `Step ${trotterDone(m)} of ${TROTTER_MANUAL}`,
        keys: 'Press Enter',
        enter: (lab, m) => {
          m.trotter ??= [[0, magnetization(lab.state)]];
        },
        action: { label: 'Step', run: (lab, m) => trotterSteps(lab, m, 1) },
        done: ({ memory }) => trotterDone(memory) >= TROTTER_MANUAL,
        payoff: 'Each step is the couplings (CX, RZ, CX on each bond), then the field (RX on each qubit). The blue dots follow the exact curve.',
        figure: trotterFig,
      },
      {
        text: `Tap Run to keep going to t = ${T_MAX}: ${TROTTER_STEPS - TROTTER_MANUAL} more steps.`,
        goal: `Run to t = ${T_MAX}`,
        keys: 'Press Enter',
        action: { label: 'Run', run: (lab, m) => trotterSteps(lab, m, TROTTER_STEPS - trotterDone(m)) },
        done: ({ memory }) => trotterDone(memory) >= TROTTER_STEPS,
        payoff: ({ memory }) => {
          const pts = memory.trotter as [number, number][];
          const [t, mz] = pts[pts.length - 1];
          return `The magnets swing down, overshoot to about -0.8 near t = 4, and come back. At t = ${t} the circuit gives m = ${mz.toFixed(2)}; the exact answer is ${exactMagnetization([t])[0].toFixed(2)}.`;
        },
        hold: true,
        figure: trotterFig,
      },
      {
        text: 'Tap Bigger steps: the same time in steps three times longer, a third of the gates.',
        goal: 'Try bigger steps',
        keys: 'Press Enter',
        action: {
          label: 'Bigger steps',
          run: (_lab, m) => {
            m.coarse = trotterMagnetization(3 * TROTTER_DT, Math.round(TROTTER_STEPS / 3));
          },
        },
        done: ({ memory }) => !!memory.coarse,
        payoff: ({ memory }) => {
          const fine = memory.trotter as [number, number][], coarse = memory.coarse as [number, number][];
          const worst = (pts: [number, number][]) => Math.max(...pts.map(([t, mz]) => Math.abs(mz - exactMagnetization([t])[0])));
          return `Small steps never miss by more than ${worst(fine).toFixed(2)}; big ones miss by up to ${worst(coarse).toFixed(2)} and get the swing wrong. Fewer gates, more error: the trade every simulation makes.`;
        },
        hold: true,
        figure: trotterFig,
      },
    ],
    outro: 'Simulating nature was why Feynman proposed quantum computers. In 2023 IBM ran this kind of Ising circuit on 127 qubits.',
  },
  {
    title: 'Quantum Zeno',
    chip: 'Zeno',
    qubits: 1,
    steps: [
      {
        text: 'Turn q0 from |0> to |1> in ten small slices of 18 degrees each. Tap Turn.',
        goal: 'Ten slices, no looks',
        keys: 'Press Enter',
        action: {
          label: 'Turn',
          run: (lab, m) => {
            for (let k = 0; k < 10; k++) lab.gate('ry', 0, [SLICE]);
            m.zeno = { ...zeno(m), free: true } satisfies ZenoView;
          },
        },
        done: ({ memory }) => zeno(memory).free,
        payoff: 'Unwatched, the ten slices add up: q0 went all the way to |1>.',
        hold: true,
        figure: zenoFig,
      },
      {
        text: 'Start again from |0>, and this time look after every slice. Tap Watch.',
        goal: 'Ten slices, a look after each',
        keys: 'Press Enter',
        action: {
          label: 'Watch',
          run: (lab, m) => {
            lab.load(1, []);
            const trial: (0 | 1)[] = [];
            for (let k = 0; k < 10; k++) {
              lab.gate('ry', 0, [SLICE]);
              trial.push(lab.measure(0) ?? 0);
            }
            m.zeno = { ...zeno(m), trial } satisfies ZenoView;
          },
        },
        done: ({ memory }) => zeno(memory).trial !== null,
        payoff: ({ memory }) => {
          const t = zeno(memory).trial!, jump = t.indexOf(1);
          return jump < 0
            ? 'All ten looks found |0>. Each slice only gave a 2.4% chance of |1>, and each look that found |0> put q0 back at the start: watched, it never got going.'
            : `It held for ${jump} look${jump === 1 ? '' : 's'}, then a look found |1> (2.4% odds each time). Watched, it usually stays put: about 78% of runs never move at all.`;
        },
        hold: true,
        figure: zenoFig,
      },
      {
        text: 'Tap Try many: 300 runs each with 1, 2, 3, 5, 10, 20 and 50 looks.',
        goal: 'Vary the number of looks',
        keys: 'Press Enter',
        action: {
          label: 'Try many',
          run: (lab, m) => {
            m.zeno = { ...zeno(m), curve: zenoCurve([1, 2, 3, 5, 10, 20, 50], 300, () => lab.random()) } satisfies ZenoView;
          },
        },
        done: ({ memory }) => zeno(memory).curve !== null,
        payoff: ({ memory }) => {
          const c = zeno(memory).curve!;
          return `With one look it always ends at |1>; with 50 looks it stayed at |0> in ${pct(c[c.length - 1][1])} of runs. The more you look, the less it moves: the quantum Zeno effect.`;
        },
        hold: true,
        figure: zenoFig,
      },
    ],
    outro: 'The Zeno effect has been measured with trapped ions and superconducting qubits. Frequent measurement can freeze a system, protect a qubit, or steer it.',
  },
  {
    title: 'Benchmarking',
    chip: 'RB',
    qubits: 1,
    steps: [
      {
        text: 'No gate is perfect. To measure how good they are, run a random string of gates that adds up to nothing, and see how often the qubit comes back to |0>. Tap Sequence.',
        goal: 'Run one random sequence',
        keys: 'Press Enter',
        action: {
          label: 'Sequence',
          run: (lab, m) => {
            const ops = rbSequence(8, () => lab.random());
            apply(lab, ops);
            const names = ops.map((o) => (o.kind === 'gate' ? o.gate.toUpperCase() : '')).join(' ');
            m.rbOne = { gates: names, survival: rbSurvival(ops) } satisfies RbOne;
          },
        },
        done: ({ memory }) => !!memory.rbOne,
        payoff: ({ memory, state }) => {
          const one = memory.rbOne as RbOne;
          return `${one.gates.split(' ').length} gates (8 random Cliffords and the one that undoes them), and q0 is back at |0> with probability ${state.probabilities()[0].toFixed(3)}. On a chip with 0.1% error per gate it comes back ${(one.survival * 100).toFixed(1)}% of the time.`;
        },
        hold: true,
        figure: rbFig,
      },
      {
        text: 'Tap Benchmark: 12 random sequences at each length from 1 to 256 Cliffords, on the noisy chip model.',
        goal: 'Benchmark the gates',
        keys: 'Press Enter',
        action: {
          label: 'Benchmark',
          run: (lab, m) => {
            m.rb = benchmark([1, 2, 4, 8, 16, 32, 64, 128, 256], 12, () => lab.random());
          },
        },
        done: ({ memory }) => !!memory.rb,
        payoff: ({ memory }) => {
          const r = memory.rb as RbResult;
          return `Survival falls as ${r.a.toFixed(2)} x ${r.p.toFixed(4)}^m + 0.5: ${(r.perClifford * 100).toFixed(2)}% error per Clifford, ${(r.perGate * 100).toFixed(3)}% per gate. Long random sequences make tiny errors visible, and the fit leaves out errors in preparing and reading the qubit.`;
        },
        hold: true,
        figure: rbFig,
      },
    ],
    outro: 'Hardware makers report gate quality measured this way. The best single-qubit gates today go wrong less than once in a thousand times.',
  },
  {
    title: HUNT_TITLE,
    chip: 'Hunt',
    qubits: 2,
    steps: [
      {
        text: 'Three entangled pairs have escaped into your room, each tied to its partner by a gold thread. Walk around, find the glowing qubits on your furniture and floor, and catch them with your hand.',
        goal: () => `Catch all three pairs (${huntStatus.caught} of 3)`,
        keys: 'Press J to catch the next one',
        done: () => huntStatus.done,
        solve: () => void huntStatus.catchNext?.(),
        payoff: 'Every pair matched, or mismatched, perfectly, though the two qubits were metres apart. Measuring one decided the other at that instant, with no signal between them: that is entanglement.',
        hold: true,
      },
    ],
    outro: 'Einstein called this spooky action at a distance. Experiments have since shown it across 1,200 km, between a satellite and two ground stations.',
  },
];

/** For tests: what a figure would draw for this step right now. */
export function figureKey(step: Step, ctx: Pick<GoalContext, 'memory' | 'state'>): string | null {
  return step.figure?.(ctx.memory, ctx.state)?.key ?? null;
}
