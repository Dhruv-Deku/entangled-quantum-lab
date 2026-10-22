import { createSystem, VisibilityState } from '@iwsdk/core';
import { feedback, unlockAudio } from './feedback';
import { campaign } from '../game/instance';
import { lab } from './instance';
import { MAX_ORBS } from './lab';
import type { Tool } from '../game/builder';

/** Build tab keys: letters place a tool at the cursor (Shift for the dagger versions). */
const BUILD_KEYS: Record<string, Tool> = {
  h: 'h', x: 'x', y: 'y', z: 'z', s: 's', S: 'sdg', t: 't', T: 'tdg', v: 'sx', V: 'sxdg',
  '1': 'rx', '2': 'ry', '3': 'rz', c: 'ctrl', o: 'anti', p: 'target', w: 'swap',
};

/**
 * Desktop debug mode: a key for every gesture, so the whole app can be driven
 * on a laptop without a headset. Press ? to show the key list.
 */
const KEYS: [string, string][] = [
  ['1 – 5', 'Select a qubit (or click an orb)'],
  ['H', 'Spread hand: Hadamard'],
  ['X  Y  Z  S  T', 'Gate deck: Pauli and phase gates'],
  ['← →  (hold)', 'Wrist rotate the selected qubit'],
  ['M', 'Fist: measure'],
  ['C', 'Touch orbs: entangle (CNOT)'],
  ['W', 'SWAP the selected qubit with the next'],
  ['Space', '100 shots: probability rain'],
  ['Ctrl+Z  Ctrl+Y', 'Undo / redo'],
  ['N  /  Backspace', 'Sandbox: add / remove a qubit'],
  ['R', 'Reset to |0…0⟩'],
  ['Enter', 'Continue, or the card button (Oracle, Storm…)'],
  ['[  ]', 'Previous / next chapter, lesson or sandbox preset'],
  ['L', 'Learn: one lesson per gate'],
  ['Q', 'Puzzles: match the target, beat par'],
  ['B', 'Build: circuit builder (cross-dot grid)'],
  ['I', 'Notes: read about this chapter or lesson (again: next page)'],
  ['In Build', 'arrows move; H X Y Z S T place; Shift+S/T dagger; V SX; 1 2 3 Rx Ry Rz; C dot; O open dot; P plus; W swap; Backspace erase'],
  ['P', 'Play the chapters from Chapter 1'],
];

export class DebugInputSystem extends createSystem({}) {
  private turning = 0;
  private help!: HTMLDivElement;

