import {
  createSystem,
  Euler,
  PokeInteractable,
  Matrix4,
  Quaternion,
  Vector3,
  VisibilityState,
  type UIKitMLAsset,
} from '@iwsdk/core';
import { feedback } from '../lab/feedback';
import { Qubit } from '../lab/components';
import { lab } from '../lab/instance';
import { LabSystem } from '../lab/lab-system';
import { MAX_ORBS } from '../lab/lab';
import { loadSave, writeSave } from '../lab/save';
import type { Op } from '../quantum/circuit';
import { toQiskit } from '../quantum/export';
import { decodeCircuit, encodeCircuit, SHARE_PREFIX } from '../quantum/share';
import { qubitColor } from '../lab/visuals';
import type { GateName } from '../quantum/gates';
import type { CampaignView } from './campaign';
import { campaign } from './instance';
import { PRESETS } from './presets';
import { BuilderPanel } from './builder-ui';
import { BUILDS, parOf } from './builder';
import { starsFor } from './puzzles';

type El = ReturnType<UIKitMLAsset['requireElementById']>;

/**
 * Where each panel sits relative to the desk workspace. Poke panels must stay
 * more than 20 cm (the poke hover radius) from the orbs, or reaching for an
 * orb pokes the panel instead of grabbing the orb.
 */
const PLACEMENT = {
  'chapter-panel': { pos: new Vector3(-0.47, 0.2, -0.03), rot: new Euler(-0.12, (32 * Math.PI) / 180, 0, 'YXZ') },
  'gate-dock': { pos: new Vector3(0.4, 0.09, 0.07), rot: new Euler((-38 * Math.PI) / 180, (-36 * Math.PI) / 180, 0, 'YXZ') },
  // the builder takes the dock's place in the Build tab, a little further out
  'builder-panel': { pos: new Vector3(0.44, 0.14, 0.03), rot: new Euler((-22 * Math.PI) / 180, (-32 * Math.PI) / 180, 0, 'YXZ') },
  'code-panel': { pos: new Vector3(0.02, 0.34, -0.22), rot: new Euler(-0.05, 0, 0, 'YXZ') },
  // upper right, opposite the chapter card and above the dock
  'nav-panel': { pos: new Vector3(0.47, 0.26, -0.06), rot: new Euler(-0.12, (-32 * Math.PI) / 180, 0, 'YXZ') },
} as const;

const SLOTS = 7;
const CODE_LINES = 16;
const NAV_SLOTS = 15;
const TABS = ['campaign', 'learn', 'puzzle', 'build', 'sandbox'] as const;
/** Where hidden panels park, out of reach of every pointer. */
const PARKED = new Vector3(0, -50, 0);

/** Short timeline label for one op: H0, Ry1, CX01, M0=1 ... */
export function opLabel(op: Op): string {
  switch (op.kind) {
    case 'gate': {
      const nc = op.controls?.length ?? 0;
      const name = op.gate.length === 1 ? op.gate.toUpperCase() : op.gate[0].toUpperCase() + op.gate.slice(1);
      const g = nc === 0 ? name : (nc === 1 ? 'C' : 'CC') + name;
      return `${g}${op.controls?.join('') ?? ''}${op.target}`;
    }
    case 'swap':
      return `SW${op.a}${op.b}`;
    case 'iswap':
      return `iS${op.a}${op.b}`;
    case 'measure':
      return `M${op.qubit}=${op.outcome ?? '?'}`;
    case 'reset':
      return `R${op.qubit}`;
  }
}

/** Panel palette: Horizon greys, one blue for "do this", mint for "done". Gold stays for entanglement. */
const C = {
  done: '#3ddc97',
  current: '#2d7ff9',
  todo: '#3a3c41',
  primary: '#2d7ff9',
  primaryIdle: '#34363b',
  text: '#e4e6eb',
  textDim: '#8a8d93',
};

/** The qubit an op mostly acts on, for colouring its timeline step. */
function opQubit(op: Op): number {
  return op.kind === 'gate' ? op.target : op.kind === 'swap' || op.kind === 'iswap' ? op.a : op.qubit;
}

/**
 * Hands-only menus: the chapter card and the gate dock. Both take poke and ray
 * input, follow the desk workspace, and mirror the campaign and lab state.
 * Also owns autosave and quick resume.
 */
