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
import { simplify } from '../quantum/optimize';
import { decodeCircuit, encodeCircuit, SHARE_PREFIX } from '../quantum/share';
import { qubitColor } from '../lab/visuals';
import type { GateName } from '../quantum/gates';
import type { CampaignView } from './campaign';
import { campaign } from './instance';
import { PRESETS } from './presets';
import { BuilderPanel } from './builder-ui';
import { notesFor } from './notes';
import { NotesPanel } from './notes-ui';
import { BUILDS, parOf } from './builder';
import { starsFor } from './puzzles';

import { DEPOL_STEPS, noiseLab, T1_STEPS, T2_STEPS } from '../lab/noise-lab';
import { library, placeGate } from '../lab/library';
import { openImportDialog } from '../lab/import-dialog';
import { codeLines, FORMAT_NAMES, FORMATS, linesOf, pages, program, routeOrError, type Format } from './code-view';
import { describe as describeVoice, parseVoice, type VoiceCommand } from './voice';
import { explainStep, histogram, nextStop, stepTitle } from './debugger';
import { nextView, STATE_VIEW_NAMES, type StateView } from '../quantum/state-views';
import { assignmentProgress, kindOf, makeCode, parseCode, SharedRoom, type Progress, type Role, type RoomKind } from '../net/room';
import { AutoTransport } from '../net/transport';
import { openDailyDialog, openShareDialog, savedName } from '../lab/share-dialog';
import { ACHIEVEMENTS, levelFor, Profile, xpFor, type ProgressContext } from './profile';
import { bestStreak, dayKey, dailyNumber, emptyDaily, recordDaily, shareText, streak, type DailyRecord } from './daily';
import { loadDaily, loadProfile, saveDaily, saveProfile } from '../lab/profile-store';
import { profileFigure, type ProfileView } from '../lab/figures';
import { listen } from '../lab/sonify';
import { downloadSnapshot } from '../lab/snapshot';
import { Banner } from '../lab/banner';
import { compareFigure } from '../lab/figures';
import { compileFor, comparePlatforms, formatTime, machineQubits, PLATFORMS, platformSchedule, runPlatform, type PlatformId, type PlatformResult } from '../quantum/platforms';
import { toQasm } from '../quantum/export';
import { PUZZLES } from './puzzles';
import { downloadCertificate, type CertificateInfo } from '../lab/certificate';
import { COURSE } from './course';
import { SpeechInput } from '../lab/speech';
import { landscape, SQUARE, toPennyLaneQaoa } from '../quantum/qaoa';
import { H2 } from '../quantum/h2-data';
import { agreement, runOnChip, TYPICAL_NOISE } from '../quantum/hardware';
import { T5, type Routed } from '../quantum/routing';
import { compileForIbm, samplesToCounts } from '../quantum/ibm-compile';
import { IbmClient, loadPending, loadSettings, savePending, type PendingJob } from '../lab/ibm';
import { addIbmButton, openIbmDialog } from '../lab/ibm-dialog';
import { schedule } from '../quantum/pulses';

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
  'code-panel': { pos: new Vector3(0.02, 0.29, -0.22), rot: new Euler(-0.05, 0, 0, 'YXZ') },
  // zoomed: bigger, at eye level just behind the orbs (the head is about 0.42 m up, 0.4 m back), facing the player
  'code-zoom': { pos: new Vector3(0, 0.43, -0.05), rot: new Euler(0, 0, 0, 'YXZ') },
  'notes-zoom': { pos: new Vector3(0, 0.4, -0.05), rot: new Euler(0, 0, 0, 'YXZ') },
  // notes: in front of the circuit board, low enough to read without looking up
  'notes-panel': { pos: new Vector3(0, 0.3, -0.17), rot: new Euler(-0.1, 0, 0, 'YXZ') },
  // the debugger and class panel hang from their top edge (anchor-y: top), just under the raised board
  'under-board': { pos: new Vector3(0, 0.332, -0.17), rot: new Euler(-0.1, 0, 0, 'YXZ') },
  // upper right, opposite the chapter card and above the dock
  'nav-panel': { pos: new Vector3(0.47, 0.26, -0.06), rot: new Euler(-0.12, (-32 * Math.PI) / 180, 0, 'YXZ') },
} as const;

const SLOTS = 7;
const CODE_LINES = 10;
const LIB_ROWS = 5;
const IBM_SHOTS = 1000;
/** How much bigger a zoomed window is. */
const ZOOM = 1.3;
const NAV_SLOTS = 18;
const TABS = ['course', 'campaign', 'learn', 'puzzle', 'build', 'sandbox'] as const;
/** Where hidden panels park, out of reach of every pointer. */
const PARKED = new Vector3(0, -50, 0);

