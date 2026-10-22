import type { Lab, LabEvent } from '../lab/lab';
import type { Op } from '../quantum/circuit';
import { CHAPTERS, type Chapter, type GoalContext, type Hint, type Step } from './chapters';
import { LESSONS } from './lessons';
import { PRESETS } from './presets';
import { BuildSession } from './build-session';
import { PUZZLES } from './puzzles';

/** Chapters (the story), Learn (one lesson per gate or idea), or the free sandbox. */
export type Mode = 'campaign' | 'learn' | 'puzzle' | 'build' | 'sandbox';

export interface CampaignView {
  mode: Mode;
  chapterIndex: number;
  chapterCount: number;
  chapter: Chapter | null;
  stepIndex: number;
  step: Step | null;
  /** The current step's goal has been met (showing its payoff). */
  stepDone: boolean;
  /** Every step of the chapter is done. */
  chapterDone: boolean;
  payoff: string | null;
  /** Label of the card button the current step needs, if any (e.g. "Oracle"). */
  action: string | null;
  /** Chapters finished at least once. */
  completed: readonly number[];
  /** First launch: the welcome card is showing over Chapter 1. */
  intro: boolean;
  lessonIndex: number;
  lessonCount: number;
  /** Lessons finished at least once. */
  learned: readonly number[];
  puzzleIndex: number;
  puzzleCount: number;
  /** Best stars (1-3) per puzzle; 0 = not solved yet. */
  stars: readonly number[];
  /** Sandbox preset loaded (-1: none). */
  preset: number;
  /** The current step's text and goal, worked out for this run (they can depend on earlier steps). */
  text: string | null;
  goal: string | null;
}

type Listener = (v: CampaignView) => void;

/** Seconds a payoff stays up before the next step starts on its own. */
const ADVANCE_DELAY = 2.2;

/**
 * Chapter and step state machine. It watches the lab, checks the current goal
 * every frame, and moves on by itself, so the player never has to reach for a menu.
 */
export class Campaign {
  mode: Mode = 'campaign';
  chapterIndex = 0;
  stepIndex = 0;
  stepDone = false;
  chapterDone = false;
  payoff: string | null = null;
  /** Chapters finished at least once, kept across sessions. */
  completed = new Set<number>();
  /** Welcome card on first launch; any action or Continue dismisses it. */
  intro = false;
  lessonIndex = 0;
  /** Sandbox starting circuit last loaded (-1: a plain sandbox). */
  preset = -1;
  puzzleIndex = 0;
  /** Best stars per puzzle, kept across sessions. */
  stars = new Map<number, number>();
  /** The circuit builder (Build tab). */
  readonly build: BuildSession;
  /** Lessons finished at least once, kept across sessions. */
  learned = new Set<number>();
  private stepStart = 0;
  private shots: Uint32Array | null = null;
  private memory: Record<string, unknown> = {};
  private timer = 0;
  private listeners = new Set<Listener>();
  private off: () => void;

  constructor(
    private lab: Lab,
    readonly chapters: Chapter[] = CHAPTERS,
    readonly lessons: Chapter[] = LESSONS,
    readonly puzzles: Chapter[] = PUZZLES,
  ) {
    this.build = new BuildSession(lab);
    this.off = lab.on((e) => this.onLab(e));
  }

