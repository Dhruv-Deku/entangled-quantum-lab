import { describe, expect, it } from 'vitest';
import type { Op } from '../quantum/circuit';
import { autoName, gateable, Library, MAX_ITEMS, placeGate } from './library';

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

const bell: Op[] = [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'x', target: 1, controls: [0] }];

describe('the library', () => {
  it('saves circuits and gates, newest first, and they survive a reload', () => {
    const store = memoryStore();
    const lib = new Library(store);
    lib.add('circuit', 2, bell);
    lib.add('gate', 2, bell);
    expect(lib.circuits[0].name).toBe('H, CX');
    expect(lib.gates[0].name).toBe('G1');
    const again = new Library(store);
    expect(again.items).toHaveLength(2);
    expect(again.items[0].kind).toBe('gate');
  });

  it('renames (plain text, short), deletes, and keeps at most MAX_ITEMS', () => {
    const lib = new Library(memoryStore());
    const it = lib.add('circuit', 2, bell);
    lib.rename(it.id, 'My Bell pair ✓ with a very long extra name');
    expect(lib.items[0].name).toBe('My Bell pair  with a ver');
    lib.remove(it.id);
    expect(lib.items).toHaveLength(0);
    for (let k = 0; k < MAX_ITEMS + 5; k++) lib.add('circuit', 1, [{ kind: 'gate', gate: 'x', target: 0 }]);
    expect(lib.items).toHaveLength(MAX_ITEMS);
  });

  it('ignores corrupted storage instead of crashing', () => {
    const store = memoryStore();
    store.setItem('entangled.library.v1', '{not json');
    expect(new Library(store).items).toEqual([]);
    store.setItem('entangled.library.v1', JSON.stringify([{ id: 'a', kind: 'circuit', name: 'x', n: 9, ops: [] }, { nope: true }]));
    expect(new Library(store).items).toEqual([]);
  });

  it('a gate holds only gates, and drops onto any qubits', () => {
    expect(gateable(bell)).toBe(true);
    expect(gateable([...bell, { kind: 'measure', qubit: 0 }])).toBe(false);
    expect(() => new Library(memoryStore()).add('gate', 1, [{ kind: 'measure', qubit: 0 }])).toThrow();
    const lib = new Library(memoryStore());
    const g = lib.add('gate', 2, bell);
    expect(placeGate(g, [3, 1])).toEqual([{ kind: 'gate', gate: 'h', target: 3 }, { kind: 'gate', gate: 'x', target: 1, controls: [3] }]);
    expect(autoName([])).toBe('Empty');
  });
});