  init(): void {
    this.help = this.buildHelp();
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        this.turning = 0;
        lab.commitRotation();
      }
    };
    const onPointer = () => unlockAudio();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('pointerdown', onPointer);
    this.cleanupFuncs.push(
      () => window.removeEventListener('keydown', onKey),
      () => window.removeEventListener('keyup', onUp),
      () => window.removeEventListener('pointerdown', onPointer),
      () => this.help.remove(),
      this.visibilityState.subscribe((v) => {
        this.help.style.display = v === VisibilityState.NonImmersive ? 'block' : 'none';
      }),
    );
  }

  private buildHelp(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'debug-help';
    el.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:10;font:13px/1.45 Inter,system-ui,sans-serif;color:#e4e6eb;' +
      'background:rgba(28,29,32,.88);border-radius:16px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:330px';
    const rows = KEYS.map(([k, v]) => `<div style="display:flex;gap:12px"><b style="min-width:112px;color:#fff">${k}</b><span style="color:#b0b3b8">${v}</span></div>`).join('');
    el.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><b>Desktop controls</b><span style="color:#8a8d93">&nbsp;&nbsp;press ? to show</span></div><div id="debug-rows" style="display:none">${rows}</div>`;
    document.body.appendChild(el);
    return el;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    unlockAudio();
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) {
      e.preventDefault();
      if (e.shiftKey ? lab.redo() : lab.undo()) feedback('select');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) {
      e.preventDefault();
      if (lab.redo()) feedback('select');
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (campaign.mode === 'build' && this.buildKey(e)) return;
    if (k >= '1' && k <= '5') {
      lab.select(Number(k) - 1);
      feedback('select');
      return;
    }
    switch (k.toLowerCase()) {
      case 'h': case 'x': case 'y': case 'z': case 's': case 't':
        if (lab.gate(k.toLowerCase() as 'h')) feedback('gate');
        break;
      case 'm':
        if (lab.measure() !== null) feedback('measure');
        break;
      case 'w':
        if (lab.n < 2) feedback('reject');
        else if (lab.apply({ kind: 'swap', a: lab.selected, b: (lab.selected + 1) % lab.n })) feedback('gate');
        break;
      case 'c':
        feedback(lab.entangleSelected() ? 'entangle' : 'reject');
        break;
      case ' ':
        e.preventDefault();
        lab.shots(100);
        feedback('shots');
        break;
      case 'arrowleft':
        this.turning = 1;
        break;
      case 'arrowright':
        this.turning = -1;
        break;
      case 'n':
        // chapters fix their own qubit count; adding qubits is a sandbox thing
        if (campaign.mode !== 'sandbox') campaign.enterSandbox();
        else if (lab.n < MAX_ORBS) lab.reset(lab.n + 1);
        break;
      case 'backspace':
        if (campaign.mode === 'sandbox' && lab.n > 1) lab.reset(lab.n - 1);
        break;
      case 'r':
        lab.reset();
        break;
      case 'enter':
        campaign.next();
        break;
      case 'p':
        campaign.startChapter(0);
        feedback('select');
        break;
      case '[':
      case ']':
        campaign.step(k === ']' ? 1 : -1);
        feedback('select');
        break;
      case 'l':
        campaign.enterLearn();
        feedback('select');
        break;
      case 'q':
        campaign.startPuzzle(campaign.puzzleIndex);
        feedback('select');
        break;
      case 'b':
        campaign.enterBuild();
        feedback('select');
        break;
      case 'i':
        window.dispatchEvent(new Event('entangled:notes'));
        break;
      case 'd':
        // dev only: dump state for automated checks
        if (import.meta.env.DEV) {
          const st = lab.history.state;
          console.info('[Entangled:state] ' + JSON.stringify({
            n: lab.n, selected: lab.selected, cursor: lab.history.cursor, length: lab.history.length, ops: lab.history.ops,
            probs: Array.from(st.probabilities()).map((p) => +p.toFixed(3)),
            campaign: campaign.toJSON(), view: { done: campaign.view.stepDone, chapterDone: campaign.view.chapterDone },
          }));
        }
        break;
      case '?':
      case '/':
        this.help.querySelector<HTMLDivElement>('#debug-rows')!.style.display =
          this.help.querySelector<HTMLDivElement>('#debug-rows')!.style.display === 'none' ? 'block' : 'none';
        break;
    }
  }

  /** Keys while the builder is open. Returns true if the key was used. */
  private buildKey(e: KeyboardEvent): boolean {
    const b = campaign.build;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      b.moveCursor(mv[0], mv[1]);
      return true;
    }
    const tool = BUILD_KEYS[e.key];
    if (tool) {
      if (!b.challenge.tools.includes(tool)) {
        feedback('reject');
        return true;
      }
      b.selectTool(tool);
      b.place(b.cursor.col, b.cursor.row, tool);
      // after a dot or swap mark go down to the next qubit (to finish the column); after a gate, go right
      if (tool === 'ctrl' || tool === 'anti' || tool === 'swap') b.moveCursor(0, 1);
      else b.moveCursor(1, 0);
      feedback('gate');
      return true;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      b.erase();
      feedback('select');
      return true;
    }
    if (e.key === 'r' || e.key === 'R') {
      b.clear();
      feedback('select');
      return true;
    }
    return false;
  }

  update(delta: number): void {
    if (this.turning !== 0) lab.rotate(lab.selected, this.turning * Math.min(delta, 0.05) * 1.6);
  }
}
