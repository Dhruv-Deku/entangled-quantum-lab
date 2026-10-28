import type { Op } from '../quantum/circuit';
import type { GateName } from '../quantum/gates';
import { mulberry32 } from '../quantum/measure';

/**
 * Today: five minutes a day, the length of a bus ride. A short session of
 * cards: the ideas you have met come back just before you would forget them
 * (spaced repetition, Leitner boxes), and one or two new ones join each day.
 * Some cards ask; others say "make this state" and you build it with your
 * hands. Right first time moves a card up a box and further into the future;
 * a miss sends it back to tomorrow.
 */

export type CardKind = 'quiz' | 'make';

export interface RecallCard {
  id: string;
  /** What it is about, on the memory board. */
  topic: string;
  kind: CardKind;
  /** The question, or the state to make. */
  prompt: string;
  /** Quiz: three answers, the right one first (shown shuffled). */
  choices?: [string, string, string];
  /** Make: the qubits and a shortest way to the state (its length is par). */
  qubits?: number;
  solution?: Op[];
  /** Why, shown once answered. */
  why: string;
}

const g = (gate: GateName, target: number, controls?: number[]): Op => ({ kind: 'gate', gate, target, ...(controls ? { controls } : {}) });

/** The deck, in the order new cards are introduced. */
export const DECK: RecallCard[] = [
  { id: 'plus', topic: 'Superposition', kind: 'make', prompt: 'Make the plus state, |0> + |1>', qubits: 1, solution: [g('h', 0)], why: 'H turns |0> into an equal mix of 0 and 1: measure it and each comes up half the time.' },
  { id: 'measure-plus', topic: 'Measurement', kind: 'quiz', prompt: 'A qubit in |0> + |1> is measured 100 times. How many 1s?', choices: ['About 50', 'Exactly 100', 'None'], why: 'Each measurement is a fair coin: about half are 1, and nothing decides which ones.' },
  { id: 'one', topic: 'X gate', kind: 'make', prompt: 'Flip the qubit: make |1>', qubits: 1, solution: [g('x', 0)], why: 'X is the quantum NOT: it swaps 0 and 1.' },
  { id: 'hh', topic: 'Interference', kind: 'quiz', prompt: 'What do two H gates in a row do to |0>?', choices: ['Bring it back to |0>', 'Make |1>', 'Give a random 0 or 1'], why: 'The two ways to reach |1> cancel out: interference undoes the first H.' },
  { id: 'bell', topic: 'Entanglement', kind: 'make', prompt: 'Make a Bell pair, |00> + |11>', qubits: 2, solution: [g('h', 0), g('x', 1, [0])], why: 'H then CNOT: the two qubits always agree, though each alone is random.' },
  { id: 'bell-measure', topic: 'Entanglement', kind: 'quiz', prompt: 'In |00> + |11>, qubit 0 is measured: 1. What is qubit 1?', choices: ['Surely 1', 'Surely 0', 'Still half and half'], why: 'Entangled outcomes are perfectly correlated, however far apart the qubits are.' },
  { id: 'minus', topic: 'Phase', kind: 'make', prompt: 'Make the minus state, |0> - |1>', qubits: 1, solution: [g('h', 0), g('z', 0)], why: 'Z flips the sign of |1>. The odds stay 50/50; the phase only shows when paths interfere.' },
  { id: 'z-odds', topic: 'Phase', kind: 'quiz', prompt: 'Z on |0> + |1>: what happens to the chance of a 1?', choices: ['Nothing', 'It doubles', 'It drops to zero'], why: 'Z changes only the phase. Another H would turn that phase into different odds.' },
  { id: 'no-signal', topic: 'Entanglement', kind: 'quiz', prompt: 'Can entanglement send a message faster than light?', choices: ['No', 'Yes', 'Only with three qubits'], why: 'Each side alone sees random results. The pattern only appears when you compare notes, by ordinary means.' },
  { id: 'cnot', topic: 'CNOT', kind: 'quiz', prompt: 'CNOT, control |1>, target |0>: what comes out?', choices: ['|11>', '|10>', '|00>'], why: 'The control is 1, so the target flips.' },
  { id: 'anti', topic: 'Entanglement', kind: 'make', prompt: 'Make two qubits that always disagree, |01> + |10>', qubits: 2, solution: [g('h', 0), g('x', 1, [0]), g('x', 1)], why: 'A Bell pair with one qubit flipped: now every measurement disagrees.' },
  { id: 'no-clone', topic: 'No cloning', kind: 'quiz', prompt: 'Can you copy an unknown qubit?', choices: ['No', 'Yes, with a CNOT', 'Yes, with two H gates'], why: 'CNOT copies 0 and 1, but a superposition gets entangled instead of copied: the no-cloning theorem.' },
  { id: 'iplus', topic: 'S gate', kind: 'make', prompt: 'Make |0> + i|1>, the arrow along y', qubits: 1, solution: [g('h', 0), g('s', 0)], why: 'S adds a quarter turn of phase: from x round to y.' },
  { id: 's-twice', topic: 'S gate', kind: 'quiz', prompt: 'Two S gates in a row make which gate?', choices: ['Z', 'X', 'H'], why: 'S is a quarter turn about z; two of them are the half turn, Z.' },
  { id: 'ghz', topic: 'GHZ', kind: 'make', prompt: 'Make three qubits that all agree, |000> + |111>', qubits: 3, solution: [g('h', 0), g('x', 1, [0]), g('x', 2, [1])], why: 'One H and a chain of CNOTs: a GHZ state.' },
  { id: 'teleport', topic: 'Teleportation', kind: 'quiz', prompt: 'Teleporting a qubit needs a Bell pair and what else?', choices: ['Two ordinary bits', 'A faster-than-light link', 'A copy of the qubit'], why: 'Alice measures and sends two bits; Bob fixes his half with X and Z. Her qubit is gone: nothing was copied.' },
  { id: 'plus-plus', topic: 'Superposition', kind: 'make', prompt: 'Make all four outcomes equally likely on two qubits', qubits: 2, solution: [g('h', 0), g('h', 1)], why: 'One H each: 2 qubits give 4 equal outcomes, n qubits give 2^n.' },
  { id: 'superdense', topic: 'Superdense coding', kind: 'quiz', prompt: 'With a shared Bell pair, one qubit can carry how many bits?', choices: ['Two', 'One', 'Four'], why: 'One of four gates on your half picks one of four Bell states: two bits.' },
  { id: 'grover', topic: 'Grover search', kind: 'quiz', prompt: 'Grover search over 4 items: how many steps to find the marked one?', choices: ['One', 'Two', 'Four'], why: 'With two qubits, one Grover step turns the state all the way onto the answer.' },
  { id: 'bb84', topic: 'BB84', kind: 'quiz', prompt: 'How do Alice and Bob notice a spy on their key?', choices: ['Errors in a sample of it', 'The key arrives late', 'The qubits get heavier'], why: 'Measuring in the wrong basis disturbs qubits: about a quarter of the sample comes out wrong.' },
  { id: 'decoherence', topic: 'Noise', kind: 'quiz', prompt: 'What makes real qubits lose their superposition?', choices: ['The environment', 'Measuring them twice', 'The H gate'], why: 'Heat, stray fields and light carry information away: decoherence. Hence chips at 10 thousandths of a kelvin.' },
  { id: 'zeno', topic: 'Zeno effect', kind: 'quiz', prompt: 'Measuring a qubit again and again, very fast, does what?', choices: ['Freezes it', 'Speeds it up', 'Copies it'], why: 'The quantum Zeno effect: each look resets the slow drift before it can grow.' },
  { id: 'double-slit', topic: 'Double slit', kind: 'quiz', prompt: 'Watch which slit each photon takes, and the stripes...', choices: ['Vanish', 'Get brighter', 'Double'], why: 'Knowing the path destroys the interference: the two slits add as plain odds.' },
  { id: 'spin', topic: 'Spin', kind: 'quiz', prompt: 'Silver atoms through one Z magnet land in how many spots?', choices: ['Two', 'One long smear', 'Three'], why: 'Spin along an axis is quantised: up or down, never in between.' },
];

