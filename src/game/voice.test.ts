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
    // any question goes to Ket, who says what it can help with
    expect(parseVoice('what is the weather')).toEqual({ type: 'ask', text: 'what is the weather' });
    expect(parseVoice('lovely day outside')).toBeNull();
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

group('voice: views', () => {
  it('switches the big-state views, including the circuit unitary', () => {
    for (const s of ['next view', 'show the q sphere', 'state city', 'heat map', 'show the unitary', 'show me the matrix']) expect(parseVoice(s), s).toEqual({ type: 'view' });
  });
});

group('voice: daily, progress, listening, pictures', () => {
  it('understands the engagement commands', () => {
    expect(parseVoice("open today's daily challenge")).toEqual({ type: 'daily' });
    expect(parseVoice('daily puzzle')).toEqual({ type: 'daily' });
    expect(parseVoice('show my achievements')).toEqual({ type: 'profile' });
    expect(parseVoice('trophies')).toEqual({ type: 'profile' });
    expect(parseVoice('listen')).toEqual({ type: 'listen' });
    expect(parseVoice('play the state')).toEqual({ type: 'listen' });
    expect(parseVoice('take a picture')).toEqual({ type: 'snapshot' });
  });
});

group('voice: machines at full size', () => {
  it('stands the machine 1:1 beside the desk, and puts it back', () => {
    for (const s of ['full size', 'show it life size', 'make the fridge real size', 'actual size please']) expect(parseVoice(s), s).toEqual({ type: 'fullsize', on: true });
    for (const s of ['back on the desk', 'shrink it', 'full size off']) expect(parseVoice(s), s).toEqual({ type: 'fullsize', on: false });
    expect(parseVoice('compare the machines')).toEqual({ type: 'compare' });
  });
});

group('voice: new powers', () => {
  it('opens many worlds, starts Quantum Rush, and changes the orb finish', () => {
    for (const s of ['many worlds', 'show me every path', 'all the paths']) expect(parseVoice(s), s).toEqual({ type: 'view', worlds: true });
    for (const s of ['quantum rush', 'start the rush', 'arcade']) expect(parseVoice(s), s).toEqual({ type: 'rush' });
    for (const s of ['next skin', 'change look', 'skins']) expect(parseVoice(s), s).toEqual({ type: 'skin' });
    expect(parseVoice('next view')).toEqual({ type: 'view' });
  });
});

group('voice: the Play tab', () => {
  it('opens each wonder by name', () => {
    const cases: [string, string][] = [
      ['zen rush', 'Zen Rush'],
      ['rush versus', 'Rush versus'],
      ['race my friends', 'Rush versus'],
      ['start a class challenge', 'Class challenge'],
      ['quantum tic tac toe', 'Quantum tic-tac-toe'],
      ['show me the double slit', 'Double slit'],
      ['stern gerlach', 'Stern-Gerlach'],
      ['the bomb tester', 'Bomb tester'],
      ['roll the dice', 'Quantum dice'],
      ['penny flip', 'Penny flip'],
      ['schrodinger', 'Schrodinger cat'],
      ['open my album', 'State album'],
      ['giant sphere', 'Giant sphere'],
      ['inside the qubit', 'Inside a qubit'],
      ['night sky', 'Night sky'],
      ['show the history', 'History'],
      ['ambient music', 'Ambient music'],
    ];
    for (const [s, item] of cases) expect(parseVoice(s), s).toEqual({ type: 'play', item });
    expect(parseVoice('quantum rush')).toEqual({ type: 'rush' });
  });

  it('reaches every setting by voice: the room and accessibility', () => {
    expect(parseVoice('settings')).toEqual({ type: 'settings' });
    expect(parseVoice('open the settings')).toEqual({ type: 'settings' });
    expect(parseVoice('pin the lab here')).toEqual({ type: 'pin', on: true });
    expect(parseVoice('unpin the lab')).toEqual({ type: 'pin', on: false });
    expect(parseVoice('high contrast')).toEqual({ type: 'contrast' });
    expect(parseVoice('turn on look to select')).toEqual({ type: 'look' });
    expect(parseVoice('show captions')).toEqual({ type: 'captions' });
    expect(parseVoice('put the double slit on my wall')).toEqual({ type: 'wall' });
    expect(parseVoice('my five minutes')).toEqual({ type: 'play', item: 'Today' });
    expect(parseVoice('wind down')).toEqual({ type: 'play', item: 'Wind down' });
    expect(parseVoice('show me the supercomputer')).toEqual({ type: 'play', item: 'Supercomputer' });
    expect(parseVoice('open quantum AI')).toEqual({ type: 'play', item: 'Quantum AI' });
    expect(parseVoice('go home')).toEqual({ type: 'home' });
    expect(parseVoice('customize my qubits')).toEqual({ type: 'studio' });
    expect(parseVoice('change the colours')).toEqual({ type: 'studio' });
    expect(parseVoice('neural network')).toEqual({ type: 'play', item: 'Quantum AI' });
    expect(parseVoice('open the state sculptor')).toEqual({ type: 'play', item: 'State sculptor' });
    expect(parseVoice('load my data')).toEqual({ type: 'play', item: 'State sculptor' });
    expect(parseVoice('show me inside an atom')).toEqual({ type: 'play', item: 'Inside an atom' });
    expect(parseVoice('the galton board')).toEqual({ type: 'play', item: 'Quantum Galton board' });
    expect(parseVoice('quantum tunnelling')).toEqual({ type: 'play', item: 'Tunnelling' });
    expect(parseVoice('pull the molecule apart')).toEqual({ type: 'play', item: 'Pull a molecule apart' });
    expect(parseVoice('ride my circuit')).toEqual({ type: 'play', item: 'Ride your circuit' });
    expect(parseVoice('something calm before bed')).toEqual({ type: 'play', item: 'Wind down' });
    expect(parseVoice("start today's cards")).toEqual({ type: 'play', item: 'Today' });
    expect(parseVoice("today's puzzle")).toEqual({ type: 'daily' });
    // the play list still wins for its own names
    expect(parseVoice('show me the double slit')).toEqual({ type: 'play', item: 'Double slit' });
  });

  it('asks Ket, the lab partner, and quiets it', () => {
    expect(parseVoice('what just happened')).toEqual({ type: 'ask', text: 'what just happened' });
    expect(parseVoice('hey Ket, what is entanglement?')).toEqual({ type: 'ask', text: 'what is entanglement' });
    expect(parseVoice('help')).toEqual({ type: 'ask', text: 'help' });
    expect(parseVoice("I'm stuck")).toEqual({ type: 'ask', text: 'i m stuck' });
    expect(parseVoice('be quiet')).toEqual({ type: 'partner', on: false });
    expect(parseVoice('Ket')).toEqual({ type: 'partner', on: true });
    // commands still work
    expect(parseVoice('Hadamard on qubit two')).toEqual({ type: 'gate', gate: 'h', qubit: 2 });
    expect(parseVoice('show me')).toEqual({ type: 'showme' });
  });
});