export class UISystem extends createSystem({
  qubits: { required: [Qubit] },
}) {
  private chapter: UIKitMLAsset | null = null;
  private dock: UIKitMLAsset | null = null;
  private code: UIKitMLAsset | null = null;
  private nav: UIKitMLAsset | null = null;
  private builderAsset: UIKitMLAsset | null = null;
  private builder: BuilderPanel | null = null;
  /** Which tab the navigator shows (it follows the mode, but can be browsed). */
  private tab: CampaignView['mode'] = 'campaign';
  private slotStart = 0;
  private els = new Map<string, El>();
  private immersive = false;
  private saveTimer = 0;
  private dirty = false;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly tilt = new Quaternion();
  private lastCue = '';
  /** The sandbox is showing a circuit someone shared; cleared when anything else loads. */
  private sharedOpen = false;
  private lastMode: CampaignView['mode'] | null = null;
  private pokeOn = true;
  private readonly hand = new Vector3();
  private readonly orb = new Vector3();

  init(): void {
    // quick resume: pick up exactly where the player left off
    const save = loadSave();
    let resumed = false;
    if (save) {
      try {
        lab.restore(save.lab as ReturnType<typeof lab.toJSON>);
        campaign.restore(save.campaign as ReturnType<typeof campaign.toJSON>);
        resumed = true;
      } catch {
        resumed = false;
      }
    }
    // a share link opens its circuit in the sandbox (progress stays in the save)
    if (!this.openShared() && !resumed) {
      campaign.startChapter(0);
      campaign.intro = true;
    }
    const onHash = () => this.openShared();
    window.addEventListener('hashchange', onHash);
    this.cleanupFuncs.push(() => window.removeEventListener('hashchange', onHash));

    this.cleanupFuncs.push(
      campaign.on((v) => this.render(v)),
      lab.on((e) => {
        this.dirty = true;
        if (e.type === 'select' || e.type === 'reset' || e.type === 'seek' || e.type === 'op') this.renderDock();
        if (e.type === 'reset' && campaign.mode === 'sandbox') this.render(campaign.view);
      }),
      this.visibilityState.subscribe((v) => {
        this.immersive = v !== VisibilityState.NonImmersive;
        this.render(campaign.view);
      }),
    );
  }

  private bind(): boolean {
    if (this.chapter && this.dock && this.nav && this.builder) return true;
    this.chapter = this.world.getSceneObject<UIKitMLAsset>('chapter-panel') ?? null;
    this.dock = this.world.getSceneObject<UIKitMLAsset>('gate-dock') ?? null;
    this.code = this.world.getSceneObject<UIKitMLAsset>('code-panel') ?? null;
    this.nav = this.world.getSceneObject<UIKitMLAsset>('nav-panel') ?? null;
    this.builderAsset = this.world.getSceneObject<UIKitMLAsset>('builder-panel') ?? null;
    if (!this.chapter || !this.dock || !this.code || !this.nav || !this.builderAsset) return false;
    this.code.visible = false;

    // panels take poke and ray input but must never capture the grab pointer,
    // or a hand reaching for an orb just above the dock grabs the dock instead
    for (const panel of [this.chapter, this.dock, this.code, this.nav, this.builderAsset]) {
      panel.traverse((o) => {
        (o as unknown as { pointerEventsType: unknown }).pointerEventsType = { deny: 'grab' };
      });
    }

    const ids = ['chapter-eyebrow', 'chapter-title', 'chapter-body', 'goal-dot', 'goal-text', 'btn-next', 'btn-next-label', 'btn-replay', 'btn-replay-label', 'pip-0', 'pip-1', 'pip-2', 'pip-3', 'pip-4'];
    for (const id of ids) this.els.set(id, this.chapter.requireElementById(id));
    const navIds = ['tab-campaign', 'tab-campaign-l', 'tab-learn', 'tab-learn-l', 'tab-puzzle', 'tab-puzzle-l', 'tab-build', 'tab-build-l', 'tab-sandbox', 'tab-sandbox-l', 'nav-progress', 'nav-progress-2'];
    for (let i = 0; i < NAV_SLOTS; i++) navIds.push(`n-${i}`, `n-${i}-n`, `n-${i}-l`);
    for (const id of navIds) this.els.set(id, this.nav.requireElementById(id));
    const dockIds = ['g-h', 'g-x', 'g-y', 'g-z', 'g-s', 'g-t', 'g-rl', 'g-rr', 'a-cnot', 'a-swap', 'a-measure', 'a-shots', 'a-export', 't-prev', 't-next', 'dock-status'];
    for (let i = 0; i < SLOTS; i++) dockIds.push(`t-${i}`, `t-${i}-l`);
    for (const id of dockIds) this.els.set(id, this.dock.requireElementById(id));
    for (const id of ['code-close', 'code-note', 'code-link']) this.els.set(id, this.code.requireElementById(id));
    for (let i = 0; i < CODE_LINES; i++) this.els.set(`code-${i}`, this.code.requireElementById(`code-${i}`));
    for (const [id, el] of this.els) el.name = id;

    const on = (id: string, fn: () => void) => {
      const el = this.els.get(id)!;
      const handler = () => fn();
      el.addEventListener('click', handler);
      this.cleanupFuncs.push(() => el.removeEventListener('click', handler));
    };
    on('btn-next', () => {
      if (campaign.mode === 'sandbox') {
        if (lab.n < MAX_ORBS) lab.reset(lab.n + 1);
      } else campaign.next();
      feedback('select');
    });
    on('btn-replay', () => {
      campaign.replay();
      feedback('select');
    });
    for (const tab of TABS) {
      on(`tab-${tab}`, () => {
        this.tab = tab;
        this.renderNav(campaign.view);
        feedback('select');
      });
    }
    for (let i = 0; i < NAV_SLOTS; i++) {
      on(`n-${i}`, () => {
        if (this.tab === 'campaign' && i < campaign.chapters.length) campaign.startChapter(i);
        else if (this.tab === 'learn' && i < campaign.lessons.length) campaign.startLesson(i);
        else if (this.tab === 'puzzle' && i < campaign.puzzles.length) campaign.startPuzzle(i);
        else if (this.tab === 'build' && i < BUILDS.length) campaign.enterBuild(i);
        else if (this.tab === 'sandbox' && i < PRESETS.length) campaign.loadPreset(i);
        else return;
        feedback('select');
      });
    }
    for (const g of ['h', 'x', 'y', 'z', 's', 't'] as GateName[]) {
      on(`g-${g}`, () => lab.gate(g) && feedback('gate'));
    }
    on('g-rl', () => lab.gate('ry', lab.selected, [-Math.PI / 8]) && feedback('gate'));
    on('g-rr', () => lab.gate('ry', lab.selected, [Math.PI / 8]) && feedback('gate'));
    on('a-cnot', () => feedback(lab.entangleSelected() ? 'entangle' : 'reject'));
    on('a-swap', () => {
      if (lab.n < 2) return feedback('reject');
      if (lab.apply({ kind: 'swap', a: lab.selected, b: (lab.selected + 1) % lab.n })) feedback('gate');
    });
    on('a-measure', () => lab.measure() !== null && feedback('measure'));
    on('a-shots', () => {
      lab.shots(100);
      feedback('shots');
    });
    on('t-prev', () => lab.undo() && feedback('select'));
    on('t-next', () => lab.redo() && feedback('select'));
    for (let i = 0; i < SLOTS; i++) {
      // tapping a step rewinds (or replays) the qubits to just after that step
      on(`t-${i}`, () => {
        const k = this.slotStart + i;
        if (k <= lab.history.length) {
          lab.seek(k);
          feedback('select');
        }
      });
    }
    on('a-export', () => this.showCode());
    on('code-link', () => this.copyLink());
    on('code-close', () => {
      this.code!.visible = false;
      feedback('select');
    });

    this.builder = new BuilderPanel(this.builderAsset, campaign.build, () => feedback('select'));
    this.cleanupFuncs.push(
      campaign.build.on(() => {
        this.dirty = true;
        this.builder?.render(!this.immersive);
        if (campaign.mode === 'build') this.render(campaign.view);
      }),
    );
    this.builder.render(!this.immersive);
    this.render(campaign.view);
    this.renderDock();
    return true;
  }

  private text(id: string, text: string): void {
    this.els.get(id)?.setProperties({ text });
  }

  private bg(id: string, backgroundColor: string): void {
    this.els.get(id)?.setProperties({ backgroundColor });
  }

  private render(v: CampaignView): void {
    if (!this.chapter) return;
    if (v.mode !== 'sandbox' || v.preset >= 0) this.sharedOpen = false;
    if (v.intro) {
      this.text('chapter-eyebrow', 'Welcome');
      this.text('chapter-title', 'Entangled');
      this.text('chapter-body', 'Hold a qubit in your hand. Ten short chapters, about fifteen minutes. A ghost hand shows every move, and every move has a button too.');
      this.text('goal-text', this.immersive ? 'Tap Start, or pinch the orb and turn it' : 'Press Enter, or hold an arrow key');
      this.bg('goal-dot', C.current);
      for (let i = 0; i < 5; i++) this.els.get(`pip-${i}`)?.setProperties({ display: 'none' });
      this.text('btn-next-label', 'Start');
      this.text('btn-replay-label', 'Replay');
      this.bg('btn-next', C.primary);
      this.renderNav(v);
      return;
    }
    if (v.mode === 'sandbox') {
      const preset = PRESETS[campaign.preset];
      const lead = this.sharedOpen
        ? `A shared circuit: ${lab.history.length} steps on ${lab.n} qubits. Scrub the timeline to replay it.`
        : preset && preset.qubits === lab.n ? preset.note : `${lab.n} qubits.`;
      this.text('chapter-eyebrow', 'Sandbox');
      this.text('chapter-title', 'Free lab');
      this.text('chapter-body', `${lead} Every gate and gesture is unlocked.`);
      const goal =
        lab.n >= MAX_ORBS
          ? this.immersive ? 'Tap 100 shots, or a timeline step to rewind' : 'Space for 100 shots, [ ] for other circuits'
          : this.immersive ? 'Try a GHZ state: H, then touch each orb' : 'N adds a qubit, [ ] loads ready-made circuits';
      this.text('goal-text', goal);
      this.bg('goal-dot', C.current);
      for (let i = 0; i < 5; i++) this.els.get(`pip-${i}`)?.setProperties({ display: 'none' });
      this.text('btn-next-label', 'Add');
      this.text('btn-replay-label', 'Reset');
      this.bg('btn-next', lab.n < MAX_ORBS ? C.primary : C.primaryIdle);
      this.renderNav(v);
      return;
    }
    if (v.mode === 'build') {
      this.renderBuildCard(v);
      return;
    }
    const ch = v.chapter!;
    const learn = v.mode === 'learn';
    const puzzle = v.mode === 'puzzle';
    // lessons and puzzles step through a list; chapters tell a story
    const listed = learn || puzzle;
    const best = puzzle ? v.stars[v.puzzleIndex] : 0;
    this.text(
      'chapter-eyebrow',
      learn
        ? `Lesson ${v.lessonIndex + 1} of ${v.lessonCount}  /  ${ch.group}`
        : puzzle
          ? `Puzzle ${v.puzzleIndex + 1} of ${v.puzzleCount}  /  par ${ch.par}${best ? `  /  best ${best} of 3 stars` : ''}`
          : `Chapter ${v.chapterIndex + 1} of ${v.chapterCount}`,
    );
    this.text('chapter-title', ch.title);
    const step = v.step;
    if (v.chapterDone) {
      // keep the last result (a fidelity, an error rate) next to the closing line
      this.text('chapter-body', v.payoff ? `${v.payoff} ${ch.outro}` : ch.outro);
      this.text(
        'goal-text',
        listed ? `${learn ? 'Lesson' : 'Puzzle'} complete. Tap Next.` : v.chapterIndex + 1 < v.chapterCount ? 'Chapter complete. Tap Continue.' : 'All chapters complete. Tap Continue for the sandbox.',
      );
      this.bg('goal-dot', C.done);
    } else if (step) {
      this.text('chapter-body', v.stepDone && v.payoff ? v.payoff : v.text ?? '');
      const hint = !this.immersive && step.keys ? `  (${step.keys})` : '';
      this.text('goal-text', v.stepDone ? 'Done' : (v.goal ?? '') + hint);
      this.bg('goal-dot', v.stepDone ? C.done : C.current);
    }
    for (let i = 0; i < 5; i++) {
      const pip = this.els.get(`pip-${i}`);
      if (!pip) continue;
      if (i >= ch.steps.length) {
        pip.setProperties({ display: 'none' });
        continue;
      }
      const done = v.chapterDone || i < v.stepIndex || (i === v.stepIndex && v.stepDone);
      pip.setProperties({ display: 'flex', backgroundColor: done ? C.done : i === v.stepIndex ? C.current : C.todo });
    }
    // a step that needs a card button (Oracle, Storm ...) turns Continue into that button
    this.text('btn-next-label', v.action ?? (listed ? 'Next' : 'Continue'));
    this.text('btn-replay-label', listed ? 'Retry' : 'Replay');
    this.bg('btn-next', v.action || v.chapterDone || v.stepDone ? C.primary : C.primaryIdle);
    if (v.action) this.text('goal-text', (v.goal ?? '') + (this.immersive ? `: tap ${v.action}` : '  (press Enter)'));
    this.renderNav(v);
    const cue = `${v.mode}-${v.chapterIndex}-${v.lessonIndex}-${v.stepIndex}-${v.stepDone}-${v.chapterDone}`;
    if ((v.stepDone || v.chapterDone) && cue !== this.lastCue) feedback('success');
    this.lastCue = cue;
  }

  /** The chapter card while the builder is open: the challenge, its par and how it is going. */
  private renderBuildCard(v: CampaignView): void {
    const b = campaign.build;
    const ch = b.challenge;
    const r = b.result;
    this.text('chapter-eyebrow', ch.target ? `Build ${b.index} of ${BUILDS.length - 1}  /  par ${parOf(ch)} steps` : 'Build  /  free');
    this.text('chapter-title', ch.title);
    this.text('chapter-body', r.status === 'solved' && ch.outro ? ch.outro : ch.text);
    const goal =
      r.status === 'solved'
        ? `Solved: ${starsFor(r.columns, r.par)} of 3 stars. Tap Next.`
        : r.status === 'free'
          ? 'Build anything; the orbs run it live'
          : this.immersive ? 'Tap a tool, then a cell on the grid' : 'Arrows move, letters place (press ? for keys)';
    this.text('goal-text', goal);
    this.bg('goal-dot', r.status === 'solved' ? C.done : C.current);
    for (let i = 0; i < 5; i++) this.els.get(`pip-${i}`)?.setProperties({ display: 'none' });
    this.text('btn-next-label', ch.target ? 'Next' : 'First challenge');
    this.text('btn-replay-label', 'Clear');
    this.bg('btn-next', r.status === 'solved' || !ch.target ? C.primary : C.primaryIdle);
    this.renderNav(v);
    const cue = `build-${b.index}-${r.status}`;
    if (r.status === 'solved' && cue !== this.lastCue) feedback('success');
    this.lastCue = cue;
  }

  /**
   * Navigator: the tab follows the mode when it changes, and lists chapters,
   * lessons or sandbox presets. Finished items are mint, the current one filled.
   */
  private renderNav(v: CampaignView): void {
    if (!this.nav) return;
    if (v.mode !== this.lastMode) {
      this.tab = v.mode;
      this.lastMode = v.mode;
    }
    for (const tab of TABS) {
      const on = tab === this.tab;
      this.bg(`tab-${tab}`, on ? C.text : '#1b1c1f');
      this.els.get(`tab-${tab}-l`)?.setProperties({ color: on ? '#18191b' : C.textDim });
    }
    const items =
      this.tab === 'campaign'
        ? campaign.chapters.map((c, i) => ({ label: c.chip ?? c.title, done: v.completed.includes(i), current: v.mode === 'campaign' && !v.intro && i === v.chapterIndex }))
        : this.tab === 'learn'
          ? campaign.lessons.map((c, i) => ({ label: c.title, done: v.learned.includes(i), current: v.mode === 'learn' && i === v.lessonIndex }))
          : this.tab === 'puzzle'
            ? campaign.puzzles.map((c, i) => ({ label: c.chip ?? c.title, done: v.stars[i] === 3, current: v.mode === 'puzzle' && i === v.puzzleIndex, stars: v.stars[i] }))
            : this.tab === 'build'
              ? BUILDS.map((c, i) => ({ label: c.chip, done: campaign.build.best.get(i) === 3, current: v.mode === 'build' && i === campaign.build.index, stars: campaign.build.best.get(i) ?? 0 }))
              : PRESETS.map((p, i) => ({ label: p.label, done: false, current: v.mode === 'sandbox' && i === campaign.preset }));
    for (let i = 0; i < NAV_SLOTS; i++) {
      const it = items[i];
      this.els.get(`n-${i}`)?.setProperties({
        display: it ? 'flex' : 'none',
        backgroundColor: !it ? '#2d2f33' : it.current ? C.text : it.done ? '#1f3a30' : '#2d2f33',
      });
      if (!it) continue;
      this.text(`n-${i}-l`, it.label);
      this.els.get(`n-${i}-l`)?.setProperties({ color: it.current ? '#18191b' : it.done ? C.done : C.text });
      const stars = 'stars' in it ? (it.stars as number) : 0;
      this.text(`n-${i}-n`, stars ? `${stars}/3` : String(i + 1));
      this.els.get(`n-${i}-n`)?.setProperties({ color: it.current ? '#18191b' : it.done ? C.done : stars ? '#c9ccd1' : '#6b6e75' });
    }
    const starTotal = v.stars.reduce((a, b) => a + b, 0);
    this.text('nav-progress', `${v.completed.length}/${v.chapterCount} chapters   ${v.learned.length}/${v.lessonCount} lessons`);
    this.text('nav-progress-2', `${starTotal} of ${v.puzzleCount * 3} stars`);
  }

  private renderDock(): void {
    if (!this.dock) return;
    const sel = lab.selected;
    const p1 = lab.history.state.prob1(sel);
    const h = lab.history;
    this.text('dock-status', `Selected: q${sel}   P(1) = ${p1.toFixed(2)}   Step ${h.cursor} of ${h.length}`);
    this.els.get('dock-status')?.setProperties({ color: qubitColor(sel) });

    // timeline: slot 0 is "start" when visible; slot i shows the state after step slotStart + i
    const all = h.toJSON().ops;
    this.slotStart = Math.max(0, Math.min(all.length + 1 - SLOTS, h.cursor - (SLOTS - 2)));
    for (let i = 0; i < SLOTS; i++) {
      const k = this.slotStart + i; // cursor position this slot seeks to
      const label = k === 0 ? 'start' : k <= all.length ? opLabel(all[k - 1]) : '-';
      const current = k === h.cursor;
      const future = k > h.cursor;
      const op = k > 0 && k <= all.length ? all[k - 1] : null;
      const isCx = op?.kind === 'gate' && !!op.controls?.length;
      // each step in its qubit's colour; multi-qubit gates in gold, like the thread they make
      const color = current ? '#18191b' : future ? '#6b6e75' : !op ? C.text : isCx ? '#e2b04a' : qubitColor(opQubit(op));
      this.text(`t-${i}-l`, label);
      this.els.get(`t-${i}-l`)?.setProperties({ color });
      this.els.get(`t-${i}`)?.setProperties({ backgroundColor: current ? '#e4e6eb' : k <= all.length ? '#2a2c30' : '#232427' });
    }
    if (this.code?.visible) this.showCode(false);
  }

  /** If the address has a share link, open that circuit in the sandbox. Returns true if it did. */
  private openShared(): boolean {
    if (!location.hash.startsWith(SHARE_PREFIX)) return false;
    let shared: ReturnType<typeof decodeCircuit> = null;
    try {
      shared = decodeCircuit(decodeURIComponent(location.hash.slice(SHARE_PREFIX.length)));
    } catch {
      shared = null;
    }
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      // address bar untouched: reloading just opens the shared circuit again
    }
    if (!shared) return false;
    this.sharedOpen = true;
    campaign.enterSandbox(shared.n, shared.ops);
    console.info(`[Entangled] opened a shared circuit: ${shared.n} qubits, ${shared.ops.length} steps`);
    feedback('select');
    return true;
  }

  /** Copy a link that opens this circuit in anyone's sandbox. */
  private copyLink(): void {
    const url = `${location.origin}${location.pathname}${SHARE_PREFIX}${encodeURIComponent(encodeCircuit(lab.n, lab.history.ops))}`;
    let copied = false;
    try {
      void navigator.clipboard?.writeText(url);
      copied = !!navigator.clipboard;
    } catch {
      copied = false;
    }
    console.info('[Entangled] share link ' + url);
    this.text('code-note', copied ? 'Link copied. Anyone who opens it gets this circuit in their sandbox.' : 'Copying is not available here; the link is in the console.');
    feedback('select');
  }

  /** Show the circuit so far as Qiskit code (also copied to the clipboard on desktop). */
  private showCode(sound = true): void {
    if (!this.code) return;
    const code = toQiskit(lab.n, lab.history.ops);
    const body = code.split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('from') && !l.startsWith('print'));
    const shown = body.length > CODE_LINES ? ['...', ...body.slice(-(CODE_LINES - 1))] : body;
    // UIKit text ignores line breaks, so each code line is its own element
    for (let i = 0; i < CODE_LINES; i++) {
      const el = this.els.get(`code-${i}`);
      if (i < shown.length) el?.setProperties({ text: shown[i], display: 'flex' });
      else el?.setProperties({ display: 'none' });
    }
    this.text('code-note', `${lab.history.ops.length} steps. Runs as-is in Qiskit${this.immersive ? '.' : '; copied to your clipboard.'}`);
    this.code.visible = true;
    if (sound) {
      feedback('select');
      try {
        void navigator.clipboard?.writeText(code);
      } catch {
        // clipboard unavailable (headset browser, permissions): the panel still shows the code
      }
      console.info('[Entangled] Qiskit export\n' + code);
    }
  }

  /**
   * The poke pointer hovers 20 cm out, so a hand reaching for an orb near a
   * panel would poke the panel instead of grabbing the orb. While either hand
   * is within reach of an orb, panels stop taking poke (ray clicks still work).
   */
  private updatePokeGate(): void {
    let near = Infinity;
    for (const side of ['left', 'right'] as const) {
      const grip = this.player.gripSpaces[side];
      if (!grip) continue;
      grip.getWorldPosition(this.hand);
      for (const e of this.queries.qubits.entities) {
        e.object3D!.getWorldPosition(this.orb);
        near = Math.min(near, this.hand.distanceTo(this.orb));
      }
    }
    const want = this.pokeOn ? near > 0.14 : near > 0.2;
    if (want === this.pokeOn) return;
    this.pokeOn = want;
    for (const id of ['chapter-panel', 'gate-dock', 'code-panel', 'nav-panel', 'builder-panel']) {
      const e = this.world.getSceneEntity(id);
      if (!e) continue;
      if (want && !e.hasComponent(PokeInteractable)) e.addComponent(PokeInteractable);
      else if (!want && e.hasComponent(PokeInteractable)) e.removeComponent(PokeInteractable);
    }
  }

  private place(obj: { position: Vector3; quaternion: Quaternion; scale: Vector3 }, key: keyof typeof PLACEMENT): void {
    const ws = this.world.getSystem(LabSystem)?.workspaceObject;
    if (!ws) return;
    const { pos, rot } = PLACEMENT[key];
    ws.updateWorldMatrix(true, false);
    this.p.copy(pos).applyMatrix4(ws.matrixWorld);
    ws.matrixWorld.decompose(this.s, this.q, this.s);
    obj.position.copy(this.p);
    obj.quaternion.copy(this.q).multiply(this.tilt.setFromEuler(rot));
  }

  update(delta: number): void {
    if (!this.bind()) return;
    this.place(this.chapter!, 'chapter-panel');
    // the builder replaces the dock while the Build tab is open
    const building = campaign.mode === 'build';
    this.dock!.visible = !building;
    this.builderAsset!.visible = building;
    if (building) {
      this.place(this.builderAsset!, 'builder-panel');
      this.dock!.position.copy(PARKED);
    } else {
      this.place(this.dock!, 'gate-dock');
      this.builderAsset!.position.copy(PARKED);
    }
    this.place(this.code!, 'code-panel');
    this.place(this.nav!, 'nav-panel');
    campaign.update(Math.min(delta, 0.05));

    this.updatePokeGate();

    // autosave a moment after the last change
    if (this.dirty) {
      this.saveTimer += delta;
      if (this.saveTimer > 0.8) {
        this.dirty = false;
        this.saveTimer = 0;
        writeSave({ lab: lab.toJSON(), campaign: campaign.toJSON(), savedAt: Date.now() });
      }
    }
  }
}