/** Days until a card in box 1..5 comes back. */
export const INTERVALS = [1, 2, 4, 8, 16];
export const SESSION_SIZE = 5;
/** New cards a session, at most. */
export const NEW_PER_DAY = 3;

export interface CardState {
  /** Leitner box, 1 (tomorrow) to 5 (in 16 days). */
  box: number;
  /** Day key when it is next due. */
  due: string;
  seen: number;
  right: number;
}

export interface MemoryState {
  cards: Record<string, CardState>;
  /** Sessions finished, by day. */
  sessions: Record<string, { cards: number; right: number }>;
}

export const emptyMemory = (): MemoryState => ({ cards: {}, sessions: {} });

/** A day key (YYYY-MM-DD) n days later. */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Record an answer: right first time moves the card up a box, a miss sends it back to box 1. */
export function review(st: MemoryState, id: string, correct: boolean, today: string): MemoryState {
  const prev = st.cards[id];
  const box = correct ? Math.min(5, (prev?.box ?? 0) + 1) : 1;
  const card: CardState = { box, due: addDays(today, INTERVALS[box - 1]), seen: (prev?.seen ?? 0) + 1, right: (prev?.right ?? 0) + (correct ? 1 : 0) };
  return { ...st, cards: { ...st.cards, [id]: card } };
}

