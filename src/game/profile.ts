import { blochVector } from '../quantum/bloch';
import type { Op } from '../quantum/circuit';
import { pairStrength } from '../quantum/entanglement';
import type { QState } from '../quantum/state';

/**
 * Achievements, XP and levels. The profile counts what the player does (gates,
 * shots, rewinds, the features they try) and, together with their progress in
 * the course, chapters, lessons, puzzles and daily challenges, unlocks
 * achievements. Pure data: the UI saves it and shows the toasts.
 */

export interface Stats {
  gates: number;
  measures: number;
  shots: number;
  rewinds: number;
  bellPairs: number;
  /** Largest GHZ state made (number of qubits). */
  ghz: number;
  /** Features tried: 'debugger', 'voice', 'listen', 'snapshot', 'shared', 'view:qsphere', ... */
  used: string[];
}

export interface ProfileData {
  stats: Stats;
  /** Achievement id -> when it was unlocked (ms). */
  unlocked: Record<string, number>;
}

/** Progress that lives elsewhere (the campaign and the daily record). */
export interface ProgressContext {
  chaptersDone: string[];
  chapterCount: number;
  lessonsDone: number;
  lessonCount: number;
  courseDone: number;
  courseCount: number;
  /** Stars per regular puzzle (0-3). */
  stars: number[];
  dailyDays: number;
  streak: number;
}

export interface Achievement {
  id: string;
  title: string;
  text: string;
  done: (s: Stats, c: ProgressContext) => boolean;
  /** For counters: [have, need]. */
  progress?: (s: Stats, c: ProgressContext) => [number, number];
}

const used = (s: Stats, f: string) => s.used.includes(f);
const VIEWS = ['qsphere', 'city', 'heatmap', 'unitary'];
const counter = (id: string, title: string, text: string, have: (s: Stats, c: ProgressContext) => number, need: (c: ProgressContext) => number): Achievement => ({
  id,
  title,
  text,
  done: (s, c) => have(s, c) >= need(c),
  progress: (s, c) => [Math.min(have(s, c), need(c)), need(c)],
});

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-gate', title: 'First move', text: 'Apply your first gate.', done: (s) => s.gates >= 1 },
  { id: 'superposition', title: 'Both at once', text: 'Put a qubit on the equator.', done: (s) => used(s, 'superposition') },
  { id: 'measure', title: 'Look!', text: 'Measure a qubit.', done: (s) => s.measures >= 1 },
  { id: 'bell', title: 'Spooky action', text: 'Make your first Bell pair.', done: (s) => s.bellPairs >= 1 },
  { id: 'ghz5', title: 'All for one', text: 'Make a five-qubit GHZ state.', done: (s) => s.ghz >= 5 },
  counter('shots', 'Rainmaker', 'Run 1,000 shots in total.', (s) => s.shots, () => 1000),
  { id: 'rewind', title: 'Time traveller', text: 'Rewind the timeline.', done: (s) => s.rewinds >= 1 },
  counter('chapters5', 'Storyteller', 'Finish five chapters.', (_s, c) => c.chaptersDone.length, () => 5),
  counter('chapters-all', 'The whole story', 'Finish every chapter.', (_s, c) => c.chaptersDone.length, (c) => c.chapterCount),
  counter('lessons', 'Every gate', 'Finish every lesson.', (_s, c) => c.lessonsDone, (c) => c.lessonCount),
  counter('course', 'Graduate', 'Finish the whole course.', (_s, c) => c.courseDone, (c) => c.courseCount),
  counter('puzzles', 'Perfectionist', 'Three stars on every puzzle.', (_s, c) => c.stars.filter((n) => n === 3).length, (c) => c.stars.length),
  { id: 'daily', title: 'Daily dose', text: 'Solve a daily challenge.', done: (_s, c) => c.dailyDays >= 1 },
  counter('streak3', 'Habit', 'A three-day daily streak.', (_s, c) => c.streak, () => 3),
  counter('streak7', 'Devoted', 'A seven-day daily streak.', (_s, c) => c.streak, () => 7),
  { id: 'bell-test', title: 'Beyond classical', text: 'Win the Bell Test chapter.', done: (_s, c) => c.chaptersDone.includes('Bell Test') },
  { id: 'qec', title: 'Error free', text: 'Finish Error Correction.', done: (_s, c) => c.chaptersDone.includes('Error Correction') },
  counter('views', 'Big picture', 'Try all four big-state views.', (s) => VIEWS.filter((v) => used(s, `view:${v}`)).length, () => VIEWS.length),
  { id: 'debugger', title: 'Inspector', text: 'Open the step debugger.', done: (s) => used(s, 'debugger') },
  { id: 'voice', title: 'Say it', text: 'Give a voice command.', done: (s) => used(s, 'voice') },
  { id: 'listen', title: 'Hear it', text: 'Listen to a quantum state.', done: (s) => used(s, 'listen') },
  { id: 'shared', title: 'Together', text: 'Join a shared lab or a class.', done: (s) => used(s, 'shared') },
  counter('machines', 'Hardware tour', 'Try all three machines.', (s) => ['superconducting', 'ions', 'atoms'].filter((m) => used(s, `machine:${m}`)).length, () => 3),
];

