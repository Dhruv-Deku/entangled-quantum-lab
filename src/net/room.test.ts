import { describe, expect, it } from 'vitest';
import { Lab } from '../lab/lab';
import { mulberry32 } from '../quantum/measure';
import { assignmentProgress, makeCode, parseCode, SharedRoom, type Msg, type Progress, type Role, type RoomHost, type Transport } from './room';

/** The relay, in memory, with the same rules as server/relay-core.mjs. */
class Bus {
  peers = new Map<string, (m: Msg) => void>();
  last: string | null = null;
  lastClass: string | null = null;
  queue: [string, Msg][] = [];
  transport(): Transport {
    let id = '';
    let deliver: (m: Msg) => void = () => {};
    return {
      send: (m) => {
        if (m.t === 'join') {
          id = m.from;
          this.peers.set(id, deliver);
          this.queue.push([id, { t: 'welcome', room: m.room, peers: [...this.peers.keys()].filter((p) => p !== id), last: this.last, lastClass: this.lastClass }]);
          return;
        }
        const text = JSON.stringify(m);
        if (m.t === 'sync') this.last = text;
        if (m.t === 'class') this.lastClass = text;
        const to = 'to' in m ? m.to : undefined;
        for (const pid of this.peers.keys()) if (pid !== id && (!to || to === pid)) this.queue.push([pid, JSON.parse(text) as Msg]);
      },
      listen: (onMessage, opened) => {
        deliver = onMessage;
        opened();
      },
      close: () => {
        this.peers.delete(id);
        for (const pid of this.peers.keys()) this.queue.push([pid, { t: 'left', from: id }]);
      },
    };
  }
  /** Deliver everything in flight (and whatever that causes). */
  flush(): void {
    for (let guard = 0; this.queue.length && guard < 1000; guard++) {
      const [to, m] = this.queue.shift()!;
      this.peers.get(to)?.(m);
    }
  }
}

function person(bus: Bus, code: string, id: string, name: string, role: Role, creator: boolean, seed: number) {
  const lab = new Lab(2, mulberry32(seed));
  const notes: string[] = [];
  const got: { assigned: number[]; shots: number } = { assigned: [], shots: 0 };
  const host: RoomHost = {
    snapshot: () => lab.history.toJSON(),
    restore: (h) => lab.restore({ history: h, selected: lab.selected }),
    showShots: () => void got.shots++,
    assigned: (m) => (got.assigned = m),
    changed: () => {},
    notify: (t) => notes.push(t),
  };
  const room = new SharedRoom(code, { id, name, role, owns: [], selected: 0 }, bus.transport(), host, creator);
  lab.on((e) => {
    if (e.type === 'op' || e.type === 'reset' || e.type === 'seek') room.localChange();
    if (e.type === 'shots') room.localShots(e.counts);
  });
  return { lab, room, notes, got };
}