  dispose(): void {
    this.off();
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.view);
    return () => this.listeners.delete(fn);
  }

  /** The chapter or lesson being played (null in the sandbox). */
  private get current(): Chapter | null {
    if (this.mode === 'campaign') return this.chapters[this.chapterIndex] ?? null;
    if (this.mode === 'learn') return this.lessons[this.lessonIndex] ?? null;
    if (this.mode === 'puzzle') return this.puzzles[this.puzzleIndex] ?? null;
    return null;
  }

  /** A chapter, lesson or puzzle is running (the builder and sandbox have no steps). */
  private get playing(): boolean {
    return this.mode === 'campaign' || this.mode === 'learn' || this.mode === 'puzzle';
  }

  get view(): CampaignView {
    const chapter = this.current;
    const step = chapter?.steps[this.stepIndex] ?? null;
    return {
      mode: this.mode,
      chapterIndex: this.chapterIndex,
      chapterCount: this.chapters.length,
      chapter,
      stepIndex: this.stepIndex,
      step: chapter?.steps[this.stepIndex] ?? null,
      stepDone: this.stepDone,
      chapterDone: this.chapterDone,
      payoff: this.payoff,
      action: chapter && !this.stepDone && !this.chapterDone ? chapter.steps[this.stepIndex]?.action?.label ?? null : null,
      completed: [...this.completed].sort((a, b) => a - b),
      intro: this.intro,
      lessonIndex: this.lessonIndex,
      lessonCount: this.lessons.length,
      learned: [...this.learned].sort((a, b) => a - b),
      puzzleIndex: this.puzzleIndex,
      puzzleCount: this.puzzles.length,
      stars: this.puzzles.map((_, i) => this.stars.get(i) ?? 0),
      preset: this.preset,
      text: step ? (typeof step.text === 'function' ? step.text(this.memory) : step.text) : null,
      goal: step ? (typeof step.goal === 'function' ? step.goal(this.memory) : step.goal) : null,
    };
  }

  private emit(): void {
    const v = this.view;
    for (const fn of this.listeners) fn(v);
  }

  private onLab(e: LabEvent): void {
    if (this.intro && (e.type === 'op' || e.type === 'shots')) {
      this.intro = false;
      this.emit();
    }
    if (e.type === 'shots') this.shots = e.counts;
    // undoing past the start of this step restarts its bookkeeping
    if (e.type === 'seek' || e.type === 'reset') this.stepStart = Math.min(this.stepStart, this.lab.history.cursor);
  }

  startChapter(i: number): void {
    this.mode = 'campaign';
    this.chapterIndex = Math.max(0, Math.min(this.chapters.length - 1, i));
    this.begin();
  }

  startLesson(i: number): void {
    this.mode = 'learn';
    this.lessonIndex = ((i % this.lessons.length) + this.lessons.length) % this.lessons.length;
    this.begin();
  }

  startPuzzle(i: number): void {
    this.mode = 'puzzle';
    this.puzzleIndex = ((i % this.puzzles.length) + this.puzzles.length) % this.puzzles.length;
    this.begin();
  }

  /** The circuit builder, at challenge i (or where the player left off). */
  enterBuild(i = this.build.index): void {
    this.mode = 'build';
    this.intro = false;
    this.stepDone = false;
    this.chapterDone = false;
    this.payoff = null;
    this.lab.preferredControl = null;
    this.build.start(i);
    this.emit();
  }

  /** Learn mode, at the lesson the player was last on. */
  enterLearn(): void {
    this.startLesson(this.lessonIndex);
  }

  private begin(): void {
    this.intro = false;
    this.memory = {};
    const ch = this.current!;
    this.lab.load(ch.qubits, ch.setup ?? []);
    this.lab.select(0);
    this.chapterDone = false;
    this.enterStep(0);
  }

  private enterStep(i: number): void {
    this.stepIndex = i;
    this.stepDone = false;
    this.payoff = null;
    this.shots = null;
    this.timer = 0;
    const step = this.view.step;
    step?.enter?.(this.lab, this.memory);
    this.lab.preferredControl = step?.control ?? null;
    this.stepStart = this.lab.history.cursor;
    this.emit();
  }

  private context(): GoalContext {
    return {
      lab: this.lab,
      state: this.lab.state,
      stepOps: this.lab.history.ops.slice(this.stepStart),
      shots: this.shots,
      memory: this.memory,
    };
  }

  /** The gesture the ghost hand should demonstrate right now, if any. */
  hint(): Hint | null {
    if (!this.playing || this.stepDone || this.chapterDone) return null;
    const h = this.view.step?.hint;
    if (!h) return null;
    return typeof h === 'function' ? h(this.context()) : h;
  }

  /** Call every frame. */
  update(dt: number): void {
    if (!this.playing || this.chapterDone) return;
    const step = this.view.step;
    if (!step) return;
    if (!this.stepDone) {
      const ctx = this.context();
      if (step.done(ctx)) {
        step.complete?.(ctx);
        const after = this.context();
        this.payoff = typeof step.payoff === 'function' ? step.payoff(after) : step.payoff ?? null;
        this.stepDone = true;
        this.intro = false;
        this.timer = 0;
        this.emit();
      }
      return;
    }
    this.timer += dt;
    if (this.timer >= (this.payoff ? ADVANCE_DELAY : 0.6)) {
      const ch = this.current!;
      if (this.stepIndex + 1 < ch.steps.length) this.enterStep(this.stepIndex + 1);
      else {
        this.chapterDone = true;
        if (this.mode === 'learn') this.learned.add(this.lessonIndex);
        else if (this.mode === 'puzzle') {
          const got = (this.memory.stars as number | undefined) ?? 1;
          this.stars.set(this.puzzleIndex, Math.max(got, this.stars.get(this.puzzleIndex) ?? 0));
        } else this.completed.add(this.chapterIndex);
        this.lab.preferredControl = null;
        this.emit();
      }
    }
  }

  /** Press the current step's card button (Oracle, Storm ...). Returns false if it has none. */
  act(): boolean {
    const step = this.view.step;
    if (!this.playing || this.stepDone || this.chapterDone || !step?.action) return false;
    step.action.run(this.lab, this.memory);
    this.update(0);
    return true;
  }

  /** The Continue button: runs the step's action, next chapter when one is finished, otherwise skip ahead. */
  next(): void {
    if (this.intro) {
      this.intro = false;
      this.emit();
      return;
    }
    if (this.mode === 'sandbox') return;
    if (this.mode === 'build') {
      if (this.build.solved || !this.build.challenge.target) this.enterBuild(this.build.index + 1);
      return;
    }
    if (this.act()) return;
    if (this.chapterDone || this.stepDone) {
      if (!this.chapterDone) {
        this.timer = Infinity;
        this.update(0);
        return;
      }
      if (this.mode === 'learn') this.startLesson(this.lessonIndex + 1);
      else if (this.mode === 'puzzle') this.startPuzzle(this.puzzleIndex + 1);
      else if (this.chapterIndex + 1 < this.chapters.length) this.startChapter(this.chapterIndex + 1);
      else this.enterSandbox();
    }
  }

  replay(): void {
    if (this.mode === 'sandbox') this.lab.reset();
    else if (this.mode === 'build') this.build.clear();
    else this.begin();
  }

  /** Previous or next chapter / lesson (the [ and ] keys). */
  step(dir: 1 | -1): void {
    if (this.mode === 'learn') this.startLesson(this.lessonIndex + dir);
    else if (this.mode === 'puzzle') this.startPuzzle(this.puzzleIndex + dir);
    else if (this.mode === 'build') this.enterBuild(this.build.index + dir);
    else if (this.mode === 'sandbox') this.loadPreset(this.preset + dir);
    else if (this.chapterIndex + dir >= this.chapters.length) this.enterSandbox();
    else this.startChapter(this.chapterIndex + dir);
  }

  /** Sandbox from one of the ready-made circuits (wraps around). */
  loadPreset(i: number): void {
    const k = ((i % PRESETS.length) + PRESETS.length) % PRESETS.length;
    this.enterSandbox(PRESETS[k].qubits, PRESETS[k].ops);
    this.preset = k;
    this.emit();
  }

  /** Free play with n qubits, optionally starting from a ready-made circuit. */
  enterSandbox(n = 3, ops: Op[] = []): void {
    this.mode = 'sandbox';
    this.preset = -1;
    this.intro = false;
    this.chapterDone = false;
    this.stepDone = false;
    this.payoff = null;
    this.lab.preferredControl = null;
    this.lab.load(n, ops);
    this.emit();
  }

  toJSON() {
    return {
      mode: this.mode,
      chapter: this.chapterIndex,
      step: this.stepIndex,
      stepStart: this.stepStart,
      memory: this.memory,
      completed: [...this.completed],
      lesson: this.lessonIndex,
      learned: [...this.learned],
      puzzle: this.puzzleIndex,
      stars: [...this.stars],
      build: this.build.toJSON(),
    };
  }

  /** Resume exactly where the player left off (the lab is restored separately). */
  restore(data: ReturnType<Campaign['toJSON']>): void {
    this.mode = data.mode;
    this.chapterIndex = Math.max(0, Math.min(this.chapters.length - 1, data.chapter));
    this.memory = data.memory ?? {};
    this.completed = new Set((data.completed ?? []).filter((i) => i >= 0 && i < this.chapters.length));
    this.lessonIndex = Math.max(0, Math.min(this.lessons.length - 1, data.lesson ?? 0));
    this.learned = new Set((data.learned ?? []).filter((i) => i >= 0 && i < this.lessons.length));
    this.puzzleIndex = Math.max(0, Math.min(this.puzzles.length - 1, data.puzzle ?? 0));
    this.build.restore(data.build);
    if (this.mode === 'build') this.build.start(this.build.index, this.build.savedCells(data.build));
    this.stars = new Map((data.stars ?? []).filter(([i, n]) => i >= 0 && i < this.puzzles.length && n >= 1 && n <= 3));
    this.stepIndex = data.step;
    this.stepDone = false;
    this.chapterDone = false;
    this.payoff = null;
    this.stepStart = Math.min(data.stepStart, this.lab.history.cursor);
    this.lab.preferredControl = this.view.step?.control ?? null;
    this.emit();
  }
}