/** Mark today's session finished. */
export function finishSession(st: MemoryState, today: string, cards: number, right: number): MemoryState {
  return { ...st, sessions: { ...st.sessions, [today]: { cards, right } } };
}

/** The cards due on or before today, those waiting longest and in the lowest boxes first. */
export function dueCards(st: MemoryState, today: string, deck: readonly RecallCard[] = DECK): RecallCard[] {
  return deck
    .filter((c) => st.cards[c.id] && st.cards[c.id].due <= today)
    .sort((a, b) => st.cards[a.id].box - st.cards[b.id].box || st.cards[a.id].due.localeCompare(st.cards[b.id].due));
}

/**
 * Today's session: due cards first (up to four), then new ones in deck
 * order (at most three a day), always with at least one card to make with your
 * hands. With nothing due and nothing new, the cards furthest from mastery
 * come round for practice.
 */
export function planSession(st: MemoryState, today: string, deck: readonly RecallCard[] = DECK): RecallCard[] {
  const due = dueCards(st, today, deck).slice(0, SESSION_SIZE - 1);
  const fresh = deck.filter((c) => !st.cards[c.id]);
  const plan = [...due];
  for (const c of fresh) {
    if (plan.length >= SESSION_SIZE || plan.length - due.length >= NEW_PER_DAY) break;
    plan.push(c);
  }
  if (plan.length < SESSION_SIZE && !fresh.length) {
    // all met, none due: practice the least certain ones
    const rest = deck.filter((c) => !plan.includes(c)).sort((a, b) => st.cards[a.id].box - st.cards[b.id].box || st.cards[a.id].due.localeCompare(st.cards[b.id].due));
    plan.push(...rest.slice(0, SESSION_SIZE - plan.length));
  }
  if (!plan.some((c) => c.kind === 'make')) {
    const make = deck.find((c) => c.kind === 'make' && !plan.includes(c) && !st.cards[c.id]) ?? deck.filter((c) => c.kind === 'make' && !plan.includes(c)).sort((a, b) => (st.cards[a.id]?.due ?? '').localeCompare(st.cards[b.id]?.due ?? ''))[0];
    if (make) {
      if (plan.length >= SESSION_SIZE) plan[plan.length - 1] = make;
      else plan.push(make);
    }
  }
  return plan;
}

