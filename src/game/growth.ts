import { addDays, DECK, sessionStreak, type MemoryState, type RecallCard } from './today';

/**
 * Your crystal: what you have learned, as a thing on your desk. Every idea
 * you have met in Today is a shard, in a spot of its own (so the crystal
 * keeps its shape as it grows), taller the better you know it; every day you
 * showed up is a ring around its base. It rests dim until today's five
 * minutes are done.
 */

export interface Shard {
  id: string;
  topic: string;
  /** Leitner box 1..5: how well it is known. */
  box: number;
  /** Where it stands on the base (metres from the centre) and how it leans outward. */
  x: number;
  z: number;
  lean: number;
  /** Height in metres. */
  height: number;
  color: string;
}

export interface Growth {
  shards: Shard[];
  /** Days with a finished session, newest first (as day keys), and the current streak. */
  days: string[];
  streak: number;
  /** Ideas on solid ground (boxes 4 and 5). */
  solid: number;
  todayDone: boolean;
}

/** Glass tints by family; gold stays for entanglement, as everywhere in the lab. */
const FAMILY: [RegExp, string][] = [
  [/entangle|cnot|ghz|teleport|superdense|no cloning|bb84/i, '#e2b04a'],
  [/phase|s gate|t gate/i, '#9b87f5'],
  [/superposition|measurement|x gate|interference/i, '#8fb7ff'],
  [/grover|noise|zeno/i, '#7bcb6a'],
  [/double slit|spin/i, '#3fc6c9'],
];

export function tintOf(topic: string): string {
  for (const [re, c] of FAMILY) if (re.test(topic)) return c;
  return '#c9d6ea';
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Shard height for a box: a sprout when just met, full height when solid. */
export const heightFor = (box: number) => 0.022 + 0.011 * Math.max(1, Math.min(5, box));

/** The crystal for this memory, today. Shard i of the deck always stands in the same spot. */
export function growthOf(mem: MemoryState, today: string, deck: readonly RecallCard[] = DECK): Growth {
  const shards: Shard[] = [];
  deck.forEach((c, i) => {
    const st = mem.cards[c.id];
    if (!st) return;
    // a sunflower spiral: early ideas at the heart, later ones further out
    const r = 0.0085 * Math.sqrt(i + 0.6);
    const a = i * GOLDEN;
    shards.push({ id: c.id, topic: c.topic, box: st.box, x: Math.cos(a) * r, z: Math.sin(a) * r, lean: Math.min(0.55, r * 9), height: heightFor(st.box), color: tintOf(c.topic) });
  });
  const days = Object.keys(mem.sessions).sort().reverse();
  return {
    shards,
    days,
    streak: sessionStreak(mem, today),
    solid: shards.filter((s) => s.box >= 4).length,
    todayDone: !!mem.sessions[today],
  };
}

/** What grew between two crystals: new shards and shards that rose a box. */
export function grewSince(before: Growth, after: Growth): { fresh: string[]; rose: string[] } {
  const was = new Map(before.shards.map((s) => [s.id, s.box]));
  return {
    fresh: after.shards.filter((s) => !was.has(s.id)).map((s) => s.id),
    rose: after.shards.filter((s) => (was.get(s.id) ?? 99) < s.box).map((s) => s.id),
  };
}

/** The last 30 days as rings, oldest first: did you show up? (The crystal's base shows them.) */
export function ringDays(g: Growth, today: string, count = 30): boolean[] {
  const set = new Set(g.days);
  return Array.from({ length: count }, (_, i) => set.has(addDays(today, i - count + 1)));
}
