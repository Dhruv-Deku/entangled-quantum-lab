import { describe, expect, it } from 'vitest';
import { run, type Op } from './circuit';
import { mulberry32 } from './measure';
import { allToAll, atomMoves, compileFor, comparePlatforms, formatTime, machineQubits, PLATFORM_ORDER, PLATFORMS, platformSchedule, runPlatform } from './platforms';

const h = (q: number): Op => ({ kind: 'gate', gate: 'h', target: q });
const cx = (c: number, t: number): Op => ({ kind: 'gate', gate: 'x', target: t, controls: [c] });
const measureAll = (n: number): Op[] => Array.from({ length: n }, (_, q) => ({ kind: 'measure', qubit: q }));
/** A circuit that needs routing on T5: every pair of 4 qubits interacts. */
const dense: Op[] = [h(0), cx(0, 1), cx(0, 2), cx(0, 3), cx(1, 2), cx(1, 3), cx(2, 3)];

describe('three kinds of quantum computer', () => {
  it('all-to-all wiring never needs SWAPs; the T5 chip does', () => {
    expect(allToAll(4).edges).toHaveLength(6);
    expect(compileFor('ions', 4, dense).swaps).toBe(0);
    expect(compileFor('atoms', 4, dense).swaps).toBe(0);
    expect(compileFor('superconducting', 4, dense).swaps).toBeGreaterThan(0);
    expect(machineQubits('superconducting', 3)).toBe(5);
    expect(machineQubits('ions', 3)).toBe(3);
  });

  it('every machine with its noise switched off gives the ideal answer', () => {
    const ghz = [h(0), cx(0, 1), cx(1, 2)];
    for (const id of PLATFORM_ORDER) {
      const p = PLATFORMS[id];
      const saved = { ...p.noise }, savedMove = p.moveError;
      Object.assign(p.noise, { p1: 0, p2: 0, readout: 0 });
      p.moveError = 0;
      const r = runPlatform(id, compileFor(id, 3, ghz), 3, 400, mulberry32(3));
      Object.assign(p.noise, saved);
      p.moveError = savedMove;
      expect(r.counts[0] + r.counts[7]).toBe(400);
    }
  });

  it('atoms move only for gates between non-neighbours, and moving costs time', () => {
    const routed = compileFor('atoms', 4, [h(0), cx(0, 1), cx(0, 3), cx(1, 2)]);
    expect(atomMoves(routed)).toBe(1);
    const near = platformSchedule('atoms', compileFor('atoms', 2, [h(0), cx(0, 1)]), 2).duration;
    const far = platformSchedule('atoms', compileFor('atoms', 3, [h(0), cx(0, 2)]), 3).duration;
    expect(far - near).toBeGreaterThanOrEqual(2 * 150_000);
  });

  it('ions are slowest per gate but most accurate; superconducting is fastest', () => {
    const ops = [...dense, ...measureAll(4)];
    const ideal = run(4, dense, () => 0.5).state.probabilities();
    const r = comparePlatforms(4, ops.slice(0, dense.length), ideal, 3000, mulberry32(9));
    const by = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(by.ions.agreement).toBeGreaterThan(by.superconducting.agreement);
    expect(by.superconducting.micros).toBeLessThan(by.ions.micros);
    expect(by.ions.overhead).toBe('all-to-all: no SWAPs');
    expect(by.superconducting.overhead).toMatch(/SWAP/);
    // atoms: the camera readout dominates a shot
    expect(by.atoms.micros).toBeGreaterThan(10_000);
  });

  it('formats times from nanoseconds to milliseconds', () => {
    expect(formatTime(0.28)).toBe('280 ns');
    expect(formatTime(3.24)).toBe('3.2 us');
    expect(formatTime(412)).toBe('412 us');
    expect(formatTime(10_600)).toBe('11 ms');
    expect(formatTime(2_500)).toBe('2.5 ms');
  });
});
