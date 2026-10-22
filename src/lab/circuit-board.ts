import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import type { Op } from '../quantum/circuit';
import type { QState } from '../quantum/state';
import { qubitColor } from './visuals';

const W = 1600;
const H = 640;
/** Board size in metres. */
export const BOARD_W = 0.5;
export const BOARD_H = (BOARD_W * H) / W;

const INK = '#e4e6eb';
const DIM = '#8a8d93';
const WIRE = '#4a4c52';
const GOLD = '#e2b04a';
const MINT = '#3ddc97';
const COLS = 13;

/**
 * A standing board behind the orbs. Left: the circuit so far as a standard
 * diagram (wires, gate boxes, CNOT dots), with future steps faded after a
 * rewind. Right: every basis state as a circle whose filled area is its
 * probability and whose hand is its phase, the way Quirk draws amplitudes.
 * Puzzles add the target state as mint outlines.
 */
export class CircuitBoard {
  readonly root: Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly tex: CanvasTexture;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.root = new Mesh(new PlaneGeometry(BOARD_W, BOARD_H), new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.root.name = 'CircuitBoard';
    (this.root as unknown as { pointerEvents: string }).pointerEvents = 'none';
  }

  render(n: number, ops: readonly Op[], cursor: number, state: QState, target: QState | null): void {
    const g = this.g;
    g.clearRect(0, 0, W, H);
    roundRect(g, 4, 4, W - 8, H - 8, 40);
    g.fillStyle = 'rgba(29,30,33,0.94)';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = '#34363b';
    g.stroke();
    this.circuit(n, ops, cursor);
    // divider
    g.fillStyle = '#34363b';
    g.fillRect(1010, 40, 2, H - 80);
    this.amplitudes(state, target);
    this.tex.needsUpdate = true;
  }

  private circuit(n: number, ops: readonly Op[], cursor: number): void {
    const g = this.g;
    text(g, 'Circuit', 44, 58, DIM, '600 26px');
    // wires at most 120 px apart, centred, so a 2-qubit circuit does not float in empty space
    const span = Math.min(H - 190, (n - 1) * 120);
    const top = (H - span) / 2 + 25, bottom = top + span;
    const wy = (q: number) => (n === 1 ? top : top + (span * q) / (n - 1));
    const x0 = 120, dx = 66;
    // window of steps: keep the cursor in view
    const start = Math.max(0, Math.min(ops.length - COLS, cursor - (COLS - 2)));
    for (let q = 0; q < n; q++) {
      text(g, `q${q}`, 44, wy(q) + 10, qubitColor(q), '700 28px');
      g.fillStyle = WIRE;
      g.fillRect(x0 - 20, wy(q) - 1.5, 900 - x0 + 70, 3);
    }
    if (start > 0) text(g, '...', x0 - 14, top - 34, DIM, '600 24px');
    text(g, ops.length ? `step ${cursor} of ${ops.length}` : 'no steps yet', 960, 58, DIM, '500 22px', 'right');
    for (let c = 0; c < COLS && start + c < ops.length; c++) {
      const k = start + c;
      const op = ops[k];
      const x = x0 + 20 + c * dx;
      g.globalAlpha = k < cursor ? 1 : 0.3;
      drawOp(g, op, x, wy);
      g.globalAlpha = 1;
    }
    // cursor: where the qubits are right now
    if (!ops.length) return;
    const cx = x0 + 20 + (cursor - start) * dx - dx / 2;
    g.fillStyle = 'rgba(45,127,249,0.9)';
    g.fillRect(cx - 1.5, top - 40, 3, bottom - top + 70);
  }

