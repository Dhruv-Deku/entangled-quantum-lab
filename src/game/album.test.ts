import { describe, expect, it } from 'vitest';
import { run } from '../quantum/circuit';
import { mulberry32 } from '../quantum/measure';
import { QState } from '../quantum/state';
import { ALBUM, albumMatches } from './album';
import { computerFlips, score } from './penny';

describe('the State Album', () => {
  it('has fifteen distinct states, each matched by its own recipe and nothing else', () => {
    expect(ALBUM).toHaveLength(15);
    for (const e of ALBUM) {
      const s = run(e.qubits, e.ops, () => 0.5).state;
      expect(albumMatches(s).map((m) => m.id), e.id).toEqual([e.id]);
    }
    expect(albumMatches(new QState(2))).toEqual([]);
  });

  it('ignores a global phase', () => {
    const s = run(1, [{ kind: 'gate', gate: 'x', target: 0 }, { kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 0 }], () => 0.5).state;
    // X H X |0> = -(|0> - |1>)/sqrt 2: the minus state up to a global sign
    expect(albumMatches(s).map((m) => m.id)).toEqual(['minus']);
  });
});

describe('the quantum penny flip', () => {
  it('H, then any computer move, then H always lands heads', () => {
    const rng = mulberry32(5);
    let r = { you: 0, computer: 0 };
    for (let k = 0; k < 40; k++) {
      const flip = computerFlips(rng);
      const ops = [{ kind: 'gate', gate: 'h', target: 0 }, ...(flip ? [{ kind: 'gate', gate: 'x', target: 0 }] : []), { kind: 'gate', gate: 'h', target: 0 }] as const;
      const s = run(1, [...ops] as never, () => 0.5).state;
      expect(s.prob1(0)).toBeCloseTo(0, 9);
      r = score(r, 0);
    }
    expect(r).toEqual({ you: 40, computer: 0 });
    expect(score(r, 1).computer).toBe(1);
  });
});
