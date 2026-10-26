/**
 * Daily quests: three small tasks a day, the same for everyone, picked by the
 * date from a pool. Each counts something the player does anyway (gates,
 * shots, Bell pairs, a Rush score ...) from zero each day, and pays XP.
 */

export type QuestCounter = 'gates' | 'shots' | 'bell' | 'measure' | 'rush' | 'album' | 'chapter' | 'wonder' | 'code' | 'worlds' | 'puzzle' | 'machine';

export interface QuestDef {
  id: string;
  text: string;
  counter: QuestCounter;
  goal: number;
  /** For a Rush score: the best of the day, not a sum. */
  max?: boolean;
}

export const QUEST_POOL: QuestDef[] = [
  { id: 'gates30', text: 'Apply 30 gates', counter: 'gates', goal: 30 },
  { id: 'shots500', text: 'Run 500 shots', counter: 'shots', goal: 500 },
  { id: 'bell2', text: 'Make 2 Bell pairs', counter: 'bell', goal: 2 },
  { id: 'measure10', text: 'Measure 10 times', counter: 'measure', goal: 10 },
  { id: 'rush1000', text: 'Score 1,000 in one Quantum Rush', counter: 'rush', goal: 1000, max: true },
  { id: 'album1', text: 'Collect a state for your album', counter: 'album', goal: 1 },
  { id: 'chapter1', text: 'Finish a chapter, lesson or puzzle', counter: 'chapter', goal: 1 },
  { id: 'wonder3', text: 'Try 3 things on the Play tab', counter: 'wonder', goal: 3 },
  { id: 'code2', text: 'Run 2 programs in the Code Lab', counter: 'code', goal: 2 },
  { id: 'worlds1', text: 'Open the Many worlds view', counter: 'worlds', goal: 1 },
  { id: 'puzzle2', text: 'Win 2 Play tab games', counter: 'puzzle', goal: 2 },
  { id: 'machine2', text: 'Run on 2 kinds of quantum computer', counter: 'machine', goal: 2 },
];

export interface QuestState {
  day: string;
  progress: Record<string, number>;
  done: string[];
  /** Quests finished on every day so far (for XP). */
  total: number;
}

export const emptyQuests = (): QuestState => ({ day: '', progress: {}, done: [], total: 0 });

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Today's three quests: picked by the date, all counting different things. */
export function questsFor(day: string): QuestDef[] {
  const out: QuestDef[] = [];
  let h = hash(`quests:${day}`);
  const pool = [...QUEST_POOL];
  while (out.length < 3 && pool.length) {
    const q = pool.splice(h % pool.length, 1)[0];
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    if (!out.some((o) => o.counter === q.counter)) out.push(q);
  }
  return out;
}

/** Count something toward today's quests; returns the ones this finished. A new day starts from zero. */
export function bump(state: QuestState, day: string, counter: QuestCounter, amount = 1): QuestDef[] {
  if (state.day !== day) {
    state.day = day;
    state.progress = {};
    state.done = [];
  }
  const fresh: QuestDef[] = [];
  for (const q of questsFor(day)) {
    if (q.counter !== counter || state.done.includes(q.id)) continue;
    const have = state.progress[q.id] ?? 0;
    state.progress[q.id] = q.max ? Math.max(have, amount) : have + amount;
    if (state.progress[q.id] >= q.goal) {
      state.done.push(q.id);
      state.total++;
      fresh.push(q);
    }
  }
  return fresh;
}
