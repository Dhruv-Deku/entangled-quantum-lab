import {
  createSystem,
  Euler,
  PokeInteractable,
  Matrix4,
  Quaternion,
  Vector3,
  VisibilityState,
  type Object3D,
  type UIKitMLAsset,
} from '@iwsdk/core';
import { feedback } from '../lab/feedback';
import { Qubit } from '../lab/components';
import { lab } from '../lab/instance';
import { KET_HOME, LabSystem } from '../lab/lab-system';
import { GestureSystem } from '../lab/gesture-system';
import { MAX_ORBS, type LabEvent } from '../lab/lab';
import { loadSave, writeSave } from '../lab/save';
import type { Op } from '../quantum/circuit';
import { simplify } from '../quantum/optimize';
import { decodeCircuit, encodeCircuit, SHARE_PREFIX } from '../quantum/share';

/** Replay links play a circuit back gate by gate. */
const REPLAY_PREFIX = '#r=';
import { ORB_SKINS, PALETTES, qubitColor, setPalette, type OrbSkinId } from '../lab/visuals';
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
import { assignmentProgress, kindOf, makeCode, parseCode, SharedRoom, type Progress, type Race, type Role, type RoomKind } from '../net/room';
import { mulberry32 } from '../quantum/measure';
import { computerCollapse, computerMove, collapse as tttCollapse, lastSquare, newGame as newTtt, place as tttPlaceMark, placeLast, SQUARE_NAMES, type Game as TttGame, type Player as TttPlayer } from './qttt';
import { fireBomb, fireZeno, histogram as slitHistogram, runAtom, sampleSlit, SG_EXPERIMENTS, sgExpected, slitIntensity, ZENO_PASSES, type SlitSetup } from '../quantum/experiments';
import { AutoTransport } from '../net/transport';
import { openDailyDialog, openShareDialog, savedName } from '../lab/share-dialog';
import { ACHIEVEMENTS, levelFor, Profile, xpFor, type ProgressContext } from './profile';
import { ket, RUSH_QUBITS, RushSession } from './rush';
import type { Vec3 } from '../quantum/gates';
import { blochVector } from '../quantum/bloch';
import { manyWorlds } from '../quantum/paths';
import { ALBUM, albumMatches } from './album';
import { CodeProgram, EXAMPLES, fromOps, type CodeGate } from './code-lab';
import { bb84Round, groverRounds, type Bb84Round } from './bb84';
import { bump as questBump, emptyQuests, questsFor, type QuestCounter } from './quests';
import { SurfaceCode } from '../quantum/surface';
import { computerFlips, score as pennyScore, type PennyPhase, type PennyRecord } from './penny';
import { Ambient } from '../lab/ambient';
import { bestStreak, dayKey, dailyNumber, emptyDaily, recordDaily, shareText, streak, type DailyRecord } from './daily';
import { loadDaily, loadProfile, saveDaily, saveProfile } from '../lab/profile-store';
import { albumFigure, bombFigure, questsFigure, sgFigure, slitFigure, spyFigure, profileFigure, rushFigure, tttFigure, type BombStatus, type Figure, type ProfileView, type RushView, type SurfaceView } from '../lab/figures';
import { listen } from '../lab/sonify';
import { downloadSnapshot } from '../lab/snapshot';
import { Banner } from '../lab/banner';
import { DWELL_SECONDS, layoutFor, saveSettings, settings, type FovLayout } from './settings';
import { compactPlacement } from './fov-layout';
import { setContrast } from '../lab/contrast';
import { cueListeners } from '../lab/feedback';
import { CUE_CAPTIONS } from '../lab/captions';
import { growthOf, grewSince, type Growth } from './growth';
import { deviceFor, scaleFor, type Device } from '../quantum/scale';
import { accuracy as qmlAccuracy, field as qmlField, initialWeights, loss as qmlLoss, predict as qmlPredict, trainStep, xorData, type Point as QmlPoint } from '../quantum/qml';
import { FIELD_N } from '../lab/qml-3d';
import { answerTopic, classify, describeState, explainOp, moveWords, nextMove, type Line as KetLine } from './partner';
import { GREETING, partOfDay, planWindDown } from './today';
import { finishSession, loadMemory, mastery, parOf as cardPar, planSession, review, saveMemory, sessionStreak, shuffledChoices, tomorrow, addDays, type MemoryState, type RecallCard } from './today';
import { memoryFigure, qmlFigure, scaleFigure, type MemoryView } from '../lab/figures';
import { countMoves } from './puzzles';
import { run as runOps } from '../quantum/circuit';
import type { QState } from '../quantum/state';
import { LookSelectSystem, type LookTarget } from '../lab/look-select';
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
  // settings: in front of the board, high enough that its twelve tiles clear the orbs
  'settings-panel': { pos: new Vector3(0, 0.37, -0.18), rot: new Euler(-0.08, 0, 0, 'YXZ') },
  // upper right, opposite the chapter card and above the dock
  'nav-panel': { pos: new Vector3(0.47, 0.26, -0.06), rot: new Euler(-0.12, (-32 * Math.PI) / 180, 0, 'YXZ') },
  // the decoder game's tap pad, right of the lattice
  'decoder-pad': { pos: new Vector3(0.17, 0.3, -0.15), rot: new Euler(-0.15, -0.3, 0, 'YXZ') },
  // where the wrist menu shows for a screenshot without a tracked hand
  'wrist-demo': { pos: new Vector3(-0.22, 0.12, 0.16), rot: new Euler(-0.5, 0.35, 0, 'YXZ') },
} as const;

const SLOTS = 7;
const CODE_LINES = 10;
const LIB_ROWS = 5;
const IBM_SHOTS = 1000;
/** How much bigger a zoomed window is. */
const ZOOM = 1.3;
const NAV_SLOTS = 18;
const LAB_LINES = 10;
const LAB_KEYS = ['h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg', 'rx', 'ry', 'rz', 'cx', 'cz', 'swap', 'ccx', 'measure', 'q0', 'q1', 'q2', 'q3', 'q4', 'pi', 'pi2', 'pi4', 'mpi2', 'up', 'down', 'delete', 'clear', 'link', 'subqubit', 'addqubit', 'example', 'fromorbs'];
const TABS = ['course', 'campaign', 'learn', 'puzzle', 'build', 'sandbox', 'play'] as const;
/** The Play tab: arcade and showcase picks. */
type GameId = 'dice' | 'penny' | 'cat' | 'spy' | 'decoder' | 'grover' | 'teleport' | 'ttt' | 'slit' | 'sg' | 'bomb' | 'today' | 'super' | 'qml';

const PLAY = ['Today', 'Wind down', 'Code lab', 'First five minutes', 'Supercomputer', 'Quantum AI', 'Daily quests', 'Quantum Rush', 'Zen Rush', 'Rush versus', 'Class challenge', 'Daily', 'Spy game', 'Be the decoder', 'Grover maze', 'Teleporter', 'Quantum tic-tac-toe', 'Double slit', 'Stern-Gerlach', 'Bomb tester', 'Shor in 3D', 'System Two', 'Photonic chip', 'Surface Code', 'Many worlds', 'Quantum dice', 'Penny flip', 'Schrodinger cat', 'State album', 'Giant sphere', 'Inside a qubit', 'Night sky', 'History', 'Ambient music'] as const;
const PLAY_TAGS = ['5 min', 'calm', 'qasm', 'tour', '2^n', 'QNN', '3/day', '60s', 'zen', 'vs', 'class', 'day', 'BB84', 'd=3', '8', 'tp', 'X O', '2 slit', 'Ag', 'EV', '15', '3x', 'light',  '49q', 'H H', 'd8', 'coin', 'box', '15', '1 m', 'JJ', 'sky', '1981', 'hum'];

/** What the studio's Show row toggles. */
const STUDIO_OPTIONS = ['liquid', 'gauge', 'phase', 'trail'] as const;
type StudioOption = (typeof STUDIO_OPTIONS)[number];