export const emptyProfile = (): ProfileData => ({ stats: { gates: 0, measures: 0, shots: 0, rewinds: 0, bellPairs: 0, ghz: 0, used: [] }, unlocked: {} });

/** A GHZ state on all n >= 3 qubits: half |0...0>, half |1...1>. */
function ghzSize(s: QState): number {
  if (s.n < 3) return 0;
  const p = s.probabilities();
  return Math.abs(p[0] - 0.5) < 1e-6 && Math.abs(p[s.dim - 1] - 0.5) < 1e-6 ? s.n : 0;
}

export class Profile {
  data: ProfileData;

  constructor(data?: ProfileData | null) {
    const e = emptyProfile();
    this.data = { stats: { ...e.stats, ...(data?.stats ?? {}), used: [...(data?.stats?.used ?? [])] }, unlocked: { ...(data?.unlocked ?? {}) } };
  }

  /** A feature was tried. */
  use(feature: string): void {
    if (!this.data.stats.used.includes(feature)) this.data.stats.used.push(feature);
  }

  /** After each op on the orbs, with the state it left. */
  onOp(op: Op, state: QState): void {
    const s = this.data.stats;
    if (op.kind === 'gate' || op.kind === 'swap' || op.kind === 'iswap') s.gates++;
    if (op.kind === 'measure') s.measures++;
    for (let q = 0; q < state.n; q++) {
      const [x, y, z] = blochVector(state, q);
      if (Math.abs(z) < 0.02 && Math.hypot(x, y) > 0.98) this.use('superposition');
    }
    let bell = false;
    for (let a = 0; a < state.n && !bell; a++) for (let b = a + 1; b < state.n && !bell; b++) bell = pairStrength(state, a, b) > 0.99;
    if (bell) s.bellPairs++;
    s.ghz = Math.max(s.ghz, ghzSize(state));
  }

  onShots(count: number): void {
    this.data.stats.shots += count;
  }

  onRewind(): void {
    this.data.stats.rewinds++;
  }

  /** Unlock whatever is now earned; returns the new ones (for the toasts). */
  check(c: ProgressContext, now = Date.now()): Achievement[] {
    const fresh: Achievement[] = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.unlocked[a.id] || !a.done(this.data.stats, c)) continue;
      this.data.unlocked[a.id] = now;
      fresh.push(a);
    }
    return fresh;
  }

  toJSON(): ProfileData {
    return this.data;
  }
}

// ---------------------------------------------------------------- XP and levels

/** XP from everything done: progress plus achievements. */
export function xpFor(p: ProfileData, c: ProgressContext): number {
  const stars = c.stars.reduce((a, b) => a + b, 0);
  return c.chaptersDone.length * 50 + c.lessonsDone * 20 + c.courseDone * 40 + stars * 15 + c.dailyDays * 30 + Object.keys(p.unlocked).length * 25;
}

export const LEVEL_TITLES = ['Newcomer', 'Tinkerer', 'Apprentice', 'Experimenter', 'Circuit builder', 'Algorithm hunter', 'Researcher', 'Quantum engineer', 'Quantum architect', 'Quantum master'];

/** Level n needs 100 * (1 + 2 + ... + (n - 1)) XP: 0, 100, 300, 600, 1000 ... */
export const xpForLevel = (level: number) => (100 * (level - 1) * level) / 2;

export function levelFor(xp: number): { level: number; title: string; into: number; span: number } {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const base = xpForLevel(level);
  return { level, title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1], into: xp - base, span: xpForLevel(level + 1) - base };
}