  private amplitudes(s: QState, target: QState | null): void {
    const g = this.g;
    text(g, target ? 'State   (mint: target)' : 'State', 1050, 58, target ? MINT : DIM, '600 26px');
    const dim = s.dim;
    let shown = Array.from({ length: dim }, (_, k) => k);
    if (dim > 8) {
      const p = s.probabilities();
      const t = target?.probabilities();
      shown = shown
        .sort((a, b) => Math.max(p[b], t?.[b] ?? 0) - Math.max(p[a], t?.[a] ?? 0))
        .slice(0, 8)
        .sort((a, b) => a - b);
    }
    const cols = shown.length <= 2 ? shown.length : 4;
    const rows = Math.ceil(shown.length / cols);
    const cellW = 520 / cols, cellH = rows > 1 ? 250 : 400;
    const R = Math.min(rows > 1 ? 62 : 84, cellW * 0.4);
    shown.forEach((k, i) => {
      const cx = 1060 + cellW * (i % cols) + cellW / 2;
      // one row sits in the middle of the board; two rows fill it
      const cy = rows > 1 ? 110 + cellH * Math.floor(i / cols) + R + 10 : H / 2 - 30;
      const re = s.re[k], im = s.im[k];
      const p = re * re + im * im;
      g.lineWidth = 2;
      g.strokeStyle = WIRE;
      circle(g, cx, cy, R);
      g.stroke();
      if (p > 1e-4) {
        g.fillStyle = 'rgba(228,230,235,0.85)';
        circle(g, cx, cy, R * Math.sqrt(p));
        g.fill();
        // phase hand: angle of the amplitude, counter-clockwise from the right
        const a = Math.atan2(im, re);
        g.strokeStyle = '#18191b';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * R * Math.sqrt(p), cy - Math.sin(a) * R * Math.sqrt(p));
        g.stroke();
      }
      if (target) {
        const tr = target.re[k], ti = target.im[k];
        const tp = tr * tr + ti * ti;
        if (tp > 1e-4) {
          g.setLineDash([8, 7]);
          g.strokeStyle = MINT;
          g.lineWidth = 3;
          circle(g, cx, cy, R * Math.sqrt(tp));
          g.stroke();
          g.setLineDash([]);
          const a = Math.atan2(ti, tr);
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(a) * (R + 12), cy - Math.sin(a) * (R + 12));
          g.stroke();
        }
      }
      // label: one digit per qubit in its colour (leftmost is the highest qubit), then the odds
      const bits = k.toString(2).padStart(s.n, '0');
      g.font = '700 26px Inter, system-ui, sans-serif';
      const w = g.measureText(bits).width;
      let x = cx - w / 2;
      for (let j = 0; j < bits.length; j++) {
        g.fillStyle = qubitColor(s.n - 1 - j);
        g.fillText(bits[j], x, cy + R + 36);
        x += g.measureText(bits[j]).width;
      }
      text(g, `${Math.round(p * 100)}%`, cx, cy + R + 66, DIM, '500 22px', 'center');
    });
    if (dim > 8) text(g, `top 8 of ${dim}`, W - 44, 58, DIM, '500 22px', 'right');
  }
}

function drawOp(g: CanvasRenderingContext2D, op: Op, x: number, wy: (q: number) => number): void {
  const box = (q: number, label: string, stroke: string) => {
    roundRect(g, x - 26, wy(q) - 26, 52, 52, 12);
    g.fillStyle = '#2d2f33';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = stroke;
    g.stroke();
    text(g, label, x, wy(q) + 9, INK, `700 ${label.length > 2 ? 18 : label.length > 1 ? 22 : 26}px`, 'center');
  };
  const link = (qs: number[]) => {
    g.fillStyle = GOLD;
    const ys = qs.map(wy);
    g.fillRect(x - 1.5, Math.min(...ys), 3, Math.max(...ys) - Math.min(...ys));
  };
  switch (op.kind) {
    case 'gate': {
      const name = op.gate.length === 1 ? op.gate.toUpperCase() : op.gate[0].toUpperCase() + op.gate.slice(1);
      const controls = op.controls ?? [];
      if (!controls.length) {
        box(op.target, op.condition ? `${name}?` : name, qubitColor(op.target));
        return;
      }
      link([...controls, op.target]);
      for (const c of controls) {
        g.fillStyle = GOLD;
        circle(g, x, wy(c), 9);
        g.fill();
      }
      if (op.gate === 'x') {
        // the CNOT target: a circled plus
        g.fillStyle = '#1d1e21';
        circle(g, x, wy(op.target), 20);
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = GOLD;
        g.stroke();
        g.fillStyle = GOLD;
        g.fillRect(x - 20, wy(op.target) - 1.5, 40, 3);
        g.fillRect(x - 1.5, wy(op.target) - 20, 3, 40);
      } else box(op.target, name, GOLD);
      return;
    }
    case 'swap':
    case 'iswap': {
      link([op.a, op.b]);
      for (const q of [op.a, op.b]) {
        g.strokeStyle = GOLD;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(x - 12, wy(q) - 12);
        g.lineTo(x + 12, wy(q) + 12);
        g.moveTo(x + 12, wy(q) - 12);
        g.lineTo(x - 12, wy(q) + 12);
        g.stroke();
      }
      return;
    }
    case 'measure':
    case 'reset': {
      const q = op.qubit;
      box(q, op.kind === 'measure' ? 'M' : 'R', '#c9ccd1');
      if (op.outcome !== undefined) text(g, `=${op.outcome}`, x, wy(q) + 52, INK, '600 20px', 'center');
    }
  }
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign = 'left'): void {
  g.font = `${font} Inter, system-ui, sans-serif`;
  g.fillStyle = color;
  g.textAlign = align;
  g.fillText(s, x, y);
  g.textAlign = 'left';
}

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