/** The settings panel's tiles, in order. */
const SETTING_KEYS = ['desk', 'pin', 'wall', 'fov', 'look', 'dwell', 'contrast', 'motion', 'captions', 'taps', 'wrist', 'partner', 'speak'] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

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
  private looksAsset: UIKitMLAsset | null = null;
  private codelabAsset: UIKitMLAsset | null = null;
  private decoderAsset: UIKitMLAsset | null = null;
  private wristAsset: UIKitMLAsset | null = null;
  /** Settings: the room, the view and accessibility. */
  private settingsAsset: UIKitMLAsset | null = null;
  private settingsOpen = false;
  /** Qubit studio, open on its own (not with the progress board). */
  private studioOpen = false;
  /** The sandbox card is the home hub (its choices launch Today, Continue, the studio). */
  private homeShown = false;
  private settingsTimer = 0;
  /** Every button and what it does, for look to select. */
  private readonly clickables = new Map<Object3D, () => void>();
  /** Compact placements for a narrow field of view, worked out once per panel spot. */
  private readonly compactSpots = new Map<string, { pos: Vector3; rot: Euler }>();
  /** The double slit sends its photons to the wall in front of you. */
  private slitWall = false;
  /** Today: five minutes of spaced repetition. */
  private memory: MemoryState = loadMemory();
  private todayPlan: RecallCard[] = [];
  private todayIdx = 0;
  private todayResults: ('right' | 'missed')[] = [];
  /** The current card is answered (quiz) or made (make card), and how. */
  private todayAnswer: { correct: boolean; picked: number | null } | null = null;
  private todayTarget: QState | null = null;
  private todayShown = false;
  private todayStart = 0;
  private todayEnd = 0;
  private todayDone = false;
  private todayCardTimer = 0;
  /** The exponential wall: how many qubits are on the table. */
  private superN = 2;
  /** Quantum AI: the data, the weights, whether the CNOT is in, and how training went. */
  private qmlData: QmlPoint[] = [];
  private qmlW: number[] = [0, 0, 0];
  private qmlEntangle = true;
  private qmlTraining = false;
  private qmlStep = 0;
  private qmlAcc: number[] = [];
  private qmlLoss: number[] = [];
  private qmlAcc_ = 0;
  private qmlTimer = 0;
  private qmlSeed = 7;
  private qmlSaid = '';
  /** The network's answer over the grid, worked out once per step (the landscape and the board share it). */
  private qmlFieldNow: number[] = [];
  /** This session is the evening wind-down: known ideas only, night sky, soft music, no clock. */
  private todayWind = false;
  /** The night sky and music as they were before winding down. */
  private windBefore: { night: boolean; music: boolean } | null = null;
  /** Ket used a hint on this Today card (it then comes back tomorrow). */
  private todayHinted = false;
  /** Ket: when it last spoke, the last step it could explain, and how long since you last did something. */
  private ketAt = -99;
  private ketLast: { op: Op; before: QState; after: QState } | null = null;
  private ketOpAt = 0;
  private ketUndos = 0;
  /** The task and step Ket last helped with, so it offers each hint once. */
  private ketHelped = '';
  private ketGreeted = false;
  private ketTargetCache: { key: string; state: QState } | null = null;
  private ketCompact: Vector3 | null = null;
  /** The crystal as last shown, to tell what grew. */
  private crystalShown: Growth | null = null;
  /** The crystal when today's session began. */
  private crystalAtStart: Growth | null = null;
  /** Development: show the wrist menu at a fixed spot, without a tracked hand. */
  wristForce = false;
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
  private tab: CampaignView['mode'] | 'play' = 'campaign';
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
    if (!this.openReplay() && !this.openShared() && !resumed) {
      // first launch: the welcome tour reaches a Bell pair in five moves (turn, H, measure, entangle, shots)
      campaign.startLesson(Math.max(0, campaign.lessons.findIndex((l) => l.chip === 'Tour')));
      campaign.intro = true;
    }
    this.openRoomLink();
    this.openDailyLink();
    const onHash = () => this.openReplay() || this.openShared() || this.openRoomLink() || this.openDailyLink();
    window.addEventListener('hashchange', onHash);
    this.cleanupFuncs.push(() => window.removeEventListener('hashchange', onHash));

    this.cleanupFuncs.push(
      campaign.on((v) => {
        // Quantum Rush lives in the sandbox: going anywhere else ends the round
        if ((this.rush || this.rushOver || this.racePending) && v.mode !== 'sandbox') this.endRush(false);
        if (this.game && v.mode !== 'sandbox') this.endGame(false);
        // a program playing on the orbs stops when the orbs are taken over
        if (this.runner && v.mode !== 'sandbox') this.runner = null;
        this.render(v);
        this.afterCampaign(v);
        this.afterDaily();
        this.checkAchievements();
      }),
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
        this.ketHears(e);
        if (e.type === 'reset' && campaign.mode === 'sandbox') this.render(campaign.view);
        // achievements count what happens on the orbs
        if (e.type === 'op') {
          const bells = this.profile.data.stats.bellPairs;
          this.profile.onOp(e.op, lab.history.state);
          if (e.op.kind === 'gate' || e.op.kind === 'swap' || e.op.kind === 'iswap') this.quest('gates');
          if (e.op.kind === 'measure') this.quest('measure');
          if (this.profile.data.stats.bellPairs > bells) this.quest('bell');
        }
        if (e.type === 'shots') this.quest('shots', e.shots);
        if (e.type === 'shots') this.profile.onShots(e.shots);
        if (e.type === 'seek') this.profile.onRewind();
        if (e.type === 'op' || e.type === 'shots' || e.type === 'seek') this.checkAchievements();
        if (this.rush && (e.type === 'op' || e.type === 'seek')) this.checkRush();
        if (e.type === 'op' || e.type === 'seek') {
          this.checkWorlds();
          this.checkAlbum();
          if (this.game) this.renderGameCard();
        }
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
    this.looksAsset = this.world.getSceneObject<UIKitMLAsset>('looks-panel') ?? null;
    this.codelabAsset = this.world.getSceneObject<UIKitMLAsset>('codelab-panel') ?? null;
    this.decoderAsset = this.world.getSceneObject<UIKitMLAsset>('decoder-panel') ?? null;
    this.wristAsset = this.world.getSceneObject<UIKitMLAsset>('wrist-panel') ?? null;
    this.settingsAsset = this.world.getSceneObject<UIKitMLAsset>('settings-panel') ?? null;
    if (!this.settingsAsset || !this.wristAsset || !this.decoderAsset || !this.codelabAsset || !this.looksAsset || !this.classAsset || !this.chapter || !this.dock || !this.code || !this.nav || !this.builderAsset || !this.notesAsset || !this.noiseAsset || !this.libAsset || !this.dbgAsset) return false;
    this.code.visible = false;

    // panels take poke and ray input but must never capture the grab pointer,
    // or a hand reaching for an orb just above the dock grabs the dock instead
    for (const panel of [this.chapter, this.dock, this.code, this.nav, this.builderAsset, this.notesAsset, this.noiseAsset, this.libAsset, this.dbgAsset, this.classAsset, this.looksAsset, this.codelabAsset, this.decoderAsset, this.wristAsset, this.settingsAsset]) {
      panel.traverse((o) => {
        (o as unknown as { pointerEventsType: unknown }).pointerEventsType = { deny: 'grab' };
      });
    }

    const ids = ['chapter-eyebrow', 'chapter-title', 'chapter-body', 'goal-dot', 'goal-text', 'btn-next', 'btn-next-label', 'btn-replay', 'btn-replay-label', 'btn-notes', 'pip-0', 'pip-1', 'pip-2', 'pip-3', 'pip-4', 'choices'];
    for (let i = 0; i < 3; i++) ids.push(`choice-${i}`, `choice-${i}-k`, `choice-${i}-l`);
    for (const id of ids) this.els.set(id, this.chapter.requireElementById(id));
    const navIds = ['tab-course', 'tab-course-l', 'tab-campaign', 'tab-campaign-l', 'tab-learn', 'tab-learn-l', 'tab-puzzle', 'tab-puzzle-l', 'tab-build', 'tab-build-l', 'tab-sandbox', 'tab-sandbox-l', 'tab-play', 'tab-play-l', 'nav-progress', 'nav-progress-2', 'nav-me', 'nav-set'];
    for (let i = 0; i < NAV_SLOTS; i++) navIds.push(`n-${i}`, `n-${i}-n`, `n-${i}-l`);
    for (const id of navIds) this.els.set(id, this.nav.requireElementById(id));
    const dockIds = ['g-h', 'g-x', 'g-y', 'g-z', 'g-s', 'g-t', 'g-rl', 'g-rr', 'a-cnot', 'a-swap', 'a-measure', 'a-shots', 'a-export', 't-prev', 't-next', 'dock-status', 'a-voice', 'a-voice-l', 'a-debug', 'a-debug-l', 'a-view', 'a-view-l', 'a-share', 'a-share-l', 'a-listen', 'a-listen-l'];
    for (let i = 0; i < SLOTS; i++) dockIds.push(`t-${i}`, `t-${i}-l`);
    for (const id of dockIds) this.els.set(id, this.dock.requireElementById(id));
    const codeIds = ['code-close', 'code-note', 'code-link', 'code-eyebrow', 'code-title', 'code-zoom', 'code-zoom-label', 'code-simplify', 'code-simplify-label', 'code-run', 'code-ibm', 'code-ibm-l', 'code-up', 'code-down', 'code-mach', 'code-m-superconducting', 'code-m-ions', 'code-m-atoms', 'code-m-photons', 'code-compare', 'code-full', 'code-edit'];
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
    // development: the UI and the lab model, for driving scenes from the managed browser
    if (import.meta.env.DEV) Object.assign(globalThis as object, { __entangledUI: this, __entangledQ: { lab, campaign }, __entangledSettings: settings, __entangledPlay: PLAY });
    const labIds = ['lab-eyebrow', 'lab-step', 'lab-run', 'lab-close', 'lab-status'];
    for (let i = 0; i < LAB_LINES; i++) labIds.push(`lab-r-${i}`, `lab-n-${i}`, `lab-t-${i}`);
    for (const k of LAB_KEYS) labIds.push(`lab-k-${k}`);
    for (const id of labIds) this.els.set(id, this.codelabAsset.requireElementById(id));
    const decIds = ['dec-eyebrow', 'dec-note'];
    for (let r = 0; r < 5; r++) {
      decIds.push(`dec-r-${r}`);
      for (let c = 0; c < 5; c++) decIds.push(`dec-b-${r}-${c}`, `dec-l-${r}-${c}`);
    }
    for (const id of decIds) this.els.set(id, this.decoderAsset.requireElementById(id));
    for (const id of ['wr-sel', 'wr-h', 'wr-x', 'wr-z', 'wr-s', 'wr-m', 'wr-n', 'wr-u']) this.els.set(id, this.wristAsset.requireElementById(id));
    const stIds = ['st-eyebrow', 'st-close', 'st-note'];
    for (const k of SETTING_KEYS) stIds.push(`st-${k}`, `st-${k}-m`, `st-${k}-b`, `st-${k}-bl`);
    for (const id of stIds) this.els.set(id, this.settingsAsset.requireElementById(id));
    const looksIds = ['looks-eyebrow', 'looks-close', 'looks-note'];
    for (let i = 0; i < ORB_SKINS.length; i++) looksIds.push(`lk-t-${i}`, `lk-sw-${i}`, `lk-n-${i}`, `lk-m-${i}`);
    for (let i = 0; i < PALETTES.length; i++) looksIds.push(`lk-p-${i}`, `lk-pd-${i}`, `lk-pl-${i}`);
    for (const k of STUDIO_OPTIONS) looksIds.push(`lk-o-${k}`, `lk-o-${k}-l`);
    for (const id of looksIds) this.els.set(id, this.looksAsset.requireElementById(id));
    this.codeScale = this.code.scale.x;
    this.notesScale = this.notesAsset.scale.x;
    for (const [id, el] of this.els) el.name = id;

    const on = (id: string, fn: () => void) => {
      const el = this.els.get(id)!;
      const handler = () => fn();
      el.addEventListener('click', handler);
      this.cleanupFuncs.push(() => el.removeEventListener('click', handler));
      this.clickables.set(el as unknown as Object3D, handler);
    };
    on('btn-next', () => {
      // Quantum Rush: Skip during a round, Again after it
      if (this.racePending) return;
      if (this.rush) return this.skipRush();
      if (this.rushOver) return this.versusSeed !== null ? this.raceButton(this.room?.kind ?? 'lab') : this.startRush(this.rushZen);
      if (this.game) return this.gameNext();
      // the welcome tour's finale: why a few qubits matter
      if (campaign.view.chapterDone && campaign.view.chapter?.chip === 'Tour') return this.startPlay(PLAY.indexOf('Supercomputer'));
      if (campaign.mode === 'sandbox') {
        if (lab.n < MAX_ORBS) lab.reset(lab.n + 1);
      } else campaign.next();
      feedback('select');
    });
    for (let i = 0; i < 3; i++) on(`choice-${i}`, () => (!this.game && this.homeShown && campaign.mode === 'sandbox' ? this.homeChoice(i) : this.game === 'qml' ? this.qmlChoice(i) : this.game === 'super' ? this.superSet([this.superN + 10, 50, 2][i]) : this.game === 'today' ? this.todayPick(i) : this.game === 'spy' ? this.spyAnswer(i) : this.game === 'ttt' || this.game === 'slit' || this.game === 'sg' || this.game === 'bomb' ? this.modeChoice(i) : feedback(campaign.answer(i) ? 'success' : 'reject')));
    on('btn-replay', () => {
      if (this.rush || this.rushOver || this.racePending) return this.endRush(true);
      if (this.game) return this.endGame(true);
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
        else if (this.tab === 'play' && k < PLAY.length) this.startPlay(k);
        else if (this.tab === 'build' && k < BUILDS.length) campaign.enterBuild(k);
        else if (this.tab === 'sandbox' && k < PRESETS.length) campaign.loadPreset(k);
        else return;
        feedback('select');
      });
    }
    for (const g of ['h', 'x', 'y', 'z', 's', 't'] as GateName[]) {
      on(`g-${g}`, () => {
        if (lab.gate(g)) feedback('gate');
        this.tapHint();
      });
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
    on('cl-go', () => {
      // on the challenge scoreboard this button goes back to the assignments
      if (this.classBoard && this.room?.race) {
        this.classBoard = false;
        this.renderClass();
        return feedback('select');
      }
      this.startAssigned();
    });
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
    for (const id of ['superconducting', 'ions', 'atoms', 'photons'] as const) on(`code-m-${id}`, () => this.setMachine(id));
    on('code-compare', () => this.compareMachines());
    on('code-full', () => this.setFullSize(!this.world.getSystem(LabSystem)?.fullSize));
    on('code-ibm', () => void this.runIbm());
    this.cleanupFuncs.push(addIbmButton());
    // a job submitted before a reload: keep waiting for it
    const pending = loadPending();
    const ibm = loadSettings();
    if (pending && ibm) this.ibmJob = { ...pending, client: new IbmClient(ibm), ideal: null, sim: null, polling: false };
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
    on('btn-notes', () => (this.game === 'slit' ? this.toggleSlitWall() : campaign.mode === 'sandbox' ? this.toggleNoise() : this.toggleNotes()));
    on('btn-lib', () => this.toggleLibrary());
    on('lib-close', () => this.toggleLibrary());
    on('looks-close', () => (this.studioOpen ? this.toggleStudio(false) : this.toggleProfile(false)));
    PALETTES.forEach((pal, i) => on(`lk-p-${i}`, () => this.choosePalette(pal.id)));
    for (const k of STUDIO_OPTIONS) on(`lk-o-${k}`, () => this.toggleOrbOption(k));
    on('nav-set', () => this.toggleSettings());
    on('st-close', () => this.toggleSettings(false));
    for (const k of SETTING_KEYS) on(`st-${k}-b`, () => this.settingAction(k));
    on('code-edit', () => this.openCodeLab(true));
    on('lab-close', () => this.closeCodeLab());
    on('lab-run', () => this.runProgram(false));
    on('lab-step', () => this.runProgram(true));
    for (const k of LAB_KEYS) on(`lab-k-${k}`, () => this.labKey(k));
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) on(`dec-b-${r}-${c}`, () => this.decoderTap(r, c));
    // the wrist menu: favourite gates on the selected qubit
    for (const g of ['h', 'x', 'z', 's'] as const) on(`wr-${g}`, () => lab.gate(g) && feedback('gate'));
    on('wr-m', () => lab.measure() !== null && feedback('measure'));
    on('wr-n', () => {
      lab.select((lab.selected + 1) % lab.n);
      feedback('select');
    });
    on('wr-u', () => lab.undo() && feedback('select'));
    ORB_SKINS.forEach((skin, i) => on(`lk-t-${i}`, () => this.wearSkin(skin.id)));
    // the finish saved with the profile
    this.world.getSystem(LabSystem)?.setSkin(this.currentSkin());
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
    this.bindAccess();
    const gs = this.world.getSystem(GestureSystem);
    if (gs) gs.onTap = (finger) => this.flash(`Finger tap: ${finger === 'middle' ? 'H' : finger === 'ring' ? 'X' : 'measure'} on q${lab.selected}`);
    return true;
  }

  // ---- settings: the room, the view and accessibility

  /** Room messages, sound captions, look to select and high contrast. */
  private bindAccess(): void {
    const ls = this.world.getSystem(LabSystem);
    if (ls) ls.onRoom = (msg) => this.flash(msg);
    const caption = (cue: Parameters<typeof feedback>[0]) => {
      const text = CUE_CAPTIONS[cue];
      if (settings.captions && text) this.world.getSystem(LabSystem)?.caption(text);
    };
    cueListeners.push(caption);
    this.cleanupFuncs.push(() => cueListeners.splice(cueListeners.indexOf(caption), 1));
    const provide = () => this.lookTargets();
    LookSelectSystem.providers.push(provide);
    this.cleanupFuncs.push(() => LookSelectSystem.providers.splice(LookSelectSystem.providers.indexOf(provide), 1));
    if (settings.contrast) setContrast(this.panels(), true);
    this.showCrystal(false);
    // a returning player: today's cards are waiting
    const today = dayKey();
    const waiting = planSession(this.memory, today).length;
    const part = partOfDay(new Date().getHours());
    if (Object.keys(this.memory.sessions).length && !this.memory.sessions[today] && waiting)
      this.flash(part === 'evening' || part === 'night' ? `${GREETING[part]}: ${waiting} cards waiting. Today, or Wind down for a calm review (Play tab)` : `${GREETING[part]}: ${waiting} cards waiting, about ${Math.max(2, waiting)} minutes. Play tab, first item`);
  }

  private panels(): (UIKitMLAsset | null)[] {
    return [this.chapter, this.dock, this.code, this.nav, this.builderAsset, this.notesAsset, this.noiseAsset, this.libAsset, this.dbgAsset, this.classAsset, this.looksAsset, this.codelabAsset, this.decoderAsset, this.wristAsset, this.settingsAsset];
  }

  /** Buttons you can see now, for look to select (panels parked out of sight and hidden elements do not count). */
  private lookTargets(): LookTarget[] {
    const out: LookTarget[] = [];
    for (const [el, press] of this.clickables) {
      const vis = (el as unknown as { isVisible?: { peek(): boolean } }).isVisible;
      if (vis && !vis.peek()) continue;
      // UIKit elements draw through their panel (their own meshes stay invisible): check the panel and what holds it
      let o: Object3D | null = el.parent;
      let shown = true;
      while (o) {
        if (!('isVisible' in o) && !o.visible) {
          shown = false;
          break;
        }
        o = o.parent;
      }
      if (shown) out.push({ object: el, press });
    }
    return out;
  }

  private toggleSettings(open = !this.settingsOpen): void {
    this.settingsOpen = open;
    if (open) {
      this.libOpen = this.dbgOpen = this.classOpen = false;
      this.profileOpen = false;
      this.certOn = false;
      if (this.notes?.open) this.notes.close();
      this.noiseOpen = false;
      this.renderSettings();
    }
    feedback('select');
  }

  /** The layout for this headset: compact on a narrow field of view (or when chosen). */
  private layout(): 'wide' | 'compact' {
    const narrowDevice = typeof navigator !== 'undefined' && /glasses/i.test(navigator.userAgent);
    return layoutFor(settings.fov, narrowDevice ? 70 : (this.world.getSystem(LabSystem)?.fovDegrees ?? null));
  }

  private settingAction(k: SettingKey): void {
    const ls = this.world.getSystem(LabSystem);
    switch (k) {
      case 'desk':
        settings.realDesk = !settings.realDesk;
        ls?.recenter();
        this.flash(settings.realDesk ? 'Looking for your table: the lab moves onto it when one is within reach' : 'The lab floats in front of you');
        break;
      case 'pin':
        if (!ls) break;
        if (settings.pinned) {
          void ls.unpin().then(() => {
            this.flash('Unpinned: the lab starts in front of you');
            this.renderSettings();
          });
        } else if (!ls.canPin()) {
          this.flash('Pinning needs a headset with spatial anchors (Quest, in the headset)');
          return feedback('reject');
        } else {
          void ls.pinHere().then((ok) => {
            this.flash(ok ? 'Pinned: the lab comes back to this spot next time' : 'The headset could not pin the lab here');
            this.renderSettings();
          });
        }
        break;
      case 'wall':
        settings.wallScreen = !settings.wallScreen;
        if (this.game === 'slit' && this.slitWall) {
          ls?.useWall(true);
          this.slitSet(this.slitSetup);
        }
        break;
      case 'fov': {
        const order: FovLayout[] = ['auto', 'wide', 'compact'];
        settings.fov = order[(order.indexOf(settings.fov) + 1) % order.length];
        break;
      }
      case 'look':
        settings.lookSelect = !settings.lookSelect;
        this.flash(settings.lookSelect ? `Look to select: rest your gaze on a button for ${DWELL_SECONDS[settings.dwell]} s` : 'Look to select off');
        break;
      case 'dwell':
        settings.dwell = settings.dwell === 'normal' ? 'slow' : settings.dwell === 'slow' ? 'fast' : 'normal';
        break;
      case 'contrast':
        settings.contrast = !settings.contrast;
        setContrast(this.panels(), settings.contrast);
        break;
      case 'motion':
        settings.reduceMotion = !settings.reduceMotion;
        break;
      case 'captions':
        settings.captions = !settings.captions;
        if (settings.captions) ls?.caption('Captions on: every sound shows here');
        break;
      case 'wrist':
        settings.wristHand = settings.wristHand === 'left' ? 'right' : 'left';
        break;
      case 'taps':
        settings.fingerTaps = !settings.fingerTaps;
        break;
      case 'partner':
        settings.partner = !settings.partner;
        if (ls) ls.partner.root.visible = settings.partner;
        if (settings.partner) this.ketSay({ text: "I'm back. Ask me what just happened, or what to do next.", point: null }, true);
        break;
      case 'speak':
        settings.speak = !settings.speak;
        if (settings.speak) this.ketSay({ text: 'I will read my words aloud.', point: null }, true);
        else if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
        break;
    }
    saveSettings();
    feedback('select');
    this.renderSettings();
  }

  private renderSettings(): void {
    if (!this.settingsAsset) return;
    const ls = this.world.getSystem(LabSystem);
    const inXr = !!this.world.xrSession;
    const onOff = (k: SettingKey, on: boolean, label = on ? 'On' : 'Off') => {
      this.text(`st-${k}-bl`, label);
      this.bg(`st-${k}-b`, on ? C.primary : C.primaryIdle);
      this.els.get(`st-${k}-bl`)?.setProperties({ color: on ? '#ffffff' : C.text });
    };
    const meta = (k: SettingKey, text: string) => this.text(`st-${k}-m`, text);
    const surfaces = ls?.surfaces.length ?? 0;
    meta('desk', !settings.realDesk ? 'Off: the lab floats in front of you' : ls?.onRealDesk ? `On your real ${ls.deskLabel === 'other' ? 'table' : ls.deskLabel}` : !inXr ? 'In the headset, with passthrough' : surfaces ? 'No table within reach yet' : 'Waiting for the room scan');
    onOff('desk', settings.realDesk);
    meta('pin', settings.pinned ? 'Pinned: back to this spot next time' : ls?.canPin() ? 'Comes back to this spot next time' : 'In the headset: spatial anchors');
    onOff('pin', !!settings.pinned, settings.pinned ? 'Unpin' : 'Pin');
    meta('wall', settings.wallScreen ? 'Double slit photons land on your real wall' : 'Off: a virtual screen instead');
    onOff('wall', settings.wallScreen);
    const fov = ls?.fovDegrees;
    meta('fov', `${this.layout() === 'compact' ? 'Compact' : 'Wide'} layout${fov ? `, ${Math.round(fov)} deg per eye` : ''}`);
    onOff('fov', settings.fov !== 'auto', settings.fov === 'auto' ? 'Auto' : settings.fov === 'wide' ? 'Wide' : 'Compact');
    meta('look', 'Rest your gaze on a button or an orb to press it');
    onOff('look', settings.lookSelect);
    meta('dwell', `How long to look: ${DWELL_SECONDS[settings.dwell]} s`);
    onOff('dwell', false, settings.dwell === 'normal' ? 'Normal' : settings.dwell === 'slow' ? 'Slow' : 'Fast');
    meta('contrast', 'White text, bright edges, darker panels');
    onOff('contrast', settings.contrast);
    meta('motion', 'No confetti, calmer celebrations');
    onOff('motion', settings.reduceMotion);
    meta('captions', 'Every sound cue shown as words');
    onOff('captions', settings.captions);
    meta('taps', 'Thumb to middle: H, ring: X, little finger: measure');
    onOff('taps', settings.fingerTaps);
    meta('wrist', `Turn your ${settings.wristHand} palm up for the menu`);
    onOff('wrist', false, settings.wristHand === 'left' ? 'Left' : 'Right');
    meta('partner', settings.partner ? 'Explains each move, hints when stuck' : 'Off: say "Ket" to bring it back');
    onOff('partner', settings.partner);
    meta('speak', 'Ket reads its words aloud');
    onOff('speak', settings.speak);
    this.text('st-eyebrow', inXr ? `Room: ${surfaces} surface${surfaces === 1 ? '' : 's'} found` : 'Room, view and access');
  }

  /** The double slit: photons to the wall in front of you, or back to the desk screen. */
  private toggleSlitWall(): void {
    this.slitWall = !this.slitWall;
    const ls = this.world.getSystem(LabSystem);
    ls?.useWall(this.slitWall);
    this.slitSet(this.slitSetup);
    this.slitStream = true;
    this.slitT = 0;
    if (this.slitWall && ls) {
      const w = ls.wallScreen;
      this.flash(w.real ? `Your wall is ${w.distance.toFixed(1)} m away: watch the photons cross the room` : 'No wall in front: a screen 2.2 m out instead');
    }
    feedback('select');
    this.renderGameCard();
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
    if (this.rush || this.rushOver || this.racePending) {
      this.renderRushCard();
      this.renderNav(v);
      return;
    }
    if (this.game) {
      this.renderGameCard();
      this.renderNav(v);
      return;
    }
    if (v.intro) {
      this.text('chapter-eyebrow', 'Welcome');
      this.text('chapter-title', 'Entangled');
      this.text('chapter-body', 'Hold a qubit in your hand. In five moves you will tie two qubits into one state. A ghost hand shows each move; every move has a button too.');
      this.text('goal-text', this.immersive ? 'Pinch the orb and turn your wrist' : 'Press Enter, or hold an arrow key');
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
      // the free lab is home: who you are, what is waiting, one tap to anything
      const home = !this.sharedOpen && !this.room && !preset;
      this.homeShown = home;
      if (home) {
        const today = dayKey();
        const waiting = this.memory.sessions[today] ? 0 : planSession(this.memory, today).length;
        const streak = sessionStreak(this.memory, today);
        const g = growthOf(this.memory, today);
        const next = campaign.chapters[this.nextChapter()];
        this.text('chapter-eyebrow', `${GREETING[partOfDay(new Date().getHours())]}  /  Level ${this.level()}${streak ? `  /  ${streak} day streak` : ''}`);
        this.text('chapter-title', 'Your lab');
        this.text('chapter-body', `${lab.n} qubits, ready in your hands. ${waiting ? `Today: ${waiting} cards waiting, about ${Math.max(2, waiting)} minutes.` : 'Today is done: your crystal is awake.'}${g.shards.length ? ` Your crystal holds ${g.shards.length} ideas.` : ''}`);
        this.modeChoices([waiting ? `Today: ${waiting} cards` : 'Today: done', `Continue: ${next?.title ?? 'chapters'}`, 'Qubit studio']);
      } else {
        this.text('chapter-eyebrow', 'Sandbox');
        this.text('chapter-title', 'Free lab');
        this.text('chapter-body', `${lead} Every gate and gesture is unlocked.`);
        this.els.get('choices')?.setProperties({ display: 'none' });
      }
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
    this.text('btn-next-label', v.action ?? (v.chapterDone && ch.chip === 'Tour' ? 'Why it matters' : listed ? 'Next' : 'Continue'));
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
    this.world.getSystem(LabSystem)?.celebrate(false);
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
      this.settingsOpen = false;
      this.libOpen = this.dbgOpen = this.classOpen = false;
      this.certOn = false;
      if (this.code) this.code.visible = false;
      if (this.notes?.open) this.notes.close();
      this.noiseOpen = false;
      this.renderLibrary();
      this.renderLooks();
    }
    feedback('select');
  }

  // ---- orb finishes, unlocked by level

  private level(): number {
    return levelFor(xpFor(this.profile.data, this.progressContext())).level;
  }

  private currentSkin(): OrbSkinId {
    const id = this.profile.data.skin as OrbSkinId | undefined;
    const skin = ORB_SKINS.find((s) => s.id === id);
    return skin && this.skinOpen(skin) ? skin.id : 'glass';
  }

  /** A finish is open at its level, and (for the newer ones) once its achievement is earned. */
  private skinOpen(skin: (typeof ORB_SKINS)[number]): boolean {
    return skin.level <= this.level() && (!skin.unlock || !!this.profile.data.unlocked[skin.unlock.achievement]);
  }

  /** Wear a finish (if the level allows it). */
  private wearSkin(id: OrbSkinId): void {
    const skin = ORB_SKINS.find((s) => s.id === id)!;
    if (!this.skinOpen(skin)) {
      this.flash(skin.unlock ? `${skin.name} unlocks with the achievement ${skin.unlock.text}.` : `${skin.name} unlocks at level ${skin.level}.`);
      return feedback('reject');
    }
    this.profile.data.skin = id;
    this.world.getSystem(LabSystem)?.setSkin(id);
    if (id !== 'glass') this.use('skin');
    this.profileDirty = true;
    this.flash(`${skin.name}: ${skin.note.toLowerCase()}.`);
    this.renderLooks();
    feedback('select');
  }

  /** The next unlocked finish (voice: "next skin"). */
  private nextSkin(): void {
    const open = ORB_SKINS.filter((s) => this.skinOpen(s));
    const i = open.findIndex((s) => s.id === this.currentSkin());
    this.wearSkin(open[(i + 1) % open.length].id);
  }

  private renderLooks(): void {
    if (!this.looksAsset) return;
    const lvl = this.level();
    const now = this.currentSkin();
    const swatch: Record<OrbSkinId, string> = { glass: '#d9e2ef', frost: '#f4f7fb', smoke: '#2a2d33', tinted: qubitColor(0), copper: '#c47c4e', pearl: '#f6f1ea', obsidian: '#0a0b0d', aurora: '#9fe7ff', hologram: '#7fe9ff' };
    this.text('looks-eyebrow', `Level ${lvl}  /  ${ORB_SKINS.filter((s) => this.skinOpen(s)).length} of ${ORB_SKINS.length} finishes`);
    ORB_SKINS.forEach((skin, i) => {
      const open = this.skinOpen(skin), on = skin.id === now;
      this.text(`lk-n-${i}`, skin.name);
      this.els.get(`lk-n-${i}`)?.setProperties({ color: open ? C.text : C.textDim });
      this.text(`lk-m-${i}`, on ? 'Wearing' : open ? 'Tap to wear' : skin.unlock ? `Earn ${skin.unlock.text}` : `Level ${skin.level}`);
      this.els.get(`lk-m-${i}`)?.setProperties({ color: on ? C.done : C.textDim });
      this.els.get(`lk-sw-${i}`)?.setProperties({ backgroundColor: open ? swatch[skin.id] : '#2d2f33' });
      this.els.get(`lk-t-${i}`)?.setProperties({ borderColor: on ? C.done : '#242528', backgroundColor: on ? '#1f2a26' : '#242528' });
    });
    PALETTES.forEach((pal, i) => {
      const on = pal.id === settings.palette;
      this.text(`lk-pl-${i}`, pal.name);
      this.els.get(`lk-pd-${i}`)?.setProperties({ backgroundColor: pal.colors[0] });
      this.bg(`lk-p-${i}`, on ? C.primary : '#2d2f33');
    });
    const shown: Record<StudioOption, boolean> = { liquid: settings.orbLiquid, gauge: settings.orbGauge, phase: settings.orbPhase, trail: settings.orbTrail };
    for (const k of STUDIO_OPTIONS) this.bg(`lk-o-${k}`, shown[k] ? C.primary : '#2d2f33');
    this.dirty = true;
  }

  // ---- Qubit studio: colours and what the orbs show

  private toggleStudio(open = !this.studioOpen): void {
    this.studioOpen = open;
    if (open) {
      this.libOpen = this.dbgOpen = this.classOpen = false;
      this.settingsOpen = false;
      if (this.notes?.open) this.notes.close();
      this.noiseOpen = false;
      this.renderLooks();
    }
    feedback('select');
  }

  private choosePalette(id: string): void {
    settings.palette = id;
    saveSettings();
    setPalette(id);
    this.world.getSystem(LabSystem)?.rebuildOrbs();
    this.renderLooks();
    this.renderDock();
    feedback('select');
  }

  private toggleOrbOption(k: StudioOption): void {
    if (k === 'liquid') settings.orbLiquid = !settings.orbLiquid;
    else if (k === 'gauge') settings.orbGauge = !settings.orbGauge;
    else if (k === 'phase') settings.orbPhase = !settings.orbPhase;
    else settings.orbTrail = !settings.orbTrail;
    saveSettings();
    this.world.getSystem(LabSystem)?.setOrbOptions({ liquid: settings.orbLiquid, gauge: settings.orbGauge, phase: settings.orbPhase, trail: settings.orbTrail });
    this.renderLooks();
    feedback('select');
  }

  // ---- home: the free lab as a hub

  /** The first chapter not yet finished (for Continue). */
  private nextChapter(): number {
    const done = new Set(campaign.view.completed);
    for (let i = 0; i < campaign.chapters.length; i++) if (!done.has(i)) return i;
    return campaign.chapters.length - 1;
  }

  private homeChoice(i: number): void {
    if (i === 0) return this.startPlay(PLAY.indexOf('Today'));
    if (i === 1) {
      campaign.startChapter(this.nextChapter());
      return feedback('select');
    }
    this.toggleStudio(true);
  }

  /** Back to the home card: the free lab with two qubits. */
  private goHome(): void {
    this.endRush(false);
    this.endGame(false);
    campaign.enterSandbox(2, []);
    feedback('select');
  }

  // ---- Quantum Rush: build target states against the clock

  private rush: RushSession | null = null;
  /** The last round's summary, shown until Again or Done. */
  private rushOver: { score: number; solved: number; bestCombo: number; best: number; newBest: boolean; top: { score: number; day: string; current: boolean }[] } | null = null;
  private rushLast: { points: number; combo: number; until: number } | null = null;
  /** After a solve the orbs show the match for a moment, then reset for the next target. */
  private rushResetAt = 0;
  private rushCardTimer = 0;
  private readonly clockNow = () => performance.now() / 1000;

  private rushZen = false;

  private startRush(zen = false, seed: number | null = null): void {
    this.rushZen = zen;
    this.endGame(false);
    this.profileOpen = this.libOpen = this.dbgOpen = this.classOpen = false;
    this.noiseOpen = false;
    if (this.code) this.code.visible = false;
    if (this.notes?.open) this.notes.close();
    this.setView(null);
    this.rushOver = null;
    this.rushLast = null;
    this.rushResetAt = 0;
    this.racePending = null;
    this.versusSeed = seed;
    // a race: everyone's targets come from the same seed, in the same order
    this.rush = new RushSession(this.clockNow(), seed !== null ? mulberry32(seed) : Math.random, zen);
    if (campaign.mode !== 'sandbox' || lab.n !== RUSH_QUBITS || lab.history.length) campaign.enterSandbox(RUSH_QUBITS, []);
    this.tab = 'play';
    this.use('rush');
    this.raceReport(0, 0, false);
    this.flash(seed !== null ? 'Go! Make each target on your own orbs. Everyone has the same ones; the standings are on the card.' : zen ? 'Zen Rush: no clock. Make each target at your own pace; Quit when you are done.' : 'Quantum Rush: make each target on the orbs, any way you like. 60 seconds; solves add time.');
    feedback('select');
    this.render(campaign.view);
  }

  /** The orbs changed: did they make the target? */
  private checkRush(): void {
    const r = this.rush;
    if (!r || this.rushResetAt) return;
    const now = this.clockNow();
    if (r.over(now) || !r.matches(lab.history.state)) return;
    const res = r.solve(now);
    this.raceReport(r.score, r.solved, false);
    this.rushLast = { points: res.points, combo: res.combo, until: now + 1.6 };
    if (res.combo >= 4) this.world.getSystem(LabSystem)?.celebrate(false);
    this.rushResetAt = now + 0.7;
    feedback('success');
    this.world.getSystem(LabSystem)?.rushFx.pop(`+${res.points}`, res.combo > 1 ? `combo x${res.combo}` : `${res.seconds.toFixed(1)} s`);
    this.renderRushCard();
  }

  private skipRush(): void {
    if (!this.rush) return;
    this.rush.skip(this.clockNow());
    lab.reset(RUSH_QUBITS);
    this.world.getSystem(LabSystem)?.rushFx.pop('Skip', '-3 s', '#8a8d93');
    feedback('select');
    this.renderRushCard();
  }

  /** The round ends: on time (summary), or Quit/Done (back to the plain sandbox), or because the player went elsewhere. */
  private endRush(toSandbox: boolean, timeUp = false): void {
    const r = this.rush;
    this.rush = null;
    // a race: my round is over (quitting counts as finishing, with the score so far)
    if (r) this.raceReport(r.score, r.solved, true);
    else if (this.racePending) this.raceReport(0, 0, true);
    this.racePending = null;
    this.world.getSystem(LabSystem)?.rushFx.clock(null);
    if (timeUp && r) {
      const newBest = this.profile.onRush(r.score, r.bestCombo);
      const top = this.profile.data.stats.rushTop;
      const mine = top.findIndex((t) => t.score === r.score);
      this.rushOver = { score: r.score, solved: r.solved, bestCombo: r.bestCombo, best: this.profile.data.stats.rushBest, newBest, top: top.map((t, i) => ({ ...t, current: i === mine })) };
      if (newBest) this.world.getSystem(LabSystem)?.celebrate(true);
      this.quest('rush', r.score);
      this.profileDirty = true;
      this.checkAchievements();
      feedback(newBest ? 'success' : 'select');
      this.banner.show(newBest ? 'New best' : this.versusSeed !== null ? 'Time' : 'Quantum Rush', `${r.score.toLocaleString('en-US')} points`, `${r.solved} made, best combo x${r.bestCombo}`);
      this.render(campaign.view);
      return;
    }
    this.rushOver = null;
    this.versusSeed = null;
    if (toSandbox) this.render(campaign.view);
  }

  // ---- Rush versus and the class challenge: the same round for everyone in the room

  /** The seed of the race I am playing (or just played), or null outside a race. */
  private versusSeed: number | null = null;
  /** The countdown before a race. */
  private racePending: { seed: number; at: number; shown: number } | null = null;
  /** The class panel shows the challenge scoreboard rather than the assignments. */
  private classBoard = false;
  private wonSeed: number | null = null;

  /** Rush versus / Class challenge on the Play tab: open a room if needed, else start the race for everyone. */
  private raceButton(kind: RoomKind): void {
    const r = this.room;
    if (!r) {
      this.startRoom(kind, savedName() || (kind === 'class' ? 'Teacher' : 'Player'));
      const code = this.room!.code;
      this.flash(
        kind === 'lab'
          ? `Rush versus: room ${code} is open. When your friends have joined with that code, press Rush versus again and you all race.`
          : `Class ${code} is open. When your students have joined with that code, press Class challenge again to start the race.`,
      );
      return feedback('select');
    }
    const others = [...r.peers.values()].filter((p) => p.role === 'student' || r.kind === 'lab').length;
    if (!others) {
      this.flash(`Nobody else is here yet: they join with code ${r.code}.`);
      return feedback('reject');
    }
    const why = r.startRace(Math.floor(Math.random() * 2 ** 31));
    if (why) {
      this.flash(why);
      feedback('reject');
    }
  }

  /** Someone started a race: a three-second countdown, then the same round for everyone. A teacher watches the scoreboard. */
  private onRaceStart(race: Race): void {
    if (race.kind === 'class') this.classBoard = true;
    if (!race.playing) {
      this.toggleClass(true);
      this.flash('Class challenge started: every student gets the same targets in the same order. The live scoreboard is in the class panel.');
      return;
    }
    this.endRush(false);
    this.endGame(false);
    this.profileOpen = this.libOpen = this.dbgOpen = this.classOpen = false;
    this.noiseOpen = false;
    if (this.code) this.code.visible = false;
    if (this.notes?.open) this.notes.close();
    this.setView(null);
    this.rushOver = null;
    this.versusSeed = race.seed;
    this.racePending = { seed: race.seed, at: this.clockNow() + 3, shown: 4 };
    if (campaign.mode !== 'sandbox' || lab.n !== RUSH_QUBITS || lab.history.length) campaign.enterSandbox(RUSH_QUBITS, []);
    this.tab = 'play';
    this.use('race');
    const by = race.by === this.room?.me.id ? 'You' : (this.room?.peers.get(race.by)?.name ?? 'Someone');
    this.flash(`${race.kind === 'class' ? 'Class challenge' : 'Rush versus'}: ${by} started a race. Same targets for everyone, in the same order.`);
    feedback('select');
    this.render(campaign.view);
  }

  /** My score, to the others in the race (only for the race I am playing). */
  private raceReport(score: number, solved: number, done: boolean): void {
    const room = this.room;
    if (this.versusSeed === null || !room?.race || room.race.seed !== this.versusSeed) return;
    room.raceScore(score, solved, done);
  }

  /** The standings in one line: "1. Bo 980   2. You 760 (playing)". */
  private standingsLine(room: SharedRoom, max = 4): string {
    const st = room.standings();
    const racing = !!this.rush;
    const line = st.slice(0, max).map((x, k) => `${k + 1}. ${x.me ? 'You' : x.name} ${x.score.toLocaleString('en-US')}${racing ? (x.done ? ' (done)' : '') : x.done ? '' : ' (playing)'}`);
    if (st.length > max) {
      const mine = st.findIndex((x) => x.me);
      if (mine >= max) line.push(`... ${mine + 1}. You ${st[mine].score.toLocaleString('en-US')}`);
    }
    return line.join('   ');
  }

  /** The room changed during a race: redraw the standings, and celebrate a win once everyone is done. */
  private raceChanged(): void {
    const room = this.room;
    const race = room?.race;
    if (!room || !race) return;
    if ((this.rush || this.rushOver || this.racePending) && this.versusSeed === race.seed) this.renderRushCard();
    if (this.versusSeed === race.seed && this.rushOver && room.raceOver() && this.wonSeed !== race.seed) {
      this.wonSeed = race.seed;
      const st = room.standings();
      if (st.length > 1 && st[0].me && st[0].score > st[1].score) {
        this.use('race:win');
        this.profileDirty = true;
        this.world.getSystem(LabSystem)?.celebrate(true);
        this.banner.show('You won', `${st[0].score.toLocaleString('en-US')} points`, `against ${st.length - 1} other${st.length > 2 ? 's' : ''}`);
        feedback('success');
      }
    }
  }

  private rushView(): RushView {
    const r = this.rush;
    const amps = (st: { dim: number; re: ArrayLike<number>; im: ArrayLike<number> }): [number, number][] => Array.from({ length: st.dim }, (_, k) => [st.re[k], st.im[k]]);
    const now = this.clockNow();
    const t = r?.target;
    return {
      target: t ? { name: t.name, ket: ket(t.state), par: t.par, tier: t.tier, amps: amps(t.state) } : { name: '', ket: '', par: 0, tier: 0, amps: [] },
      now: lab.n === RUSH_QUBITS ? amps(lab.history.state) : [],
      secondsLeft: r ? r.timeLeft(now) : 0,
      score: r?.score ?? this.rushOver?.score ?? 0,
      solved: r?.solved ?? this.rushOver?.solved ?? 0,
      combo: r?.combo ?? 1,
      last: this.rushLast && now < this.rushLast.until ? { points: this.rushLast.points, combo: this.rushLast.combo } : null,
      over: this.rushOver ? { best: this.rushOver.best, newBest: this.rushOver.newBest, bestCombo: this.rushOver.bestCombo, top: this.rushOver.top } : null,
      race: this.room?.race && this.room.race.seed === this.versusSeed ? { name: this.room.race.kind === 'class' ? 'Class challenge' : 'Rush versus', final: this.room.raceOver(), standings: this.room.standings() } : undefined,
    };
  }

  /** The card during a round (and its summary after). */
  private renderRushCard(): void {
    for (let i = 0; i < 5; i++) this.els.get(`pip-${i}`)?.setProperties({ display: 'none' });
    this.els.get('btn-notes')?.setProperties({ display: 'none' });
    this.els.get('btn-lib')?.setProperties({ display: 'none' });
    const over = this.rushOver;
    const room = this.room;
    const race = this.versusSeed !== null && room?.race?.seed === this.versusSeed ? room.race : null;
    const raceName = race?.kind === 'class' ? 'Class challenge' : 'Rush versus';
    if (this.racePending) {
      const left = Math.max(1, Math.ceil(this.racePending.at - this.clockNow()));
      const racers = room ? [...room.peers.values()].filter((x) => x.role === 'student' || room.kind === 'lab').length + 1 : 1;
      this.text('chapter-eyebrow', `${raceName}  /  ${racers} racing`);
      this.text('chapter-title', `Starting in ${left}`);
      this.text('chapter-body', 'Same targets for everyone, in the same order, each on your own orbs. Make each one as fast as you can; the standings update live.');
      this.text('goal-text', 'Most points wins');
      this.bg('goal-dot', C.current);
      this.text('btn-next-label', 'Ready');
      this.text('btn-replay-label', 'Quit');
      this.bg('btn-next', C.primaryIdle);
      return;
    }
    if (over && race && room) {
      const st = room.standings();
      const place = st.findIndex((x) => x.me);
      const all = room.raceOver();
      const ord = (k: number) => `${k}${k % 10 === 1 && k !== 11 ? 'st' : k % 10 === 2 && k !== 12 ? 'nd' : k % 10 === 3 && k !== 13 ? 'rd' : 'th'}`;
      this.text('chapter-eyebrow', `${raceName}  /  ${all ? 'final' : 'waiting for the others'}`);
      this.text('chapter-title', all ? (place === 0 && st.length > 1 ? 'You won!' : `${ord(place + 1)} of ${st.length}`) : `${over.score.toLocaleString('en-US')} points`);
      this.text('chapter-body', this.standingsLine(room));
      this.text('goal-text', `${over.score.toLocaleString('en-US')} points, ${over.solved} made, best combo x${over.bestCombo}`);
      this.bg('goal-dot', all && place === 0 ? C.done : C.current);
      this.text('btn-next-label', 'Again');
      this.text('btn-replay-label', 'Done');
      this.bg('btn-next', C.primary);
      return;
    }
    if (over) {
      this.text('chapter-eyebrow', 'Quantum Rush  /  round over');
      this.text('chapter-title', `${over.score.toLocaleString('en-US')} points`);
      this.text('chapter-body', `${over.solved} target${over.solved === 1 ? '' : 's'} made, best combo x${over.bestCombo}. ${over.newBest ? 'A new best score!' : `Your best: ${over.best.toLocaleString('en-US')}.`}`);
      this.text('goal-text', over.newBest ? 'New best' : 'Try for more');
      this.bg('goal-dot', C.done);
      this.text('btn-next-label', 'Again');
      this.text('btn-replay-label', 'Done');
      this.bg('btn-next', C.primary);
      return;
    }
    const r = this.rush!;
    const left = r.timeLeft(this.clockNow());
    this.text('chapter-eyebrow', `${r.zen ? 'Zen Rush  /  no clock' : `${race ? raceName : 'Quantum Rush'}  /  ${Math.ceil(left)} s left`}${r.combo > 1 ? `  /  combo x${r.combo}` : ''}`);
    this.text('chapter-title', r.target.name);
    this.text('chapter-body', race && room ? `Make ${ket(r.target.state)}: par ${r.target.par}.   ${this.standingsLine(room, 3)}` : `Make ${ket(r.target.state)} on the orbs, any way you like: par ${r.target.par}. It counts the moment they match.`);
    this.text('goal-text', `Score ${r.score.toLocaleString('en-US')}   /   ${r.solved} made`);
    this.bg('goal-dot', left <= 10 ? '#ff8a7a' : C.current);
    this.text('btn-next-label', 'Skip');
    this.text('btn-replay-label', 'Quit');
    this.bg('btn-next', C.primaryIdle);
  }

  /** Every frame during a round: the clock, the reset after a solve, and time running out. */
  private updateRush(dt: number): void {
    const p = this.racePending;
    if (p) {
      const now = this.clockNow();
      const left = Math.ceil(p.at - now);
      if (left < p.shown) {
        p.shown = left;
        if (left > 0) this.world.getSystem(LabSystem)?.rushFx.pop(String(left), 'get ready', C.textDim);
        this.renderRushCard();
      }
      if (now >= p.at) {
        this.world.getSystem(LabSystem)?.rushFx.pop('Go', 'same targets for all');
        this.startRush(false, p.seed);
      }
      return;
    }
    const r = this.rush;
    if (!r) return;
    const now = this.clockNow();
    if (this.rushResetAt && now >= this.rushResetAt) {
      this.rushResetAt = 0;
      lab.reset(RUSH_QUBITS);
    }
    this.world.getSystem(LabSystem)?.rushFx.clock(r.zen ? null : r.timeLeft(now));
    if (r.over(now)) return this.endRush(false, true);
    this.rushCardTimer += dt;
    if (this.rushCardTimer > 0.25) {
      this.rushCardTimer = 0;
      this.renderRushCard();
    }
  }

  /** The Play tab: Quantum Rush, today's daily, the surface code, and a many-worlds demo. */
  private startPlay(k: number): void {
    const item = PLAY[k];
    const lsys = this.world.getSystem(LabSystem);
    this.quest('wonder');
    if (item === 'Code lab') return this.labOpen ? this.closeCodeLab() : this.openCodeLab(false);
    if (item === 'Quantum AI') {
      this.endRush(false);
      this.endGame(false);
      return this.startGame('qml');
    }
    if (item === 'Supercomputer') {
      this.endRush(false);
      this.endGame(false);
      return this.startGame('super');
    }
    if (item === 'Today' || item === 'Wind down') {
      this.endRush(false);
      this.endGame(false);
      this.todayWind = item === 'Wind down';
      return this.startGame('today');
    }
    if (item === 'First five minutes') {
      this.endRush(false);
      this.endGame(false);
      campaign.startLesson(campaign.lessons.findIndex((l) => l.chip === 'Tour'));
      return feedback('select');
    }
    if (item === 'Daily quests') {
      this.questsOpen = !this.questsOpen;
      if (this.questsOpen) this.profileOpen = this.libOpen = this.albumOpen = false;
      this.renderNav(campaign.view);
      return feedback('select');
    }
    if (item === 'Quantum Rush') return this.startRush();
    if (item === 'Zen Rush') return this.startRush(true);
    if (item === 'Rush versus' || item === 'Class challenge') return this.raceButton(item === 'Rush versus' ? 'lab' : 'class');
    // the switches: they stay on while you do anything else
    const toggle = (on: boolean, feature: string, text: string) => {
      if (on) this.use(feature);
      this.flash(text);
      feedback('select');
      this.renderNav(campaign.view);
    };
    if (item === 'Giant sphere') return toggle((this.giantOn = !this.giantOn), 'giant', this.giantOn ? 'You are inside the Bloch sphere. Turn a qubit and its arrow paints the sky around you.' : 'The giant sphere is put away.');
    if (item === 'Inside a qubit') return toggle((this.insideOn = !this.insideOn), 'inside', this.insideOn ? 'Inside a qubit: a transmon a thousand times bigger. Its |0> and |1> levels fill as you turn the selected orb.' : 'Back to the desk.');
    if (item === 'Shor in 3D') {
      this.shorOn = !this.shorOn;
      lsys?.showShor(this.shorOn);
      return toggle(this.shorOn, 'shor', this.shorOn ? "Shor's algorithm factoring 15: superposition, the repeating pattern, a measurement, the Fourier transform, and the factors." : 'Shor put away.');
    }
    if (item === 'System Two') {
      this.systemTwoOn = !this.systemTwoOn;
      lsys?.showSystemTwo(this.systemTwoOn);
      return toggle(this.systemTwoOn, 'system-two', this.systemTwoOn ? 'A modular quantum computer, three metres behind you: three cryostats linked into one machine. Turn around and look.' : 'The big machine is put away.');
    }
    if (item === 'Photonic chip') {
      this.codeFormat = 'chip';
      this.showCode(false);
      this.setMachine('photons');
      return this.renderNav(campaign.view);
    }
    if (item === 'History') return toggle((this.historyOn = !this.historyOn), 'history', this.historyOn ? 'Quantum computing from 1981 to 2024, around the desk. Turn your head to walk the timeline.' : 'The gallery is put away.');
    if (item === 'Night sky') {
      this.nightOn = !this.nightOn;
      lsys?.setNight(this.nightOn);
      return toggle(this.nightOn, 'night', this.nightOn ? 'Night sky. The lab stays right where it is.' : 'The room is back.');
    }
    if (item === 'Ambient music') {
      if (this.ambient.on) this.ambient.stop();
      else this.ambient.start();
      return toggle(this.ambient.on, 'ambient', this.ambient.on ? 'Ambient music: every basis state with weight is a note. Gates glide the chord.' : 'Music off.');
    }
    if (item === 'State album') {
      this.albumOpen = !this.albumOpen;
      if (this.albumOpen) this.profileOpen = this.libOpen = false;
      return toggle(this.albumOpen, 'album-open', this.albumOpen ? `Your State Album: ${this.albumCount()} of ${ALBUM.length}. Make a state on the orbs to collect it.` : 'Album closed.');
    }
    this.endRush(false);
    const games: Record<string, GameId> = { 'Quantum dice': 'dice', 'Penny flip': 'penny', 'Schrodinger cat': 'cat', 'Spy game': 'spy', 'Be the decoder': 'decoder', 'Grover maze': 'grover', Teleporter: 'teleport', 'Quantum tic-tac-toe': 'ttt', 'Double slit': 'slit', 'Stern-Gerlach': 'sg', 'Bomb tester': 'bomb' };
    if (games[item]) return this.startGame(games[item]);
    this.endGame(false);
    if (item === 'Daily') return this.startDaily();
    if (item === 'Surface Code') {
      campaign.startChapter(campaign.chapters.findIndex((c) => c.title === 'Surface Code'));
      return feedback('select');
    }
    // interference you can see: H twice on q0 cancels its |1> paths, a Bell pair branches q1
    campaign.enterSandbox(2, [{ kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'h', target: 1 }, { kind: 'gate', gate: 'z', target: 1, controls: [0] }, { kind: 'gate', gate: 'h', target: 0 }, { kind: 'gate', gate: 'h', target: 1 }]);
    this.setView('worlds');
    this.tab = 'play';
    this.renderNav(campaign.view);
    this.flash('Many worlds: every path through H, H, CZ, H, H. Opposite colours meet at the empty rings and cancel.');
    feedback('select');
  }

  // ---- the Play tab's wonders and mini-games

  private giantOn = false;
  private insideOn = false;
  private historyOn = false;
  private shorOn = false;
  private systemTwoOn = false;
  private nightOn = false;
  private albumOpen = false;
  private readonly ambient = new Ambient();
  private ambientTimer = 0;
  private game: GameId | null = null;
  private pennyPhase: PennyPhase = 'first';
  private penny: PennyRecord = { you: 0, computer: 0 };
  private pennyLast: { flipped: boolean; outcome: 0 | 1 } | null = null;
  private diceAt = -1;
  private diceLast: number | null = null;

  /** Is this Play item running (for the navigator's highlight)? */
  private playOn(item: (typeof PLAY)[number]): boolean {
    switch (item) {
      case 'Code lab':
        return this.labOpen;
      case 'Daily quests':
        return this.questsOpen;
      case 'Spy game':
        return this.game === 'spy';
      case 'Be the decoder':
        return this.game === 'decoder';
      case 'Grover maze':
        return this.game === 'grover';
      case 'Teleporter':
        return this.game === 'teleport';
      case 'Quantum tic-tac-toe':
        return this.game === 'ttt';
      case 'Double slit':
        return this.game === 'slit';
      case 'Stern-Gerlach':
        return this.game === 'sg';
      case 'Bomb tester':
        return this.game === 'bomb';
      case 'Shor in 3D':
        return this.shorOn;
      case 'System Two':
        return this.systemTwoOn;
      case 'Photonic chip':
        return this.machine === 'photons' && !!this.code?.visible && this.codeFormat === 'chip';
      case 'Quantum Rush':
        return !!(this.rush || this.rushOver) && !this.rushZen && this.versusSeed === null;
      case 'Zen Rush':
        return !!(this.rush || this.rushOver) && this.rushZen;
      case 'Rush versus':
        return this.versusSeed !== null && this.room?.race?.kind === 'versus';
      case 'Class challenge':
        return this.room?.race?.kind === 'class' && (this.versusSeed !== null || this.classBoard);
      case 'Quantum dice':
        return this.game === 'dice';
      case 'Penny flip':
        return this.game === 'penny';
      case 'Schrodinger cat':
        return this.game === 'cat';
      case 'State album':
        return this.albumOpen;
      case 'Giant sphere':
        return this.giantOn;
      case 'Inside a qubit':
        return this.insideOn;
      case 'Night sky':
        return this.nightOn;
      case 'History':
        return this.historyOn;
      case 'Ambient music':
        return this.ambient.on;
      default:
        return false;
    }
  }

  private albumCount(): number {
    return ALBUM.filter((e) => this.profile.data.stats.used.includes(`album:${e.id}`)).length;
  }

  /** A state on the orbs that is in the album, and not collected yet: collect it. */
  private checkAlbum(): void {
    for (const e of albumMatches(lab.history.state)) {
      const key = `album:${e.id}`;
      if (this.profile.data.stats.used.includes(key)) continue;
      this.profile.use(key);
      this.banner.show('New in your State Album', e.name, `${e.ket}  /  ${this.albumCount()} of ${ALBUM.length} collected`);
      this.world.getSystem(LabSystem)?.celebrate(false);
      this.quest('album');
      this.checkAchievements();
    }
  }

  private startGame(g: GameId): void {
    this.profileOpen = this.libOpen = this.albumOpen = false;
    if (this.code) this.code.visible = false;
    this.setView(null);
    this.game = g;
    this.tab = 'play';
    if (g === 'dice') {
      campaign.enterSandbox(3, []);
      this.diceLast = null;
      this.use('dice');
    } else if (g === 'penny') {
      campaign.enterSandbox(1, []);
      this.pennyPhase = 'first';
      this.pennyLast = null;
    } else if (g === 'cat') {
      campaign.enterSandbox(1, [{ kind: 'gate', gate: 'h', target: 0 }]);
      this.use('cat');
    } else if (g === 'spy') {
      campaign.enterSandbox(1, []);
      this.spyRound = null;
      this.spyPhase = 'ready';
    } else if (g === 'decoder') {
      campaign.enterSandbox(1, []);
      this.decoderRound();
    } else if (g === 'teleport') {
      campaign.enterSandbox(3, []);
      this.teleportNew();
    } else if (g === 'ttt' || g === 'slit' || g === 'sg' || g === 'bomb') {
      campaign.enterSandbox(1, []);
      this.game = g;
      this.modeStart(g);
    } else if (g === 'today') {
      this.game = g;
      this.todayBegin();
    } else if (g === 'qml') {
      campaign.enterSandbox(2, []);
      this.game = g;
      const ls = this.world.getSystem(LabSystem);
      if (ls) {
        ls.orbsHidden = true;
        ls.qml.root.visible = true;
      }
      this.qmlEntangle = true;
      this.qmlNew(true);
      this.ketSay({ text: 'A quantum neural network: two qubits read each point, and it learns which colour goes where. Tap Train and watch the landscape.', point: null }, true);
    } else if (g === 'super') {
      campaign.enterSandbox(1, []);
      this.game = g;
      this.superN = 2;
      const ls = this.world.getSystem(LabSystem);
      if (ls) ls.orbsHidden = true;
      ls?.showScale(scaleFor(2));
      this.ketSay({ text: 'Two qubits hold four numbers. Add qubits and watch what an ordinary computer would need to keep up.', point: null }, true);
    } else {
      campaign.enterSandbox(3, []);
      this.groverNew();
    }
    this.game = g;
    feedback('select');
    this.render(campaign.view);
  }

  private endGame(render: boolean): void {
    if (!this.game) return;
    this.game = null;
    const ls = this.world.getSystem(LabSystem);
    ls?.dice.hide();
    ls?.spy.hide();
    if (ls) ls.grover.root.visible = false;
    if (ls) ls.teleporter.root.visible = false;
    if (ls) {
      for (const r of [ls.ttt.root, ls.slits.root, ls.sg.root, ls.bombs.root]) r.visible = false;
      ls.orbsHidden = false;
      if (this.slitWall) ls.useWall(false);
      ls.showScale(null);
      ls.qml.root.visible = false;
    }
    this.slitWall = false;
    if (this.windBefore) {
      this.nightOn = this.windBefore.night;
      ls?.setNight(this.nightOn);
      if (!this.windBefore.music && this.ambient.on) this.ambient.stop();
      this.windBefore = null;
    }
    this.todayWind = false;
    this.slitStream = this.sgStream = false;
    ls?.showSurfacePuzzle(null);
    if (render) this.render(campaign.view);
  }

  /** The card's main button in a mini-game. */
  private gameNext(): void {
    const lsys = this.world.getSystem(LabSystem);
    if (this.game === 'spy') return this.spyNext();
    if (this.game === 'decoder') return this.decoderNext();
    if (this.game === 'grover') return this.groverNext();
    if (this.game === 'teleport') return this.teleportNext();
    if (this.game === 'ttt' || this.game === 'slit' || this.game === 'sg' || this.game === 'bomb') return this.modeNext();
    if (this.game === 'today') return this.todayNext();
    if (this.game === 'super') return this.superSet(this.superN + 1);
    if (this.game === 'qml') {
      this.qmlTraining = !this.qmlTraining;
      feedback('select');
      return this.renderGameCard();
    }
    if (this.game === 'dice') {
      // three Hadamards and three measurements: a fair number from 1 to 8
      lab.reset(3);
      for (let q = 0; q < 3; q++) lab.gate('h', q);
      lsys?.dice.roll();
      this.diceAt = performance.now() / 1000 + 0.9;
      feedback('gate');
    } else if (this.game === 'penny') {
      if (this.pennyPhase === 'first') {
        // the computer moves in secret: flip or not
        const flipped = computerFlips(Math.random);
        if (flipped) lab.apply({ kind: 'gate', gate: 'x', target: 0 });
        this.pennyLast = { flipped, outcome: 0 };
        this.pennyPhase = 'second';
        feedback('select');
      } else if (this.pennyPhase === 'second') {
        const outcome = lab.measure(0) ?? 0;
        this.pennyLast = { flipped: this.pennyLast?.flipped ?? false, outcome };
        this.penny = pennyScore(this.penny, outcome);
        this.pennyPhase = 'reveal';
        if (this.penny.you >= 3) this.use('penny:3');
        feedback(outcome === 0 ? 'success' : 'reject');
        if (outcome === 0) {
          lsys?.celebrate(false);
          this.quest('puzzle');
        }
      } else {
        lab.reset(1);
        this.pennyPhase = 'first';
        feedback('select');
      }
    } else if (this.game === 'cat') {
      if (lab.history.ops.some((o) => o.kind === 'measure')) lab.load(1, [{ kind: 'gate', gate: 'h', target: 0 }]);
      else lab.measure(0);
      feedback('measure');
    }
    this.renderGameCard();
  }

  private updateGame(dt: number): void {
    const ls = this.world.getSystem(LabSystem);
    if (this.game === 'ttt' || this.game === 'slit' || this.game === 'sg' || this.game === 'bomb') this.modeUpdate(dt);
    if (this.game === 'today') this.todayUpdate(dt);
    if (this.game === 'qml') this.qmlUpdate(dt);
    if (this.game === 'teleport' && this.tele.phase === 'flying' && ls?.teleporter.arrived) {
      this.tele.phase = 'fix';
      this.renderGameCard();
    }
    if (this.game === 'spy' && this.spyPhase === 'flying' && ls?.spy.arrived) {
      this.spyPhase = 'guess';
      this.renderGameCard();
    }
    if (this.game === 'grover' && ls) ls.grover.set(Array.from({ length: 8 }, (_, k) => lab.history.state.re[k]), this.groverOpen, this.groverMarked);
    if (this.game === 'decoder' && ls) ls.showSurfacePuzzle({ d: this.dec.d, lit: this.decoderLit(), flips: [...this.dec.flips], errors: this.dec.revealed ? this.dec.errors : null });
    if (this.diceAt > 0 && performance.now() / 1000 >= this.diceAt && this.game === 'dice') {
      this.diceAt = -1;
      const bits = [0, 1, 2].map((q) => lab.measure(q) ?? 0);
      const label = `${bits[2]}${bits[1]}${bits[0]}`;
      this.diceLast = parseInt(label, 2) + 1;
      this.world.getSystem(LabSystem)?.dice.land(this.diceLast, label);
      feedback('measure');
      this.renderGameCard();
    }
    this.ambientTimer += dt;
    if (this.ambient.on && this.ambientTimer > 0.4) {
      this.ambientTimer = 0;
      this.ambient.set(lab.state.probabilities());
    }
  }

  private renderGameCard(): void {
    for (let i = 0; i < 5; i++) this.els.get(`pip-${i}`)?.setProperties({ display: 'none' });
    if (this.game === 'today') return this.renderTodayCard();
    if (this.game === 'super') return this.renderSuperCard();
    if (this.game === 'qml') return this.renderQmlCard();
    if (this.game === 'ttt' || this.game === 'slit' || this.game === 'sg' || this.game === 'bomb') return this.renderModeCard();
    const asking = this.game === 'spy' && this.spyPhase === 'guess';
    this.els.get('choices')?.setProperties({ display: asking ? 'flex' : 'none' });
    if (asking) {
      ['Eve was listening', 'The line was clean'].forEach((label, i) => {
        this.els.get(`choice-${i}`)?.setProperties({ display: 'flex' });
        this.text(`choice-${i}-l`, label);
        this.bg(`choice-${i}`, '#2d2f33');
        this.els.get(`choice-${i}-l`)?.setProperties({ color: C.text });
      });
      this.els.get('choice-2')?.setProperties({ display: 'none' });
    }
    if (this.game === 'spy' || this.game === 'decoder' || this.game === 'grover' || this.game === 'teleport') return this.renderLearnGame();
    this.els.get('btn-notes')?.setProperties({ display: 'none' });
    this.els.get('btn-lib')?.setProperties({ display: 'none' });
    this.text('btn-replay-label', 'Done');
    this.bg('btn-next', C.primary);
    this.bg('goal-dot', C.current);
    if (this.game === 'dice') {
      this.text('chapter-eyebrow', 'Play  /  Quantum dice');
      this.text('chapter-title', this.diceLast ? `You rolled ${this.diceLast}` : 'An eight-sided die');
      this.text('chapter-body', 'Three qubits, each put half and half by an H, then measured: three fair coin tosses no one can predict, read as a number from 1 to 8.');
      this.text('goal-text', this.diceLast ? `|${(this.diceLast - 1).toString(2).padStart(3, '0')}> + 1 = ${this.diceLast}` : 'Tap Roll');
      this.text('btn-next-label', this.diceLast ? 'Roll again' : 'Roll');
    } else if (this.game === 'penny') {
      const rec = `You ${this.penny.you} : ${this.penny.computer} Computer`;
      this.text('chapter-eyebrow', `Play  /  Penny flip  /  ${rec}`);
      if (this.pennyPhase === 'first') {
        this.text('chapter-title', 'Your move');
        this.text('chapter-body', 'The coin is heads up (|0>). Do anything you like to it, then the computer secretly flips it or not, you move again, and we look. Heads, you win. (Hint: think quantum.)');
        this.text('goal-text', 'Make your move, then tap Done');
        this.text('btn-next-label', 'Done');
      } else if (this.pennyPhase === 'second') {
        this.text('chapter-title', 'The computer has moved');
        this.text('chapter-body', 'It flipped the coin, or it did not; you will not be told. Make your second move, then reveal.');
        this.text('goal-text', 'Move again, then tap Reveal');
        this.text('btn-next-label', 'Reveal');
      } else {
        const won = this.pennyLast?.outcome === 0;
        this.text('chapter-title', won ? 'Heads: you win' : 'Tails: the computer wins');
        this.text('chapter-body', `The computer ${this.pennyLast?.flipped ? 'flipped' : 'did not flip'} the coin. ${won ? 'With H before and after, a flip cannot touch |+>: you win every time.' : 'A classical move wins only half the time. Try H, and H again after.'}`);
        this.text('goal-text', rec);
        this.bg('goal-dot', won ? C.done : '#ff8a7a');
        this.text('btn-next-label', 'Play again');
      }
    } else if (this.game === 'cat') {
      const opened = lab.history.ops.some((o) => o.kind === 'measure');
      const p1 = lab.history.state.prob1(0);
      this.text('chapter-eyebrow', "Play  /  Schrodinger's cat");
      this.text('chapter-title', opened ? (p1 > 0.5 ? 'Asleep' : 'Awake') : 'Awake and asleep');
      this.text('chapter-body', opened ? 'Looking made it one or the other. Tap New cat for another superposition, and tilt the orb first to change the odds.' : `The qubit is in superposition, so the cat is both: awake ${Math.round((1 - p1) * 100)}%, asleep ${Math.round(p1 * 100)}%. Tilt the orb to change the odds, then open the box.`);
      this.text('goal-text', opened ? 'Tap New cat' : 'Tap Open, or close your fist');
      this.text('btn-next-label', opened ? 'New cat' : 'Open');
    }
  }


  // ---- new modes: quantum tic-tac-toe, the double slit, Stern-Gerlach and the bomb tester

  private tttGame: TttGame = newTtt();
  private tttSel: number | null = null;
  private tttVs: 'computer' | 'friend' = 'computer';
  /** Seconds until the computer acts (negative: not its turn). */
  private tttWait = -1;
  private tttScore = { x: 0, o: 0, draws: 0 };
  private tttLog: string[] = [];
  private slitSetup: SlitSetup = 'both';
  private slitStream = false;
  private slitT = 0;
  private slitAcc = 0;
  private slitHits: number[] = [];
  private sgExp = 0;
  private sgStream = false;
  private sgT = 0;
  private sgAcc = 0;
  private bombSet: { live: boolean; status: BombStatus }[] = [];
  private bombIdx = 0;
  private bombPhotons = 0;
  private bombLast = '';
  private bombZeno = false;
  private bombNextAt = -1;
  private modeCardTimer = 0;
  private modeFig: { at: number; key: string; fig: Figure } | null = null;

  private modeStart(g: 'ttt' | 'slit' | 'sg' | 'bomb'): void {
    const ls = this.world.getSystem(LabSystem);
    if (!ls) return;
    ls.orbsHidden = true;
    ls.ttt.root.visible = g === 'ttt';
    ls.slits.root.visible = g === 'slit';
    ls.sg.root.visible = g === 'sg';
    ls.bombs.root.visible = g === 'bomb';
    if (g === 'ttt') {
      ls.cellTap = (sq) => this.tttTap(sq);
      this.tttNew();
    } else if (g === 'slit') {
      this.slitSet(this.slitSetup);
    } else if (g === 'sg') {
      this.sgSet(this.sgExp);
    } else {
      this.bombRound();
    }
    this.use(g === 'ttt' ? 'ttt' : `exp-open:${g}`);
  }

  /** The card's main button. */
  private modeNext(): void {
    if (this.game === 'ttt') {
      this.tttNew();
      return feedback('select');
    }
    if (this.game === 'slit') {
      if (this.slitHits.length >= 2500) this.slitSet(this.slitSetup);
      this.slitStream = !this.slitStream;
      if (this.slitStream) this.slitT = 0;
    } else if (this.game === 'sg') {
      const c = this.world.getSystem(LabSystem)?.sg.counts;
      if (c && c.up + c.down + c.stopped >= 800) this.sgSet(this.sgExp);
      this.sgStream = !this.sgStream;
      if (this.sgStream) this.sgT = 0;
    } else if (this.game === 'bomb') {
      if (this.bombIdx >= this.bombSet.length) {
        this.bombRound();
        return feedback('select');
      }
      this.bombFire();
      return;
    }
    feedback('select');
    this.renderGameCard();
  }

  /** The card's choice buttons. */
  private modeChoice(i: number): void {
    if (this.game === 'ttt') {
      const g = this.tttGame;
      if (g.pending && this.tttHuman(g.pending.chooser)) return this.tttTap(g.marks[g.pending.mark].squares[i] ?? -1);
      if (!g.marks.length && i < 2) {
        this.tttVs = i === 0 ? 'computer' : 'friend';
        feedback('select');
        return this.renderGameCard();
      }
      return;
    }
    if (this.game === 'slit') {
      this.slitSet((['both', 'watched', 'one'] as const)[i]);
      this.slitStream = true;
      this.slitT = 0;
    } else if (this.game === 'sg') {
      this.sgSet(i);
      this.sgStream = true;
      this.sgT = 0;
    } else if (this.game === 'bomb') {
      if (i === 0) this.bombCallDud();
      else if (i === 1 && this.bombZeno) this.bombZenoTest();
      return;
    }
    feedback('select');
    this.renderGameCard();
  }

  private modeUpdate(dt: number): void {
    const ls = this.world.getSystem(LabSystem);
    if (!ls) return;
    let dirty = false;
    if (this.game === 'ttt') {
      const g = this.tttGame;
      ls.ttt.set({ marks: g.marks, board: g.board, selected: this.tttSel, options: g.pending && this.tttHuman(g.pending.chooser) ? g.marks[g.pending.mark].squares : [], line: g.over?.line ?? null });
      if (this.tttWait >= 0) {
        this.tttWait -= dt;
        if (this.tttWait < 0) this.tttComputer();
      }
    } else if (this.game === 'slit' && this.slitStream) {
      // a few slow photons you can follow, then faster and faster
      this.slitT += dt;
      const rate = this.slitT < 4 ? 3 : Math.min(90, 3 + (this.slitT - 4) * 14);
      this.slitAcc += dt * rate;
      while (this.slitAcc >= 1) {
        this.slitAcc -= 1;
        const x = sampleSlit(this.slitSetup, Math.random);
        this.slitHits.push(x);
        ls.slits.fire(x, rate < 8, Math.random);
      }
      if (this.slitHits.length >= 300) this.use('exp:slit');
      if (this.slitHits.length >= 2500) this.slitStream = false;
      dirty = true;
    } else if (this.game === 'sg' && this.sgStream) {
      this.sgT += dt;
      const rate = this.sgT < 5 ? 4 : Math.min(45, 4 + (this.sgT - 5) * 9);
      this.sgAcc += dt * rate;
      const stages = SG_EXPERIMENTS[this.sgExp].stages;
      while (this.sgAcc >= 1) {
        this.sgAcc -= 1;
        ls.sg.fire(runAtom(stages, Math.random), rate < 10);
      }
      const c = ls.sg.counts;
      if (c.up + c.down >= 100) this.use('exp:sg');
      if (c.up + c.down + c.stopped >= 800) this.sgStream = false;
      dirty = true;
    } else if (this.game === 'bomb' && this.bombNextAt > 0 && this.clockNow() >= this.bombNextAt) {
      this.bombNextAt = -1;
      this.bombIdx++;
      if (this.bombIdx < this.bombSet.length) ls.bombs.newBomb(`Bomb ${this.bombIdx + 1} of ${this.bombSet.length}`, 'live or dud?');
      else {
        const saved = this.bombSet.filter((b) => b.status === 'live').length;
        this.banner.show('Bomb tester', `${saved} live bomb${saved === 1 ? '' : 's'} found untouched`, `${this.bombSet.filter((b) => b.status === 'boom').length} lost, ${this.bombSet.filter((b) => b.status === 'dud').length} duds called right`);
        if (saved) this.world.getSystem(LabSystem)?.celebrate(false);
        this.quest('puzzle');
      }
      this.renderGameCard();
    }
    this.modeCardTimer += dt;
    if (dirty && this.modeCardTimer > 0.3) {
      this.modeCardTimer = 0;
      this.renderGameCard();
    }
  }

  /** The board's figure for the mode (redrawn at most five times a second while particles stream). */
  private modeFigure(): Figure | null {
    if (this.game === 'today') return memoryFigure(this.todayView());
    if (this.game === 'qml')
      return qmlFigure({ field: this.qmlFieldNow, n: FIELD_N, points: this.qmlData, weights: this.qmlW, entangle: this.qmlEntangle, step: this.qmlStep, acc: this.qmlAcc, loss: this.qmlLoss });
    if (this.game === 'super') {
      const sc = scaleFor(this.superN);
      return scaleFigure({ n: sc.n, amplitudes: sc.amplitudes, bytes: sc.bytes, note: sc.note });
    }
    const now = this.clockNow();
    const stamp = `${this.game}`;
    if (this.modeFig && this.modeFig.key === stamp && now - this.modeFig.at < 0.2 && (this.game === 'slit' || this.game === 'sg')) return this.modeFig.fig;
    let fig: Figure | null = null;
    if (this.game === 'ttt') fig = tttFigure({ status: this.tttStatus(), vs: this.tttVs, score: this.tttScore, log: this.tttLog });
    else if (this.game === 'slit') {
      const setup = this.slitSetup;
      fig = slitFigure({ setup, hist: slitHistogram(this.slitHits, 48), curve: Array.from({ length: 121 }, (_, i) => slitIntensity(-1 + (2 * i) / 120, setup)), hits: this.slitHits.length });
    } else if (this.game === 'sg') {
      const e = SG_EXPERIMENTS[this.sgExp];
      const c = this.world.getSystem(LabSystem)?.sg.counts ?? { up: 0, down: 0, stopped: 0 };
      fig = sgFigure({ name: e.name, up: c.up, down: c.down, stopped: c.stopped, expectUp: sgExpected(e.stages).up, note: this.sgNote() });
    } else if (this.game === 'bomb') fig = bombFigure({ bombs: this.bombSet.map((b, i) => ({ status: b.status, current: i === this.bombIdx })), photons: this.bombPhotons, zeno: this.bombZeno, last: this.bombLast });
    this.modeFig = fig ? { at: now, key: stamp, fig } : null;
    return fig;
  }

  /** Choice buttons on the card: a label each (null hides it), the active one in blue. */
  private modeChoices(labels: (string | null)[], active = -1): void {
    this.els.get('choices')?.setProperties({ display: labels.some((l) => l) ? 'flex' : 'none' });
    for (let i = 0; i < 3; i++) {
      const l = labels[i] ?? null;
      this.els.get(`choice-${i}`)?.setProperties({ display: l ? 'flex' : 'none' });
      if (!l) continue;
      this.text(`choice-${i}-l`, l);
      this.bg(`choice-${i}`, i === active ? C.primary : '#2d2f33');
      this.els.get(`choice-${i}-l`)?.setProperties({ color: C.text });
    }
  }

  private renderModeCard(): void {
    this.els.get('btn-notes')?.setProperties({ display: 'none' });
    this.els.get('btn-lib')?.setProperties({ display: 'none' });
    this.text('btn-replay-label', 'Done');
    this.bg('btn-next', C.primary);
    this.bg('goal-dot', C.current);
    if (this.game === 'ttt') return this.renderTttCard();
    if (this.game === 'slit') {
      const n = this.slitHits.length;
      const titles: Record<SlitSetup, [string, string]> = {
        both: ['Both slits, nobody watching', 'One photon at a time goes through a plate with two slits. Each lands in one spot, but dot by dot the screen fills with stripes: each photon passed through both slits as a wave and interfered with itself.'],
        watched: ['Watch which slit', 'A ring at each slit says which one every photon took. Now each photon goes through just one, and the stripes vanish: knowing the path destroys the interference.'],
        one: ['One slit', 'Cover one slit: a single broad bump, no stripes. Opening a second slit makes dark places where light used to land.'],
      };
      this.text('chapter-eyebrow', `Play  /  Double slit  /  ${n.toLocaleString('en-US')} photons`);
      this.text('chapter-title', titles[this.slitSetup][0]);
      this.text('chapter-body', titles[this.slitSetup][1]);
      this.text('goal-text', this.slitStream ? (this.slitWall ? 'Photons crossing your room' : 'Firing, faster and faster') : n >= 2500 ? 'Screen full: Fire starts again' : this.slitWall ? 'Tap Fire: the screen is your wall' : 'Tap Fire, or My wall for room scale');
      this.text('btn-next-label', this.slitStream ? 'Pause' : 'Fire');
      this.els.get('btn-notes')?.setProperties({ display: 'flex' });
      this.text('btn-notes-label', this.slitWall ? 'Desk screen' : 'My wall');
      return this.modeChoices(['Both slits', 'Watch them', 'One slit'], ['both', 'watched', 'one'].indexOf(this.slitSetup));
    }
    if (this.game === 'sg') {
      const e = SG_EXPERIMENTS[this.sgExp];
      const c = this.world.getSystem(LabSystem)?.sg.counts ?? { up: 0, down: 0, stopped: 0 };
      const titles = ['Two spots, never a smear', 'Measure again: same answer', 'Measuring X scrambles Z'];
      this.text('chapter-eyebrow', `Play  /  Stern-Gerlach  /  ${e.name}  /  ${c.up + c.down + c.stopped} atoms`);
      this.text('chapter-title', titles[this.sgExp]);
      this.text('chapter-body', this.sgNote());
      this.text('goal-text', this.sgStream ? 'Atoms flying' : 'Tap Fire, or pick an experiment');
      this.text('btn-next-label', this.sgStream ? 'Pause' : 'Fire');
      return this.modeChoices(SG_EXPERIMENTS.map((x) => x.name), this.sgExp);
    }
    // the bomb tester
    const done = this.bombIdx >= this.bombSet.length;
    const saved = this.bombSet.filter((b) => b.status === 'live').length;
    this.text('chapter-eyebrow', done ? 'Play  /  Bomb tester  /  round over' : `Play  /  Bomb tester  /  bomb ${this.bombIdx + 1} of ${this.bombSet.length}`);
    this.text('chapter-title', done ? `${saved} live bomb${saved === 1 ? '' : 's'} found untouched` : 'Is this bomb live?');
    this.text(
      'chapter-body',
      done
        ? 'Every one found by D was proven live without a single photon touching it. That is an interaction-free measurement.'
        : this.bombLast || 'A live bomb goes off if one photon touches its trigger; a dud lets light pass. Send photons through the interferometer: if the dark detector D ever clicks, the bomb is live, and it never went off.',
    );
    this.text('goal-text', done ? 'Tap New round' : `Photons fired: ${this.bombPhotons}`);
    this.text('btn-next-label', done ? 'New round' : 'Fire a photon');
    this.modeChoices(done ? [] : ['Call it a dud', this.bombZeno ? 'Zeno test' : null]);
  }

  // ---- quantum tic-tac-toe

  private tttHuman(p: TttPlayer): boolean {
    return this.tttVs === 'friend' || p === 'X';
  }

  private tttNew(): void {
    this.tttGame = newTtt();
    this.tttSel = null;
    this.tttWait = -1;
    this.tttLog = [];
    this.renderGameCard();
  }

  /** A square was tapped, by ray or by finger. */
  private tttTap(sq: number): void {
    if (this.game !== 'ttt') return;
    const g = this.tttGame;
    if (g.over) return feedback('reject');
    if (g.pending) {
      if (!this.tttHuman(g.pending.chooser) || !g.marks[g.pending.mark].squares.includes(sq)) return feedback('reject');
      return this.tttMeasure(sq);
    }
    if (!this.tttHuman(g.turn) || sq < 0) return feedback('reject');
    if (lastSquare(g) === sq) {
      const who = g.turn;
      placeLast(g, sq);
      this.tttLog.push(`${who}${g.marks.length}: ${SQUARE_NAMES[sq]} (the last square)`);
      return this.tttAfter();
    }
    if (g.board[sq] >= 0) return feedback('reject');
    if (this.tttSel === null || this.tttSel === sq) {
      this.tttSel = this.tttSel === sq ? null : sq;
      feedback('select');
      return this.renderGameCard();
    }
    const a = this.tttSel;
    this.tttSel = null;
    this.tttPlace(a, sq);
  }

  private tttPlace(a: number, b: number): void {
    const g = this.tttGame;
    const who = g.turn;
    const r = tttPlaceMark(g, a, b);
    if (!r) return feedback('reject');
    this.tttLog.push(`${who}${g.marks.length}: ${SQUARE_NAMES[a]} + ${SQUARE_NAMES[b]}${r === 'loop' ? '  (a loop)' : ''}`);
    feedback(r === 'loop' ? 'gate' : 'select');
    if (r === 'loop') this.world.getSystem(LabSystem)?.rushFx.pop('Loop', 'now it is measured', '#e2b04a');
    this.tttAfter();
  }

  private tttMeasure(sq: number): void {
    const g = this.tttGame;
    const mark = g.marks[g.pending!.mark];
    const order = tttCollapse(g, sq);
    if (!order) return;
    this.world.getSystem(LabSystem)?.ttt.popCollapse(order.map((mi) => g.marks[mi].at ?? 0));
    this.tttLog.push(`${mark.player}${mark.n} measured: ${SQUARE_NAMES[sq]}${order.length > 1 ? `, ${order.length - 1} more forced` : ''}`);
    feedback('measure');
    this.tttAfter();
  }

  /** After a move or a collapse: the end of the game, or the computer's turn. */
  private tttAfter(): void {
    const g = this.tttGame;
    if (g.over) {
      const w = g.over.winner;
      if (w === 'X') this.tttScore.x++;
      else if (w === 'O') this.tttScore.o++;
      else this.tttScore.draws++;
      const lost = this.tttVs === 'computer' && w === 'O';
      if (w && !lost) {
        this.world.getSystem(LabSystem)?.celebrate(true);
        if (this.tttVs === 'computer') this.use('ttt:win');
        this.quest('puzzle');
      }
      feedback(lost ? 'reject' : 'success');
    } else if (g.pending ? !this.tttHuman(g.pending.chooser) : !this.tttHuman(g.turn)) this.tttWait = 0.9;
    this.renderGameCard();
  }

  private tttComputer(): void {
    const g = this.tttGame;
    if (g.over) return;
    if (g.pending) return this.tttMeasure(computerCollapse(g, g.pending.chooser, Math.random));
    const mv = computerMove(g, Math.random);
    if (typeof mv === 'number') {
      placeLast(g, mv);
      this.tttLog.push(`O${g.marks.length}: ${SQUARE_NAMES[mv]} (the last square)`);
      return this.tttAfter();
    }
    this.tttPlace(mv[0], mv[1]);
  }

  private tttStatus(): string {
    const g = this.tttGame;
    const name = (p: TttPlayer) => (this.tttVs === 'computer' ? (p === 'X' ? 'You' : 'The computer') : p);
    if (g.over) return g.over.winner ? `${name(g.over.winner)} won${this.tttVs === 'computer' && g.over.winner === 'X' ? '!' : ''}` : 'A draw';
    if (g.pending) return this.tttHuman(g.pending.chooser) ? `${this.tttVs === 'computer' ? 'You' : g.pending.chooser} measure the loop` : 'The computer measures the loop';
    if (!this.tttHuman(g.turn)) return 'The computer is thinking';
    return this.tttVs === 'computer' ? 'Your move' : `${g.turn} to move`;
  }

  private renderTttCard(): void {
    const g = this.tttGame;
    const sc = this.tttScore;
    this.text('chapter-eyebrow', `Play  /  Quantum tic-tac-toe  /  ${this.tttVs === 'computer' ? `you ${sc.x} : ${sc.o} computer` : `X ${sc.x} : ${sc.o} O`}`);
    this.text('chapter-title', this.tttStatus());
    this.text('btn-next-label', 'New game');
    let body: string;
    let goal: string;
    let choices: (string | null)[] = [];
    let active = -1;
    if (g.over) {
      body = `${g.over.note} Every spooky mark ended up in exactly one square: the loops were measured.`;
      goal = 'Tap New game';
      this.bg('goal-dot', g.over.winner === 'O' && this.tttVs === 'computer' ? '#ff8a7a' : C.done);
    } else if (g.pending) {
      const m = g.marks[g.pending.mark];
      const [a, b] = m.squares;
      body = `${m.player}${m.n} closed a loop of entangled squares, so the loop is measured. ${this.tttHuman(g.pending.chooser) ? 'Choose' : 'The computer chooses'} where ${m.player}${m.n} lands, ${SQUARE_NAMES[a]} or ${SQUARE_NAMES[b]}; every mark tied to it is forced into a square of its own.`;
      goal = this.tttHuman(g.pending.chooser) ? 'Tap a gold square, or a button' : 'Watch the collapse';
      if (this.tttHuman(g.pending.chooser)) choices = [`${m.player}${m.n} to ${SQUARE_NAMES[a]}`, `${m.player}${m.n} to ${SQUARE_NAMES[b]}`];
    } else if (lastSquare(g) !== null && this.tttHuman(g.turn)) {
      body = 'One square left: tap it for an ordinary, classical mark.';
      goal = 'Tap the last square';
    } else if (this.tttSel !== null) {
      body = `First square: ${SQUARE_NAMES[this.tttSel]}. Tap a second: your mark will be in both at once, entangled.`;
      goal = 'Tap a second square';
    } else {
      body = 'Tap two squares for a spooky mark: it is in both at once until a loop of entangled squares is measured. Three classical marks in a row win.';
      goal = this.tttHuman(g.turn) ? 'Tap two squares' : 'The computer is moving';
      if (!g.marks.length) {
        choices = ['Play the computer', 'Two players'];
        active = this.tttVs === 'computer' ? 0 : 1;
      }
    }
    this.text('chapter-body', body);
    this.text('goal-text', goal);
    this.modeChoices(choices, active);
  }

  // ---- Quantum AI

  /** New data (or the same data again) and fresh, untrained weights. */
  private qmlNew(sameData: boolean): void {
    if (!sameData || !this.qmlData.length) this.qmlSeed = (this.qmlSeed * 7919 + 13) % 100000;
    this.qmlData = xorData(40, mulberry32(this.qmlSeed));
    this.qmlW = initialWeights(mulberry32(this.qmlSeed + 1));
    this.qmlStep = 0;
    this.qmlAcc = [];
    this.qmlLoss = [];
    this.qmlTraining = false;
    this.qmlSaid = '';
    this.world.getSystem(LabSystem)?.qml.setData(this.qmlData);
    this.qmlRefresh();
  }

  /** Measure how it does now, and show its landscape. */
  private qmlRefresh(): void {
    const acc = qmlAccuracy(this.qmlData, this.qmlW, this.qmlEntangle);
    this.qmlAcc_ = acc;
    this.qmlAcc.push(acc);
    this.qmlLoss.push(qmlLoss(this.qmlData, this.qmlW, this.qmlEntangle));
    if (this.qmlAcc.length > 200) {
      this.qmlAcc.shift();
      this.qmlLoss.shift();
    }
    const wrong = this.qmlData.map((p) => Math.sign(qmlPredict(p.x, p.y, this.qmlW, this.qmlEntangle)) !== p.label);
    this.qmlFieldNow = qmlField(this.qmlW, this.qmlEntangle, FIELD_N);
    this.world.getSystem(LabSystem)?.qml.setField(this.qmlFieldNow, wrong);
  }

  private qmlUpdate(dt: number): void {
    if (!this.qmlTraining) return;
    this.qmlTimer += dt;
    if (this.qmlTimer < 0.14) return;
    this.qmlTimer = 0;
    // a gentle learning rate, so you can watch the landscape find its shape
    this.qmlW = trainStep(this.qmlData, this.qmlW, this.qmlEntangle, 0.12);
    this.qmlStep++;
    this.qmlRefresh();
    const acc = this.qmlAcc_;
    if (acc >= 0.95 && this.qmlEntangle && this.qmlSaid !== 'learned') {
      this.qmlSaid = 'learned';
      this.qmlTraining = false;
      this.use('qml:learned');
      this.world.getSystem(LabSystem)?.celebrate(false);
      this.ketSay({ text: `It learned XOR: ${Math.round(acc * 100)}% right, in ${this.qmlStep} steps. The CNOT lets the answer depend on both coordinates at once. Now turn entanglement off and train again.`, point: null }, true);
    } else if (!this.qmlEntangle && this.qmlStep >= 50 && this.qmlSaid !== 'stuck') {
      this.qmlSaid = 'stuck';
      this.qmlTraining = false;
      this.ketSay({ text: `Stuck at ${Math.round(acc * 100)}%. Without entanglement, qubit 1 only ever hears about y, and XOR needs x and y together.`, point: null }, true);
    } else if (this.qmlStep >= 150) this.qmlTraining = false;
    this.renderGameCard();
  }

  private qmlChoice(i: number): void {
    if (i === 0) {
      this.qmlEntangle = !this.qmlEntangle;
      this.qmlNew(true);
    } else if (i === 1) this.qmlNew(false);
    else this.qmlNew(true);
    feedback('select');
    this.renderGameCard();
  }

  private renderQmlCard(): void {
    const acc = Math.round(this.qmlAcc_ * 100);
    this.els.get('btn-notes')?.setProperties({ display: 'none' });
    this.els.get('btn-lib')?.setProperties({ display: 'none' });
    this.text('btn-replay-label', 'Done');
    this.bg('btn-next', C.primary);
    this.bg('goal-dot', acc >= 95 ? C.done : C.current);
    this.text('chapter-eyebrow', `Play  /  Quantum AI  /  step ${this.qmlStep}`);
    this.text('chapter-title', this.qmlStep === 0 ? 'Teach two qubits XOR' : acc >= 95 ? `Learned: ${acc}% right` : `${acc}% right`);
    this.text(
      'chapter-body',
      this.qmlEntangle
        ? 'Each point turns two qubits (its x and its y), a CNOT entangles them, and qubit 1 answers: teal above zero, red below. Training tunes three angles by the parameter-shift rule, as on real quantum hardware.'
        : 'The same network without the CNOT: the qubits never meet. Watch it try.',
    );
    this.text('goal-text', this.qmlTraining ? 'Training...' : acc >= 95 ? 'Every bead on its own side' : 'Tap Train');
    this.text('btn-next-label', this.qmlTraining ? 'Pause' : 'Train');
    this.modeChoices([this.qmlEntangle ? 'Entanglement: on' : 'Entanglement: off', 'New data', 'Start over'], this.qmlEntangle ? -1 : 0);
  }

  // ---- the exponential wall

  private superSet(n: number): void {
    const before = deviceFor(this.superN);
    this.superN = Math.max(1, Math.min(60, n));
    const sc = scaleFor(this.superN);
    this.world.getSystem(LabSystem)?.showScale(sc);
    if (sc.device !== before) {
      const lines: Record<Device, string> = {
        phone: 'Still small: a phone could store every number.',
        laptop: 'Already a laptop full of memory, for a few dozen qubits.',
        server: 'Now it takes a server. Each qubit doubles it again.',
        rack: 'A whole rack of servers, just to write the state down.',
        supercomputer: 'Now it takes a supercomputer. Look at the racks filling the room.',
        beyond: 'Past about 49 qubits, no supercomputer has enough memory. Real quantum chips already have over 100 qubits.',
      };
      this.ketSay({ text: lines[sc.device], point: null }, true);
    }
    if (this.superN >= 50) this.use('super:50');
    feedback('select');
    this.renderGameCard();
  }

  private renderSuperCard(): void {
    const sc = scaleFor(this.superN);
    this.els.get('btn-notes')?.setProperties({ display: 'none' });
    this.els.get('btn-lib')?.setProperties({ display: 'none' });
    this.text('btn-replay-label', 'Done');
    this.bg('btn-next', C.primary);
    this.bg('goal-dot', sc.device === 'beyond' ? '#ff8a7a' : C.current);
    this.text('chapter-eyebrow', 'Play  /  The exponential wall');
    this.text('chapter-title', `${sc.n} qubits: ${sc.bytes}`);
    this.text('chapter-body', `${sc.note} An ordinary computer stores one number per basis state: 2^${sc.n} of them, 16 bytes each.`);
    this.text('goal-text', sc.n < 50 ? 'Add qubits and look around you' : 'Each qubit doubles it again');
    this.text('btn-next-label', 'Add a qubit');
    this.modeChoices([`+10 qubits`, 'Jump to 50', 'Back to 2']);
  }

  // ---- your crystal

  /** Show the crystal for the current memory; with `animate`, what is new grows in. */
  private showCrystal(animate: boolean): void {
    const ls = this.world.getSystem(LabSystem);
    if (!ls) return;
    const g = growthOf(this.memory, dayKey());
    ls.crystal.set(g, animate);
    this.crystalShown = g;
  }

  // ---- finger taps

  private tapHinted = false;

  /** Once a session, after a gate from the dock: there is a quicker way. */
  private tapHint(): void {
    if (this.tapHinted || !settings.fingerTaps || !this.immersive) return;
    this.tapHinted = true;
    this.ketSay({ text: 'A quicker way: tap your thumb to your middle finger for H, your ring finger for X, your little finger to measure.', point: null }, true);
  }

  // ---- Ket, the lab partner

  /** Say a line (unless Ket is off, or spoke a moment ago and this can wait). */
  private ketSay(line: KetLine, urgent = false): void {
    if (!settings.partner) return;
    const now = this.clockNow();
    if (!urgent && now - this.ketAt < 4) return;
    this.ketAt = now;
    this.world.getSystem(LabSystem)?.partnerSay(line.text, line.point);
    if (settings.speak && typeof speechSynthesis !== 'undefined') {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(line.text.replace(/\|(\w+)>/g, 'ket $1'));
        u.rate = 1.05;
        speechSynthesis.speak(u);
      } catch {
        // no speech on this browser: the card still shows the words
      }
    }
  }

  /** Ket explains moves while you build freely or make a state for Today; chapters and games narrate themselves. */
  private ketExplains(): boolean {
    if (this.rush || this.racePending) return false;
    return campaign.mode === 'sandbox' && (!this.game || this.game === 'today') && !(this.game === 'today' && this.todayCurrent?.kind !== 'make');
  }

  private ketHears(e: LabEvent): void {
    if (e.type === 'op' && !e.live) {
      this.ketOpAt = this.clockNow();
      const after = lab.history.state.clone();
      this.ketLast = { op: e.op, before: e.before, after };
      if (this.ketExplains()) {
        const line = explainOp(e.op, e.before, after);
        if (line) this.ketSay(line);
      }
    }
    if (e.type === 'seek') this.ketUndos++;
    if (e.type === 'reset') {
      this.ketUndos = 0;
      this.ketOpAt = this.clockNow();
    }
  }

  /** The state the current task asks for, if it is a "make this state" task: a puzzle, the daily, or a Today card. */
  private ketTarget(): { key: string; state: QState } | null {
    let key = '', make: (() => QState) | null = null;
    if (this.game === 'today') {
      const card = this.todayCurrent;
      if (card?.kind === 'make' && this.todayTarget && !this.todayAnswer) {
        key = `today:${card.id}`;
        const t = this.todayTarget;
        make = () => t;
      }
    } else if (!this.game && campaign.mode === 'puzzle') {
      const v = campaign.view;
      const ch = v.chapter;
      if (ch?.solution && !v.chapterDone && !v.stepDone) {
        key = `puzzle:${v.puzzleIndex}:${ch.title}`;
        make = () => runOps(ch.qubits, [...(ch.setup ?? []), ...ch.solution!], () => 0.5).state;
      }
    }
    if (!make) return null;
    if (this.ketTargetCache?.key !== key) this.ketTargetCache = { key, state: make() };
    return this.ketTargetCache;
  }

  /** Every frame: say hello once, and notice when you are stuck. */
  private ketUpdate(): void {
    if (!settings.partner || this.rush) return;
    const now = this.clockNow();
    if (!this.ketGreeted && now > 6) {
      this.ketGreeted = true;
      const tour = campaign.view.mode === 'learn' && campaign.view.chapter?.chip === 'Tour';
      this.ketSay(tour ? { text: "Hi, I'm Ket. That glass orb is a qubit: pinch it and turn your wrist. Ask me anything, any time.", point: 0 } : { text: "Hi, I'm Ket, your lab partner. Ask me 'what just happened?' or 'what should I do?' any time.", point: null }, true);
      return;
    }
    const idle = now - this.ketOpAt;
    const target = this.ketTarget();
    if (target) {
      const stuck = idle > 20 || this.ketUndos >= 3;
      const key = `${target.key}:${lab.history.length}`;
      if (stuck && this.ketHelped !== key && lab.state.n === target.state.n) {
        this.ketHelped = key;
        this.ketUndos = 0;
        const move = nextMove(lab.state, target.state, lab.state.n <= 2 ? 4 : 3);
        if (move) {
          if (this.game === 'today') this.todayHinted = true;
          this.ketSay(moveWords(move), true);
        }
      }
      return;
    }
    // a chapter or lesson step you have been on a while
    const v = campaign.view;
    if ((v.mode === 'campaign' || v.mode === 'learn' || v.mode === 'course') && !this.game && !v.intro && !v.stepDone && !v.chapterDone && idle > 45) {
      const key = `${v.mode}:${v.chapterIndex}:${v.lessonIndex}:${v.courseIndex}:${v.stepIndex}`;
      if (this.ketHelped !== key) {
        this.ketHelped = key;
        this.ketSay({ text: "Stuck? Say 'show me' and I'll do this step, or ask me 'what should I do?'", point: null }, true);
      }
    }
  }

  /** A spoken question for Ket. */
  private ketAnswer(text: string): void {
    const kind = classify(text);
    if (!settings.partner) {
      settings.partner = true;
      saveSettings();
      const ls = this.world.getSystem(LabSystem);
      if (ls) ls.partner.root.visible = true;
    }
    if (kind === 'what-happened') {
      const last = this.ketLast;
      const line = last ? explainOp(last.op, last.before, last.after) : null;
      return this.ketSay(line ?? describeState(lab.state), true);
    }
    if (kind === 'state') return this.ketSay(describeState(lab.state), true);
    if (kind === 'hint') {
      const target = this.ketTarget();
      if (target) {
        const move = nextMove(lab.state, target.state, lab.state.n <= 2 ? 4 : 3);
        if (move && this.game === 'today') this.todayHinted = true;
        return this.ketSay(move ? moveWords(move) : { text: 'You are already there: that is the state.', point: null }, true);
      }
      const v = campaign.view;
      const goal = v.step && !v.chapterDone ? (typeof v.step.goal === 'function' ? null : v.step.goal) : null;
      return this.ketSay({ text: goal ? `The task: ${goal}. Say 'show me' and I'll do it with you.` : 'Try the Play tab: Today takes five minutes, or pick a chapter.', point: null }, true);
    }
    const topic = answerTopic(text);
    this.ketSay(topic ?? { text: 'I can tell you what just happened, what to do next, what the state is, or explain ideas like entanglement, superposition, measurement and phase.', point: null }, true);
  }

  // ---- Today: five minutes of spaced repetition

  private todayBegin(): void {
    this.crystalAtStart = growthOf(this.memory, dayKey());
    this.todayPlan = this.todayWind ? planWindDown(this.memory, dayKey()) : planSession(this.memory, dayKey());
    if (this.todayWind && !this.windBefore) {
      // the room goes dark and quiet: stars overhead, the state as soft music
      this.windBefore = { night: this.nightOn, music: this.ambient.on };
      this.nightOn = true;
      this.world.getSystem(LabSystem)?.setNight(true);
      if (!this.ambient.on) this.ambient.start();
    }
    this.todayIdx = 0;
    this.todayResults = [];
    this.todayDone = false;
    this.todayStart = this.clockNow();
    this.todayCard();
  }

  private get todayCurrent(): RecallCard | null {
    return this.todayDone ? null : (this.todayPlan[this.todayIdx] ?? null);
  }

  /** Set the lab up for the current card: a make card gets fresh qubits to build on. */
  private todayCard(): void {
    const card = this.todayCurrent;
    this.todayAnswer = null;
    this.todayShown = false;
    this.todayHinted = false;
    this.todayTarget = card?.kind === 'make' ? runOps(card.qubits!, card.solution!, () => 0.5).state : null;
    campaign.enterSandbox(card?.kind === 'make' ? card.qubits! : 1, []);
    this.renderGameCard();
  }

  /** Record the first answer to the current card. */
  private todayRecord(correct: boolean, picked: number | null): void {
    const card = this.todayCurrent;
    if (!card || this.todayAnswer) return;
    this.todayAnswer = { correct, picked };
    this.todayResults[this.todayIdx] = correct ? 'right' : 'missed';
    this.memory = review(this.memory, card.id, correct, dayKey());
    saveMemory(this.memory);
    this.showCrystal(true);
    feedback(correct ? 'success' : 'reject');
    this.renderGameCard();
  }

  private todayPick(i: number): void {
    const card = this.todayCurrent;
    if (!card || card.kind !== 'quiz' || this.todayAnswer) return;
    this.todayRecord(i === shuffledChoices(card, dayKey()).right, i);
  }

  /** The card's main button: Show me or Skip, then Next card, then Finish; Practice more after. */
  private todayNext(): void {
    const card = this.todayCurrent;
    if (this.todayDone) return this.todayBegin();
    if (!card) return;
    if (!this.todayAnswer) {
      if (card.kind === 'make') {
        // show me: build it for you (it counts as a miss: it comes back tomorrow)
        this.todayShown = true;
        campaign.enterSandbox(card.qubits!, []);
        for (const op of card.solution!) if (op.kind === 'gate') lab.gate(op.gate, op.target, op.params, op.controls);
        return;
      }
      return this.todayRecord(false, null);
    }
    this.todayIdx++;
    if (this.todayIdx < this.todayPlan.length) {
      feedback('select');
      return this.todayCard();
    }
    this.todayFinish();
  }

  private todayFinish(): void {
    const today = dayKey();
    const right = this.todayResults.filter((r) => r === 'right').length;
    this.memory = finishSession(this.memory, today, this.todayPlan.length, right);
    saveMemory(this.memory);
    this.todayDone = true;
    this.todayEnd = this.clockNow();
    const streak = sessionStreak(this.memory, today);
    this.showCrystal(true);
    if (this.crystalAtStart && this.crystalShown) {
      const grew = grewSince(this.crystalAtStart, this.crystalShown);
      const parts = [grew.fresh.length ? `${grew.fresh.length} new shard${grew.fresh.length === 1 ? '' : 's'}` : '', grew.rose.length ? `${grew.rose.length} grew taller` : ''].filter(Boolean);
      this.ketSay(
        this.todayWind
          ? { text: 'Rest well. Sleep is when memories settle: these ideas will be firmer tomorrow. Your crystal has a new ring.', point: null }
          : { text: `Your crystal is awake: ${parts.length ? `${parts.join(', ')}, and ` : ''}a new ring for today. Come back tomorrow and it grows again.`, point: null },
        true,
      );
    }
    if (streak >= 3) this.use('today:streak3');
    if (mastery(this.memory).solid >= 10) this.use('today:solid10');
    this.use('today');
    this.quest('puzzle');
    this.profileDirty = true;
    this.banner.show(this.todayWind ? 'Rest well' : 'Done for today', `${right} of ${this.todayPlan.length} right first time`, streak > 1 ? `${streak} days in a row` : 'Day one of your streak');
    this.world.getSystem(LabSystem)?.celebrate(right === this.todayPlan.length);
    campaign.enterSandbox(1, []);
    this.renderGameCard();
  }

  private todayUpdate(dt: number): void {
    const card = this.todayCurrent;
    if (card?.kind === 'make' && !this.todayAnswer && this.todayTarget && lab.state.n === this.todayTarget.n && lab.state.fidelity(this.todayTarget) > 0.999) {
      this.todayRecord(!this.todayShown && !this.todayHinted && countMoves(lab.history.ops) <= cardPar(card) + 2, null);
    }
    // the clock on the card
    this.todayCardTimer += dt;
    if (this.todayCardTimer > 1) {
      this.todayCardTimer = 0;
      this.renderGameCard();
    }
  }

  private todayView(): MemoryView {
    const today = dayKey();
    const m = mastery(this.memory);
    return {
      streak: sessionStreak(this.memory, today),
      boxes: m.boxes,
      total: m.total,
      session: this.todayPlan.map((c, i) => ({ topic: c.topic, kind: c.kind, status: this.todayResults[i] ?? (!this.todayDone && i === this.todayIdx ? 'now' : 'next') })),
      tomorrow: tomorrow(this.memory, today),
      week: Array.from({ length: 7 }, (_, i) => !!this.memory.sessions[addDays(today, i - 6)]),
      title: this.todayWind ? 'Wind down  /  a calm review, nothing new' : undefined,
    };
  }

  private renderTodayCard(): void {
    const today = dayKey();
    const card = this.todayCurrent;
    const secs = Math.max(0, Math.round((this.todayDone ? this.todayEnd : this.clockNow()) - this.todayStart));
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    this.els.get('btn-notes')?.setProperties({ display: 'none' });
    this.els.get('btn-lib')?.setProperties({ display: 'none' });
    this.text('btn-replay-label', 'Done');
    this.bg('btn-next', C.primary);
    // the pips are today's cards
    this.todayPlan.forEach((_, i) => {
      if (i > 4) return;
      const r = this.todayResults[i];
      this.els.get(`pip-${i}`)?.setProperties({ display: 'flex', backgroundColor: r === 'right' ? C.done : r === 'missed' ? '#ff8a7a' : !this.todayDone && i === this.todayIdx ? C.current : C.todo });
    });
    if (!card) {
      const right = this.todayResults.filter((r) => r === 'right').length;
      const streak = sessionStreak(this.memory, today);
      const t = tomorrow(this.memory, today);
      this.text('chapter-eyebrow', this.todayWind ? 'Wind down  /  done' : `Today  /  done in ${clock}`);
      this.text('chapter-title', this.todayWind ? 'Rest well' : 'Done for today');
      this.text('chapter-body', `${right} of ${this.todayPlan.length} right first time. ${streak > 1 ? `${streak} days in a row.` : 'Day one of your streak.'} Tomorrow ${t.due} card${t.due === 1 ? '' : 's'} come${t.due === 1 ? 's' : ''} back${t.fresh ? `, with ${t.fresh} new idea${t.fresh === 1 ? '' : 's'}` : ''}.`);
      this.text('goal-text', 'See you tomorrow');
      this.bg('goal-dot', C.done);
      this.text('btn-next-label', 'Practice more');
      return this.modeChoices([]);
    }
    const n = this.todayPlan.length;
    const hello = this.todayIdx === 0 && !this.todayAnswer ? `${GREETING[partOfDay(new Date().getHours())]}  /  ` : '';
    this.text('chapter-eyebrow', this.todayWind ? `Wind down  /  ${card.topic}  /  ${this.todayIdx + 1} of ${n}` : `${hello}Today  /  card ${this.todayIdx + 1} of ${n}  /  ${card.topic}  /  ${clock}`);
    this.text('chapter-title', card.prompt);
    const a = this.todayAnswer;
    const box = this.memory.cards[card.id]?.box ?? 1;
    const days = [1, 2, 4, 8, 16][box - 1];
    if (card.kind === 'quiz') {
      const { labels, right } = shuffledChoices(card, today);
      this.modeChoices(labels);
      if (a) {
        labels.forEach((_, i) => {
          this.bg(`choice-${i}`, i === right ? '#1f3a30' : i === a.picked ? '#3a2523' : '#2d2f33');
          this.els.get(`choice-${i}-l`)?.setProperties({ color: i === right ? C.done : i === a.picked ? '#ff8a7a' : C.textDim });
        });
      }
      this.text('chapter-body', a ? `${a.correct ? 'Right.' : `The answer: ${card.choices![0]}.`} ${card.why}` : 'Pick one. It comes back just before you would forget it.');
      this.text('goal-text', a ? (a.correct ? `Right first time: back in ${days} day${days === 1 ? '' : 's'}` : 'Comes back tomorrow') : 'Tap an answer');
      this.text('btn-next-label', a ? (this.todayIdx + 1 < n ? 'Next card' : 'Finish') : 'Skip');
    } else {
      this.modeChoices([]);
      const moves = countMoves(lab.history.ops);
      this.text('chapter-body', a ? `${a.correct ? 'Made it.' : this.todayShown ? 'That is how.' : this.todayHinted ? 'Made it, with a hint.' : 'Made it, the long way.'} ${card.why}` : `Build it with your hands, the dock or your voice: ${cardPar(card)} move${cardPar(card) === 1 ? '' : 's'} is enough.`);
      this.text('goal-text', a ? (a.correct ? `Right first time: back in ${days} day${days === 1 ? '' : 's'}` : 'Comes back tomorrow') : `Moves: ${moves}  /  best ${cardPar(card)}`);
      this.text('btn-next-label', a ? (this.todayIdx + 1 < n ? 'Next card' : 'Finish') : 'Show me');
    }
    this.bg('goal-dot', a ? (a.correct ? C.done : '#ff8a7a') : C.current);
  }

  // ---- the double slit and Stern-Gerlach

  private slitSet(setup: SlitSetup): void {
    this.slitSetup = setup;
    this.slitHits = [];
    this.slitAcc = 0;
    const ls = this.world.getSystem(LabSystem);
    ls?.slits.clear();
    ls?.slits.setSetup(setup);
  }

  private sgSet(i: number): void {
    this.sgExp = i;
    this.sgAcc = 0;
    this.world.getSystem(LabSystem)?.sg.setExperiment(SG_EXPERIMENTS[i].stages);
  }

  private sgNote(): string {
    return [
      'Each silver atom is a tiny magnet. If its tilt could be anything, the beam would smear into a band (grey). It lands in exactly two spots: measured along Z, spin is only ever up or down.',
      'Keep only the atoms that went up and send them through a second Z magnet: every one goes up again. Ask the same question twice and you get the same answer.',
      'Put an X magnet in between and keep its +x atoms: the last Z magnet splits them half and half again. Learning X erased what Z said: both cannot be known at once.',
    ][this.sgExp];
  }

  // ---- the bomb tester

  private bombRound(): void {
    let live: boolean[] = [];
    do live = Array.from({ length: 6 }, () => Math.random() < 0.5);
    while (live.filter(Boolean).length < 2 || live.filter(Boolean).length > 4);
    this.bombSet = live.map((l) => ({ live: l, status: 'unknown' as BombStatus }));
    this.bombIdx = 0;
    this.bombPhotons = 0;
    this.bombLast = '';
    this.bombNextAt = -1;
    this.world.getSystem(LabSystem)?.bombs.newBomb('Bomb 1 of 6', 'live or dud?');
    this.renderGameCard();
  }

  private bombBusy(): boolean {
    return this.bombIdx >= this.bombSet.length || this.bombNextAt > 0 || !!this.world.getSystem(LabSystem)?.bombs.busy;
  }

  private bombDone(status: BombStatus, text: string): void {
    this.bombSet[this.bombIdx].status = status;
    this.bombLast = text;
    this.bombNextAt = this.clockNow() + 1.8;
    if (status === 'live') {
      this.use('bomb:safe');
      this.world.getSystem(LabSystem)?.celebrate(false);
      feedback('success');
    } else feedback(status === 'dud' ? 'success' : 'reject');
    if (!this.bombZeno && (status === 'live' || status === 'boom')) {
      this.bombZeno = true;
      this.bombLast += ' New: the Zeno test.';
    }
    this.renderGameCard();
  }

  private bombFire(): void {
    if (this.bombBusy()) return;
    const b = this.bombSet[this.bombIdx];
    const outcome = fireBomb(b.live, Math.random);
    this.bombPhotons++;
    this.use('exp:bomb');
    feedback('gate');
    this.world.getSystem(LabSystem)?.bombs.fire(b.live, outcome, () => {
      if (outcome === 'D') return this.bombDone('live', 'D clicked: this bomb is live, and it never went off. The photon reached D only because the bomb could have looked.');
      if (outcome === 'boom') return this.bombDone('boom', 'Boom: the photon took the lower arm and set the bomb off.');
      this.bombLast = 'C: no news. A dud always sends the photon to C, and so does a live bomb a quarter of the time. Fire again, or call it a dud.';
      feedback('select');
      this.renderGameCard();
    });
    this.renderGameCard();
  }

  private bombCallDud(): void {
    if (this.bombBusy()) return;
    const b = this.bombSet[this.bombIdx];
    this.world.getSystem(LabSystem)?.bombs.newBomb(b.live ? 'It was live!' : 'A dud', b.live ? 'D just had not clicked yet' : 'well called');
    this.bombDone(b.live ? 'wrong' : 'dud', b.live ? 'It was live: D just had not clicked yet. Luckily nobody tested it the classical way.' : 'A dud, well called: C every time is what a dud does.');
  }

  private bombZenoTest(): void {
    if (this.bombBusy()) return;
    const b = this.bombSet[this.bombIdx];
    const r = fireZeno(b.live, Math.random);
    this.bombPhotons++;
    feedback('gate');
    this.world.getSystem(LabSystem)?.bombs.zeno(b.live, r.result, r.pass, ZENO_PASSES, () => {
      if (r.result === 'live') return this.bombDone('live', `Zeno: ${ZENO_PASSES} passes, and the bomb's looking kept the photon from turning. Live, and never touched.`);
      if (r.result === 'dud') return this.bombDone('dud', `Zeno: with nothing looking, ${ZENO_PASSES} small turns added up to a full flip. A dud, for certain.`);
      this.bombDone('boom', `Boom on pass ${r.pass}: each pass has a small chance of the bomb seeing the photon.`);
    });
    this.renderGameCard();
  }

  // ---- daily quests

  private questsOpen = false;

  /** Count toward today's quests; a finished quest pays XP and pops a banner. */
  private quest(counter: QuestCounter, amount = 1): void {
    const q = (this.profile.data.quests ??= emptyQuests());
    for (const done of questBump(q, dayKey(), counter, amount)) {
      this.banner.show('Daily quest done', done.text, `+15 XP  /  ${q.done.length} of 3 today`);
      this.world.getSystem(LabSystem)?.celebrate(false);
    }
    if (q.total >= 9) this.profile.use('quests:9');
    this.profileDirty = true;
  }

  private questsFigureNow() {
    const day = dayKey();
    const q = this.profile.data.quests ?? emptyQuests();
    const today = q.day === day;
    return questsFigure(day, questsFor(day).map((d) => ({ text: d.text, have: today ? (q.progress[d.id] ?? 0) : 0, goal: d.goal, done: today && q.done.includes(d.id) })), q.total);
  }

  // ---- the spy game (BB84), be the decoder, the Grover maze

  private spyRound: Bb84Round | null = null;
  private spyPhase: 'ready' | 'flying' | 'guess' | 'result' = 'ready';
  private spyRecord = { right: 0, rounds: 0 };
  private spyLastRight = false;

  private spyNext(): void {
    if (this.spyPhase === 'flying' || this.spyPhase === 'guess') return;
    // Eve is there half the time, at random
    this.spyRound = bb84Round(16, Math.random() < 0.5, Math.random);
    this.spyPhase = 'flying';
    this.world.getSystem(LabSystem)?.spy.send(this.spyRound);
    feedback('select');
    this.renderGameCard();
  }

  private spyAnswer(i: number): void {
    if (this.game !== 'spy' || this.spyPhase !== 'guess' || !this.spyRound || i > 1) return;
    const saidEve = i === 0;
    this.spyLastRight = saidEve === this.spyRound.eve;
    this.spyRecord = { right: this.spyRecord.right + (this.spyLastRight ? 1 : 0), rounds: this.spyRecord.rounds + 1 };
    this.spyPhase = 'result';
    this.world.getSystem(LabSystem)?.spy.reveal();
    if (this.spyLastRight) {
      this.world.getSystem(LabSystem)?.celebrate(false);
      this.quest('puzzle');
      if (this.spyRecord.right >= 3) this.use('spy:3');
    }
    feedback(this.spyLastRight ? 'success' : 'reject');
    this.renderGameCard();
  }

  private readonly dec = { d: 3, errors: [] as number[], flips: new Set<number>(), revealed: false, wins: 0, rounds: 0, won: false, best: 0 };
  private decCodes = new Map<number, SurfaceCode>();
  private decCode(): SurfaceCode {
    let c = this.decCodes.get(this.dec.d);
    if (!c) this.decCodes.set(this.dec.d, (c = new SurfaceCode(this.dec.d)));
    return c;
  }

  /** A fresh lattice with hidden bit flips: only the checks they light are shown. */
  private decoderRound(): void {
    const d = (this.dec.d = this.dec.wins >= 3 ? 5 : 3);
    const code = this.decCode();
    let errors: number[] = [];
    while (!errors.length || !code.syndrome(errors, 'X').length) {
      errors = [];
      for (let q = 0; q < d * d; q++) if (Math.random() < (d === 3 ? 0.14 : 0.08)) errors.push(q);
    }
    this.dec.errors = errors;
    this.dec.flips = new Set();
    this.dec.revealed = false;
    this.dec.best = code.decode(code.syndrome(errors, 'X'), 'X').correction.length;
    this.renderDecoderPad();
  }

  /** Checks still lit: the real errors and the player's flips together. */
  private decoderLit(): number[] {
    const left = new Set(this.dec.errors);
    for (const q of this.dec.flips) left.has(q) ? left.delete(q) : left.add(q);
    return this.decCode().syndrome([...left], 'X');
  }

  private decoderTap(r: number, c: number): void {
    if (this.game !== 'decoder' || this.dec.revealed || r >= this.dec.d || c >= this.dec.d) return;
    const q = r * this.dec.d + c;
    this.dec.flips.has(q) ? this.dec.flips.delete(q) : this.dec.flips.add(q);
    feedback('select');
    this.renderDecoderPad();
    this.renderGameCard();
  }

  private decoderNext(): void {
    if (this.dec.revealed) {
      this.decoderRound();
      return this.renderGameCard();
    }
    if (this.decoderLit().length) return feedback('reject');
    // check: did the fix and the real errors together cross the grid?
    const code = this.decCode();
    this.dec.won = !code.logicalFlip(this.dec.errors, [...this.dec.flips], 'X');
    this.dec.revealed = true;
    this.dec.rounds++;
    if (this.dec.won) {
      this.dec.wins++;
      this.world.getSystem(LabSystem)?.celebrate(false);
      this.quest('puzzle');
      if (this.dec.wins >= 3) this.use('decoder:3');
    }
    feedback(this.dec.won ? 'success' : 'reject');
    this.renderDecoderPad();
    this.renderGameCard();
  }

  private renderDecoderPad(): void {
    if (!this.decoderAsset) return;
    const d = this.dec.d;
    const err = new Set(this.dec.revealed ? this.dec.errors : []);
    for (let r = 0; r < 5; r++) {
      this.els.get(`dec-r-${r}`)?.setProperties({ display: r < d ? 'flex' : 'none' });
      for (let c = 0; c < 5; c++) {
        const q = r * d + c, on = c < d && this.dec.flips.has(q), bad = c < d && err.has(q);
        this.els.get(`dec-b-${r}-${c}`)?.setProperties({ display: c < d ? 'flex' : 'none' });
        this.bg(`dec-b-${r}-${c}`, on && bad ? '#4a4c52' : on ? '#1f3a30' : bad ? '#3a2523' : '#2f3135');
        this.text(`dec-l-${r}-${c}`, on && bad ? 'ok' : on ? 'X' : bad ? '!' : '.');
        this.els.get(`dec-l-${r}-${c}`)?.setProperties({ color: on && !bad ? C.done : bad ? '#ff8a7a' : C.text });
      }
    }
    this.text('dec-eyebrow', `Be the decoder  /  distance ${d}  /  won ${this.dec.wins} of ${this.dec.rounds}`);
    const lit = this.decoderLit().length;
    this.text('dec-note', this.dec.revealed ? (this.dec.won ? 'Fixed: the logical qubit is safe.' : 'The fix crossed the grid: a logical error.') : lit ? `${lit} check${lit === 1 ? '' : 's'} still lit` : 'All dark: tap Check.');
  }

  private groverMarked = 0;
  private groverOpen: number | null = null;
  private groverRound = 0;
  private groverPhase: 'oracle' | 'diffuse' | 'look' | 'opened' = 'oracle';
  private groverRecord = { found: 0, mazes: 0 };

  private groverNew(): void {
    lab.load(3, [0, 1, 2].map((q) => ({ kind: 'gate', gate: 'h', target: q }) as Op));
    this.groverMarked = Math.floor(Math.random() * 8);
    this.groverOpen = null;
    this.groverRound = 0;
    this.groverPhase = 'oracle';
    const ls = this.world.getSystem(LabSystem);
    if (ls) ls.grover.root.visible = true;
  }

  private groverNext(): void {
    const ccz: Op = { kind: 'gate', gate: 'z', target: 2, controls: [0, 1] };
    const each = (gate: 'h' | 'x', which: number[]) => which.map((q) => ({ kind: 'gate', gate, target: q }) as Op);
    if (this.groverPhase === 'opened') {
      this.groverNew();
    } else if (this.groverPhase === 'oracle') {
      // flip the sign of the prize door only: X where its bit is 0, CCZ, and back
      const zeros = [0, 1, 2].filter((q) => !((this.groverMarked >> q) & 1));
      for (const op of [...each('x', zeros), ccz, ...each('x', zeros)]) lab.apply(op);
      this.groverPhase = 'diffuse';
      feedback('gate');
    } else if (this.groverPhase === 'diffuse') {
      // reflect every amplitude about the average
      const all = [0, 1, 2];
      for (const op of [...each('h', all), ...each('x', all), ccz, ...each('x', all), ...each('h', all)]) lab.apply(op);
      this.groverRound++;
      this.groverPhase = this.groverRound >= groverRounds(8) ? 'look' : 'oracle';
      feedback('entangle');
    } else {
      const bits = [0, 1, 2].map((q) => lab.measure(q) ?? 0);
      this.groverOpen = bits[0] + 2 * bits[1] + 4 * bits[2];
      this.groverPhase = 'opened';
      this.groverRecord = { found: this.groverRecord.found + (this.groverOpen === this.groverMarked ? 1 : 0), mazes: this.groverRecord.mazes + 1 };
      if (this.groverOpen === this.groverMarked) {
        this.world.getSystem(LabSystem)?.celebrate(true);
        this.quest('puzzle');
      }
      feedback(this.groverOpen === this.groverMarked ? 'success' : 'reject');
    }
    this.renderGameCard();
  }

  private readonly tele = { phase: 'pair' as 'pair' | 'measure' | 'flying' | 'fix' | 'done', m0: 0, m1: 0, message: [0, 0, 1] as Vec3, sent: 0 };

  /** A new message on q0: a random tilt and twist. */
  private teleportNew(): void {
    const theta = 0.5 + Math.random() * 2.1, phi = Math.random() * Math.PI * 2;
    lab.load(3, [{ kind: 'gate', gate: 'ry', target: 0, params: [theta] }, { kind: 'gate', gate: 'rz', target: 0, params: [phi] }]);
    this.tele.message = blochVector(lab.history.state, 0);
    this.tele.phase = 'pair';
    const ls = this.world.getSystem(LabSystem);
    if (ls) {
      ls.teleporter.reset();
      ls.teleporter.root.visible = true;
    }
  }

  private teleportNext(): void {
    const t = this.tele, ls = this.world.getSystem(LabSystem);
    if (t.phase === 'pair') {
      lab.gate('h', 1);
      lab.entangle(1, 2);
      t.phase = 'measure';
      feedback('entangle');
    } else if (t.phase === 'measure') {
      lab.entangle(0, 1);
      lab.gate('h', 0);
      t.m0 = lab.measure(0) ?? 0;
      t.m1 = lab.measure(1) ?? 0;
      ls?.teleporter.sendBits(t.m0, t.m1);
      t.phase = 'flying';
      feedback('measure');
    } else if (t.phase === 'fix') {
      if (t.m1) lab.gate('x', 2);
      if (t.m0) lab.gate('z', 2);
      ls?.teleporter.arrive();
      t.phase = 'done';
      t.sent++;
      ls?.celebrate(false);
      this.quest('puzzle');
      this.use('teleport');
      feedback('success');
    } else if (t.phase === 'done') {
      this.teleportNew();
      feedback('select');
    } else return;
    this.renderGameCard();
  }

  private renderLearnGame(): void {
    this.els.get('btn-notes')?.setProperties({ display: 'none' });
    this.els.get('btn-lib')?.setProperties({ display: 'none' });
    this.text('btn-replay-label', 'Done');
    this.bg('goal-dot', C.current);
    this.bg('btn-next', C.primary);
    if (this.game === 'spy') {
      const r = this.spyRound;
      this.text('chapter-eyebrow', `Play  /  Spy game  /  you called it ${this.spyRecord.right} of ${this.spyRecord.rounds}`);
      if (this.spyPhase === 'ready') {
        this.text('chapter-title', 'Is anyone listening?');
        this.text('chapter-body', 'Alice sends Bob a secret key, one photon at a time, each in a random basis. Eve may be tapping the fibre (it is random). A spy cannot copy a qubit, so she leaves errors behind. Watch, then call it.');
        this.text('goal-text', 'Tap Send');
        this.text('btn-next-label', 'Send');
      } else if (this.spyPhase === 'flying') {
        this.text('chapter-title', 'Photons in flight');
        this.text('chapter-body', 'Upright and flat bars are the + basis, slanted ones the x basis. Bob guesses a basis for each; only the matches are kept.');
        this.text('goal-text', 'Watch them cross');
        this.text('btn-next-label', 'Wait');
        this.bg('btn-next', C.primaryIdle);
      } else if (this.spyPhase === 'guess') {
        this.text('chapter-title', 'Was Eve listening?');
        this.text('chapter-body', `They kept ${r?.kept} bits where the bases matched, and compared ${r?.checked} of them in public: ${r?.errors} disagreed. Without Eve none would. Make the call.`);
        this.text('goal-text', 'Pick an answer');
        this.text('btn-next-label', 'Send');
        this.bg('btn-next', C.primaryIdle);
      } else {
        this.text('chapter-title', this.spyLastRight ? 'Right!' : 'Not this time');
        this.text('chapter-body', r?.eve ? `Eve was there: her wrong guesses of basis turned ${r.errors} of ${r.checked} checked bits. Alice and Bob throw this key away.` : `The line was clean: every checked bit agreed, so the other ${r?.key.length} bits are a secret key only Alice and Bob share.`);
        this.text('goal-text', `You called it ${this.spyRecord.right} of ${this.spyRecord.rounds}`);
        this.bg('goal-dot', this.spyLastRight ? C.done : '#ff8a7a');
        this.text('btn-next-label', 'Next round');
      }
    } else if (this.game === 'decoder') {
      const lit = this.decoderLit().length;
      this.text('chapter-eyebrow', `Play  /  Be the decoder  /  won ${this.dec.wins} of ${this.dec.rounds}`);
      if (!this.dec.revealed) {
        this.text('chapter-title', lit ? `${lit} check${lit === 1 ? '' : 's'} lit` : 'All dark');
        this.text('chapter-body', `Bit flips are hiding on the lattice; you only see the checks they light. Tap qubits on the pad to flip them back until every check is dark, with as few flips as you can. The computer's decoder needs ${this.dec.best}.`);
        this.text('goal-text', lit ? 'Tap qubits to clear the lit checks' : 'Tap Check');
        this.text('btn-next-label', 'Check');
        this.bg('btn-next', lit ? C.primaryIdle : C.primary);
      } else {
        this.text('chapter-title', this.dec.won ? 'Fixed' : 'Logical error');
        this.text('chapter-body', this.dec.won ? `Your ${this.dec.flips.size} flip${this.dec.flips.size === 1 ? '' : 's'} and the real errors (coral) close into loops: the logical qubit never noticed. The computer used ${this.dec.best}.` : 'Your fix and the real errors together stretch across the grid: the checks are dark, but the logical qubit flipped. The shortest fix is usually the right one.');
        this.text('goal-text', this.dec.wins >= 3 ? 'Distance 5 next: 25 qubits' : 'Win three to go bigger');
        this.bg('goal-dot', this.dec.won ? C.done : '#ff8a7a');
        this.text('btn-next-label', 'New round');
      }
    } else if (this.game === 'teleport') {
      const t = this.tele;
      this.text('chapter-eyebrow', `Play  /  Teleporter  /  ${t.sent} sent`);
      const labels = { pair: 'Make the pair', measure: 'Measure', flying: 'Wait', fix: 'Fix', done: 'Send another' };
      this.text('btn-next-label', labels[t.phase]);
      if (t.phase === 'flying') this.bg('btn-next', C.primaryIdle);
      if (t.phase === 'pair') {
        this.text('chapter-title', 'Send q0 to q2');
        this.text('chapter-body', "q0 carries a message: its arrow, a state nobody knows. Teleport it to q2 without moving it. First Alice and Bob share an entangled pair: q1 and q2.");
        this.text('goal-text', 'Tap Make the pair');
      } else if (t.phase === 'measure') {
        this.text('chapter-title', 'The Bell measurement');
        this.text('chapter-body', 'Alice entangles the message with her half of the pair (a CNOT from q0 to q1, then H on q0) and measures both. That gives two ordinary bits.');
        this.text('goal-text', 'Tap Measure');
      } else if (t.phase === 'flying') {
        this.text('chapter-title', 'Two bits in flight');
        this.text('chapter-body', `Alice sends ${t.m0} and ${t.m1} to Bob the ordinary way. Nothing else travels; on their own, the bits say nothing about the message.`);
        this.text('goal-text', 'Watch them cross');
      } else if (t.phase === 'fix') {
        this.text('chapter-title', `Bob got ${t.m0} and ${t.m1}`);
        this.text('chapter-body', `He fixes q2 with them: ${t.m1 ? 'X, because the second bit is 1' : 'no X (second bit 0)'}${t.m0 ? ', then Z, because the first bit is 1' : ', no Z (first bit 0)'}.`);
        this.text('goal-text', 'Tap Fix');
      } else {
        const now = blochVector(lab.history.state, 2), m = t.message;
        const overlap = (1 + now[0] * m[0] + now[1] * m[1] + now[2] * m[2]) / 2;
        this.text('chapter-title', 'Teleported');
        this.text('chapter-body', `q2 now points exactly where q0 did (fidelity ${overlap.toFixed(3)}), and q0 has lost it: the state moved, it was not copied. It took two bits and one entangled pair; nothing went faster than light.`);
        this.text('goal-text', 'Tap Send another');
        this.bg('goal-dot', C.done);
      }
    } else if (this.game === 'grover') {
      const label = { oracle: 'Oracle', diffuse: 'Diffuse', look: 'Look', opened: 'New maze' }[this.groverPhase];
      this.text('chapter-eyebrow', `Play  /  Grover maze  /  found ${this.groverRecord.found} of ${this.groverRecord.mazes}`);
      this.text('btn-next-label', label);
      if (this.groverPhase === 'opened') {
        const won = this.groverOpen === this.groverMarked;
        this.text('chapter-title', won ? `Door ${this.groverOpen! + 1}: the prize!` : `Door ${this.groverOpen! + 1}: empty`);
        this.text('chapter-body', won ? 'One look after two rounds, and it is the right door. Classically you would open four on average; Grover needs about the square root.' : `The prize was behind door ${this.groverMarked + 1}. Two rounds give it a 95% chance, not 100%: quantum search is a very good bet, not a sure thing.`);
        this.bg('goal-dot', won ? C.done : '#ff8a7a');
        this.text('goal-text', 'Tap New maze');
      } else {
        this.text('chapter-title', 'Find the prize in one look');
        this.text('chapter-body', `Eight doors, one prize, all equally likely (the bars). The oracle flips the prize door's bar below the line without telling you which; Diffuse reflects every bar about the average. Round ${Math.min(this.groverRound + 1, 2)} of 2.`);
        this.text('goal-text', `Tap ${label}`);
      }
    }
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
        if (c.worlds) {
          this.setView('worlds');
          this.flash('Many worlds: every path the computation takes. Opposite colours cancel.');
        } else window.dispatchEvent(new Event('entangled:view'));
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
      case 'settings':
        this.toggleSettings();
        return true;
      case 'ask':
        this.ketAnswer(c.text);
        return true;
      case 'home':
        this.goHome();
        return true;
      case 'studio':
        this.toggleStudio(true);
        return true;
      case 'partner':
        if (settings.partner !== c.on) this.settingAction('partner');
        return true;
      case 'pin':
        if (!!settings.pinned === c.on) return true;
        this.settingAction('pin');
        return true;
      case 'contrast':
        this.settingAction('contrast');
        return true;
      case 'look':
        this.settingAction('look');
        return true;
      case 'captions':
        this.settingAction('captions');
        return true;
      case 'wall':
        if (this.game !== 'slit') this.startPlay(PLAY.indexOf('Double slit'));
        if (!this.slitWall) this.toggleSlitWall();
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
      case 'rush':
        this.startRush();
        return true;
      case 'play': {
        const k = PLAY.indexOf(c.item as (typeof PLAY)[number]);
        if (k < 0) return false;
        this.startPlay(k);
        return true;
      }
      case 'skin':
        this.nextSkin();
        return true;
      case 'fullsize':
        if (!this.code?.visible || this.codeFormat !== 'chip') {
          this.codeFormat = 'chip';
          this.showCode(false);
        }
        this.setFullSize(c.on);
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
        raceStart: (race) => this.onRaceStart(race),
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
    this.classBoard = false;
    this.racePending = null;
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
    this.raceChanged();
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
    // a celebration whenever a chapter, lesson, puzzle, daily or course module is finished
    const doneKey = v.chapterDone ? `${v.mode}:${v.chapterIndex}:${v.lessonIndex}:${v.puzzleIndex}:${v.courseIndex}` : '';
    if (doneKey && doneKey !== this.lastDoneKey) {
      this.world.getSystem(LabSystem)?.celebrate(true);
      this.quest('chapter');
    }
    this.lastDoneKey = doneKey;
  }

  private lastDoneKey = '';

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
    this.text('cl-go-l', 'Start next module');
    if (this.classBoard && r.race?.kind === 'class') return this.renderClassBoard(r, teacher);
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

  /** The class challenge scoreboard, live: every student's points, best first. */
  private renderClassBoard(r: SharedRoom, teacher: boolean): void {
    const st = r.standings();
    const top = Math.max(1, ...st.map((x) => x.score));
    const playing = st.filter((x) => !x.done).length;
    this.text('cl-title', r.raceOver() ? 'Class challenge: final scores' : 'Class challenge: live scoreboard');
    this.els.get('cl-pick')?.setProperties({ display: 'none' });
    this.text('cl-line', st.length ? `Same targets for everyone. ${playing ? `${playing} still playing, ` : ''}${st.length - playing} finished.${teacher ? ' Class challenge on the Play tab starts another.' : ''}` : 'Waiting for the first scores...');
    for (let i = 0; i < 6; i++) {
      const x = st[i];
      this.els.get(`cl-r-${i}`)?.setProperties({ display: x ? 'flex' : 'none' });
      if (!x) continue;
      this.text(`cl-n-${i}`, `${i + 1}. ${x.me ? 'You' : x.name}`);
      this.els.get(`cl-f-${i}`)?.setProperties({ width: 130 * (x.score / top), backgroundColor: x.done ? C.done : C.primary });
      this.text(`cl-s-${i}`, `${x.score.toLocaleString('en-US')} points, ${x.solved} made${x.done ? '' : ', playing'}`);
    }
    this.els.get('cl-list')?.setProperties({ display: st.length ? 'flex' : 'none' });
    this.text('cl-go-l', 'Assignments');
    this.els.get('cl-go')?.setProperties({ display: 'flex' });
    this.els.get('cl-cert')?.setProperties({ display: 'none' });
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
    this.checkWorlds();
    if (view === 'worlds') this.quest('worlds');
  }

  /** The many-worlds achievement: paths seen cancelling. */
  private checkWorlds(): void {
    if (this.stateView !== 'worlds' || this.profile.data.stats.used.includes('worlds:cancel')) return;
    if (manyWorlds(lab.n, lab.history.ops).cancellations > 0) this.use('worlds:cancel');
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
    return t === 'course' ? campaign.course.length : t === 'campaign' ? campaign.chapters.length : t === 'learn' ? campaign.lessons.length : t === 'puzzle' ? campaign.puzzles.length : t === 'build' ? BUILDS.length : t === 'play' ? PLAY.length : PRESETS.length;
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
            : this.tab === 'play'
              ? PLAY.map((label) => ({ label, done: false, current: this.playOn(label), play: true }))
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
      this.text(`n-${i}-n`, 'play' in it ? PLAY_TAGS[at] : stars ? `${stars}/3` : String(at + 1));
      this.els.get(`n-${i}-n`)?.setProperties({ color: it.current ? '#18191b' : it.done ? C.done : stars ? '#c9ccd1' : '#6b6e75' });
    }
    this.text('nav-progress', `${v.coursed.length}/${v.courseCount} course  ${v.completed.length}/${v.chapterCount} chapters  ${v.learned.length}/${v.lessonCount} lessons`);
    const ctx = this.progressContext();
    const lvl = levelFor(xpFor(this.profile.data, ctx));
    this.text('nav-progress-2', `Level ${lvl.level}  ${Object.keys(this.profile.data.unlocked).length}/${ACHIEVEMENTS.length}`);
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

  // ---- the Code Lab: write your own program

  private labOpen = false;
  private readonly program = new CodeProgram();
  private labMsg: { text: string; bad: boolean } | null = null;
  private labExample = 0;
  /** A program playing on the orbs: its ops, how many have run, and the clock to the next (step mode waits for Step). */
  private runner: { ops: Op[]; done: number; timer: number; stepping: boolean; replay: boolean } | null = null;

  /** Open the Code Lab; `fromOrbs` starts it from the circuit on the orbs. */
  private openCodeLab(fromOrbs: boolean): void {
    this.labOpen = true;
    if (this.code) this.code.visible = false;
    if (this.notes?.open) this.notes.close();
    this.libOpen = this.noiseOpen = this.profileOpen = this.albumOpen = false;
    if (fromOrbs || !this.program.stmts.length) this.loadFromOrbs();
    this.use('codelab');
    this.flash('Code Lab: tap a gate, then its qubits. Run plays your program on the orbs.');
    feedback('select');
    this.renderCodeLab();
    this.renderNav(campaign.view);
  }

  private closeCodeLab(): void {
    this.labOpen = false;
    feedback('select');
    this.renderNav(campaign.view);
  }

  private loadFromOrbs(): void {
    const { stmts, skipped } = fromOps(lab.history.ops.slice(0, lab.history.cursor));
    this.program.load(lab.n, stmts);
    this.labMsg = stmts.length ? { text: `Loaded ${stmts.length} line${stmts.length === 1 ? '' : 's'} from the orbs${skipped ? ` (${skipped} step${skipped === 1 ? '' : 's'} the Code Lab has no key for left out)` : ''}.`, bad: false } : null;
  }

  private labKey(k: string): void {
    const p = this.program;
    let err: string | null = null;
    const gates: CodeGate[] = ['h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg', 'rx', 'ry', 'rz', 'cx', 'cz', 'swap', 'ccx', 'measure'];
    if ((gates as string[]).includes(k)) p.gate(k as CodeGate);
    else if (/^q[0-4]$/.test(k)) err = p.qubit(Number(k[1]));
    else if (k === 'pi' || k === 'pi2' || k === 'pi4' || k === 'mpi2') err = p.angle({ pi: 'pi', pi2: 'pi/2', pi4: 'pi/4', mpi2: '-pi/2' }[k]!);
    else if (k === 'up') p.move(-1);
    else if (k === 'down') p.move(1);
    else if (k === 'delete') p.backspace();
    else if (k === 'clear') p.clear();
    else if (k === 'addqubit') p.setQubits(p.n + 1);
    else if (k === 'subqubit') p.setQubits(p.n - 1);
    else if (k === 'fromorbs') this.loadFromOrbs();
    else if (k === 'example') {
      const ex = EXAMPLES[this.labExample++ % EXAMPLES.length];
      p.load(ex.n, ex.stmts);
      this.labMsg = { text: `Example: ${ex.name}. Tap Run to play it on the orbs.`, bad: false };
    } else if (k === 'link') {
      const r = p.ops();
      if ('error' in r) err = r.error;
      else {
        const url = `${location.origin}${location.pathname}${REPLAY_PREFIX}${encodeURIComponent(encodeCircuit(p.n, r.ops))}`;
        try {
          void navigator.clipboard?.writeText(url);
        } catch {
          // no clipboard in this browser: the link is still shown below
        }
        this.labMsg = { text: `Replay link copied: it plays your program back, gate by gate. ${url.length > 70 ? url.slice(0, 67) + '...' : url}`, bad: false };
      }
    }
    if (err) this.labMsg = { text: err, bad: true };
    else if (!['example', 'link', 'fromorbs'].includes(k)) this.labMsg = null;
    feedback(err ? 'reject' : 'select');
    this.renderCodeLab();
  }

  /** Run (or Step) the program on the orbs: a fresh sandbox, then one gate at a time. */
  private runProgram(step: boolean): void {
    if (step && this.runner?.stepping && this.runner.done < this.runner.ops.length) {
      this.runNext();
      return this.renderCodeLab();
    }
    const r = this.program.ops();
    if ('error' in r) {
      this.labMsg = { text: r.error, bad: true };
      this.program.cursor = r.line;
      feedback('reject');
      return this.renderCodeLab();
    }
    this.endRush(false);
    this.endGame(false);
    campaign.enterSandbox(this.program.n, []);
    this.runner = { ops: r.ops, done: 0, timer: step ? 0 : 0.35, stepping: step, replay: false };
    this.labMsg = { text: step ? 'Stepping: tap Step for each line.' : `Running ${r.ops.length} line${r.ops.length === 1 ? '' : 's'} on ${this.program.n} qubit${this.program.n === 1 ? '' : 's'}...`, bad: false };
    if (step) this.runNext();
    this.use('codelab:run');
    this.quest('code');
    this.renderCodeLab();
  }

  private runNext(): void {
    const r = this.runner;
    if (!r || r.done >= r.ops.length) return;
    const op = r.ops[r.done++];
    lab.apply(op);
    feedback(op.kind === 'measure' ? 'measure' : op.kind === 'gate' && op.controls?.length ? 'entangle' : 'gate');
    if (r.done >= r.ops.length) {
      this.labMsg = { text: r.replay ? 'Replay finished: the circuit is yours to change.' : `Done: ${r.ops.length} line${r.ops.length === 1 ? '' : 's'} ran. Try 100 shots, or the Many worlds view.`, bad: false };
      if (r.replay) this.flash('Replay finished: the circuit is yours to change.');
    }
  }

  private updateRunner(dt: number): void {
    const r = this.runner;
    if (!r || r.stepping || r.done >= r.ops.length) return;
    r.timer -= dt;
    if (r.timer > 0) return;
    r.timer = 0.75;
    this.runNext();
    if (this.labOpen) this.renderCodeLab();
  }

  private renderCodeLab(): void {
    if (!this.codelabAsset) return;
    const p = this.program;
    const { text, first } = p.lines();
    const running = this.runner && this.runner.done < this.runner.ops.length ? this.runner.done - 1 : -2;
    // keep the cursor's line in view
    const curLine = first + Math.max(0, p.cursor);
    const start = Math.max(0, Math.min(text.length - LAB_LINES, curLine - LAB_LINES + 2));
    for (let i = 0; i < LAB_LINES; i++) {
      const at = start + i;
      const line = text[at];
      this.els.get(`lab-r-${i}`)?.setProperties({ display: line === undefined ? 'none' : 'flex', backgroundColor: at === first + p.cursor ? '#24324a' : running >= 0 && at === first + running ? '#1f3a30' : '#141517' });
      if (line === undefined) continue;
      this.text(`lab-n-${i}`, String(at + 1));
      this.text(`lab-t-${i}`, line + (at === first + p.cursor ? '  <' : ''));
      this.els.get(`lab-t-${i}`)?.setProperties({ color: at < first ? '#8fb7ff' : line.includes('_') ? '#ff8a7a' : '#c9ccd1' });
    }
    this.text('lab-eyebrow', `Code Lab  /  OpenQASM 3  /  ${p.n} qubit${p.n === 1 ? '' : 's'}, ${p.stmts.length} line${p.stmts.length === 1 ? '' : 's'}`);
    const cur = p.current;
    this.text('lab-status', this.labMsg?.text ?? (cur && cur.qubits.length < (cur.gate === 'ccx' ? 3 : ['cx', 'cz', 'swap'].includes(cur.gate) ? 2 : 1) ? `${cur.gate}: now tap ${['rx', 'ry', 'rz'].includes(cur.gate) && cur.angle === null ? 'an angle, then ' : ''}its qubit${cur.gate === 'ccx' || ['cx', 'cz', 'swap'].includes(cur.gate) ? 's (control first)' : ''}.` : 'Tap a gate, then its qubits. Run plays it on the orbs; Step goes line by line.'));
    this.els.get('lab-status')?.setProperties({ color: this.labMsg?.bad ? '#ff8a7a' : C.textDim });
    this.bg('lab-run', C.primary);
    this.bg('lab-step', this.runner?.stepping && this.runner.done < this.runner.ops.length ? C.done : '#34363b');
  }

  /** A replay link (#r=): open the circuit and play it back, gate by gate. */
  private openReplay(): boolean {
    if (!location.hash.startsWith(REPLAY_PREFIX)) return false;
    let shared: ReturnType<typeof decodeCircuit> = null;
    try {
      shared = decodeCircuit(decodeURIComponent(location.hash.slice(REPLAY_PREFIX.length)));
    } catch {
      shared = null;
    }
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      // the address keeps the link; reloading replays it again
    }
    if (!shared) return false;
    campaign.enterSandbox(shared.n, []);
    this.runner = { ops: shared.ops, done: 0, timer: 1.2, stepping: false, replay: true };
    this.flash(`Replaying a shared circuit: ${shared.ops.length} steps on ${shared.n} qubits.`);
    return true;
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
    // today's quests, or the spy game's photons
    const questsFig = this.questsOpen ? this.questsFigureNow() : null;
    const spyFig = this.game === 'spy' && this.spyRound && this.spyPhase !== 'flying' ? spyFigure({ ...this.spyRound, eve: this.spyPhase === 'result' ? this.spyRound.eve : null, record: this.spyRecord }) : this.modeFigure();
    if (questsFig || spyFig) {
      labSys.hardwareWanted = false;
      labSys.showHardware(null);
      labSys.showMaths(false);
      labSys.showLandscape(null);
      labSys.showDensity(false);
      labSys.showWheels(false);
      labSys.showVqe(undefined, H2);
      const fig = (questsFig ?? spyFig)!;
      labSys.showOverlay(fig.key, (b) => b.draw(fig.draw));
      return;
    }
    // the State Album, while it is open
    if (this.albumOpen) {
      labSys.hardwareWanted = false;
      labSys.showHardware(null);
      labSys.showMaths(false);
      labSys.showLandscape(null);
      labSys.showDensity(false);
      labSys.showWheels(false);
      labSys.showVqe(undefined, H2);
      const fig = albumFigure(ALBUM.map((e) => ({ name: e.name, ket: e.ket, hint: e.hint, qubits: e.qubits, got: this.profile.data.stats.used.includes(`album:${e.id}`) })));
      labSys.showOverlay(fig.key, (b) => b.draw(fig.draw));
      return;
    }
    // Quantum Rush: the target, the clock and the score
    if (this.rush || this.rushOver) {
      labSys.hardwareWanted = false;
      labSys.showHardware(null);
      labSys.showMaths(false);
      labSys.showLandscape(null);
      labSys.showDensity(false);
      labSys.showWheels(false);
      labSys.showVqe(undefined, H2);
      const fig = rushFigure(this.rushView());
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
          : machine === 'photons'
            ? 'Light through the photonic chip  /  a whole run takes nanoseconds'
            : 'Laser pulses on the atom array  /  the long gaps are atoms moving';
    return { schedule: sched, qubits, holders, title };
  }

  /** The chip tab's machine: superconducting chip, trapped ions or neutral atoms. */
  private setMachine(id: PlatformId): void {
    this.quest('machine');
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

  /** Stand the machine around the qubits 1:1 on the floor beside the desk, or put it back. */
  private setFullSize(on: boolean): void {
    const labSys = this.world.getSystem(LabSystem);
    if (!labSys) return;
    labSys.fullSize = on;
    const what = this.machine === 'superconducting' ? 'The dilution refrigerator' : this.machine === 'ions' ? 'The vacuum chamber' : 'The optics table';
    this.flash(on ? `${what}, at its real size. Walk around it.` : `${what}, back on the desk.`);
    feedback('select');
    this.showCode(false);
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
    for (const m of ['superconducting', 'ions', 'atoms', 'photons'] as const) this.bg(`code-m-${m}`, m === this.machine ? C.primary : '#34363b');
    this.bg('code-compare', this.compared?.key === key ? C.done : '#34363b');
    this.bg('code-full', this.world.getSystem(LabSystem)?.fullSize ? C.primary : '#34363b');
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
    for (const id of ['chapter-panel', 'gate-dock', 'code-panel', 'nav-panel', 'builder-panel', 'notes-panel', 'noise-panel', 'library-panel', 'debug-panel', 'class-panel', 'looks-panel', 'codelab-panel', 'decoder-panel', 'wrist-panel']) {
      const e = this.world.getSceneEntity(id);
      if (!e) continue;
      if (want && !e.hasComponent(PokeInteractable)) e.addComponent(PokeInteractable);
      else if (!want && e.hasComponent(PokeInteractable)) e.removeComponent(PokeInteractable);
    }
  }

  private place(obj: { position: Vector3; quaternion: Quaternion; scale: Vector3 }, key: keyof typeof PLACEMENT): void {
    const ws = this.world.getSystem(LabSystem)?.workspaceObject;
    if (!ws) return;
    let spot: { pos: Vector3; rot: Euler } = PLACEMENT[key];
    if (this.layout() === 'compact') {
      let c = this.compactSpots.get(key);
      if (!c) this.compactSpots.set(key, (c = compactPlacement(spot.pos, spot.rot)));
      spot = c;
    }
    const { pos, rot } = spot;
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
    // Ket keeps its place by the chapter card, in the compact layout too
    this.world.getSystem(LabSystem)?.partner.setHome(this.layout() === 'compact' ? (this.ketCompact ??= compactPlacement(KET_HOME, new Euler()).pos) : KET_HOME);
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
    // the wrist menu floats just above the upturned left palm, facing the player
    const palm = this.world.getSystem(GestureSystem)?.palmUp;
    if (palm || this.wristForce) {
      const w = this.wristAsset!;
      if (palm) w.position.copy(palm.center).addScaledVector(palm.normal, 0.06);
      else this.place(w, 'wrist-demo');
      this.player.head.getWorldPosition(this.p);
      if (palm) w.lookAt(this.p);
      w.visible = true;
      this.text('wr-sel', `q${lab.selected}`);
      this.els.get('wr-sel')?.setProperties({ color: qubitColor(lab.selected) });
    } else {
      this.wristAsset!.visible = false;
      this.wristAsset!.position.copy(PARKED);
    }
    if (this.game === 'decoder') {
      this.place(this.decoderAsset!, 'decoder-pad');
      this.decoderAsset!.visible = true;
    } else {
      this.decoderAsset!.visible = false;
      this.decoderAsset!.position.copy(PARKED);
    }
    if (this.labOpen) {
      this.place(this.codelabAsset!, 'code-panel');
      this.codelabAsset!.visible = true;
    } else {
      this.codelabAsset!.visible = false;
      this.codelabAsset!.position.copy(PARKED);
    }
    this.updateBoardMode();
    const lsys = this.world.getSystem(LabSystem);
    if (lsys) {
      lsys.boardRaised = this.dbgOpen || this.classOpen || this.shorOn;
      // the Surface Code chapter's lattice takes the space the big-state views use
      const cv = campaign.view;
      const lattice = cv.mode === 'campaign' && !cv.intro && !this.profileOpen && !this.libOpen && cv.chapter?.title === 'Surface Code' ? ((campaign.memoryValue('surface') as SurfaceView | undefined) ?? null) : null;
      lsys.showSurface(lattice);
      const inside = this.insideOn && !lattice;
      lsys.showTransmon(inside);
      lsys.showStateView(this.libOpen || lattice || inside ? null : this.stateView);
      lsys.showCat(this.game === 'cat');
      lsys.showGiant(this.giantOn);
      lsys.showHistory(this.historyOn);
      if (lsys.dice.root.visible && this.game !== 'dice') lsys.dice.hide();
      lsys.crystal.showLabel(this.profileOpen || this.game === 'today');
      lsys.showTrophies(this.profileOpen ? ACHIEVEMENTS.map((a) => ({ id: a.id, title: a.title, unlocked: !!this.profile.data.unlocked[a.id] })) : null);
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
    // the finishes stand in front of the board while the progress board is up
    if (this.studioOpen && (this.notes!.open || this.libOpen || this.noiseOpen || this.profileOpen || this.settingsOpen)) this.studioOpen = false;
    if (this.profileOpen || this.studioOpen) {
      this.place(this.looksAsset!, 'notes-panel');
      this.looksAsset!.visible = true;
    } else {
      this.looksAsset!.visible = false;
      this.looksAsset!.position.copy(PARKED);
    }
    if (this.noiseOpen) {
      this.place(this.noiseAsset!, 'notes-panel');
      this.noiseAsset!.visible = true;
    } else {
      this.noiseAsset!.visible = false;
      this.noiseAsset!.position.copy(PARKED);
    }
    // settings stand in front of the board; another window opening there closes them
    if (this.settingsOpen && (this.notes!.open || this.libOpen || this.noiseOpen || this.profileOpen || this.dbgOpen || this.classOpen)) this.settingsOpen = false;
    if (this.settingsOpen) {
      this.place(this.settingsAsset!, 'settings-panel');
      this.settingsAsset!.visible = true;
      this.settingsTimer += delta;
      if (this.settingsTimer > 1) {
        this.settingsTimer = 0;
        this.renderSettings();
      }
    } else {
      this.settingsAsset!.visible = false;
      this.settingsAsset!.position.copy(PARKED);
    }
    this.place(this.nav!, 'nav-panel');
    // development: slow motion (window.__entangledSlowmo) slows the chapters' own clocks too, as it does the 3D
    const slow = import.meta.env.DEV ? ((globalThis as { __entangledSlowmo?: number }).__entangledSlowmo ?? 1) : 1;
    campaign.update(Math.min(delta, 0.05) * slow);
    this.updateRush(Math.min(delta, 0.05));
    this.updateGame(Math.min(delta, 0.05));
    this.ketUpdate();
    this.updateRunner(Math.min(delta, 0.05));
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