/** How well the deck is known: unseen, learning (boxes 1 to 3) and solid (4 and 5). */
export function mastery(st: MemoryState, deck: readonly RecallCard[] = DECK): { unseen: number; learning: number; solid: number; total: number; boxes: number[] } {
  const boxes = [0, 0, 0, 0, 0, 0];
  for (const c of deck) boxes[st.cards[c.id]?.box ?? 0]++;
  return { unseen: boxes[0], learning: boxes[1] + boxes[2] + boxes[3], solid: boxes[4] + boxes[5], total: deck.length, boxes };
}

/** Days in a row with a finished session, up to today (or up to yesterday, if today's is still to come). */
export function sessionStreak(st: MemoryState, today: string): number {
  let day = st.sessions[today] ? today : addDays(today, -1);
  let n = 0;
  while (st.sessions[day]) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/** How many cards come back tomorrow (and how many new ones could join). */
export function tomorrow(st: MemoryState, today: string, deck: readonly RecallCard[] = DECK): { due: number; fresh: number } {
  const t = addDays(today, 1);
  return { due: deck.filter((c) => st.cards[c.id] && st.cards[c.id].due <= t).length, fresh: Math.min(NEW_PER_DAY, deck.filter((c) => !st.cards[c.id]).length) };
}

/** A quiz's answers in a fixed shuffled order for this card and day; `right` is where the right one went. */
export function shuffledChoices(card: RecallCard, today: string): { labels: string[]; right: number } {
  const labels = [...(card.choices ?? [])];
  let h = 2166136261;
  for (const ch of `${card.id}:${today}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rng = mulberry32(h >>> 0);
  const order = [0, 1, 2].sort(() => rng() - 0.5);
  return { labels: order.map((i) => labels[i]), right: order.indexOf(0) };
}

/** Moves allowed for "right first time" on a make card: par plus two. */
export const parOf = (card: RecallCard) => card.solution?.length ?? 0;

// ---------------------------------------------------------------- storage

const KEY = 'entangled.memory.v1';

export function parseMemory(raw: string | null): MemoryState {
  if (!raw) return emptyMemory();
  try {
    const d = JSON.parse(raw) as Partial<MemoryState>;
    const out = emptyMemory();
    for (const [id, c] of Object.entries(d.cards ?? {})) {
      if (!c || typeof c.box !== 'number' || typeof c.due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.due)) continue;
      out.cards[id] = { box: Math.max(1, Math.min(5, Math.round(c.box))), due: c.due, seen: Number(c.seen) || 0, right: Number(c.right) || 0 };
    }
    for (const [day, s] of Object.entries(d.sessions ?? {})) if (/^\d{4}-\d{2}-\d{2}$/.test(day) && s) out.sessions[day] = { cards: Number(s.cards) || 0, right: Number(s.right) || 0 };
    return out;
  } catch {
    return emptyMemory();
  }
}

export function loadMemory(): MemoryState {
  try {
    return parseMemory(globalThis.localStorage?.getItem(KEY) ?? null);
  } catch {
    return emptyMemory();
  }
}

export function saveMemory(st: MemoryState): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(st));
  } catch {
    // storage full or private mode: today's progress lasts this session
  }
}

// ---------------------------------------------------------------- the time of day

export type PartOfDay = 'morning' | 'day' | 'evening' | 'night';

export function partOfDay(hour: number): PartOfDay {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export const GREETING: Record<PartOfDay, string> = { morning: 'Good morning', day: 'Good afternoon', evening: 'Good evening', night: 'Late night' };

/**
 * Wind down: an evening review, calm and short. Only ideas you have already
 * met (the ones due first, then the least certain), at most four, nothing
 * new. A first-ever session falls back to the usual start.
 */
export function planWindDown(st: MemoryState, today: string, deck: readonly RecallCard[] = DECK): RecallCard[] {
  const seen = deck.filter((c) => st.cards[c.id]);
  if (!seen.length) return planSession(st, today, deck);
  const due = dueCards(st, today, deck);
  const rest = seen.filter((c) => !due.includes(c)).sort((a, b) => st.cards[a.id].box - st.cards[b.id].box || st.cards[a.id].due.localeCompare(st.cards[b.id].due));
  return [...due, ...rest].slice(0, due.length ? 4 : 3);
}
