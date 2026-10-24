import { describe as group, expect, it } from 'vitest';
import { parseVoice } from './voice';

group('voice commands', () => {
  it('gates, however they are said', () => {
    expect(parseVoice('Hadamard on qubit two')).toEqual({ type: 'gate', gate: 'h', qubit: 2 });
    expect(parseVoice('h on 2')).toEqual({ type: 'gate', gate: 'h', qubit: 2 });
    expect(parseVoice('hadamard on qubit to')).toEqual({ type: 'gate', gate: 'h', qubit: 2 });
    expect(parseVoice('apply X to qubit zero')).toEqual({ type: 'gate', gate: 'x', qubit: 0 });
    expect(parseVoice('bit flip on one')).toEqual({ type: 'gate', gate: 'x', qubit: 1 });
    expect(parseVoice('phase flip qubit 1')).toEqual({ type: 'gate', gate: 'z', qubit: 1 });
    expect(parseVoice('T gate')).toEqual({ type: 'gate', gate: 't', qubit: null });
    expect(parseVoice('S dagger on qubit three')).toEqual({ type: 'gate', gate: 'sdg', qubit: 3 });
    expect(parseVoice('square root of x on 0')).toEqual({ type: 'gate', gate: 'sx', qubit: 0 });
  });

  it('two-qubit commands', () => {
    expect(parseVoice('entangle zero and one')).toEqual({ type: 'cnot', control: 0, target: 1 });
    expect(parseVoice('CNOT from qubit one to qubit two')).toEqual({ type: 'cnot', control: 1, target: 2 });
    expect(parseVoice('see not 2 3')).toEqual({ type: 'cnot', control: 2, target: 3 });
    expect(parseVoice('swap qubits 0 and 2')).toEqual({ type: 'swap', a: 0, b: 2 });
    expect(parseVoice('entangle zero')).toBeNull();
  });

  it('rotations with angles and axes', () => {
    const r = parseVoice('rotate qubit zero by pi over four around x');
    expect(r).toMatchObject({ type: 'gate', gate: 'rx', qubit: 0 });
    expect((r as { params: number[] }).params[0]).toBeCloseTo(Math.PI / 4, 12);
    expect((parseVoice('turn qubit 1 by 90 degrees') as { params: number[] }).params[0]).toBeCloseTo(Math.PI / 2, 12);
    expect(parseVoice('rotate qubit 2 by a half turn about zed')).toMatchObject({ gate: 'rz', qubit: 2, params: [Math.PI] });
    expect((parseVoice('rotate by minus pi over 2') as { params: number[]; qubit: null }).params[0]).toBeCloseTo(-Math.PI / 2, 12);
  });

  it('measuring, shots and the rest', () => {
    expect(parseVoice('measure qubit one')).toEqual({ type: 'measure', qubit: 1 });
    expect(parseVoice('measure everything')).toEqual({ type: 'measure', qubit: 'all' });
    expect(parseVoice('run a thousand shots')).toEqual({ type: 'shots', count: 1000 });
    expect(parseVoice('100 shots')).toEqual({ type: 'shots', count: 100 });
    expect(parseVoice('run')).toEqual({ type: 'shots', count: 100 });
    expect(parseVoice('undo that')).toEqual({ type: 'undo' });
    expect(parseVoice('add a qubit')).toEqual({ type: 'add' });
    expect(parseVoice('select qubit three')).toEqual({ type: 'select', qubit: 3 });
    expect(parseVoice('answer two')).toEqual({ type: 'answer', index: 1 });
    expect(parseVoice('show me')).toEqual({ type: 'showme' });
    expect(parseVoice('open the code')).toEqual({ type: 'code' });
    expect(parseVoice('next')).toEqual({ type: 'next' });
    expect(parseVoice('what is the weather')).toBeNull();
    expect(parseVoice('')).toBeNull();
  });
});

group('voice: shared rooms', () => {
  it('joins rooms spelled out, claims qubits, starts and leaves labs', () => {
    expect(parseVoice('join room L K seven Q F')).toEqual({ type: 'join', code: 'LK7QF' });
    expect(parseVoice('join LK7QF')).toEqual({ type: 'join', code: 'LK7QF' });
    expect(parseVoice('claim qubit one')).toEqual({ type: 'claim', qubit: 1 });
    expect(parseVoice('release this qubit')).toEqual({ type: 'claim', qubit: null });
    expect(parseVoice('start a shared lab')).toEqual({ type: 'share' });
    expect(parseVoice('leave the room')).toEqual({ type: 'leave' });
    expect(parseVoice('open the classroom')).toEqual({ type: 'classroom' });
    expect(parseVoice('assign module three')).toEqual({ type: 'assign', module: 2, on: true });
    expect(parseVoice('unassign module 12')).toEqual({ type: 'assign', module: 11, on: false });
  });
});