/** Draw `count` shots from a probability list. */
function sampleProbs(p: ArrayLike<number>, count: number, rnd: () => number): Uint32Array {
  const counts = new Uint32Array(p.length);
  let total = 0;
  for (let i = 0; i < p.length; i++) total += p[i];
  for (let s = 0; s < count; s++) {
    let r = rnd() * total, k = 0;
    while (k < p.length - 1 && r >= p[k]) r -= p[k++];
    counts[k]++;
  }
  return counts;
}

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
  /** Code window language and page. */
  private codeFormat: Format = 'qiskit';
  private codePage = 0;
  /** Page count at the last render: someone reading the last page keeps following new steps. */
  private codePages = 1;
  /** Zoom: the code window and the notes grow and come closer. */
  private zoom = false;
  /** Scene scales of the code window and notes, before any zoom. */
  private codeScale = 0;
  private notesScale = 0;
  /** Eased 0..1: how far the windows are into their zoomed placement. */
  private zoomT = 0;
  /** Eased 0..1 open animation per window (a window settles in instead of popping up). */
  private codeOpenT = 1;
  private notesOpenT = 1;
  private codeWasOpen = false;
  private notesWasOpen = false;
  private readonly p2 = new Vector3();
  private readonly q2 = new Quaternion();
  /** Sandbox circuit before Simplify, kept until the circuit changes, so Undo can bring it back. */
  private unsimplified: { n: number; ops: Op[]; after: string } | null = null;
  /** Outside the sandbox Simplify only previews: the panel shows the shorter circuit, the lab keeps yours. */
  private preview: string | null = null;
  /** A note that belongs to one exact circuit (keyed by its ops); dropped once the circuit changes. */
  private codeNote: { key: string; text: string } | null = null;
  /** Set while Simplify reloads the lab: the reload passes through an empty circuit, which must not count as a change. */
  private reloading = false;
  private nav: UIKitMLAsset | null = null;
  private builderAsset: UIKitMLAsset | null = null;
  private builder: BuilderPanel | null = null;
  private notesAsset: UIKitMLAsset | null = null;
  private noiseAsset: UIKitMLAsset | null = null;
  private libAsset: UIKitMLAsset | null = null;
  private dbgAsset: UIKitMLAsset | null = null;
  private classAsset: UIKitMLAsset | null = null;
  /** why the shared lab last refused an op (for the voice reply) */
  private refused: string | null = null;
  /** Shared lab or classroom, while in one. */
  private room: SharedRoom | null = null;
  private classOpen = false;
  /** The course module the teacher is looking at in the class panel. */
  private classPick = 0;
  /** The certificate is on the board; and whether this session already showed it unasked. */
  private certOn = false;
  private certOffered = false;
  /** Where the player was when the certificate went up: moving on puts it away. */
  private certAt = '';
  private lastReport = '';
  private lastCoursed = -1;
  /** Step debugger: open, breakpoints (step numbers), and a run in progress (seconds to the next step). */
  private dbgOpen = false;
  private breakpoints = new Set<number>();
  private dbgRun: { stop: number; timer: number } | null = null;
  /** The big-state view on show (Q-sphere, state city, entanglement map), if any. */
  private stateView: StateView | null = null;
  /** Library panel: open, which tab, which page, and whether the board shows the QR code. */
  private libOpen = false;
  private libTab: 'circuit' | 'gate' = 'circuit';
  private libPage = 0;
  private libQr = false;
  private libNote: string | null = null;
  /** The noise lab panel is open (sandbox only). */
  private noiseOpen = false;
  private notes: NotesPanel | null = null;
  /** Which tab the navigator shows (it follows the mode, but can be browsed). */
  private tab: CampaignView['mode'] = 'campaign';
  /** Navigator page when a tab has more items than slots (the last slot turns the page). */
  private navPage = 0;
  private navCurrent = '';
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
    this.openRoomLink();
    this.openDailyLink();
    const onHash = () => this.openShared() || this.openRoomLink() || this.openDailyLink();
    window.addEventListener('hashchange', onHash);
    this.cleanupFuncs.push(() => window.removeEventListener('hashchange', onHash));

    this.cleanupFuncs.push(
      campaign.on((v) => (this.render(v), this.afterCampaign(v), this.afterDaily(), this.checkAchievements())),
      lab.on((e) => {
        this.dirty = true;
        if (this.room) {
          if (e.type === 'op' || e.type === 'reset' || e.type === 'seek') this.room.localChange();
          if (e.type === 'shots') this.room.localShots(e.counts);
          if (e.type === 'select') this.room.select(e.qubit);
        }
        if (e.type === 'rejected' && lab.guard) {
          this.refused = e.reason;
          this.flash(e.reason);
          feedback('reject');
        }
        if (e.type === 'select' || e.type === 'reset' || e.type === 'seek' || e.type === 'op') this.renderDock();
        if (e.type === 'reset' && campaign.mode === 'sandbox') this.render(campaign.view);
        // achievements count what happens on the orbs
        if (e.type === 'op') this.profile.onOp(e.op, lab.history.state);
        if (e.type === 'shots') this.profile.onShots(e.shots);
        if (e.type === 'seek') this.profile.onRewind();
        if (e.type === 'op' || e.type === 'shots' || e.type === 'seek') this.checkAchievements();
      }),
      this.visibilityState.subscribe((v) => {
        this.immersive = v !== VisibilityState.NonImmersive;
        this.render(campaign.view);
      }),
    );
  }

  private bind(): boolean {
    if (this.chapter && this.dock && this.nav && this.builder && this.notes) return true;
    this.chapter = this.world.getSceneObject<UIKitMLAsset>('chapter-panel') ?? null;
    this.dock = this.world.getSceneObject<UIKitMLAsset>('gate-dock') ?? null;
    this.code = this.world.getSceneObject<UIKitMLAsset>('code-panel') ?? null;
    this.nav = this.world.getSceneObject<UIKitMLAsset>('nav-panel') ?? null;
    this.builderAsset = this.world.getSceneObject<UIKitMLAsset>('builder-panel') ?? null;
    this.notesAsset = this.world.getSceneObject<UIKitMLAsset>('notes-panel') ?? null;
    this.noiseAsset = this.world.getSceneObject<UIKitMLAsset>('noise-panel') ?? null;
    this.libAsset = this.world.getSceneObject<UIKitMLAsset>('library-panel') ?? null;
    this.dbgAsset = this.world.getSceneObject<UIKitMLAsset>('debug-panel') ?? null;
    this.classAsset = this.world.getSceneObject<UIKitMLAsset>('class-panel') ?? null;
    if (!this.classAsset || !this.chapter || !this.dock || !this.code || !this.nav || !this.builderAsset || !this.notesAsset || !this.noiseAsset || !this.libAsset || !this.dbgAsset) return false;
    this.code.visible = false;

    // panels take poke and ray input but must never capture the grab pointer,
    // or a hand reaching for an orb just above the dock grabs the dock instead
    for (const panel of [this.chapter, this.dock, this.code, this.nav, this.builderAsset, this.notesAsset, this.noiseAsset, this.libAsset, this.dbgAsset, this.classAsset]) {
      panel.traverse((o) => {
        (o as unknown as { pointerEventsType: unknown }).pointerEventsType = { deny: 'grab' };
      });
    }

    const ids = ['chapter-eyebrow', 'chapter-title', 'chapter-body', 'goal-dot', 'goal-text', 'btn-next', 'btn-next-label', 'btn-replay', 'btn-replay-label', 'btn-notes', 'pip-0', 'pip-1', 'pip-2', 'pip-3', 'pip-4', 'choices'];
    for (let i = 0; i < 3; i++) ids.push(`choice-${i}`, `choice-${i}-k`, `choice-${i}-l`);
    for (const id of ids) this.els.set(id, this.chapter.requireElementById(id));
    const navIds = ['tab-course', 'tab-course-l', 'tab-campaign', 'tab-campaign-l', 'tab-learn', 'tab-learn-l', 'tab-puzzle', 'tab-puzzle-l', 'tab-build', 'tab-build-l', 'tab-sandbox', 'tab-sandbox-l', 'nav-progress', 'nav-progress-2', 'nav-me'];
    for (let i = 0; i < NAV_SLOTS; i++) navIds.push(`n-${i}`, `n-${i}-n`, `n-${i}-l`);
    for (const id of navIds) this.els.set(id, this.nav.requireElementById(id));
    const dockIds = ['g-h', 'g-x', 'g-y', 'g-z', 'g-s', 'g-t', 'g-rl', 'g-rr', 'a-cnot', 'a-swap', 'a-measure', 'a-shots', 'a-export', 't-prev', 't-next', 'dock-status', 'a-voice', 'a-voice-l', 'a-debug', 'a-debug-l', 'a-view', 'a-view-l', 'a-share', 'a-share-l', 'a-listen', 'a-listen-l'];
    for (let i = 0; i < SLOTS; i++) dockIds.push(`t-${i}`, `t-${i}-l`);
    for (const id of dockIds) this.els.set(id, this.dock.requireElementById(id));
    const codeIds = ['code-close', 'code-note', 'code-link', 'code-eyebrow', 'code-title', 'code-zoom', 'code-zoom-label', 'code-simplify', 'code-simplify-label', 'code-run', 'code-ibm', 'code-ibm-l', 'code-up', 'code-down', 'code-mach', 'code-m-superconducting', 'code-m-ions', 'code-m-atoms', 'code-compare'];
    for (const f of FORMATS) codeIds.push(`code-tab-${f}`, `code-tab-${f}-l`);
    for (let i = 0; i < CODE_LINES; i++) codeIds.push(`code-r-${i}`, `code-n-${i}`, `code-h-${i}`, `code-t-${i}`);
    for (const id of codeIds) this.els.set(id, this.code.requireElementById(id));
    const noiseIds = ['noise-title', 'noise-toggle', 'noise-toggle-label', 'noise-close', 'noise-note', 'noise-zne', 'noise-status'];
    for (const k of ['t1', 't2', 'p']) noiseIds.push(`noise-${k}`, `noise-${k}-fill`, `noise-${k}-down`, `noise-${k}-up`);
    for (const id of noiseIds) this.els.set(id, this.noiseAsset.requireElementById(id));
    this.els.set('btn-notes-label', this.chapter.requireElementById('btn-notes-label'));
    this.els.set('btn-lib', this.chapter.requireElementById('btn-lib'));
    const libIds = ['lib-title', 'lib-close', 'lib-tab-circuits', 'lib-tab-circuits-l', 'lib-tab-gates', 'lib-tab-gates-l', 'lib-note', 'lib-save', 'lib-save-l', 'lib-import', 'lib-qr', 'lib-qr-l', 'lib-prev', 'lib-next'];
    for (let i = 0; i < LIB_ROWS; i++) libIds.push(`lib-r-${i}`, `lib-n-${i}`, `lib-m-${i}`, `lib-a-${i}`, `lib-a-${i}-l`, `lib-d-${i}`);
    for (const id of libIds) this.els.set(id, this.libAsset.requireElementById(id));
    const dbgIds = ['dbg-eyebrow', 'dbg-title', 'dbg-close', 'dbg-why-0', 'dbg-why-1', 'dbg-why-2', 'dbg-start', 'dbg-back', 'dbg-step', 'dbg-run', 'dbg-run-l', 'dbg-bp', 'dbg-bp-l'];
    for (let i = 0; i < 8; i++) dbgIds.push(`dbg-c-${i}`, `dbg-p-${i}`, `dbg-b-${i}`, `dbg-l-${i}`);
    for (const id of dbgIds) this.els.set(id, this.dbgAsset.requireElementById(id));
    const classIds = ['cl-eyebrow', 'cl-title', 'cl-close', 'cl-pick', 'cl-prev', 'cl-mod', 'cl-next', 'cl-assign', 'cl-assign-l', 'cl-line', 'cl-list', 'cl-go', 'cl-go-l', 'cl-cert'];
    for (let i = 0; i < 6; i++) classIds.push(`cl-r-${i}`, `cl-n-${i}`, `cl-f-${i}`, `cl-s-${i}`);
    for (const id of classIds) this.els.set(id, this.classAsset.requireElementById(id));
    this.codeScale = this.code.scale.x;
    this.notesScale = this.notesAsset.scale.x;
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
    for (let i = 0; i < 3; i++) on(`choice-${i}`, () => feedback(campaign.answer(i) ? 'success' : 'reject'));
    on('btn-replay', () => {
      // in the course the second button is Show me while a task is open
      if (campaign.mode === 'course' && campaign.showMe()) return feedback('select');
      campaign.replay();
      feedback('select');
    });
    for (const tab of TABS) {
      on(`tab-${tab}`, () => {
        this.tab = tab;
        this.navPage = this.pageOfCurrent();
        this.renderNav(campaign.view);
        feedback('select');
      });
    }
    for (let i = 0; i < NAV_SLOTS; i++) {
      on(`n-${i}`, () => {
        const { paged, per, pages } = this.navPaging();
        if (paged && i === NAV_SLOTS - 1) {
          this.navPage = (this.navPage + 1) % pages;
          this.renderNav(campaign.view);
          return feedback('select');
        }
        const k = paged ? this.navPage * per + i : i;
        if (this.tab === 'course' && k < campaign.course.length) campaign.startCourse(k);
        else if (this.tab === 'campaign' && k < campaign.chapters.length) campaign.startChapter(k);
        else if (this.tab === 'learn' && k < campaign.lessons.length) campaign.startLesson(k);
        else if (this.tab === 'puzzle' && k < campaign.puzzles.length) campaign.startPuzzle(k);
        else if (this.tab === 'build' && k < BUILDS.length) campaign.enterBuild(k);
        else if (this.tab === 'sandbox' && k < PRESETS.length) campaign.loadPreset(k);
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
    // voice commands
    this.speech = new SpeechInput(
      (text) => this.onVoice(text),
      (listening, error) => {
        this.text('a-voice-l', listening ? 'Listening' : 'Voice');
        this.bg('a-voice', listening ? C.primary : '#2d2f33');
        this.flash(error ?? (listening ? 'Listening: say "Hadamard on qubit zero", "entangle zero and one", "run a thousand shots"...' : 'Voice off.'));
      },
    );
    on('a-voice', () => this.speech?.toggle());
    on('a-debug', () => this.toggleDebugger());
    on('a-view', () => this.cycleView());
    on('a-share', () => this.shareButton());
    on('cl-close', () => this.toggleClass(false));
    on('cl-prev', () => this.pickModule(-1));
    on('cl-next', () => this.pickModule(1));
    on('cl-assign', () => this.toggleAssigned());
    on('cl-go', () => this.startAssigned());
    on('cl-cert', () => this.toggleCertificate());
    on('a-listen', () => this.listenNow());
    on('nav-me', () => this.toggleProfile());
    const onEngage = (e: Event) => {
      const what = (e as CustomEvent<string>).detail;
      if (what === 'listen') this.listenNow();
      else if (what === 'daily') this.startDaily();
      else if (what === 'profile') this.toggleProfile();
      else if (what === 'snapshot') this.snapshot();
    };
    window.addEventListener('entangled:engage', onEngage);
    this.cleanupFuncs.push(() => window.removeEventListener('entangled:engage', onEngage));
    const onShareKey = (e: Event) => {
      const what = (e as CustomEvent<string>).detail ?? 'button';
      if (what === 'dialog') this.openShare();
      else if (what === 'class') this.toggleClass();
      else this.shareButton();
    };
    window.addEventListener('entangled:share', onShareKey);
    this.cleanupFuncs.push(() => window.removeEventListener('entangled:share', onShareKey), () => this.leaveRoom(true));
    this.cleanupFuncs.push(this.addShareButton());
    const onViewKey = () => this.cycleView();
    window.addEventListener('entangled:view', onViewKey);
    this.cleanupFuncs.push(() => window.removeEventListener('entangled:view', onViewKey));
    on('dbg-close', () => this.toggleDebugger());
    on('dbg-start', () => this.dbgSeek(0));
    on('dbg-back', () => this.dbgSeek(lab.history.cursor - 1));
    on('dbg-step', () => this.dbgSeek(lab.history.cursor + 1));
    on('dbg-run', () => this.dbgToggleRun());
    on('dbg-bp', () => this.dbgToggleBreakpoint());
    const onDebugKey = (e: Event) => {
      const what = (e as CustomEvent<string>).detail ?? 'toggle';
      if (what === 'toggle' || (what === 'open' && !this.dbgOpen)) return this.toggleDebugger();
      if (!this.dbgOpen) return;
      if (what === 'back') this.dbgSeek(lab.history.cursor - 1);
      else if (what === 'step') this.dbgSeek(lab.history.cursor + 1);
      else if (what === 'run') this.dbgToggleRun();
      else if (what === 'bp') this.dbgToggleBreakpoint();
    };
    window.addEventListener('entangled:debug', onDebugKey);
    this.cleanupFuncs.push(() => window.removeEventListener('entangled:debug', onDebugKey));
    // development: feed text to the voice handler as if it had been heard (for automated checks)
    if (import.meta.env.DEV) {
      const onSay = (e: Event) => this.onVoice((e as CustomEvent<string>).detail);
      window.addEventListener('entangled:say', onSay);
      this.cleanupFuncs.push(() => window.removeEventListener('entangled:say', onSay));
      // and jump to a chapter, press its card button or Show me
      const onChapter = (e: Event) => campaign.startChapter(Number((e as CustomEvent<string>).detail));
      const onCard = (e: Event) => ((e as CustomEvent<string>).detail === 'showme' ? campaign.showMe() : campaign.next());
      window.addEventListener('entangled:chapter', onChapter);
      window.addEventListener('entangled:card', onCard);
      this.cleanupFuncs.push(() => window.removeEventListener('entangled:chapter', onChapter), () => window.removeEventListener('entangled:card', onCard));
    }
    const onVoiceKey = () => this.speech?.toggle();
    window.addEventListener('entangled:voice', onVoiceKey);
    this.cleanupFuncs.push(() => window.removeEventListener('entangled:voice', onVoiceKey), () => this.speech?.stop());
    on('code-link', () => this.copyLink());
    for (const f of FORMATS) on(`code-tab-${f}`, () => this.setFormat(f));
    on('code-simplify', () => this.simplifyCircuit());
    on('code-run', () => this.runChip());
    for (const id of ['superconducting', 'ions', 'atoms'] as const) on(`code-m-${id}`, () => this.setMachine(id));
    on('code-compare', () => this.compareMachines());
    on('code-ibm', () => void this.runIbm());
    this.cleanupFuncs.push(addIbmButton());
    // a job submitted before a reload: keep waiting for it
    const pending = loadPending();
    const settings = loadSettings();
    if (pending && settings) this.ibmJob = { ...pending, client: new IbmClient(settings), ideal: null, sim: null, polling: false };
    on('code-zoom', () => this.toggleZoom());
    on('code-up', () => this.pageCode(-1));
    on('code-down', () => this.pageCode(1));
    // K, G, O, = and the up / down arrows on desktop
    const onCodeKey = (e: Event) => {
      const what = (e as CustomEvent<string>).detail;
      if (what === 'toggle') {
        if (this.code?.visible) this.code.visible = false;
        else this.showCode();
      } else if (what === 'format') this.setFormat(FORMATS[(FORMATS.indexOf(this.codeFormat) + 1) % FORMATS.length]);
      else if (what === 'simplify') (this.codeFormat === 'chip' ? this.runChip() : this.simplifyCircuit());
      else if (what === 'ibm') void this.runIbm();
      else if (what === 'zoom') this.toggleZoom();
      else if ((what === 'up' || what === 'down') && this.code?.visible) this.pageCode(what === 'up' ? -1 : 1);
    };
    window.addEventListener('entangled:code', onCodeKey);
    this.cleanupFuncs.push(() => window.removeEventListener('entangled:code', onCodeKey));
    on('code-close', () => {
      this.code!.visible = false;
      feedback('select');
    });

    this.builder = new BuilderPanel(this.builderAsset, campaign.build, () => feedback('select'));
    this.notes = new NotesPanel(this.notesAsset, () => undefined, () => this.toggleZoom());
    on('btn-notes', () => (campaign.mode === 'sandbox' ? this.toggleNoise() : this.toggleNotes()));
    on('btn-lib', () => this.toggleLibrary());
    on('lib-close', () => this.toggleLibrary());
    on('lib-tab-circuits', () => this.libShow('circuit'));
    on('lib-tab-gates', () => this.libShow('gate'));
    on('lib-prev', () => this.libTurn(-1));
    on('lib-next', () => this.libTurn(1));
    on('lib-save', () => this.libSave());
    on('lib-import', () => this.libImport());
    on('lib-qr', () => this.libToggleQr());
    for (let i = 0; i < LIB_ROWS; i++) {
      on(`lib-a-${i}`, () => this.libUse(i));
      on(`lib-d-${i}`, () => this.libDelete(i));
    }
    // the builder's custom slots follow the library's newest gates
    const syncCustoms = () => campaign.build.setCustoms(library.gates.slice(0, 3).map((g) => ({ name: g.name, n: g.n, ops: g.ops })), campaign.mode === 'build');
    syncCustoms();
    this.cleanupFuncs.push(
      library.onChange(() => {
        syncCustoms();
        this.renderLibrary();
      }),
    );
    const onLibKey = (e: Event) => {
      const what = (e as CustomEvent<string>).detail;
      if (what === 'toggle') this.toggleLibrary();
      else if (!this.libOpen) return;
      else if (what === 'save') this.libSave();
      else if (what === 'tab') this.libShow(this.libTab === 'circuit' ? 'gate' : 'circuit');
      else if (what === 'qr') this.libToggleQr();
      else if (what === 'import') this.libImport();
      else if (what === 'use') this.libUse(0);
    };
    window.addEventListener('entangled:library', onLibKey);
    this.cleanupFuncs.push(() => window.removeEventListener('entangled:library', onLibKey));
    on('noise-toggle', () => {
      noiseLab.toggle();
      feedback('select');
    });
    on('noise-close', () => this.toggleNoise());
    on('noise-zne', () => {
      noiseLab.mitigate(lab.n, lab.history.ops);
      feedback('shots');
    });
    for (const [k, key] of [['t1', 't1'], ['t2', 't2'], ['p', 'depol']] as const) {
      on(`noise-${k}-down`, () => noiseLab.step(key, -1));
      on(`noise-${k}-up`, () => noiseLab.step(key, 1));
    }
    // noisy shots sample the mixed state's probabilities
    lab.sampler = null;
    this.cleanupFuncs.push(
      noiseLab.onChange(() => {
        lab.sampler = noiseLab.on ? (count) => sampleProbs(noiseLab.rho(lab.n, lab.history.ops).probabilities(), count, () => lab.random()) : null;
        this.world.getSystem(LabSystem)?.refreshBoard();
        this.renderNoise();
        this.dirty = true;
      }),
    );
    const onNoiseKey = (e: Event) => {
      const what = (e as CustomEvent<string>).detail;
      if (what === 'panel') return this.toggleNoise();
      if (!this.noiseOpen) return;
      if (what === 'toggle') noiseLab.toggle();
      else if (what === 'zne' && noiseLab.on) noiseLab.mitigate(lab.n, lab.history.ops);
      else if (what === 't1-up' || what === 't1-down') noiseLab.step('t1', what === 't1-up' ? 1 : -1);
    };
    window.addEventListener('entangled:noise', onNoiseKey);
    this.cleanupFuncs.push(() => window.removeEventListener('entangled:noise', onNoiseKey));
    this.renderNoise();
    // the I key (desktop) asks for notes through a window event, to keep input and UI decoupled
    const onNotesKey = () => (this.notes?.open ? this.notes.advance() : this.toggleNotes());
    window.addEventListener('entangled:notes', onNotesKey);
    this.cleanupFuncs.push(() => window.removeEventListener('entangled:notes', onNotesKey));
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
    // the Notes button only shows where there are notes; open notes follow the chapter or lesson
    const n = this.currentNotes(v);
    // in the sandbox the third card button opens the noise lab
    const sandbox = v.mode === 'sandbox' && !v.intro;
    this.els.get('btn-notes')?.setProperties({ display: n || sandbox ? 'flex' : 'none' });
    this.text('btn-notes-label', sandbox ? (this.noiseOpen ? 'Close noise' : 'Noise') : 'Notes');
    this.els.get('btn-lib')?.setProperties({ display: sandbox ? 'flex' : 'none' });
    // the noise lab is a sandbox tool: leaving the sandbox turns it off
    if (!sandbox && (this.noiseOpen || noiseLab.on)) {
      this.noiseOpen = false;
      if (noiseLab.on) noiseLab.toggle();
    }
    if (this.notes?.open) {
      if (!n) this.notes.close();
      else if (n.title !== this.notes.title) this.notes.show(n.eyebrow, n.title, n.paras);
    }
    if (v.mode !== 'sandbox' || v.preset >= 0) this.sharedOpen = false;
    if (v.intro || v.mode === 'sandbox') this.els.get('choices')?.setProperties({ display: 'none' });
    if (v.intro) {
      this.text('chapter-eyebrow', 'Welcome');
      this.text('chapter-title', 'Entangled');
      this.text('chapter-body', 'Hold a qubit in your hand. Eighteen chapters, from one qubit to Shor and VQE. A ghost hand shows every move, and every move has a button too.');
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
    if (v.mode !== 'course' && v.mode !== 'campaign' && v.mode !== 'learn' && v.mode !== 'puzzle') this.els.get('choices')?.setProperties({ display: 'none' });
    if (v.mode === 'build') {
      this.renderBuildCard(v);
      return;
    }
    const ch = v.chapter!;
    const learn = v.mode === 'learn';
    const puzzle = v.mode === 'puzzle';
    const course = v.mode === 'course';
    // lessons, puzzles and the course step through a list; chapters tell a story
    const listed = learn || puzzle || course;
    const best = puzzle ? v.stars[v.puzzleIndex] : 0;
    this.text(
      'chapter-eyebrow',
      course
        ? `Course  /  module ${v.courseIndex + 1} of ${v.courseCount}  /  step ${Math.min(v.stepIndex + 1, ch.steps.length)} of ${ch.steps.length}`
        : learn
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
        listed ? `${course ? 'Module' : learn ? 'Lesson' : 'Puzzle'} complete. Tap Next.` : v.chapterIndex + 1 < v.chapterCount ? 'Chapter complete. Tap Continue.' : 'All chapters complete. Tap Continue for the sandbox.',
      );
      this.bg('goal-dot', C.done);
    } else if (step) {
      this.text('chapter-body', v.stepDone && v.payoff ? v.payoff : v.text ?? '');
      const hint = !this.immersive && step.keys ? `  (${step.keys})` : '';
      this.text('goal-text', v.stepDone ? 'Done' : (v.goal ?? '') + hint);
      this.bg('goal-dot', v.stepDone ? C.done : C.current);
    }
    this.renderChoices(v);
    // the course has more steps than pips: the eyebrow counts them instead
    for (let i = 0; i < 5; i++) {
      const pip = this.els.get(`pip-${i}`);
      if (!pip) continue;
      if (i >= ch.steps.length || course) {
        pip.setProperties({ display: 'none' });
        continue;
      }
      const done = v.chapterDone || i < v.stepIndex || (i === v.stepIndex && v.stepDone);
      pip.setProperties({ display: 'flex', backgroundColor: done ? C.done : i === v.stepIndex ? C.current : C.todo });
    }
    // a step that needs a card button (Oracle, Storm ...) turns Continue into that button
    this.text('btn-next-label', v.action ?? (listed ? 'Next' : 'Continue'));
    this.text('btn-replay-label', course && step?.solve && !v.stepDone && !v.chapterDone ? 'Show me' : listed ? 'Retry' : 'Replay');
    this.bg('btn-next', v.action || v.chapterDone || v.stepDone ? C.primary : C.primaryIdle);
    if (v.action) this.text('goal-text', (v.goal ?? '') + (this.immersive ? `: tap ${v.action}` : '  (press Enter)'));
    if (step?.hold && v.stepDone && !v.chapterDone) this.text('goal-text', this.immersive ? 'Tap Continue when ready' : 'Press Enter to continue');
    this.renderNav(v);
    const cue = `${v.mode}-${v.chapterIndex}-${v.lessonIndex}-${v.stepIndex}-${v.stepDone}-${v.chapterDone}`;
    if ((v.stepDone || v.chapterDone) && cue !== this.lastCue) feedback('success');
    this.lastCue = cue;
  }

  /**
   * Quiz answers on the card: hidden unless the step is a quiz; a wrong pick
   * turns red, the right one turns mint once answered.
   */
  private renderChoices(v: CampaignView): void {
    const choices = !v.intro && !v.chapterDone ? v.step?.choices : undefined;
    this.els.get('choices')?.setProperties({ display: choices ? 'flex' : 'none' });
    if (!choices) return;
    for (let i = 0; i < 3; i++) {
      const c = choices[i];
      this.els.get(`choice-${i}`)?.setProperties({ display: c ? 'flex' : 'none' });
      if (!c) continue;
      const right = v.stepDone && i === v.step!.answer;
      const wrong = v.wrong === i;
      this.text(`choice-${i}-l`, c);
      this.bg(`choice-${i}`, right ? '#1f3a30' : wrong ? '#3a2523' : '#2d2f33');
      this.els.get(`choice-${i}-l`)?.setProperties({ color: right ? C.done : wrong ? '#ff8a7a' : C.text });
      this.els.get(`choice-${i}-k`)?.setProperties({ color: right ? C.done : wrong ? '#ff8a7a' : C.textDim });
    }
    if (!v.stepDone) this.text('goal-text', v.wrong !== null ? 'Not quite. Try another answer.' : this.immersive ? 'Tap an answer' : 'Pick an answer  (press 1, 2 or 3)');
    this.bg('goal-dot', v.stepDone ? C.done : v.wrong !== null ? '#ff8a7a' : C.current);
  }

  private speech: SpeechInput | null = null;
  /** A short message on the dock's status line (what voice heard, and so on), until `until`. */
  private dockFlash: { text: string; until: number } | null = null;
  /** Pops up above the dock: achievements, the daily challenge solved. */
  private banner = new Banner();
  private profile = new Profile(loadProfile());
  private dailyRec: DailyRecord = loadDaily() ?? emptyDaily();
  private profileOpen = false;
  /** The machine the chip tab compiles for and runs on. */
  private machine: PlatformId = 'superconducting';
  /** The last Compare all three, for this circuit. */
  private compared: { key: string; results: PlatformResult[]; ideal: number[] } | null = null;
  private profileDirty = false;
  private profileSaveTimer = 0;

  private flash(text: string): void {
    this.dockFlash = { text, until: performance.now() + 4000 };
    this.renderDock();
  }

  // ---- engagement: achievements, levels, the daily challenge, listening, pictures

  /** Progress the achievements need from the campaign and the daily record. */
  private progressContext(): ProgressContext {
    const v = campaign.view;
    return {
      chaptersDone: v.completed.map((i) => campaign.chapters[i]?.title ?? ''),
      chapterCount: campaign.chapters.length,
      lessonsDone: v.learned.length,
      lessonCount: campaign.lessons.length,
      courseDone: v.coursed.length,
      courseCount: campaign.course.length,
      stars: v.stars.slice(0, PUZZLES.length),
      dailyDays: Object.keys(this.dailyRec.days).length,
      streak: streak(this.dailyRec, dayKey()),
    };
  }

  /** Unlock what is now earned; each new one gets a turn on the dock line and a chime. */
  private checkAchievements(): void {
    this.profileDirty = true;
    const fresh = this.profile.check(this.progressContext());
    if (!fresh.length) return;
    for (const a of fresh) this.banner.show('Achievement unlocked', a.title, a.text);
    feedback('success');
    this.renderNav(campaign.view);
    if (this.profileOpen) this.updateBoardMode();
  }

  private use(feature: string): void {
    this.profile.use(feature);
    this.checkAchievements();
  }

  private profileView(): ProfileView {
    const ctx = this.progressContext();
    const xp = xpFor(this.profile.data, ctx);
    const lvl = levelFor(xp);
    const today = dayKey();
    return {
      level: lvl.level,
      title: lvl.title,
      xp,
      into: lvl.into,
      span: lvl.span,
      streak: ctx.streak,
      bestStreak: bestStreak(this.dailyRec),
      daily: { number: dailyNumber(today), result: this.dailyRec.days[today] ?? null },
      achievements: ACHIEVEMENTS.map((a) => ({ title: a.title, text: a.text, unlocked: !!this.profile.data.unlocked[a.id], progress: a.progress?.(this.profile.data.stats, ctx) })),
    };
  }

  private toggleProfile(open = !this.profileOpen): void {
    this.profileOpen = open;
    if (open) {
      this.libOpen = this.dbgOpen = this.classOpen = false;
      this.certOn = false;
      if (this.code) this.code.visible = false;
      if (this.notes?.open) this.notes.close();
      this.noiseOpen = false;
      this.renderLibrary();
    }
    feedback('select');
  }

  /** Today's daily challenge: the last puzzle on the Puzzles tab. */
  private startDaily(): void {
    this.profileOpen = false;
    campaign.startPuzzle(campaign.puzzles.length - 1);
    const today = this.dailyRec.days[dayKey()];
    this.flash(today ? `Daily #${dailyNumber(dayKey())}: you solved it in ${today.moves}. Try for fewer, or come back tomorrow.` : `Daily #${dailyNumber(dayKey())}: the same puzzle for everyone today.`);
    feedback('select');
  }

  /** A #daily link opens today's challenge. */
  private openDailyLink(): boolean {
    if (location.hash !== '#daily') return false;
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      // the link stays in the address bar
    }
    this.startDaily();
    return true;
  }

  /** The daily challenge was just solved: add it to the streak, and offer the result to share. */
  private afterDaily(): void {
    const d = campaign.lastDaily;
    if (!d) return;
    campaign.lastDaily = null;
    this.dailyRec = recordDaily(this.dailyRec, d.key, d.moves, d.par);
    saveDaily(this.dailyRec);
    const s = streak(this.dailyRec, d.key);
    this.banner.show(`Daily #${dailyNumber(d.key)} solved`, `${d.moves} move${d.moves === 1 ? '' : 's'}, par ${d.par}`, `Daily streak: ${s} day${s === 1 ? '' : 's'}. A new puzzle tomorrow.`);
    if (!this.immersive) openDailyDialog(`Daily #${dailyNumber(d.key)} solved`, shareText(this.dailyRec, d.key, `${location.origin}${location.pathname}#daily`));
  }

  /** Play the state as a chord, and say what is being heard. */
  private listenNow(): void {
    const notes = listen(lab.state);
    const n = lab.n;
    const ket = (k: number) => `|${k.toString(2).padStart(n, '0')}>`;
    const together = notes.every((x) => x.delay === notes[0].delay);
    this.flash(notes.length === 1 ? `One note: the state is ${ket(notes[0].k)}.` : notes.length > 6 ? `${notes.length} notes${together ? ', all together' : ': each phase comes in at its own time'}.` : `${notes.map((x) => ket(x.k)).join(' ')}: ${together ? 'one chord, same phase' : 'rolled out by phase'}.`);
    this.use('listen');
  }

  /** Save a picture of the board with a QR code of this circuit. */
  private snapshot(): void {
    const labSys = this.world.getSystem(LabSystem);
    if (!labSys) return;
    const gates = lab.history.ops.slice(0, lab.history.cursor).filter((o) => o.kind !== 'measure').length;
    const v = campaign.view;
    const title = v.mode === 'sandbox' ? 'My quantum circuit' : (v.chapter?.title ?? 'My quantum circuit');
    const link = `${location.origin}${location.pathname}${SHARE_PREFIX}${encodeURIComponent(encodeCircuit(lab.n, lab.history.ops.slice(0, lab.history.cursor)))}`;
    downloadSnapshot(labSys.boardImage(), { title, subtitle: `${lab.n} qubit${lab.n === 1 ? '' : 's'}, ${gates} gate${gates === 1 ? '' : 's'}`, link, date: new Date() });
    this.flash('Saved a picture of the board: entangled-circuit.png, with a QR code that opens this circuit.');
    this.use('snapshot');
  }

  /** What the microphone heard: understand it, do it, and say what was done. */
  private onVoice(text: string): void {
    const cmd = parseVoice(text);
    if (!cmd) {
      this.flash(`Heard "${text.trim()}": not a command I know.`);
      return feedback('reject');
    }
    this.refused = null;
    const ok = this.runVoice(cmd);
    if (ok) this.use('voice');
    // a shared lab refusing the gate says why (whose qubit it is); keep that rather than a generic no
    this.flash(`Heard "${text.trim()}": ${ok ? `${describeVoice(cmd)}.` : this.refused ?? `${describeVoice(cmd)} is not possible here.`}`);
    feedback(ok ? 'select' : 'reject');
  }

  /** Carry out a voice command with the same calls the buttons and gestures use. Returns false if it does not apply. */
  private runVoice(c: VoiceCommand): boolean {
    const inRange = (q: number) => q >= 0 && q < lab.n;
    switch (c.type) {
      case 'gate': {
        const q = c.qubit ?? lab.selected;
        if (!inRange(q)) return false;
        lab.select(q);
        return !!lab.gate(c.gate, q, c.params);
      }
      case 'cnot':
        return inRange(c.control) && inRange(c.target) && c.control !== c.target && !!lab.entangle(c.control, c.target);
      case 'swap':
        return inRange(c.a) && inRange(c.b) && c.a !== c.b && !!lab.apply({ kind: 'swap', a: c.a, b: c.b });
      case 'measure':
        if (c.qubit === 'all') {
          for (let q = 0; q < lab.n; q++) lab.measure(q);
          return true;
        }
        return inRange(c.qubit ?? lab.selected) && lab.measure(c.qubit ?? lab.selected) !== null;
      case 'shots':
        lab.shots(Math.min(1000, Math.max(1, c.count)));
        return true;
      case 'select':
        if (!inRange(c.qubit)) return false;
        lab.select(c.qubit);
        return true;
      case 'answer':
        return campaign.answer(c.index);
      case 'undo':
        return lab.undo();
      case 'redo':
        return lab.redo();
      case 'reset':
        campaign.replay();
        return true;
      case 'add':
        if (campaign.mode !== 'sandbox' || lab.n >= MAX_ORBS) return false;
        lab.reset(lab.n + 1);
        return true;
      case 'remove':
        if (campaign.mode !== 'sandbox' || lab.n <= 1) return false;
        lab.reset(lab.n - 1);
        return true;
      case 'next':
        campaign.next();
        return true;
      case 'showme':
        return campaign.showMe();
      case 'notes':
        this.toggleNotes();
        return true;
      case 'code':
        this.showCode();
        return true;
      case 'simplify':
        this.simplifyCircuit();
        return true;
      case 'zoom':
        this.toggleZoom();
        return true;
      case 'noise':
        if (campaign.mode !== 'sandbox') return false;
        this.toggleNoise();
        return true;
      case 'library':
        this.toggleLibrary();
        return true;
      case 'debug':
        window.dispatchEvent(new Event('entangled:debug'));
        return true;
      case 'view':
        window.dispatchEvent(new Event('entangled:view'));
        return true;
      case 'claim':
        if (!this.room || this.room.kind !== 'lab') return false;
        return this.room.claim(c.qubit ?? lab.selected);
      case 'join': {
        const code = parseCode(c.code);
        if (!code) return false;
        this.joinRoom(code, savedName() || 'Player', 'student', false);
        return true;
      }
      case 'share':
        if (this.room) return false;
        this.startRoom('lab', savedName() || 'Player');
        return true;
      case 'leave':
        if (!this.room) return false;
        this.leaveRoom();
        return true;
      case 'assign': {
        const r = this.room;
        if (r?.kind !== 'class' || r.me.role !== 'teacher' || c.module < 0 || c.module >= COURSE.length) return false;
        this.classPick = c.module;
        r.assign(c.on ? [...r.assigned, c.module] : r.assigned.filter((m) => m !== c.module));
        if (!this.classOpen) this.toggleClass(true);
        return true;
      }
      case 'classroom':
        if (this.room?.kind !== 'class') return false;
        this.toggleClass();
        return true;
      case 'listen':
        this.listenNow();
        return true;
      case 'daily':
        this.startDaily();
        return true;
      case 'profile':
        this.toggleProfile();
        return true;
      case 'snapshot':
        this.snapshot();
        return true;
      case 'machine':
        if (!this.code?.visible || this.codeFormat !== 'chip') {
          this.codeFormat = 'chip';
          this.showCode(false);
        }
        this.setMachine(c.id);
        return true;
      case 'compare':
        if (!this.code?.visible || this.codeFormat !== 'chip') {
          this.codeFormat = 'chip';
          this.showCode(false);
        }
        this.compareMachines();
        return true;
      case 'close':
        this.profileOpen = false;
        this.certOn = false;
        if (this.code) this.code.visible = false;
        if (this.notes?.open) this.notes.close();
        this.libOpen = false;
        this.noiseOpen = false;
        this.renderLibrary();
        return true;
    }
  }

  // ---- shared lab and classroom

  /**
   * The dock's Share button: outside a room it opens the share dialog (in the
   * headset, where the page cannot be seen, it opens a shared lab at once);
   * in a shared lab it claims or releases the selected qubit; in a class it
   * opens the class panel.
   */
  private shareButton(): void {
    if (!this.room) {
      if (this.immersive) this.startRoom('lab', savedName() || 'Player');
      else this.openShare();
      return;
    }
    if (this.room.kind === 'lab') {
      const q = lab.selected;
      if (this.room.claim(q)) this.flash(this.room.me.owns.includes(q) ? `q${q} is yours: only you (or a teacher) can turn it. Press Share again to let go.` : `q${q} is free again.`);
      feedback('select');
    } else this.toggleClass();
  }

  private openShare(): void {
    const r = this.room;
    openShareDialog({
      current: r ? { code: r.code, kind: r.kind, role: r.me.role, peers: [...r.peers.values()].map((p) => `${p.name}${p.role === 'teacher' ? ' (teacher)' : ''}`), link: this.roomLink(r.code) } : null,
      start: (kind, name) => this.startRoom(kind, name),
      join: (code, name, role) => this.joinRoom(code, name, role, false),
      leave: () => this.leaveRoom(),
      certificate: this.certificateInfo() ? () => downloadCertificate(this.certificateInfo()!) : null,
      snapshot: () => this.snapshot(),
    });
  }

  private roomLink(code: string): string {
    // keep only the relay choice: other query parameters (dev tooling) don't belong in a shared link
    const relay = new URLSearchParams(location.search).get('relay');
    return `${location.origin}${location.pathname}${relay ? `?relay=${encodeURIComponent(relay)}` : ''}#room=${code}`;
  }

  /** A #room=CODE link joins that room. */
  private openRoomLink(): boolean {
    const m = /^#room=([A-Za-z0-9]+)/.exec(location.hash);
    if (!m) return false;
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      // the link stays in the address bar
    }
    const code = parseCode(m[1]);
    if (!code) return false;
    this.joinRoom(code, savedName() || 'Guest', 'student', false);
    return true;
  }

  private startRoom(kind: RoomKind, name: string): void {
    this.joinRoom(makeCode(kind), name, kind === 'class' ? 'teacher' : 'student', true);
  }

  private joinRoom(code: string, name: string, role: Role, creator: boolean): void {
    this.leaveRoom(true);
    this.use('shared');
    const kind = kindOf(code)!;
    const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 12);
    // a shared lab is one circuit in the sandbox (the creator keeps theirs; people joining get it)
    if (kind === 'lab' && campaign.mode !== 'sandbox') campaign.enterSandbox(lab.n, creator ? [...lab.history.ops] : []);
    const transport = new AutoTransport(code, () => this.flash('No relay server here: sharing only with other tabs of this browser. See the README for running one.'));
    this.room = new SharedRoom(
      code,
      { id, name: name || 'Player', role, owns: [], selected: lab.selected },
      transport,
      {
        snapshot: () => lab.history.toJSON(),
        restore: (h) => {
          if (campaign.mode !== 'sandbox') campaign.enterSandbox(h.n, []);
          lab.restore({ history: h, selected: Math.min(lab.selected, h.n - 1) });
        },
        showShots: (counts) => lab.showShots(counts),
        assigned: (modules) => this.onAssigned(modules),
        changed: () => this.roomChanged(),
        notify: (text) => this.flash(text),
      },
      creator,
    );
    lab.guard = (op) => this.room?.guard(op) ?? null;
    this.lastReport = '';
    this.flash(
      creator
        ? kind === 'lab'
          ? `Shared lab ${code} is open. Others join with that code (Share on their page, or say "join room ${code.split('').join(' ')}").`
          : `Class ${code} is open: students join with that code. Pick modules to assign in the class panel.`
        : `Joining ${kind === 'lab' ? 'shared lab' : 'class'} ${code}...`,
    );
    if (kind === 'class' && role === 'teacher') this.toggleClass(true);
    this.roomChanged();
    this.afterCampaign(campaign.view);
  }

  private leaveRoom(quiet = false): void {
    if (!this.room) return;
    this.room.close();
    this.room = null;
    lab.guard = null;
    this.classOpen = false;
    if (!quiet) this.flash('You left the room.');
    this.roomChanged();
  }

  /** Presence, claims, assignments or progress changed. */
  private roomChanged(): void {
    const r = this.room;
    this.text('a-share-l', r ? `${r.code} (${r.peers.size + 1})` : 'Share');
    this.bg('a-share', r ? C.primary : '#2d2f33');
    const owners = Array.from({ length: lab.n }, (_, q) => {
      const o = r?.kind === 'lab' ? r.ownerOf(q) : null;
      return o ? (o === r!.me ? 'you' : o.name) : null;
    });
    this.world.getSystem(LabSystem)?.setOwners(owners);
    this.renderClass();
  }

  /** The teacher assigned modules: start the first one not done yet. */
  private onAssigned(modules: number[]): void {
    const names = modules.map((m) => COURSE[m]?.title ?? `module ${m + 1}`);
    this.flash(modules.length ? `Your teacher assigned: ${names.join(', ')}.` : 'Your teacher cleared the assignment.');
    this.certOffered = false;
    const todo = modules.find((m) => !campaign.coursed.has(m));
    if (todo !== undefined && !(campaign.mode === 'course' && campaign.courseIndex === todo)) campaign.startCourse(todo);
    else if (todo === undefined && modules.length) {
      // finished before they were assigned: the certificate is ready now
      this.certOffered = true;
      this.certOn = true;
      this.certAt = `${campaign.mode}:${campaign.courseIndex}`;
      this.flash(`Your teacher assigned ${names.join(', ')}: you have already finished ${modules.length > 1 ? 'them' : 'it'}. Your certificate is on the board.`);
    }
    this.renderClass();
  }

  /** After each campaign change: report progress to the teacher, and offer the certificate once it is earned. */
  private afterCampaign(v: CampaignView): void {
    const r = this.room;
    if (r?.kind === 'class' && r.me.role === 'student') {
      const p: Progress = { mode: v.mode, module: v.courseIndex, step: v.chapterDone ? (v.chapter?.steps.length ?? 0) : v.stepIndex, steps: v.chapter?.steps.length ?? 0, done: [...v.coursed] };
      const key = JSON.stringify(p);
      if (key !== this.lastReport) {
        this.lastReport = key;
        r.report(p);
      }
    }
    const at = `${v.mode}:${v.courseIndex}`;
    if (this.certOn && this.certAt && at !== this.certAt) this.certOn = false;
    if (!this.certOn) this.certAt = '';
    // the certificate: all assigned modules done (in a class), or the whole course
    const earned = this.certificateInfo() !== null;
    const finishedNow = this.lastCoursed >= 0 && v.coursed.length > this.lastCoursed;
    this.lastCoursed = v.coursed.length;
    if (earned && finishedNow && !this.certOffered) {
      this.certOffered = true;
      this.certOn = true;
      this.certAt = at;
      this.flash('Certificate earned! It is on the board; download it from Share on the page.');
      feedback('success');
    }
    this.renderClass();
  }

  private certificateInfo(): CertificateInfo | null {
    const r = this.room;
    const done = campaign.coursed;
    const name = r?.me.name || savedName() || 'A student';
    if (r?.kind === 'class' && r.me.role === 'student' && r.assigned.length) {
      if (!r.assigned.every((m) => done.has(m))) return null;
      const teacher = [...r.peers.values()].find((p) => p.role === 'teacher');
      return { name, modules: r.assigned.map((m) => COURSE[m]?.title ?? `Module ${m + 1}`), context: `Class ${r.code}${teacher ? `, teacher ${teacher.name}` : ''}`, date: new Date() };
    }
    if (COURSE.every((_, m) => done.has(m))) return { name, modules: COURSE.map((c) => c.title), context: 'The full Entangled course', date: new Date() };
    return null;
  }

  private toggleCertificate(): void {
    const info = this.certificateInfo();
    if (!info) {
      this.flash('Not yet: finish the assigned modules first.');
      return feedback('reject');
    }
    this.certOn = !this.certOn;
    this.certAt = this.certOn ? `${campaign.mode}:${campaign.courseIndex}` : '';
    if (!this.immersive && this.certOn) downloadCertificate(info);
    feedback('select');
  }

  private toggleClass(open = !this.classOpen): void {
    if (this.room?.kind !== 'class') open = false;
    this.classOpen = open;
    if (open) {
      if (this.code) this.code.visible = false;
      if (this.notes?.open) this.notes.close();
      this.libOpen = false;
      this.noiseOpen = false;
      this.dbgOpen = false;
      this.setView(null);
    }
    this.renderClass();
    feedback('select');
  }

  private pickModule(dir: number): void {
    this.classPick = (this.classPick + dir + COURSE.length) % COURSE.length;
    this.renderClass();
  }

  private toggleAssigned(): void {
    const r = this.room;
    if (!r || r.me.role !== 'teacher') return;
    const m = this.classPick;
    r.assign(r.assigned.includes(m) ? r.assigned.filter((x) => x !== m) : [...r.assigned, m]);
    feedback('select');
  }

  /** A student: go to the next assigned module not done yet. */
  private startAssigned(): void {
    const r = this.room;
    if (!r) return;
    const todo = r.assigned.find((m) => !campaign.coursed.has(m));
    if (todo === undefined) return this.flash(r.assigned.length ? 'All assigned modules are done.' : 'Nothing assigned yet.');
    campaign.startCourse(todo);
    this.toggleClass(false);
  }

  private renderClass(): void {
    const r = this.room;
    if (!this.classAsset || !this.classOpen || r?.kind !== 'class') return;
    const teacher = r.me.role === 'teacher';
    const students = [...r.peers.values()].filter((p) => p.role === 'student');
    const steps = (m: number) => COURSE[m]?.steps.length ?? 1;
    const titles = (ms: readonly number[]) => ms.map((m) => `${m + 1} ${COURSE[m]?.title ?? ''}`).join(', ');
    // the teacher counts students; a student sees who teaches the class
    const teacherName = [...r.peers.values()].find((p) => p.role === 'teacher')?.name;
    this.text('cl-eyebrow', teacher ? `Class ${r.code}  /  ${students.length} student${students.length === 1 ? '' : 's'}` : `Class ${r.code}${teacherName ? `  /  teacher ${teacherName}` : ''}  /  you: ${r.me.name}`);
    this.text('cl-title', teacher ? 'Assign modules, watch progress' : 'Your assignment');
    this.els.get('cl-pick')?.setProperties({ display: teacher ? 'flex' : 'none' });
    const picked = r.assigned.includes(this.classPick);
    this.text('cl-mod', `${this.classPick + 1}. ${COURSE[this.classPick].title}`);
    this.text('cl-assign-l', picked ? 'Unassign' : 'Assign');
    this.bg('cl-assign', picked ? '#3a2523' : C.primary);
    this.text('cl-line', r.assigned.length ? `Assigned: ${titles(r.assigned)}` : teacher ? 'Nothing assigned yet: pick a module and press Assign.' : 'Your teacher has not assigned anything yet.');
    // the teacher sees every student; a student sees themself
    const rows: { name: string; p: Progress | undefined }[] = teacher
      ? students.map((s) => ({ name: s.name, p: r.progress.get(s.id) }))
      : [{ name: r.me.name, p: { mode: campaign.mode, module: campaign.courseIndex, step: campaign.view.chapterDone ? steps(campaign.courseIndex) : campaign.view.stepIndex, steps: steps(campaign.courseIndex), done: [...campaign.coursed] } }];
    for (let i = 0; i < 6; i++) {
      const row = rows[i];
      this.els.get(`cl-r-${i}`)?.setProperties({ display: row ? 'flex' : 'none' });
      if (!row) continue;
      const { fraction, complete } = assignmentProgress(r.assigned, row.p, steps);
      this.text(`cl-n-${i}`, row.name);
      this.els.get(`cl-f-${i}`)?.setProperties({ width: 130 * fraction, backgroundColor: complete ? C.done : C.primary });
      const p = row.p;
      this.text(
        `cl-s-${i}`,
        !p ? 'joined' : complete ? 'All done: certificate earned' : p.mode === 'course' ? `Module ${p.module + 1}, step ${Math.min(p.step + 1, p.steps)} of ${p.steps}` : `In ${p.mode}`,
      );
    }
    if (!rows.length) this.text('cl-line', `${r.assigned.length ? `Assigned: ${titles(r.assigned)}. ` : ''}No students yet: they join with code ${r.code}.`);
    this.els.get('cl-list')?.setProperties({ display: rows.length ? 'flex' : 'none' });
    // nothing left to start once every assigned module is done
    const todo = r.assigned.some((m) => !campaign.coursed.has(m));
    this.els.get('cl-go')?.setProperties({ display: teacher || !todo ? 'none' : 'flex' });
    this.els.get('cl-cert')?.setProperties({ display: teacher ? 'none' : 'flex' });
    this.bg('cl-cert', this.certificateInfo() ? C.done : '#34363b');
  }

  /** A Share button on the 2D page, beside IBM Quantum. */
  private addShareButton(): () => void {
    const b = document.createElement('button');
    b.textContent = 'Share';
    b.style.cssText = 'position:fixed;right:150px;bottom:16px;z-index:10;height:36px;padding:0 16px;border-radius:18px;border:none;background:rgba(28,29,32,.88);color:#e4e6eb;font:600 13px Inter,system-ui,sans-serif;cursor:pointer';
    b.onclick = () => this.openShare();
    document.body.appendChild(b);
    return () => b.remove();
  }

  /** Q-sphere, then the state city, then the entanglement map, then back to the circuit. */
  private cycleView(): void {
    this.setView(nextView(this.stateView));
    this.flash(this.stateView ? `${STATE_VIEW_NAMES[this.stateView]}. Press View again for the next one.` : 'Back to the circuit.');
    feedback('select');
  }

  /** The views use the space in front of the board, so they and the debugger or class panel take turns. */
  private setView(view: StateView | null): void {
    this.stateView = view;
    if (view) this.use(`view:${view}`);
    if (view) this.dbgOpen = this.classOpen = false;
    this.text('a-view-l', this.stateView ? STATE_VIEW_NAMES[this.stateView] : 'View');
    this.bg('a-view', this.stateView ? C.primary : '#2d2f33');
  }

  /** Open or close the step debugger. */
  private toggleDebugger(): void {
    this.dbgOpen = !this.dbgOpen;
    this.dbgRun = null;
    if (this.dbgOpen) {
      this.use('debugger');
      this.classOpen = false;
      this.setView(null);
      if (this.code) this.code.visible = false;
      if (this.notes?.open) this.notes.close();
      this.libOpen = false;
      this.noiseOpen = false;
    }
    this.renderDebugger();
    feedback('select');
  }

  private dbgSeek(k: number): void {
    const target = Math.max(0, Math.min(lab.history.length, k));
    if (target === lab.history.cursor) return;
    lab.seek(target);
    feedback('select');
  }

  /** Run: step forward every half second until the next breakpoint (or the end); again to stop. */
  private dbgToggleRun(): void {
    if (this.dbgRun) this.dbgRun = null;
    else if (lab.history.cursor < lab.history.length) this.dbgRun = { stop: nextStop(lab.history.cursor, lab.history.length, this.breakpoints), timer: 0 };
    this.renderDebugger();
  }

  private dbgToggleBreakpoint(): void {
    const k = lab.history.cursor;
    if (k === 0) return;
    if (this.breakpoints.has(k)) this.breakpoints.delete(k);
    else this.breakpoints.add(k);
    this.renderDebugger();
    this.renderDock();
  }

  private updateDebugger(dt: number): void {
    if (!this.dbgRun) return;
    this.dbgRun.timer += dt;
    if (this.dbgRun.timer < 0.5) return;
    this.dbgRun.timer = 0;
    if (lab.history.cursor >= this.dbgRun.stop) {
      this.dbgRun = null;
      this.renderDebugger();
      return;
    }
    lab.seek(lab.history.cursor + 1);
    if (lab.history.cursor >= this.dbgRun.stop) {
      this.dbgRun = null;
      if (this.breakpoints.has(lab.history.cursor)) feedback('success');
      this.renderDebugger();
    }
  }

  private renderDebugger(): void {
    if (!this.dbgAsset || !this.dbgOpen) return;
    const h = lab.history;
    const k = h.cursor;
    const op = k > 0 ? h.ops[k - 1] : null;
    this.text('dbg-eyebrow', `Debugger  /  ${this.breakpoints.size ? `breakpoints at step ${[...this.breakpoints].sort((a, b) => a - b).join(', ')}` : 'no breakpoints'}`);
    this.text('dbg-title', stepTitle(op, k, h.length));
    const why = op ? explainStep(op, h.stateAt(k - 1), h.state) : ['Every qubit starts at 0. Step forward to see what each gate does, and why.'];
    for (let i = 0; i < 3; i++) this.els.get(`dbg-why-${i}`)?.setProperties({ display: why[i] ? 'flex' : 'none', text: why[i] ?? ' ' });
    const bars = histogram(h.state);
    for (let i = 0; i < 8; i++) {
      const b = bars[i];
      this.els.get(`dbg-c-${i}`)?.setProperties({ display: b ? 'flex' : 'none' });
      if (!b) continue;
      this.els.get(`dbg-b-${i}`)?.setProperties({ height: Math.max(2, 58 * b.p), backgroundColor: b.p > 0.001 ? '#c9ccd1' : '#34363b' });
      this.text(`dbg-p-${i}`, b.p > 0.001 ? b.p.toFixed(2) : '');
      this.text(`dbg-l-${i}`, b.label);
    }
    this.text('dbg-run-l', this.dbgRun ? 'Stop' : 'Run');
    this.bg('dbg-run', this.dbgRun ? C.primary : '#34363b');
    const onBp = this.breakpoints.has(k);
    this.text('dbg-bp-l', onBp ? 'Clear breakpoint' : 'Breakpoint');
    this.bg('dbg-bp', onBp ? '#3a2523' : '#34363b');
  }

  /** Open or close the library (any mode; loading a circuit moves to the sandbox). */
  private toggleLibrary(): void {
    this.libOpen = !this.libOpen;
    if (this.libOpen) this.dbgOpen = this.classOpen = this.profileOpen = false;
    this.libQr = false;
    this.libNote = null;
    if (this.libOpen) {
      if (this.code) this.code.visible = false;
      if (this.notes?.open) this.notes.close();
      this.noiseOpen = false;
    }
    this.renderLibrary();
    feedback('select');
  }

  private libItems() {
    return this.libTab === 'circuit' ? library.circuits : library.gates;
  }

  private libShow(tab: 'circuit' | 'gate'): void {
    this.libTab = tab;
    this.libPage = 0;
    this.libQr = false;
    this.libNote = null;
    this.renderLibrary();
    feedback('select');
  }

  private libTurn(dir: number): void {
    const pages = Math.max(1, Math.ceil(this.libItems().length / LIB_ROWS));
    this.libPage = Math.max(0, Math.min(pages - 1, this.libPage + dir));
    this.renderLibrary();
  }

  private libSave(): void {
    const ops = lab.history.ops.slice();
    try {
      const it = library.add(this.libTab, lab.n, ops);
      this.libNote = this.libTab === 'gate' ? `Saved as gate ${it.name} (${it.n} qubits). In Build it is a tile; in the sandbox, Apply drops it on the selected qubit and up.` : `Saved "${it.name}".`;
      this.libPage = 0;
      feedback('success');
    } catch (err) {
      this.libNote = (err as Error).message;
      feedback('reject');
    }
    this.renderLibrary();
  }

  private libUse(row: number): void {
    const it = this.libItems()[this.libPage * LIB_ROWS + row];
    if (!it) return;
    if (it.kind === 'circuit') {
      campaign.enterSandbox(it.n, it.ops);
      this.libNote = `Loaded "${it.name}" in the sandbox.`;
      feedback('select');
    } else {
      // a gate goes onto the selected qubit and the ones above it
      const qubits = [...Array(it.n).keys()].map((k) => lab.selected + k);
      if (campaign.mode !== 'sandbox' || qubits[qubits.length - 1] >= lab.n) {
        this.libNote = campaign.mode !== 'sandbox' ? 'Apply works in the sandbox (or use the gate as a tile in Build).' : `${it.name} needs ${it.n} qubits from q${lab.selected}: select a lower qubit or add one.`;
        feedback('reject');
      } else {
        for (const op of placeGate(it, qubits)) lab.apply(op);
        this.libNote = `Applied ${it.name} on ${qubits.map((q) => `q${q}`).join(', ')}.`;
        feedback('gate');
      }
    }
    this.renderLibrary();
  }

  private libDelete(row: number): void {
    const it = this.libItems()[this.libPage * LIB_ROWS + row];
    if (!it) return;
    library.remove(it.id);
    this.libNote = `Deleted "${it.name}".`;
    feedback('select');
  }

  private libImport(): void {
    if (this.immersive) {
      this.libNote = 'Import uses the 2D page: exit VR, paste the code, then come back in.';
      this.renderLibrary();
      return feedback('reject');
    }
    openImportDialog((c, name) => {
      const it = library.add('circuit', c.n, c.ops, name || undefined);
      campaign.enterSandbox(c.n, c.ops);
      this.libTab = 'circuit';
      this.libPage = 0;
      this.libNote = `Imported "${it.name}" from ${c.format === 'qasm' ? 'OpenQASM' : 'Qiskit'}: ${c.n} qubits, ${c.ops.length} steps.`;
      this.renderLibrary();
      feedback('success');
    });
  }

  private libToggleQr(): void {
    this.libQr = !this.libQr;
    this.renderLibrary();
    feedback('select');
  }

  private renderLibrary(): void {
    if (!this.libAsset) return;
    const items = this.libItems();
    const gates = this.libTab === 'gate';
    this.text('lib-title', gates ? 'My gates' : 'My circuits');
    for (const [t, on] of [['circuits', !gates], ['gates', gates]] as const) {
      this.bg(`lib-tab-${t}`, on ? C.text : '#242528');
      this.els.get(`lib-tab-${t}-l`)?.setProperties({ color: on ? '#18191b' : C.textDim });
    }
    const pages = Math.max(1, Math.ceil(items.length / LIB_ROWS));
    this.libPage = Math.min(this.libPage, pages - 1);
    for (let i = 0; i < LIB_ROWS; i++) {
      const it = items[this.libPage * LIB_ROWS + i];
      this.els.get(`lib-r-${i}`)?.setProperties({ display: it ? 'flex' : 'none' });
      if (!it) continue;
      this.text(`lib-n-${i}`, it.name);
      this.text(`lib-m-${i}`, `${it.n} qubit${it.n === 1 ? '' : 's'}, ${it.ops.length} steps${gates && i < 3 && this.libPage === 0 ? `, Build tile G${i + 1}` : ''}`);
      this.text(`lib-a-${i}-l`, gates ? 'Apply' : 'Load');
    }
    this.text('lib-save-l', gates ? 'Make gate' : 'Save this circuit');
    this.text('lib-qr-l', this.libQr ? 'Hide QR' : 'QR code');
    this.els.get('lib-prev')?.setProperties({ display: pages > 1 ? 'flex' : 'none' });
    this.els.get('lib-next')?.setProperties({ display: pages > 1 ? 'flex' : 'none' });
    this.text(
      'lib-note',
      this.libNote ??
        (gates
          ? 'Make gate turns the circuit on the orbs into one block you can reuse: a tile in Build, or Apply in the sandbox.'
          : items.length
            ? 'Saved on this device. Load opens a circuit in the sandbox.'
            : 'Nothing saved yet. Save this circuit keeps what is on the orbs; Import reads OpenQASM or Qiskit code.'),
    );
    this.dirty = true;
  }

  /** Open or close the noise lab (sandbox only). */
  private toggleNoise(): void {
    if (campaign.mode !== 'sandbox') return feedback('reject');
    this.noiseOpen = !this.noiseOpen;
    if (this.noiseOpen) {
      if (this.code) this.code.visible = false;
      if (this.notes?.open) this.notes.close();
    }
    this.renderNoise();
    this.render(campaign.view);
    feedback('select');
  }

  private renderNoise(): void {
    if (!this.noiseAsset) return;
    const { on, noise, zne } = noiseLab;
    this.text('noise-toggle-label', on ? 'Turn off' : 'Turn on');
    this.bg('noise-toggle', on ? C.primary : '#34363b');
    this.text('noise-title', on ? 'The chip is noisy' : 'Noise is off');
    this.text(
      'noise-note',
      on
        ? 'The orbs now show the noisy, mixed state: arrows shrink inside the spheres, and shots sample it. T1 is how long |1> lasts; T2 how long a superposition keeps its phase.'
        : 'Turn noise on to run every gate as a real chip would: errors, energy loss (T1) and dephasing (T2). The board shows the density matrix.',
    );
    const frac = (list: number[], v: number) => Math.max(0.04, (list.findIndex((x) => x >= v - 1e-12) + 1) / list.length);
    this.text('noise-t1', `${noise.t1} us`);
    this.text('noise-t2', `${noise.t2} us`);
    this.text('noise-p', `${(noise.depol * 100).toFixed(noise.depol < 0.001 && noise.depol > 0 ? 2 : 1)}%`);
    this.els.get('noise-t1-fill')?.setProperties({ width: 90 * frac(T1_STEPS, noise.t1) });
    this.els.get('noise-t2-fill')?.setProperties({ width: 90 * frac(T2_STEPS, noise.t2) });
    this.els.get('noise-p-fill')?.setProperties({ width: 90 * frac(DEPOL_STEPS, noise.depol) });
    this.text(
      'noise-status',
      zne ? `fidelity ${zne.values[0].toFixed(3)} -> ${zne.mitigated.toFixed(3)} mitigated (ideal 1)` : on ? 'Run noise at 1x, 2x, 3x and extrapolate to zero.' : 'Turn noise on to mitigate it.',
    );
    this.bg('noise-zne', on ? '#34363b' : '#26272b');
  }

  /** What the Notes button would open right now, if anything. */
  private currentNotes(v: CampaignView = campaign.view): { eyebrow: string; title: string; paras: string[] } | null {
    if (v.mode === 'build') {
      const paras = notesFor('Circuit diagrams');
      return paras && { eyebrow: 'Builder notes', title: 'Circuit diagrams', paras };
    }
    if ((v.mode === 'campaign' || v.mode === 'learn' || v.mode === 'course') && v.chapter && !v.intro) {
      const paras = notesFor(v.chapter.title);
      const eyebrow = v.mode === 'learn' ? `Lesson ${v.lessonIndex + 1} notes` : v.mode === 'course' ? 'Course notes' : `Chapter ${v.chapterIndex + 1} notes`;
      return paras && { eyebrow, title: v.chapter.title, paras };
    }
    return null;
  }

  private toggleNotes(): void {
    if (!this.notes) return;
    if (this.notes.open) {
      this.notes.close();
      return;
    }
    const n = this.currentNotes();
    if (!n) return feedback('reject');
    if (this.code) this.code.visible = false;
    this.notes.show(n.eyebrow, n.title, n.paras);
    feedback('select');
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
  /** How many items the current tab lists. */
  private navCount(): number {
    const t = this.tab;
    return t === 'course' ? campaign.course.length : t === 'campaign' ? campaign.chapters.length : t === 'learn' ? campaign.lessons.length : t === 'puzzle' ? campaign.puzzles.length : t === 'build' ? BUILDS.length : PRESETS.length;
  }

  /** More items than slots: pages of NAV_SLOTS - 1, the last slot turns the page. */
  private navPaging(): { paged: boolean; per: number; pages: number } {
    const n = this.navCount();
    const paged = n > NAV_SLOTS;
    const per = paged ? NAV_SLOTS - 1 : NAV_SLOTS;
    return { paged, per, pages: Math.max(1, Math.ceil(n / per)) };
  }

  /** The page holding what is being played on this tab (0 if nothing is). */
  private pageOfCurrent(): number {
    const v = campaign.view;
    const { paged, per } = this.navPaging();
    if (!paged) return 0;
    const i = this.tab === 'campaign' && v.mode === 'campaign' ? v.chapterIndex : this.tab === 'course' && v.mode === 'course' ? v.courseIndex : -1;
    return i < 0 ? 0 : Math.floor(i / per);
  }

  private renderNav(v: CampaignView): void {
    if (!this.nav) return;
    if (v.mode !== this.lastMode) {
      this.tab = v.mode;
      this.lastMode = v.mode;
    }
    // follow along when the chapter or module changes (Continue, keys, voice), once the tab matches
    const current = `${v.mode}:${v.chapterIndex}:${v.courseIndex}`;
    if (current !== this.navCurrent) {
      this.navCurrent = current;
      this.navPage = this.pageOfCurrent();
    }
    for (const tab of TABS) {
      const on = tab === this.tab;
      this.bg(`tab-${tab}`, on ? C.text : '#1b1c1f');
      this.els.get(`tab-${tab}-l`)?.setProperties({ color: on ? '#18191b' : C.textDim });
    }
    const items =
      this.tab === 'course'
        ? campaign.course.map((c, i) => ({ label: c.chip ?? c.title, done: v.coursed.includes(i), current: v.mode === 'course' && i === v.courseIndex }))
        : this.tab === 'campaign'
        ? campaign.chapters.map((c, i) => ({ label: c.chip ?? c.title, done: v.completed.includes(i), current: v.mode === 'campaign' && !v.intro && i === v.chapterIndex }))
        : this.tab === 'learn'
          ? campaign.lessons.map((c, i) => ({ label: c.title, done: v.learned.includes(i), current: v.mode === 'learn' && i === v.lessonIndex }))
          : this.tab === 'puzzle'
            ? campaign.puzzles.map((c, i) => ({ label: c.chip ?? c.title, done: v.stars[i] === 3, current: v.mode === 'puzzle' && i === v.puzzleIndex, stars: v.stars[i] }))
            : this.tab === 'build'
              ? BUILDS.map((c, i) => ({ label: c.chip, done: campaign.build.best.get(i) === 3, current: v.mode === 'build' && i === campaign.build.index, stars: campaign.build.best.get(i) ?? 0 }))
              : PRESETS.map((p, i) => ({ label: p.label, done: false, current: v.mode === 'sandbox' && i === campaign.preset }));
    const { paged, per, pages } = this.navPaging();
    const page = Math.min(this.navPage, pages - 1);
    for (let i = 0; i < NAV_SLOTS; i++) {
      if (paged && i === NAV_SLOTS - 1) {
        // the page turner
        const last = page === pages - 1;
        this.els.get(`n-${i}`)?.setProperties({ display: 'flex', backgroundColor: '#1b1c1f' });
        this.text(`n-${i}-l`, last ? 'Back' : 'More');
        this.els.get(`n-${i}-l`)?.setProperties({ color: C.text });
        this.text(`n-${i}-n`, last ? '<' : '>');
        this.els.get(`n-${i}-n`)?.setProperties({ color: C.textDim });
        continue;
      }
      const at = paged ? page * per + i : i;
      const it = items[at];
      this.els.get(`n-${i}`)?.setProperties({
        display: it ? 'flex' : 'none',
        backgroundColor: !it ? '#2d2f33' : it.current ? C.text : it.done ? '#1f3a30' : '#2d2f33',
      });
      if (!it) continue;
      this.text(`n-${i}-l`, it.label);
      this.els.get(`n-${i}-l`)?.setProperties({ color: it.current ? '#18191b' : it.done ? C.done : C.text });
      const stars = 'stars' in it ? (it.stars as number) : 0;
      this.text(`n-${i}-n`, stars ? `${stars}/3` : String(at + 1));
      this.els.get(`n-${i}-n`)?.setProperties({ color: it.current ? '#18191b' : it.done ? C.done : stars ? '#c9ccd1' : '#6b6e75' });
    }
    this.text('nav-progress', `${v.coursed.length}/${v.courseCount} course   ${v.completed.length}/${v.chapterCount} chapters   ${v.learned.length}/${v.lessonCount} lessons`);
    const ctx = this.progressContext();
    const lvl = levelFor(xpFor(this.profile.data, ctx));
    this.text('nav-progress-2', `Level ${lvl.level}  /  ${Object.keys(this.profile.data.unlocked).length} of ${ACHIEVEMENTS.length}`);
  }

  private renderDock(): void {
    if (!this.dock) return;
    const sel = lab.selected;
    const p1 = lab.history.state.prob1(sel);
    const h = lab.history;
    const flashing = this.dockFlash && performance.now() < this.dockFlash.until;
    this.text('dock-status', flashing ? this.dockFlash!.text : `Selected: q${sel}   P(1) = ${p1.toFixed(2)}   Step ${h.cursor} of ${h.length}`);
    this.els.get('dock-status')?.setProperties({ color: flashing ? C.text : qubitColor(sel) });

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
      this.els.get(`t-${i}`)?.setProperties({
        backgroundColor: current ? '#e4e6eb' : k <= all.length ? '#2a2c30' : '#232427',
        borderWidth: this.breakpoints.has(k) ? 2 : 0,
        borderColor: '#ff8a7a',
      });
    }
    if (this.code?.visible) this.showCode(false);
    this.renderDebugger();
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

  /** Show the circuit in another language (a tab of the code window). */
  private setFormat(f: Format): void {
    this.codeFormat = f;
    this.codePage = 0;
    this.showCode();
  }

  /** Zoom the code window and the notes in or out. */
  private toggleZoom(): void {
    this.zoom = !this.zoom;
    this.notes?.setZoomed(this.zoom);
    this.text('code-zoom-label', this.zoom ? 'Unzoom' : 'Zoom');
    this.bg('code-zoom', this.zoom ? C.primary : '#34363b');
    feedback('select');
  }

  /**
   * Run on chip: route the circuit onto T5, run 1000 shots with typical
   * hardware errors, play the run on the 3D chip, rain the counts, and say how
   * close they came to the ideal circuit.
   */
  private runChip(): void {
    const ops = lab.history.ops.slice();
    const routed = this.compiled(ops);
    if (typeof routed === 'string') {
      feedback('reject');
      return;
    }
    const shots = 1000;
    const noisy = this.machine === 'superconducting' ? runOnChip(routed, lab.n, T5.qubits, shots, Math.random, TYPICAL_NOISE) : runPlatform(this.machine, routed, lab.n, shots, Math.random);
    const score = agreement(noisy.counts, this.idealOf(ops));
    const labSys = this.world.getSystem(LabSystem);
    labSys?.playMachine(routed);
    labSys?.playHardware(labSys.machineSeconds(routed));
    lab.showShots(noisy.counts);
    const p = PLATFORMS[this.machine];
    const shot = formatTime((platformSchedule(this.machine, routed, lab.n).duration + p.timing.readout) / 1000);
    const how =
      this.machine === 'superconducting'
        ? routed.swaps ? `The ${routed.swaps} routing SWAP${routed.swaps === 1 ? '' : 's'} cost some of that.` : 'No SWAPs were needed.'
        : this.machine === 'ions' ? 'Every ion reaches every other, so nothing was rerouted.' : 'Atoms that were not neighbours flew over and back for their gates.';
    this.codeNote = {
      key: JSON.stringify(ops),
      text: `${shots} shots on the ${p.name.toLowerCase()} (two-qubit error ${(p.noise.p2 * 100).toFixed(1)}%, readout ${(p.noise.readout * 100).toFixed(1)}%): ${(score * 100).toFixed(1)}% agree with the ideal. One shot takes ${shot}. ${how}`,
    };
    this.use(`machine:${this.machine}`);
    this.showCode(false);
    feedback('shots');
  }

  /** Routed circuit for a course step that shows the hardware, cached until the circuit changes. */
  private stepRouted: { key: string; routed: Routed | null } = { key: '', routed: null };
  private landscapeGrid: Float32Array | null = null;

  /**
   * What the board, chip and fridge show: the code window's Chip or Maths tab
   * when it is open, otherwise whatever the current chapter or course step asks for.
   */
  private updateBoardMode(): void {
    const labSys = this.world.getSystem(LabSystem);
    if (!labSys) return;
    const v = campaign.view;
    const playing = v.mode === 'course' || v.mode === 'campaign' || v.mode === 'learn' || v.mode === 'puzzle';
    const step = playing && !v.intro ? v.step : null;
    const codeOpen = this.code!.visible;
    // a certificate stays on the board until it is put away
    const cert = this.certOn ? this.certificateInfo() : null;
    if (cert) {
      labSys.hardwareWanted = false;
      labSys.showHardware(null);
      labSys.showMaths(false);
      labSys.showLandscape(null);
      labSys.showDensity(false);
      labSys.showWheels(false);
      labSys.showVqe(undefined, H2);
      labSys.showCertificate(cert);
      return;
    }
    // the progress board: level, streak and achievements
    if (this.profileOpen) {
      labSys.hardwareWanted = false;
      labSys.showHardware(null);
      labSys.showMaths(false);
      labSys.showLandscape(null);
      labSys.showDensity(false);
      labSys.showWheels(false);
      labSys.showVqe(undefined, H2);
      const fig = profileFigure(this.profileView());
      labSys.showOverlay(fig.key, (b) => b.draw(fig.draw));
      return;
    }
    // the library takes the board while it is open: thumbnails, or a QR code of the current circuit
    if (this.libOpen) {
      labSys.hardwareWanted = false;
      labSys.showHardware(null);
      labSys.showMaths(false);
      labSys.showLandscape(null);
      labSys.showDensity(false);
      labSys.showWheels(false);
      labSys.showVqe(undefined, H2);
      const items = this.libItems().slice(this.libPage * LIB_ROWS, this.libPage * LIB_ROWS + 8);
      if (this.libQr) {
        const url = `${location.origin}${location.pathname}${SHARE_PREFIX}${encodeURIComponent(encodeCircuit(lab.n, lab.history.ops))}`;
        labSys.showOverlay(`qr:${url}`, (b) => b.renderQr(url, 'Scan with a phone camera to open this circuit there.'));
      } else {
        labSys.showOverlay(`lib:${this.libTab}:${this.libPage}:${items.map((i) => i.id).join(',')}`, (b) =>
          b.renderLibrary(this.libTab === 'gate' ? 'My gates' : 'My circuits', items, this.libTab === 'gate' ? 'No gates yet: Make gate saves the circuit on the orbs as one.' : 'No circuits yet: Save this circuit, or Import code.'),
        );
      }
      return;
    }
    // a chapter's own figure (a Bell score, a syndrome table ...) unless the code window's Maths or Chip tab wants the board
    const cmp = codeOpen && this.codeFormat === 'chip' && this.compared?.key === JSON.stringify(lab.history.ops) ? this.compared : null;
    const fig = cmp
      ? compareFigure(lab.n, cmp.ideal, cmp.results.map((r) => ({ name: r.name, examples: PLATFORMS[r.id].examples, counts: r.counts, agreement: r.agreement, time: formatTime(r.micros), twoQubit: r.twoQubit, overhead: r.overhead })))
      : step && !this.noiseOpen && !(codeOpen && (this.codeFormat === 'maths' || this.codeFormat === 'chip'))
        ? campaign.figure()
        : null;
    labSys.showOverlay(fig ? fig.key : null, fig ? (b) => b.draw(fig.draw) : undefined);
    if (fig) {
      labSys.hardwareWanted = false;
      labSys.showHardware(null);
      labSys.showMaths(false);
      labSys.showLandscape(null);
      labSys.showDensity(false);
      labSys.showWheels(false);
      labSys.showVqe(undefined, H2);
      return;
    }
    // the noise lab takes the board while it is open
    labSys.showDensity(this.noiseOpen);
    if (this.noiseOpen) {
      labSys.hardwareWanted = false;
      labSys.showHardware(null);
      labSys.showMaths(false);
      labSys.showLandscape(null);
      return;
    }
    const codeChip = codeOpen && this.codeFormat === 'chip';
    const wantHardware = codeChip || !!step?.hardware;
    const wantMaths = !wantHardware && ((codeOpen && this.codeFormat === 'maths') || step?.board === 'maths');
    labSys.showWheels(!wantHardware && !wantMaths && step?.board === 'wheel');
    labSys.showVqe(!wantHardware && !wantMaths && step?.board === 'vqe' ? ((campaign.memoryValue('vqe') as never) ?? null) : undefined, H2);
    const wantLandscape = !wantHardware && !wantMaths && step?.board === 'landscape';
    labSys.hardwareWanted = wantHardware;
    // course steps about hardware show the superconducting machine; the chip tab shows the one picked
    labSys.machine = codeChip ? this.machine : 'superconducting';
    if (!wantHardware) labSys.showHardware(null);
    else if (!codeChip) {
      const key = JSON.stringify(lab.history.ops);
      if (key !== this.stepRouted.key) {
        const r = routeOrError(lab.n, lab.history.ops);
        this.stepRouted = { key, routed: typeof r === 'string' ? null : r };
      }
      const r = this.stepRouted.routed;
      if (r) {
        if (!labSys.chip.playing) labSys.chip.showLayout(r.initial);
        labSys.showHardware(this.pulseView(r, 'superconducting'));
      }
    }
    labSys.showMaths(wantMaths);
    if (wantLandscape) {
      this.landscapeGrid ??= landscape(SQUARE, 40);
      labSys.showLandscape({ graph: SQUARE, grid: this.landscapeGrid, res: 40, qaoa: campaign.qaoa });
    } else labSys.showLandscape(null);
  }

  /** An IBM Quantum job in flight (submitted from the chip tab), and what to compare it with. */
  private ibmJob: (PendingJob & { client: IbmClient; ideal: number[] | null; sim: number | null; polling: boolean }) | null = null;
  private ibmNote: string | null = null;
  private ibmTimer = 0;

  /**
   * Run on IBM: compile for the backend (route onto its wiring, translate to
   * RZ, SX, CZ), submit a 1000-shot Sampler job, then poll until it finishes.
   */
  private async runIbm(): Promise<void> {
    if (this.ibmJob) {
      this.ibmNote = `Still waiting for job ${this.ibmJob.id.slice(0, 8)} on ${this.ibmJob.backend}.`;
      return this.showCode(false);
    }
    const settings = loadSettings();
    if (!settings) {
      this.ibmNote = this.immersive ? 'Add your IBM Quantum API key first: exit VR and tap IBM Quantum (bottom right of the page).' : 'Add your IBM Quantum API key and instance CRN, then tap Run on IBM again.';
      if (!this.immersive) openIbmDialog(() => void this.runIbm());
      this.showCode(false);
      return feedback('reject');
    }
    const ops = lab.history.ops.slice();
    const n = lab.n;
    const client = new IbmClient(settings);
    try {
      this.ibmNote = 'Contacting IBM Quantum: choosing a backend...';
      this.showCode(false);
      const backend = await client.pickBackend();
      const cal = await client.calibration(backend.name, backend.nQubits);
      const compiled = compileForIbm(n, ops, backend, cal.score, cal.usable);
      this.ibmNote = `Compiled for ${backend.name}: qubits ${compiled.region.join(', ')}, ${compiled.twoQubit} CZ gates, ${compiled.swaps} SWAPs. Submitting...`;
      this.showCode(false);
      const id = await client.submit(compiled.qasm, backend.name, IBM_SHOTS);
      const job: PendingJob = { id, backend: backend.name, n, submittedAt: Date.now() };
      savePending(job);
      // what to compare the hardware with: the ideal circuit, and the noise model on the same compiled circuit
      const ideal = Array.from(lab.history.state.probabilities());
      const simRun = runOnChip({ ops: compiled.native, initial: compiled.initial, final: compiled.final, swaps: compiled.swaps, twoQubitBefore: 0, twoQubitAfter: 0 }, n, compiled.region.length, 2000, Math.random, TYPICAL_NOISE);
      this.ibmJob = { ...job, client, ideal, sim: agreement(simRun.counts, ideal), polling: false };
      this.ibmTimer = 0;
      this.ibmNote = `Submitted to ${backend.name} (job ${id.slice(0, 8)}). Queued: results can take minutes; keep working.`;
      feedback('select');
    } catch (err) {
      this.ibmNote = (err as Error).message;
      feedback('reject');
    }
    this.showCode(false);
  }

  /** Every few seconds while a job is out: check it, and show the result when it lands. */
  private pollIbm(dt: number): void {
    const job = this.ibmJob;
    if (!job || job.polling) return;
    this.ibmTimer += dt;
    if (this.ibmTimer < 8) return;
    this.ibmTimer = 0;
    job.polling = true;
    void (async () => {
      try {
        const st = await job.client.job(job.id);
        if (st.status === 'Completed') {
          const counts = samplesToCounts(await job.client.samples(job.id), job.n);
          const shots = counts.reduce((a, b) => a + b, 0);
          if (lab.n === job.n) lab.showShots(counts);
          const real = job.ideal ? agreement(counts, job.ideal) : null;
          this.ibmNote =
            real === null
              ? `${job.backend}: ${shots} real shots are in (on the rain if the lab still has ${job.n} qubits).`
              : `${job.backend}, ${shots} real shots: ${(real * 100).toFixed(1)}% agree with the ideal circuit; the noise model predicted ${((job.sim ?? 0) * 100).toFixed(1)}%.`;
          this.ibmJob = null;
          savePending(null);
          feedback('success');
        } else if (st.status === 'Failed' || st.status === 'Cancelled') {
          this.ibmNote = `IBM job ${st.status.toLowerCase()}${st.reason ? `: ${st.reason}` : '.'}`;
          this.ibmJob = null;
          savePending(null);
          feedback('reject');
        } else {
          const mins = Math.round((Date.now() - job.submittedAt) / 60000);
          this.ibmNote = `${job.backend}: ${st.status.toLowerCase()} (${mins} min so far, job ${job.id.slice(0, 8)}).`;
        }
      } catch (err) {
        this.ibmNote = `Checking the IBM job: ${(err as Error).message}`;
      }
      job.polling = false;
      if (this.code?.visible) this.showCode(false);
    })();
  }

  /** The board's pulse view for a routed circuit. */
  private pulseView(routed: Routed, machine: PlatformId = this.machine) {
    const qubits = machineQubits(machine, lab.n);
    const holders = new Array<number>(qubits).fill(-1);
    routed.initial.forEach((p, i) => (holders[p] = i));
    const sched = machine === 'superconducting' ? schedule(routed.ops, T5.qubits) : platformSchedule(machine, routed, lab.n);
    const title =
      machine === 'superconducting'
        ? `Pulse schedule on T5${routed.swaps ? `  /  ${routed.swaps} routing SWAP${routed.swaps === 1 ? '' : 's'}` : ''}`
        : machine === 'ions'
          ? 'Laser pulses on the ion chain  /  every pair can interact'
          : 'Laser pulses on the atom array  /  the long gaps are atoms moving';
    return { schedule: sched, qubits, holders, title };
  }

  /** The chip tab's machine: superconducting chip, trapped ions or neutral atoms. */
  private setMachine(id: PlatformId): void {
    this.machine = id;
    this.compared = null;
    this.codeNote = null;
    const p = PLATFORMS[id];
    this.flash(`${p.name} (${p.examples}). ${p.facts[2]}`);
    feedback('select');
    this.showCode(false);
  }

  /** Compile for the current machine (T5 routing can fail with a message). */
  private compiled(ops: readonly Op[]): Routed | string {
    if (this.machine === 'superconducting') return routeOrError(lab.n, ops);
    try {
      return compileFor(this.machine, lab.n, ops);
    } catch (err) {
      return (err as Error).message;
    }
  }

  /** The ideal answer: exact when nothing is measured mid-circuit, otherwise a noiseless run. */
  private idealOf(ops: readonly Op[]): number[] {
    const midMeasure = ops.some((op) => op.kind === 'measure' || op.kind === 'reset');
    if (!midMeasure) return Array.from(lab.history.state.probabilities());
    const routed = compileFor('ions', lab.n, ops);
    const saved = { ...PLATFORMS.ions.noise };
    Object.assign(PLATFORMS.ions.noise, { p1: 0, p2: 0, readout: 0 });
    const counts = runPlatform('ions', routed, lab.n, 4000, Math.random).counts;
    Object.assign(PLATFORMS.ions.noise, saved);
    return Array.from(counts, (c) => c / 4000);
  }

  /** Run the circuit on all three machines and compare them on the board. */
  private compareMachines(): void {
    const ops = lab.history.ops.slice();
    const ideal = this.idealOf(ops);
    let results: PlatformResult[];
    try {
      results = comparePlatforms(lab.n, ops, ideal, 1000, Math.random);
    } catch (err) {
      this.codeNote = { key: JSON.stringify(ops), text: (err as Error).message };
      this.showCode(false);
      return feedback('reject');
    }
    this.compared = { key: JSON.stringify(ops), results, ideal };
    const best = results.reduce((a, b) => (b.agreement > a.agreement ? b : a));
    const fastest = results.reduce((a, b) => (b.micros < a.micros ? b : a));
    this.codeNote = { key: JSON.stringify(ops), text: `Most accurate: ${best.name} (${(best.agreement * 100).toFixed(1)}%). Fastest shot: ${fastest.name} (${formatTime(fastest.micros)}). Each machine trades speed, accuracy and wiring differently.` };
    for (const r of results) this.profile.use(`machine:${r.id}`);
    this.checkAchievements();
    this.showCode(false);
    feedback('shots');
  }

  private pageCode(dir: number): void {
    this.codePage += dir;
    this.showCode(false);
  }

  /**
   * Simplify: cancel, merge and commute gates (src/quantum/optimize.ts). In the
   * sandbox the circuit is replaced, and the button becomes Undo until it
   * changes; elsewhere the panel previews the shorter version and the chapter's
   * own circuit is left alone.
   */
  private simplifyCircuit(): void {
    const ops = lab.history.ops.slice();
    const key = JSON.stringify(ops);
    if (this.unsimplified && this.unsimplified.after === key) {
      const { n, ops: before } = this.unsimplified;
      this.unsimplified = null;
      this.codeNote = { key: JSON.stringify(before), text: `Back to your original ${before.length} steps.` };
      this.reload(n, before);
      this.showCode();
      return;
    }
    if (this.preview === key) {
      this.preview = null;
      this.codeNote = null;
      this.showCode();
      return;
    }
    const r = simplify(ops);
    if (r.ops.length === ops.length) {
      this.codeNote = { key, text: 'Already as short as these rules make it: nothing cancels, merges or slides together.' };
      this.showCode(false);
      feedback('reject');
      return;
    }
    const what = `${ops.length} steps to ${r.ops.length} (${r.cancelled} cancelled, ${r.merged} merged)`;
    if (campaign.mode === 'sandbox') {
      const after = JSON.stringify(r.ops);
      this.unsimplified = { n: lab.n, ops, after };
      this.codeNote = { key: after, text: `Simplified: ${what}. Same circuit, fewer gates. Undo brings yours back.` };
      this.reload(lab.n, r.ops);
    } else {
      this.preview = key;
      this.codeNote = { key, text: `Simplified copy: ${what}. Your circuit here is unchanged.` };
    }
    this.showCode();
  }

  private reload(n: number, ops: Op[]): void {
    this.reloading = true;
    try {
      lab.load(n, ops);
    } finally {
      this.reloading = false;
    }
    // the card redrew mid-reload (on the reset), so draw it again with the new circuit
    this.render(campaign.view);
  }

  /** Show the circuit so far as Qiskit or OpenQASM code (also copied to the clipboard on desktop). */
  private showCode(sound = true): void {
    if (!this.code || this.reloading) return;
    if (this.notes?.open) this.notes.close();
    const ops = lab.history.ops;
    const key = JSON.stringify(ops);
    if (this.unsimplified && this.unsimplified.after !== key) this.unsimplified = null;
    if (this.preview !== null && this.preview !== key) this.preview = null;
    if (this.codeNote && this.codeNote.key !== key) this.codeNote = null;
    const shownOps = this.preview !== null ? simplify(ops).ops : ops;
    const lang = FORMAT_NAMES[this.codeFormat];
    const onChip = this.codeFormat === 'chip';
    const routed = onChip ? this.compiled(shownOps) : null;
    const labSys = this.world.getSystem(LabSystem);
    const chipVisual = labSys?.chip;
    if (this.machine === 'superconducting' && routed && typeof routed !== 'string' && chipVisual && !chipVisual.playing) chipVisual.showLayout(routed.initial);
    if (onChip && this.compared?.key !== key) labSys?.showHardware(routed && typeof routed !== 'string' ? this.pulseView(routed) : null);
    // in the MaxCut chapter and the course's QAOA module the PennyLane tab is the QAOA program itself
    const qaoa = this.codeFormat === 'pennylane' ? campaign.qaoa : null;
    const code = qaoa ? toPennyLaneQaoa(SQUARE, qaoa.gammas, qaoa.betas) : program(this.codeFormat, lab.n, shownOps);
    // a page at a time
    // on an all-to-all machine the circuit runs as written
    const native = onChip && this.machine !== 'superconducting' && routed && typeof routed !== 'string'
      ? `// ${PLATFORMS[this.machine].name}: every ${PLATFORMS[this.machine].qubit} reaches every other, so no SWAPs.\n${toQasm(lab.n, routed.ops)}`
      : null;
    const all = qaoa ? linesOf(code, 'pennylane') : native ? linesOf(native, 'qasm') : codeLines(this.codeFormat, lab.n, shownOps);
    const count = pages(all.length, CODE_LINES);
    if (!sound && this.codePage === this.codePages - 1) this.codePage = count - 1;
    this.codePages = count;
    this.codePage = Math.max(0, Math.min(count - 1, this.codePage));
    const first = this.codePage * CODE_LINES;
    for (let i = 0; i < CODE_LINES; i++) {
      const line = all[first + i];
      this.els.get(`code-r-${i}`)?.setProperties({ display: line ? 'flex' : 'none' });
      if (!line) continue;
      const space = /^\s/.test(line.rest) || /\s$/.test(line.head);
      this.text(`code-n-${i}`, String(first + i + 1));
      this.els.get(`code-h-${i}`)?.setProperties({ text: line.head || ' ', display: line.head ? 'flex' : 'none' });
      this.els.get(`code-t-${i}`)?.setProperties({
        text: line.rest.trim() || ' ',
        marginLeft: space && line.head ? 5 : 0,
        color: line.comment ? '#6b6e75' : C.text,
      });
    }
    this.els.get('code-up')?.setProperties({ display: count > 1 ? 'flex' : 'none' });
    this.els.get('code-down')?.setProperties({ display: count > 1 ? 'flex' : 'none' });
    this.bg('code-up', this.codePage > 0 ? '#34363b' : '#26272b');
    this.bg('code-down', this.codePage + 1 < count ? '#34363b' : '#26272b');
    for (const f of FORMATS) {
      const on = f === this.codeFormat;
      this.bg(`code-tab-${f}`, on ? C.text : '#242528');
      this.els.get(`code-tab-${f}-l`)?.setProperties({ color: on ? '#18191b' : C.textDim });
    }
    const range = count > 1 ? `lines ${first + 1}-${Math.min(all.length, first + CODE_LINES)} of ${all.length}` : `${all.length} lines`;
    this.text('code-eyebrow', `Code  /  ${ops.length} steps on ${lab.n} qubit${lab.n === 1 ? '' : 's'}  /  ${range}`);
    const onMaths = this.codeFormat === 'maths';
    this.text('code-title', onChip ? (this.machine === 'superconducting' ? 'Your circuit on the T5 chip' : `Your circuit on ${PLATFORMS[this.machine].name.toLowerCase()}`) : onMaths ? 'The maths of this step' : `Your circuit in ${lang}`);
    this.els.get('code-mach')?.setProperties({ display: onChip ? 'flex' : 'none' });
    for (const m of ['superconducting', 'ions', 'atoms'] as const) this.bg(`code-m-${m}`, m === this.machine ? C.primary : '#34363b');
    this.bg('code-compare', this.compared?.key === key ? C.done : '#34363b');
    this.els.get('code-simplify')?.setProperties({ display: onChip ? 'none' : 'flex' });
    this.els.get('code-run')?.setProperties({ display: onChip ? 'flex' : 'none' });
    this.els.get('code-ibm')?.setProperties({ display: onChip ? 'flex' : 'none' });
    this.text('code-ibm-l', this.ibmJob ? 'IBM job...' : 'Run on IBM');
    this.bg('code-run', typeof routed === 'string' ? '#26272b' : C.primary);
    this.text('code-simplify-label', this.unsimplified ? 'Undo' : this.preview !== null ? 'Original' : 'Simplify');
    this.bg('code-simplify', this.unsimplified || this.preview !== null ? C.primary : '#34363b');
    const where = { qiskit: 'Runs as-is in Qiskit', qasm: 'Opens in IBM Quantum, Qiskit, Braket and most other tools', pennylane: 'Runs as-is in PennyLane', chip: '', maths: 'Scrub the timeline to see any step. The board above shows it typeset' }[this.codeFormat];
    const chipNote = !routed
      ? ''
      : typeof routed === 'string'
        ? routed
        : this.machine === 'superconducting'
          ? `Five qubits in a T, wired only to neighbours. ${routed.swaps ? `${routed.swaps} SWAP${routed.swaps === 1 ? '' : 's'} added: ${routed.twoQubitBefore} two-qubit gates became ${routed.twoQubitAfter}.` : `No SWAPs needed: all ${routed.twoQubitBefore} two-qubit gates land on wired pairs.`}`
          : `${PLATFORMS[this.machine].facts[0]} ${PLATFORMS[this.machine].facts[1]}`;
    this.text('code-note', (onChip && this.ibmNote) || (this.codeNote?.text ?? (onChip ? chipNote : `${where}${this.immersive ? '.' : '; copied to your clipboard.'}`)));
    this.code.visible = true;
    if (sound) {
      feedback('select');
      try {
        void navigator.clipboard?.writeText(code);
      } catch {
        // clipboard unavailable (headset browser, permissions): the panel still shows the code
      }
      console.info(`[Entangled] ${lang} export\n` + code);
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
    for (const id of ['chapter-panel', 'gate-dock', 'code-panel', 'nav-panel', 'builder-panel', 'notes-panel', 'noise-panel', 'library-panel', 'debug-panel', 'class-panel']) {
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

  /**
   * Place a window part way between its normal and zoomed spots (t = 0..1),
   * at `appear` of its open animation: it grows from 94% and drops 1 cm into place.
   */
  private placeBlend(obj: { position: Vector3; quaternion: Quaternion; scale: Vector3 }, from: keyof typeof PLACEMENT, to: keyof typeof PLACEMENT, t: number, base: number, appear: number): void {
    this.place(obj, to);
    this.p2.copy(obj.position);
    this.q2.copy(obj.quaternion);
    this.place(obj, from);
    obj.position.lerp(this.p2, t);
    obj.quaternion.slerp(this.q2, t);
    obj.position.y += (1 - appear) * 0.01;
    obj.scale.setScalar(base * (1 + (ZOOM - 1) * t) * (0.94 + 0.06 * appear));
  }

  update(delta: number): void {
    if (!this.bind()) return;
    // the banner floats just above the dock; the profile saves every couple of seconds
    const ws = this.world.getSystem(LabSystem)?.workspaceObject;
    if (ws && this.banner.root.parent !== ws) {
      ws.add(this.banner.root);
      const { pos, rot } = PLACEMENT['gate-dock'];
      this.banner.root.position.copy(pos);
      this.banner.root.quaternion.setFromEuler(rot);
      this.banner.root.translateY(0.112);
      this.banner.root.translateZ(0.01);
    }
    this.banner.update(Math.min(delta, 0.05));
    this.profileSaveTimer += delta;
    if (this.profileDirty && this.profileSaveTimer > 2) {
      saveProfile(this.profile.toJSON());
      this.profileDirty = false;
      this.profileSaveTimer = 0;
    }
    // ease toward the zoom state and through the open animations (critically damped, about 0.25 s)
    const dt = Math.min(delta, 0.05);
    const ease = 1 - Math.exp(-dt * 14);
    this.zoomT += ((this.zoom ? 1 : 0) - this.zoomT) * ease;
    if (Math.abs(this.zoomT - (this.zoom ? 1 : 0)) < 1e-3) this.zoomT = this.zoom ? 1 : 0;
    if (this.code!.visible && !this.codeWasOpen) this.codeOpenT = 0;
    if (this.notes!.open && !this.notesWasOpen) this.notesOpenT = 0;
    this.codeWasOpen = this.code!.visible;
    this.notesWasOpen = this.notes!.open;
    this.codeOpenT += (1 - this.codeOpenT) * ease;
    this.notesOpenT += (1 - this.notesOpenT) * ease;
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
    this.placeBlend(this.code!, 'code-panel', 'code-zoom', this.zoomT, this.codeScale, this.codeOpenT);
    this.updateBoardMode();
    const lsys = this.world.getSystem(LabSystem);
    if (lsys) {
      lsys.boardRaised = this.dbgOpen || this.classOpen;
      lsys.showStateView(this.libOpen ? null : this.stateView);
    }
    // notes sit where the code panel does; only one of the two is open at a time
    if (this.notes!.open) {
      this.placeBlend(this.notesAsset!, 'notes-panel', 'notes-zoom', this.zoomT, this.notesScale, this.notesOpenT);
      this.notesAsset!.visible = true;
    } else {
      this.notesAsset!.visible = false;
      this.notesAsset!.position.copy(PARKED);
    }
    if (this.classOpen) {
      this.place(this.classAsset!, 'under-board');
      this.classAsset!.visible = true;
    } else {
      this.classAsset!.visible = false;
      this.classAsset!.position.copy(PARKED);
    }
    if (this.dbgOpen) {
      this.place(this.dbgAsset!, 'under-board');
      this.dbgAsset!.visible = true;
    } else {
      this.dbgAsset!.visible = false;
      this.dbgAsset!.position.copy(PARKED);
    }
    if (this.libOpen) {
      this.place(this.libAsset!, 'notes-panel');
      this.libAsset!.visible = true;
    } else {
      this.libAsset!.visible = false;
      this.libAsset!.position.copy(PARKED);
    }
    if (this.noiseOpen) {
      this.place(this.noiseAsset!, 'notes-panel');
      this.noiseAsset!.visible = true;
    } else {
      this.noiseAsset!.visible = false;
      this.noiseAsset!.position.copy(PARKED);
    }
    this.place(this.nav!, 'nav-panel');
    campaign.update(Math.min(delta, 0.05));
    this.pollIbm(Math.min(delta, 0.05));
    this.updateDebugger(Math.min(delta, 0.05));
    if (this.dockFlash && performance.now() >= this.dockFlash.until) {
      this.dockFlash = null;
      this.renderDock();
    }

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