describe('shared lab', () => {
  it('room codes say what kind of room they are, and survive being said aloud', () => {
    const code = makeCode('lab', mulberry32(5));
    expect(code).toMatch(/^L[A-Z2-9]{4}$/);
    expect(parseCode(`  ${code.toLowerCase().split('').join(' ')} `)).toBe(code);
    expect(parseCode('C7QF2')).toBe('C7QF2');
    expect(parseCode('hello')).toBeNull();
  });

  it('two people build one circuit: a late joiner catches up, changes go both ways, measurements agree', () => {
    const bus = new Bus();
    const ana = person(bus, 'LABCD', 'a1', 'Ana', 'student', true, 1);
    ana.lab.gate('h', 0);
    bus.flush();
    const ben = person(bus, 'LABCD', 'b2', 'Ben', 'student', false, 2);
    bus.flush();
    expect(ben.lab.history.toJSON()).toEqual(ana.lab.history.toJSON());
    expect(ana.notes).toContain('Ben joined.');
    ben.lab.entangle(0, 1);
    bus.flush();
    expect(ana.lab.history.length).toBe(2);
    // Ana measures; Ben gets her outcome, not a roll of his own
    const out = ana.lab.measure(0);
    bus.flush();
    const last = ben.lab.history.ops[2];
    expect(last.kind === 'measure' && last.outcome).toBe(out);
    expect(ben.lab.history.state.probabilities()).toEqual(ana.lab.history.state.probabilities());
    // undo travels too
    ben.lab.undo();
    bus.flush();
    expect(ana.lab.history.cursor).toBe(2);
    ana.lab.shots(100);
    bus.flush();
    expect(ben.got.shots).toBe(1);
  });

  it('simultaneous changes settle on the same circuit everywhere', () => {
    const bus = new Bus();
    const ana = person(bus, 'LABCD', 'a1', 'Ana', 'student', true, 1);
    const ben = person(bus, 'LABCD', 'b2', 'Ben', 'student', false, 2);
    bus.flush();
    ana.lab.gate('x', 0);
    ben.lab.gate('h', 1);
    bus.flush();
    expect(ana.lab.history.toJSON()).toEqual(ben.lab.history.toJSON());
  });

  it('each holding half a Bell pair: claimed qubits are off limits to the other, the teacher can still help', () => {
    const bus = new Bus();
    const ana = person(bus, 'LABCD', 'a1', 'Ana', 'student', true, 1);
    const ben = person(bus, 'LABCD', 'b2', 'Ben', 'student', false, 2);
    const tia = person(bus, 'LABCD', 't3', 'Tia', 'teacher', false, 3);
    bus.flush();
    expect(ana.room.claim(0)).toBe(true);
    expect(ben.room.claim(1)).toBe(true);
    bus.flush();
    expect(ben.room.claim(0)).toBe(false);
    expect(ben.notes).toContain('q0 belongs to Ana.');
    expect(ben.room.guard({ kind: 'gate', gate: 'h', target: 0 })).toMatch(/q0 belongs to Ana/);
    expect(ben.room.guard({ kind: 'measure', qubit: 0 })).toMatch(/Ana/);
    expect(ben.room.guard({ kind: 'measure', qubit: 1 })).toBeNull();
    // a two-qubit gate needs one of its qubits to be mine: that is how the pair gets entangled
    expect(ana.room.guard({ kind: 'gate', gate: 'x', target: 1, controls: [0] })).toBeNull();
    expect(tia.room.guard({ kind: 'gate', gate: 'h', target: 0 })).toBeNull();
    expect(tia.room.ownerOf(1)?.name).toBe('Ben');
    // releasing
    ana.room.claim(0);
    bus.flush();
    expect(ben.room.guard({ kind: 'gate', gate: 'h', target: 0 })).toBeNull();
  });

  it('a person leaving is noticed', () => {
    const bus = new Bus();
    const ana = person(bus, 'LABCD', 'a1', 'Ana', 'student', true, 1);
    const ben = person(bus, 'LABCD', 'b2', 'Ben', 'student', false, 2);
    bus.flush();
    ben.room.close();
    bus.flush();
    expect(ana.room.peers.size).toBe(0);
    expect(ana.notes).toContain('Ben left.');
  });
});

describe('classroom', () => {
  it('the teacher assigns modules, students (even late ones) get them, and progress comes back', () => {
    const bus = new Bus();
    const tia = person(bus, 'CABCD', 't3', 'Tia', 'teacher', true, 3);
    const sam = person(bus, 'CABCD', 's1', 'Sam', 'student', false, 1);
    bus.flush();
    tia.room.assign([2, 0, 2]);
    bus.flush();
    expect(sam.got.assigned).toEqual([0, 2]);
    const lee = person(bus, 'CABCD', 's2', 'Lee', 'student', false, 2);
    bus.flush();
    expect(lee.got.assigned).toEqual([0, 2]);
    // circuits are each person's own in a classroom
    sam.lab.gate('x', 0);
    bus.flush();
    expect(lee.lab.history.length).toBe(0);
    const p: Progress = { mode: 'course', module: 2, step: 3, steps: 6, done: [0] };
    sam.room.report(p);
    bus.flush();
    expect(tia.room.progress.get('s1')).toEqual(p);
    expect(assignmentProgress([0, 2], p, () => 6)).toEqual({ fraction: 0.75, complete: false });
    expect(assignmentProgress([0, 2], { ...p, done: [0, 2] }, () => 6).complete).toBe(true);
  });
});
