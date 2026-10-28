import { describe, expect, it } from 'vitest';
import { run, type Op } from '../quantum/circuit';
import { QState } from '../quantum/state';
import { answerTopic, classify, describeState, entangledPairs, explainOp, moveWords, nextMove, outcomes } from './partner';

const g = (gate: 'h' | 'x' | 'z' | 's' | 't', target: number, controls?: number[]): Op => ({ kind: 'gate', gate, target, ...(controls ? { controls } : {}) });
const after = (n: number, ops: Op[], from?: QState) => run(n, ops, () => 0.5, from).state;

describe('Ket, the lab partner', () => {
  it('explains a gate from the states before and after it', () => {
    const z0 = new QState(1);
    expect(explainOp(g('h', 0), z0, after(1, [g('h', 0)]))!.text).toMatch(/superposition/);
    const plus = after(1, [g('h', 0)]);
    expect(explainOp(g('h', 0), plus, after(1, [g('h', 0)], plus))!.text).toMatch(/back to a sure 0/);
    expect(explainOp(g('x', 0), z0, after(1, [g('x', 0)]))!.text).toMatch(/0 became 1/);
    expect(explainOp(g('z', 0), z0, z0)!.text).toMatch(/nothing you can see/);
    expect(explainOp(g('s', 0), plus, after(1, [g('s', 0)], plus))!.text).toMatch(/quarter turn/);
  });

  it('notices entanglement being made, and a CNOT that does nothing', () => {
    const plus0 = after(2, [g('h', 0)]);
    const bell = after(2, [g('x', 1, [0])], plus0);
    const e = explainOp(g('x', 1, [0]), plus0, bell)!;
    expect(e.text).toMatch(/entangled/);
    expect(e.point).toBe(1);
    expect(explainOp(g('x', 1, [0]), new QState(2), new QState(2))!.text).toMatch(/Nothing changed/);
    expect(entangledPairs(bell)).toEqual([[0, 1]]);
  });

  it('says what a measurement did to the partner', () => {
    const bell = after(2, [g('h', 0), g('x', 1, [0])]);
    const m: Op = { kind: 'measure', qubit: 0, outcome: 1 };
    const collapsed = after(2, [g('x', 0), g('x', 1)]);
    const e = explainOp(m, bell, collapsed)!;
    expect(e.text).toMatch(/q0 read 1, and its partner q1 became a sure 1/);
  });

  it('describes the state in words', () => {
    expect(outcomes(after(2, [g('h', 0), g('x', 1, [0])]))).toBe('50% |00>, 50% |11>');
    expect(describeState(after(2, [g('h', 0), g('x', 1, [0])])).text).toMatch(/q0 and q1 are entangled/);
    expect(describeState(after(1, [g('x', 0)])).text).toMatch(/q0 is a sure 1/);
  });

  it('plans the next move toward a goal from wherever you are', () => {
    const bell = after(2, [g('h', 0), g('x', 1, [0])]);
    const first = nextMove(new QState(2), bell)!;
    expect(first.kind).toBe('gate');
    // follow its hints and arrive
    let s = new QState(2);
    for (let i = 0; i < 4 && s.fidelity(bell) < 0.999; i++) s = after(2, [nextMove(s, bell)!], s);
    expect(s.fidelity(bell)).toBeGreaterThan(0.999);
    // from a wrong turn too
    let w = after(2, [g('x', 1)]);
    for (let i = 0; i < 5 && w.fidelity(bell) < 0.999; i++) w = after(2, [nextMove(w, bell)!], w);
    expect(w.fidelity(bell)).toBeGreaterThan(0.999);
    expect(nextMove(bell, bell)).toBeNull();
    expect(moveWords(g('x', 1, [0])).text).toMatch(/CNOT: touch q0 to q1/);
  });

  it('sorts spoken questions and knows the ideas', () => {
    expect(classify('what just happened')).toBe('what-happened');
    expect(classify('what should I do')).toBe('hint');
    expect(classify('help')).toBe('hint');
    expect(classify("what's the state")).toBe('state');
    expect(classify('what is entanglement')).toBe('topic');
    expect(answerTopic('what is entanglement')!.text).toMatch(/share one state/);
    expect(answerTopic('tell me about phase')!.text).toMatch(/direction of an amplitude/);
    expect(answerTopic('what is the weather')).toBeNull();
  });
});
