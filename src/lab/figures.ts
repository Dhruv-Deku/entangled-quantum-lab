import { CHSH_ALICE, CHSH_BOB, logicalError, TSIRELSON, zenoSurvival, type ChshResult, type RbResult, type Unitary } from '../quantum/advanced';

/**
 * Figures a chapter puts on the circuit board: the CHSH score, the bit-flip
 * code's syndrome table and threshold curve, an arc diagram of who is
 * entangled with whom, the quantum walk against a classical one, Trotter
 * against exact time evolution, and the circuit's whole matrix. Plain 2D
 * canvas drawing in the board's style (no three.js), keyed so the board only
 * redraws when the data changes.
 */

export interface Figure {
  /** Changes whenever the picture would. */
  key: string;
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void;
}

const INK = '#e4e6eb';
const DIM = '#8a8d93';
const LINE = '#34363b';
const GRID = '#2a2c30';
const GOLD = '#e2b04a';
const MINT = '#3ddc97';
const BLUE = '#2d7ff9';
const SOFT_BLUE = '#7fa9f5';
const CORAL = '#ff8a7a';
const QUBIT = ['#FF7759', '#3FC6C9', '#9B87F5', '#7BCB6A', '#FF8FB6'];
const FONT = 'Inter, system-ui, sans-serif';

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign = 'left'): void {
  g.fillStyle = color;
  g.font = `${font} ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillText(s, x, y);
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

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

/** Lines no wider than maxW. */
function wrap(g: CanvasRenderingContext2D, s: string, font: string, maxW: number): string[] {
  g.font = `${font} ${FONT}`;
  const out: string[] = [];
  let cur = '';
  for (const word of s.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && g.measureText(next).width > maxW) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/** The board's card, a title on the left and an optional reading on the right. */
function panel(g: CanvasRenderingContext2D, w: number, h: number, title: string, right?: string): void {
  g.clearRect(0, 0, w, h);
  roundRect(g, 4, 4, w - 8, h - 8, 40);
  g.fillStyle = 'rgba(29,30,33,0.94)';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = LINE;
  g.stroke();
  text(g, title, 44, 62, DIM, '600 28px');
  if (right) text(g, right, w - 44, 62, INK, '700 26px', 'right');
}

interface Axes {
  x0: number;
  y0: number;
  w: number;
  h: number;
  sx: (v: number) => number;
  sy: (v: number) => number;
}

/** A plot box with ticks; returns the scales. */
function axes(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, xr: [number, number], yr: [number, number], xt: number[], yt: number[], xl: string, yl: string, fmt = (v: number) => `${v}`): Axes {
  const sx = (v: number) => x0 + ((v - xr[0]) / (xr[1] - xr[0])) * w;
  const sy = (v: number) => y0 + h - ((v - yr[0]) / (yr[1] - yr[0])) * h;
  g.lineWidth = 2;
  g.strokeStyle = GRID;
  for (const v of yt) {
    g.beginPath();
    g.moveTo(x0, sy(v));
    g.lineTo(x0 + w, sy(v));
    g.stroke();
    text(g, fmt(v), x0 - 12, sy(v) + 7, DIM, '500 20px', 'right');
  }
  g.strokeStyle = LINE;
  g.strokeRect(x0, y0, w, h);
  for (const v of xt) text(g, fmt(v), sx(v), y0 + h + 30, DIM, '500 20px', 'center');
  text(g, xl, x0 + w / 2, y0 + h + 60, INK, '600 22px', 'center');
  text(g, yl, x0, y0 - 14, DIM, '600 20px');
  return { x0, y0, w, h, sx, sy };
}

function polyline(g: CanvasRenderingContext2D, a: Axes, pts: [number, number][], color: string, width: number, dash: number[] = []): void {
  g.setLineDash(dash);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(a.sx(x), a.sy(y)) : g.moveTo(a.sx(x), a.sy(y))));
  g.stroke();
  g.setLineDash([]);
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A short fingerprint of many numbers (to 3 decimals), for figure keys. */
function digest(xs: ArrayLike<number>): string {
  let h = 2166136261;
  for (let i = 0; i < xs.length; i++) {
    h ^= Math.round(xs[i] * 1000) + i * 31;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------- CHSH

export interface ChshRun {
  label: string;
  result: ChshResult;
}

/**
 * Left: the correlation E between the two measurements against the angle
 * between them (cos for a Bell pair), with the four settings of the game.
 * Right: each run's score S against the classical limit 2 and the quantum
 * limit 2 sqrt 2.
 */
export function chshFigure(runs: ChshRun[]): Figure {
  return {
    key: `chsh:${runs.map((r) => `${r.label}:${r.result.e.flat().map(r2).join(',')}`).join('|')}`,
    draw: (g, w, h) => {
      const last = runs[runs.length - 1]?.result;
      panel(g, w, h, 'Bell test (CHSH)', last ? `won ${Math.round(last.win * 100)}% of ${last.rounds} rounds  /  75% is the best without entanglement` : 'no rounds yet');
      const a = axes(g, 130, 110, 640, 380, [-Math.PI, Math.PI], [-1, 1], [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI], [-1, 0, 1], 'angle between Alice and Bob', 'agreement E', (v) =>
        Math.abs(v) < 1e-9 ? '0' : Math.abs(Math.abs(v) - Math.PI) < 1e-9 ? (v < 0 ? '-180' : '180') : Math.abs(v) <= 1 + 1e-9 ? `${v}` : `${Math.round((v * 180) / Math.PI)}`,
      );
      const curve: [number, number][] = [];
      for (let i = 0; i <= 120; i++) {
        const d = -Math.PI + (i / 120) * 2 * Math.PI;
        curve.push([d, Math.cos(d)]);
      }
      polyline(g, a, curve, '#5a5d63', 3, [10, 8]);
      text(g, 'Bell pair: E = cos(angle)', a.sx(0), a.sy(-0.82), DIM, '500 20px', 'center');
      // the four settings: E1, E2, E3 should agree (E near +0.7), E4 should disagree
      runs.forEach((run, ri) => {
        const lastRun = ri === runs.length - 1;
        const color = lastRun ? (run.result.exact > 2 ? GOLD : SOFT_BLUE) : '#5a5d63';
        for (let x = 0; x < 2; x++)
          for (let y = 0; y < 2; y++) dot(g, a.sx(CHSH_ALICE[x] - CHSH_BOB[y]), a.sy(run.result.e[x][y]), lastRun ? 10 : 7, color);
      });
      if (runs.length) {
        const e = runs[runs.length - 1].result.e;
        text(g, 'E1', a.sx(CHSH_ALICE[0] - CHSH_BOB[0]) - 18, a.sy(e[0][0]) + 8, INK, '600 20px', 'right');
        text(g, 'E2, E3', a.sx(CHSH_ALICE[0] - CHSH_BOB[1]) + 18, a.sy(e[0][1]) + 8, INK, '600 20px');
        text(g, 'E4', a.sx(CHSH_ALICE[1] - CHSH_BOB[1]) + 18, a.sy(e[1][1]) + 8, INK, '600 20px');
      }
      // the score bars, with the two limits marked on each
      const bx = 880, bw = 600, by = 170, smax = 3.4;
      const sx = (v: number) => bx + (Math.max(0, v) / smax) * bw;
      text(g, 'score S = E1 + E2 + E3 - E4', bx, 116, DIM, '600 22px');
      text(g, 'classical limit 2', sx(2) - 8, by - 14, INK, '600 20px', 'right');
      text(g, 'quantum limit 2.83', sx(TSIRELSON), by - 14, GOLD, '600 20px', 'center');
      runs.slice(-3).forEach((run, i) => {
        const y = by + i * 100;
        roundRect(g, bx, y, bw, 40, 12);
        g.fillStyle = '#26272b';
        g.fill();
        roundRect(g, bx, y, Math.max(24, sx(run.result.s) - bx), 40, 12);
        g.fillStyle = run.result.exact > 2 ? GOLD : SOFT_BLUE;
        g.fill();
        for (const [v, c] of [[2, INK], [TSIRELSON, GOLD]] as const) {
          g.fillStyle = c;
          g.fillRect(sx(v) - 2, y - 8, 4, 56);
        }
        text(g, run.label, bx, y + 74, INK, '600 22px');
        text(g, `S = ${run.result.s.toFixed(2)} +- ${run.result.se.toFixed(2)}`, bx + bw, y + 74, INK, '700 22px', 'right');
      });
      if (!runs.length) text(g, 'Make a Bell pair, then tap Play.', bx, by + 30, DIM, '500 22px');
    },
  };
}

// ---------------------------------------------------------------- bit-flip code

export interface QecView {
  /** The two parity checks once measured: q0 xor q1, q1 xor q2. */
  syndrome: [number, number] | null;
  /** Which qubit the storm flipped (shown after the syndrome is read). */
  flipped: number | null;
  corrected: boolean;
  curve: [number, number][] | null;
}

const SYNDROME_ROWS: [string, string, number | null][] = [
  ['00', 'no flip: leave it', null],
  ['10', 'q0 flipped: flip it back', 0],
  ['11', 'q1 flipped: flip it back', 1],
  ['01', 'q2 flipped: flip it back', 2],
];

/** Left: the syndrome lookup, the current reading lit. Right: failure rate with and without the code. */
export function qecFigure(v: QecView): Figure {
  return {
    key: `qec:${JSON.stringify(v)}`,
    draw: (g, w, h) => {
      panel(g, w, h, 'Bit-flip code: two parity checks find the flip without looking at the message', v.corrected ? 'message restored' : v.syndrome ? `syndrome ${v.syndrome.join('')}` : '');
      const x0 = 50, y0 = 120;
      text(g, 'q3 = q0 xor q1    q4 = q1 xor q2', x0, y0, DIM, '600 22px');
      SYNDROME_ROWS.forEach(([bits, what, q], i) => {
        const y = y0 + 30 + i * 86;
        const lit = v.syndrome !== null && v.syndrome.join('') === bits;
        roundRect(g, x0, y, 640, 70, 16);
        g.fillStyle = lit ? (v.corrected ? 'rgba(61,220,151,0.18)' : 'rgba(45,127,249,0.22)') : '#232428';
        g.fill();
        if (lit) {
          g.lineWidth = 3;
          g.strokeStyle = v.corrected ? MINT : BLUE;
          g.stroke();
        }
        text(g, bits[0], x0 + 40, y + 47, QUBIT[3], '700 30px', 'center');
        text(g, bits[1], x0 + 80, y + 47, QUBIT[4], '700 30px', 'center');
        text(g, what, x0 + 130, y + 45, lit ? INK : DIM, `${lit ? 700 : 500} 24px`);
        if (q !== null) dot(g, x0 + 600, y + 35, 12, QUBIT[q]);
      });
      // threshold: with the code against without
      const a = axes(g, 860, 110, 640, 370, [0, 0.6], [0, 0.7], [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], [0, 0.2, 0.4, 0.6], 'chance each qubit flips, p', 'chance the message is lost', (n) => `${n}`);
      polyline(g, a, [[0, 0], [0.6, 0.6]], DIM, 3, [10, 8]);
      const curve: [number, number][] = [];
      for (let i = 0; i <= 60; i++) curve.push([i / 100, logicalError(i / 100)]);
      polyline(g, a, curve, INK, 4);
      text(g, 'no code: p', a.sx(0.03), a.sy(0.3), DIM, '600 20px');
      text(g, 'with the code: 3p^2 - 2p^3', a.sx(0.21), a.sy(0.025), INK, '600 20px');
      g.strokeStyle = LINE;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(a.sx(0.5), a.y0);
      g.lineTo(a.sx(0.5), a.y0 + a.h);
      g.stroke();
      text(g, 'break-even', a.sx(0.5) - 8, a.y0 + 24, DIM, '500 18px', 'right');
      for (const [p, f] of v.curve ?? []) {
        dot(g, a.sx(p), a.sy(f), 9, MINT);
      }
    },
  };
}

// ---------------------------------------------------------------- who is entangled with whom

/** Four or five qubits in a row; a gold arc joins every entangled pair, as thick as the entanglement. */
export function arcsFigure(n: number, pair: number[][], caption: string, bracket: { qubits: [number, number]; label: string } | null): Figure {
  return {
    key: `arcs:${pair.flat().map(r2).join(',')}:${caption}:${bracket?.label ?? ''}`,
    draw: (g, w, h) => {
      panel(g, w, h, 'Who is entangled with whom: an arc for each entangled pair');
      const gap = (w - 300) / Math.max(1, n - 1), base = 400;
      const xOf = (q: number) => 150 + q * gap;
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++) {
          const s = pair[a][b];
          if (s < 0.02) continue;
          // flattened arcs: longer pairs rise higher, all of them stay on the board
          const xa = xOf(a), xb = xOf(b), rx = (xb - xa) / 2, ry = Math.min(rx, 80 + 70 * (b - a - 1));
          g.strokeStyle = GOLD;
          g.globalAlpha = 0.35 + 0.65 * s;
          g.lineWidth = 4 + 14 * s;
          g.beginPath();
          g.ellipse((xa + xb) / 2, base - 40, rx, ry, 0, Math.PI, 2 * Math.PI);
          g.stroke();
          g.globalAlpha = 1;
          text(g, s.toFixed(2), (xa + xb) / 2, base - 56 - ry, GOLD, '700 24px', 'center');
        }
      for (let q = 0; q < n; q++) {
        dot(g, xOf(q), base - 40, 30, '#26272b');
        g.lineWidth = 5;
        g.strokeStyle = QUBIT[q];
        g.beginPath();
        g.arc(xOf(q), base - 40, 30, 0, Math.PI * 2);
        g.stroke();
        text(g, `q${q}`, xOf(q), base - 30, QUBIT[q], '700 28px', 'center');
      }
      if (bracket) {
        const [a, b] = bracket.qubits, y = base + 20;
        g.strokeStyle = BLUE;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(xOf(a) - 30, y);
        g.lineTo(xOf(a) - 30, y + 24);
        g.lineTo(xOf(b) + 30, y + 24);
        g.lineTo(xOf(b) + 30, y);
        g.stroke();
        text(g, bracket.label, (xOf(a) + xOf(b)) / 2, y + 60, SOFT_BLUE, '600 24px', 'center');
      }
      wrap(g, caption, '600 26px', w - 120).slice(0, 2).forEach((l, i) => text(g, l, w / 2, h - 80 + i * 34, INK, '600 26px', 'center'));
    },
  };
}

// ---------------------------------------------------------------- quantum walk

/** Bars: where the quantum walker might be; grey ticks: a classical walker after the same steps. Inset: how far each has spread. */
export function walkFigure(t: number, quantum: number[], classical: number[], spreads: { t: number; q: number; c: number }[], start: number): Figure {
  return {
    key: `walk:${t}:${quantum.map(r2).join(',')}`,
    draw: (g, w, h) => {
      panel(g, w, h, `Quantum walk: ${t} step${t === 1 ? '' : 's'} from the middle`, t ? `spread ${spreads[spreads.length - 1].q.toFixed(2)} sites (classical ${spreads[spreads.length - 1].c.toFixed(2)})` : '');
      const n = quantum.length;
      const x0 = 70, y0 = 110, bw = 1000 / n, ph = 380;
      const top = Math.max(0.5, ...quantum, ...classical);
      g.strokeStyle = LINE;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0, y0 + ph);
      g.lineTo(x0 + n * bw, y0 + ph);
      g.stroke();
      for (let i = 0; i < n; i++) {
        const x = x0 + i * bw;
        const hq = (quantum[i] / top) * ph;
        if (hq > 0.5) {
          g.fillStyle = BLUE;
          if (hq > 18) {
            roundRect(g, x + 8, y0 + ph - hq, bw - 16, hq, 8);
            g.fill();
          } else g.fillRect(x + 8, y0 + ph - hq, bw - 16, hq);
        }
        const hc = (classical[i] / top) * ph;
        if (classical[i] > 1e-9) {
          g.fillStyle = DIM;
          g.fillRect(x + 4, y0 + ph - hc - 3, bw - 8, 6);
        }
        text(g, `${i - start}`, x + bw / 2, y0 + ph + 30, i === start ? INK : DIM, `${i === start ? 700 : 500} 20px`, 'center');
      }
      text(g, 'blue: quantum walker   grey: classical coin-flip walker', x0, y0 + ph + 66, DIM, '500 20px');
      // inset: spread against steps
      const a = axes(g, 1180, 130, 340, 300, [0, 6], [0, 4], [0, 2, 4, 6], [0, 2, 4], 'steps', 'spread');
      const lin: [number, number][] = [], sq: [number, number][] = [];
      for (let i = 0; i <= 60; i++) {
        lin.push([i / 10, 0.56 * (i / 10)]);
        sq.push([i / 10, Math.sqrt(i / 10)]);
      }
      polyline(g, a, sq, DIM, 3, [8, 6]);
      polyline(g, a, lin, '#4a6fb3', 3, [8, 6]);
      for (const s of spreads) {
        dot(g, a.sx(s.t), a.sy(s.c), 7, DIM);
        dot(g, a.sx(s.t), a.sy(s.q), 9, BLUE);
      }
      text(g, 'quantum ~ t', a.sx(3.1), a.sy(3.4), SOFT_BLUE, '600 18px');
      text(g, 'classical ~ sqrt t', a.sx(3.4), a.sy(1.3), DIM, '600 18px');
    },
  };
}

// ---------------------------------------------------------------- time evolution

/** Magnetisation of the Ising chain: exact (line), the circuit's Trotter steps (blue), big steps (coral). */
export function trotterFigure(exact: [number, number][], steps: [number, number][], coarse: [number, number][] | null, tMax: number): Figure {
  return {
    key: `trotter:${steps.length}:${steps.map(([, m]) => r2(m)).join(',')}:${coarse?.length ?? 0}`,
    draw: (g, w, h) => {
      const last = steps[steps.length - 1];
      panel(g, w, h, 'Ising chain: magnetisation over time, H = -(Z0 Z1 + Z1 Z2) - (X0 + X1 + X2)', last ? `t = ${last[0].toFixed(2)}   m = ${last[1].toFixed(3)}` : '');
      const a = axes(g, 130, 110, 1000, 380, [0, tMax], [-1, 1], Array.from({ length: Math.floor(tMax / 0.5) + 1 }, (_, i) => i * 0.5), [-1, -0.5, 0, 0.5, 1], 'time t', 'm = average <Z>');
      polyline(g, a, exact, INK, 4);
      if (coarse) {
        polyline(g, a, coarse, CORAL, 3, [8, 6]);
        for (const [t, m] of coarse) dot(g, a.sx(t), a.sy(m), 9, CORAL);
      }
      polyline(g, a, steps, BLUE, 3);
      for (const [t, m] of steps) dot(g, a.sx(t), a.sy(m), 9, BLUE);
      const lx = 1180;
      const legend: [string, string][] = [[INK, 'exact: e^(-iHt), solved'], [BLUE, 'the circuit on the orbs: small steps']];
      if (coarse) legend.push([CORAL, 'three times bigger steps']);
      legend.forEach(([c, s], i) => {
        dot(g, lx + 10, 150 + i * 46, 9, c);
        text(g, s, lx + 32, 158 + i * 46, INK, '500 22px');
      });
      const note = 'Each step: the couplings (CX, RZ, CX on each bond), then the field (RX on each qubit). Smaller steps track the exact curve better; the error shrinks with the step size.';
      wrap(g, note, '500 20px', 330).forEach((l, i) => text(g, l, lx, 320 + i * 28, DIM, '500 20px'));
    },
  };
}

// ---------------------------------------------------------------- the whole circuit as a matrix

/** Hue for a phase, the same wheel as the Q-sphere. */
function phaseFill(re: number, im: number, alpha: number): string {
  const hue = ((((Math.atan2(im, re) / (2 * Math.PI)) * 360) % 360) + 360) % 360;
  return `hsla(${Math.round(hue)}, 58%, 64%, ${alpha.toFixed(3)})`;
}

/** The circuit's unitary: one square per entry, its colour the phase and its size the magnitude. */
export function unitaryFigure(n: number, steps: number, u: Unitary | null, description: string): Figure {
  return {
    key: `unitary:${n}:${steps}:${u ? digest(u.re) + digest(u.im) : 'none'}:${description}`,
    draw: (g, w, h) => {
      panel(g, w, h, `Circuit unitary  /  ${n} qubit${n === 1 ? '' : 's'}, ${steps} step${steps === 1 ? '' : 's'}`, 'View: next');
      if (!u) {
        wrap(g, description, '600 28px', w - 160).forEach((l, i) => text(g, l, w / 2, 280 + i * 40, INK, '600 28px', 'center'));
        return;
      }
      const d = 1 << n;
      const size = 470, x0 = 110, y0 = 120, cell = size / d;
      g.fillStyle = '#202124';
      g.fillRect(x0, y0, size, size);
      for (let r = 0; r < d; r++)
        for (let c = 0; c < d; c++) {
          const re = u.re[r * d + c], im = u.im[r * d + c];
          const mag = Math.hypot(re, im);
          if (mag < 1e-6) continue;
          const s = cell * (0.25 + 0.7 * mag);
          g.fillStyle = phaseFill(re, im, 0.35 + 0.65 * mag);
          g.fillRect(x0 + c * cell + (cell - s) / 2, y0 + r * cell + (cell - s) / 2, s, s);
        }
      g.strokeStyle = LINE;
      g.lineWidth = 2;
      g.strokeRect(x0, y0, size, size);
      if (d <= 8)
        for (let k = 0; k < d; k++) {
          const label = `|${k.toString(2).padStart(n, '0')}>`;
          text(g, label, x0 + k * cell + cell / 2, y0 - 12, DIM, '500 18px', 'center');
          text(g, label, x0 - 10, y0 + k * cell + cell / 2 + 6, DIM, '500 18px', 'right');
        }
      else {
        text(g, 'in ->', x0, y0 - 12, DIM, '500 18px');
        text(g, 'out', x0 - 10, y0 + 20, DIM, '500 18px', 'right');
      }
      // legend and reading
      const lx = 680;
      text(g, 'Column k is what the circuit does to |k>.', lx, 150, INK, '600 26px');
      text(g, 'Square size: magnitude.   Colour: phase.', lx, 192, DIM, '500 22px');
      const cx = lx + 90, cy = 330, rr = 70;
      for (let i = 0; i < 72; i++) {
        const a0 = (i / 72) * Math.PI * 2, a1 = ((i + 1) / 72) * Math.PI * 2;
        g.beginPath();
        g.arc(cx, cy, rr, -a1, -a0);
        g.arc(cx, cy, rr - 22, -a0, -a1, true);
        g.closePath();
        g.fillStyle = phaseFill(Math.cos(a0), Math.sin(a0), 1);
        g.fill();
      }
      text(g, '0', cx + rr + 14, cy + 7, DIM, '500 18px');
      text(g, 'pi/2', cx, cy - rr - 12, DIM, '500 18px', 'center');
      text(g, 'pi', cx - rr - 14, cy + 7, DIM, '500 18px', 'right');
      text(g, '3pi/2', cx, cy + rr + 26, DIM, '500 18px', 'center');
      wrap(g, description, '600 24px', 640).slice(0, 4).forEach((l, i) => text(g, l, lx + 220, 290 + i * 34, INK, '600 24px'));
      text(g, `${d} x ${d} complex numbers: the whole circuit as one gate.`, lx, 500, DIM, '500 22px');
    },
  };
}

// ---------------------------------------------------------------- quantum Zeno

export interface ZenoView {
  /** The ten turns run without looking. */
  free: boolean;
  /** Outcomes of the watched run, one per look. */
  trial: (0 | 1)[] | null;
  curve: [number, number][] | null;
}

/** Left: the runs as rows of looks. Right: how often the qubit stays put against the number of looks. */
export function zenoFigure(v: ZenoView): Figure {
  return {
    key: `zeno:${JSON.stringify(v)}`,
    draw: (g, w, h) => {
      panel(g, w, h, 'Quantum Zeno effect: a half turn in small slices, looking after each one');
      const x0 = 60, gap = 52;
      const row = (y: number, label: string, outcomes: (0 | 1)[] | null, status: string, statusColor: string) => {
        text(g, label, x0 - 16, y - 34, DIM, '600 22px');
        for (let k = 0; k < 10; k++) {
          const x = x0 + k * gap, o = outcomes?.[k];
          if (o === undefined) {
            g.strokeStyle = LINE;
            g.lineWidth = 2;
            g.beginPath();
            g.arc(x, y, 16, 0, Math.PI * 2);
            g.stroke();
          } else {
            dot(g, x, y, 16, o ? CORAL : MINT);
            text(g, `${o}`, x, y + 8, '#10261c', '700 20px', 'center');
          }
        }
        text(g, status, x0 + 9 * gap + 34, y + 8, statusColor, '700 22px');
      };
      row(170, 'ten slices, no looks', null, v.free ? 'ends at |1>' : '', CORAL);
      const jump = v.trial ? v.trial.indexOf(1) : -1;
      row(290, 'ten slices, a look after each', v.trial, !v.trial ? '' : jump < 0 ? 'stayed |0>' : `jump at ${jump + 1}`, jump < 0 ? MINT : CORAL);
      const lines = 'Each slice turns q0 by 18 degrees: a 2.4% chance a look finds |1>. Each look that finds |0> puts it back at the start.';
      wrap(g, lines, '500 22px', 680).forEach((l, i) => text(g, l, x0 - 16, 390 + i * 32, DIM, '500 22px'));
      // survival against looks, log scale
      const lx = (n: number) => Math.log10(n);
      const a = axes(g, 900, 110, 600, 380, [0, lx(50)], [0, 1], [], [0, 0.25, 0.5, 0.75, 1], 'number of looks (log scale)', 'chance it is still |0>', (n) => `${n}`);
      for (const n of [1, 2, 5, 10, 20, 50]) text(g, `${n}`, a.sx(lx(n)), a.y0 + a.h + 30, DIM, '500 20px', 'center');
      const curve: [number, number][] = [];
      for (let i = 0; i <= 80; i++) {
        const n = 10 ** ((i / 80) * lx(50));
        curve.push([lx(n), zenoSurvival(n)]);
      }
      polyline(g, a, curve, INK, 4);
      text(g, 'theory: cos^2(90 deg / N)^N', a.sx(lx(6)), a.sy(0.3), INK, '600 20px');
      for (const [n, f] of v.curve ?? []) dot(g, a.sx(lx(n)), a.sy(f), 9, MINT);
    },
  };
}

// ---------------------------------------------------------------- randomized benchmarking

/** How often a noisy qubit survives a random sequence that should do nothing, against its length; the fitted decay. */
export function rbFigure(r: RbResult | null, one: { gates: string; survival: number } | null): Figure {
  return {
    key: `rb:${r ? r.points.map(([, f]) => r2(f * 100)).join(',') : ''}:${one?.gates ?? ''}`,
    draw: (g, w, h) => {
      panel(g, w, h, 'Randomized benchmarking: random gates that add up to nothing', r ? `${(r.perGate * 100).toFixed(2)}% error per gate` : '');
      const lmax = Math.log2(256);
      const a = axes(g, 130, 110, 900, 380, [0, lmax], [0.5, 1], [], [0.5, 0.6, 0.7, 0.8, 0.9, 1], 'sequence length m (Clifford gates)', 'back to |0>', (v) => v.toFixed(1));
      for (const m of [1, 2, 4, 8, 16, 32, 64, 128, 256]) text(g, `${m}`, a.sx(Math.log2(m)), a.y0 + a.h + 30, DIM, '500 20px', 'center');
      if (r) {
        const fit: [number, number][] = [];
        for (let i = 0; i <= 80; i++) {
          const m = 2 ** ((i / 80) * lmax);
          fit.push([Math.log2(m), r.a * r.p ** m + 0.5]);
        }
        polyline(g, a, fit, INK, 4);
        for (const [m, f] of r.points) dot(g, a.sx(Math.log2(m)), a.sy(f), 10, MINT);
      }
      const lx = 1090;
      if (one) {
        text(g, 'one sequence:', lx, 140, DIM, '600 22px');
        wrap(g, one.gates, '600 22px', 440).slice(0, 3).forEach((l, i) => text(g, l, lx, 176 + i * 30, INK, '600 22px'));
        text(g, `perfect gates: back to |0> every time`, lx, 290, MINT, '600 22px');
        text(g, `noisy chip: ${(one.survival * 100).toFixed(1)}% of the time`, lx, 324, CORAL, '600 22px');
      }
      if (r) {
        text(g, `fit: ${r.a.toFixed(2)} x ${r.p.toFixed(4)}^m + 0.5`, lx, 400, INK, '600 22px');
        text(g, `${(r.perClifford * 100).toFixed(2)}% error per Clifford`, lx, 434, DIM, '500 22px');
      }
    },
  };
}

// ---------------------------------------------------------------- profile

export interface ProfileView {
  level: number;
  title: string;
  xp: number;
  into: number;
  span: number;
  streak: number;
  bestStreak: number;
  /** Today's daily challenge: its number, and the result if solved. */
  daily: { number: number; result: { moves: number; par: number } | null };
  achievements: { title: string; text: string; unlocked: boolean; progress?: [number, number] }[];
}

/** Left: level, XP and the daily streak. Right: every achievement, unlocked or with its progress. */
export function profileFigure(v: ProfileView): Figure {
  return {
    key: `profile:${JSON.stringify(v)}`,
    draw: (g, w, h) => {
      const got = v.achievements.filter((a) => a.unlocked).length;
      panel(g, w, h, 'Your progress', `${got} of ${v.achievements.length} achievements`);
      const x0 = 44;
      text(g, `Level ${v.level}`, x0, 150, INK, '700 64px');
      text(g, v.title, x0, 196, SOFT_BLUE, '600 30px');
      roundRect(g, x0, 226, 400, 18, 9);
      g.fillStyle = '#26272b';
      g.fill();
      roundRect(g, x0, 226, Math.max(18, (400 * v.into) / v.span), 18, 9);
      g.fillStyle = BLUE;
      g.fill();
      text(g, `${v.xp} XP   ${v.span - v.into} to level ${v.level + 1}`, x0, 276, DIM, '500 22px');
      text(g, 'Daily streak', x0, 346, DIM, '600 22px');
      text(g, `${v.streak} day${v.streak === 1 ? '' : 's'}`, x0, 392, INK, '700 40px');
      text(g, `best ${v.bestStreak}`, x0 + 230, 392, DIM, '500 22px');
      const d = v.daily;
      text(g, `Daily #${d.number}`, x0, 452, DIM, '600 22px');
      text(g, d.result ? `solved in ${d.result.moves} (par ${d.result.par})` : 'open: Puzzles, then Daily', x0, 488, d.result ? MINT : INK, '600 24px');
      // achievements grid
      const gx = 500, gy = 100, cols = 4, gap = 10;
      const tw = (w - gx - 40 - gap * (cols - 1)) / cols, rows = Math.ceil(v.achievements.length / cols);
      const th = Math.min(84, (h - gy - 40 - gap * (rows - 1)) / rows);
      v.achievements.forEach((a, i) => {
        const x = gx + (i % cols) * (tw + gap), y = gy + Math.floor(i / cols) * (th + gap);
        roundRect(g, x, y, tw, th, 14);
        g.fillStyle = a.unlocked ? 'rgba(61,220,151,0.14)' : '#232428';
        g.fill();
        if (a.unlocked) {
          g.lineWidth = 2;
          g.strokeStyle = 'rgba(61,220,151,0.55)';
          g.stroke();
          dot(g, x + tw - 22, y + 22, 9, MINT);
        }
        text(g, a.title, x + 14, y + 30, a.unlocked ? INK : '#b8bbc1', '700 20px');
        const line = wrap(g, a.text, '500 15px', tw - 28)[0] ?? '';
        text(g, line, x + 14, y + 54, DIM, '500 15px');
        if (!a.unlocked && a.progress) {
          const [have, need] = a.progress;
          roundRect(g, x + 14, y + th - 16, tw - 90, 6, 3);
          g.fillStyle = '#34363b';
          g.fill();
          if (have > 0) {
            roundRect(g, x + 14, y + th - 16, Math.max(6, ((tw - 90) * have) / need), 6, 3);
            g.fillStyle = SOFT_BLUE;
            g.fill();
          }
          text(g, `${have}/${need}`, x + tw - 14, y + th - 9, DIM, '600 15px', 'right');
        }
      });
    },
  };
}

// ---------------------------------------------------------------- three machines compared

export interface MachineResult {
  name: string;
  examples: string;
  counts: Uint32Array;
  agreement: number;
  time: string;
  twoQubit: number;
  overhead: string;
}

/** One column per machine: its shots against the ideal outlines, how close it came, and what it cost. */
export function compareFigure(n: number, ideal: ArrayLike<number>, results: MachineResult[]): Figure {
  return {
    key: `compare:${n}:${results.map((r) => `${r.name}:${r.agreement.toFixed(4)}`).join('|')}`,
    draw: (g, w, h) => {
      const shots = results[0] ? results[0].counts.reduce((a, b) => a + b, 0) : 0;
      panel(g, w, h, 'The same circuit on three kinds of quantum computer', `${shots} shots each`);
      const best = Math.max(...results.map((r) => r.agreement));
      const colW = (w - 88 - 2 * 24) / 3;
      const dim = 1 << n;
      results.forEach((r, i) => {
        const x = 44 + i * (colW + 24), y = 92;
        const top = r.agreement === best;
        roundRect(g, x, y, colW, h - y - 36, 22);
        g.fillStyle = top ? 'rgba(61,220,151,0.08)' : '#232428';
        g.fill();
        if (top) {
          g.lineWidth = 2;
          g.strokeStyle = 'rgba(61,220,151,0.6)';
          g.stroke();
        }
        text(g, r.name, x + 22, y + 44, INK, '700 28px');
        text(g, r.examples, x + 22, y + 74, DIM, '500 18px');
        // the outcomes: ideal as outlines, the machine's shots as bars
        const cx = x + 22, cy = y + 100, cw = colW - 44, ch = 170, bw = cw / dim;
        const tot = r.counts.reduce((a, b) => a + b, 0) || 1;
        const peak = Math.max(0.5, ...Array.from(ideal), ...Array.from(r.counts, (c) => c / tot));
        g.fillStyle = LINE;
        g.fillRect(cx, cy + ch, cw, 2);
        for (let k = 0; k < dim; k++) {
          const bx = cx + k * bw;
          const hm = ((r.counts[k] / tot) / peak) * ch;
          if (hm > 0.5) {
            g.fillStyle = SOFT_BLUE;
            g.fillRect(bx + bw * 0.18, cy + ch - hm, bw * 0.64, hm);
          }
          const hi = (ideal[k] / peak) * ch;
          if (hi > 0.5) {
            g.strokeStyle = INK;
            g.lineWidth = 2;
            g.strokeRect(bx + bw * 0.12, cy + ch - hi, bw * 0.76, hi);
          }
          if (dim <= 8) text(g, k.toString(2).padStart(n, '0'), bx + bw / 2, cy + ch + 24, DIM, '500 16px', 'center');
        }
        const ty = cy + ch + (dim <= 8 ? 70 : 50);
        text(g, `${(r.agreement * 100).toFixed(1)}%`, x + 22, ty, top ? MINT : INK, '700 44px');
        text(g, 'agree with the ideal', x + 22 + 150, ty - 6, DIM, '500 18px');
        text(g, `one shot: ${r.time}`, x + 22, ty + 40, INK, '600 20px');
        text(g, `${r.twoQubit} two-qubit gate${r.twoQubit === 1 ? '' : 's'}, ${r.overhead}`, x + 22, ty + 70, DIM, '500 18px');
      });
    },
  };
}

// ---------------------------------------------------------------- Quantum Rush

export interface RushView {
  /** The target and where the orbs are now, as amplitudes [re, im] per basis state. */
  target: { name: string; ket: string; par: number; tier: number; amps: [number, number][] };
  now: [number, number][];
  secondsLeft: number;
  score: number;
  solved: number;
  combo: number;
  /** The last solve, for a moment after it happens. */
  last: { points: number; combo: number } | null;
  /** The round is over: the summary. */
  over: { best: number; newBest: boolean; bestCombo: number; top: { score: number; day: string; current: boolean }[] } | null;
}

const phaseOf = (re: number, im: number) => `hsl(${Math.round((((Math.atan2(im, re) * 180) / Math.PI) + 360) % 360)}, 58%, 64%)`;

/** The Rush board: the target's amplitudes beside the orbs' own, the clock, the score and the combo. */
export function rushFigure(v: RushView): Figure {
  const secs = Math.ceil(v.secondsLeft);
  return {
    key: `rush:${secs}:${v.score}:${v.solved}:${v.combo}:${v.target.name}:${v.now.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(';')}:${v.last?.points ?? ''}:${v.over ? 'over' : ''}`,
    draw: (g, w, h) => {
      panel(g, w, h, v.over ? 'Quantum Rush  /  round over' : `Quantum Rush  /  target ${v.solved + 1}  /  par ${v.target.par}`, `Score ${v.score.toLocaleString('en-US')}`);
      if (v.over) {
        const cx = 520;
        text(g, `${v.score.toLocaleString('en-US')}`, cx, 250, INK, '700 120px', 'center');
        text(g, 'points', cx, 300, DIM, '600 30px', 'center');
        text(g, `${v.solved} target${v.solved === 1 ? '' : 's'} made   /   best combo x${v.over.bestCombo}`, cx, 390, INK, '600 30px', 'center');
        if (v.over.newBest) {
          roundRect(g, cx - 150, 430, 300, 60, 30);
          g.fillStyle = 'rgba(61,220,151,0.18)';
          g.fill();
          text(g, 'New best!', cx, 470, MINT, '700 32px', 'center');
        }
        // the leaderboard: your five best rounds
        text(g, 'Your best rounds', 1040, 140, DIM, '600 26px');
        v.over.top.forEach((t, i) => {
          const y = 200 + i * 62;
          roundRect(g, 1030, y - 40, 480, 52, 16);
          g.fillStyle = t.current ? 'rgba(61,220,151,0.16)' : '#232428';
          g.fill();
          text(g, `${i + 1}`, 1060, y - 4, t.current ? MINT : DIM, '700 28px', 'center');
          text(g, t.score.toLocaleString('en-US'), 1100, y - 4, t.current ? MINT : INK, '700 28px');
          text(g, t.day, 1490, y - 4, DIM, '500 22px', 'right');
        });
        text(g, 'Again plays another round. Faster solves score more; solving in a row multiplies.', w / 2, h - 50, DIM, '500 24px', 'center');
        return;
      }
      // the target, large
      text(g, v.target.name, 44, 128, INK, '700 40px');
      text(g, v.target.ket, 44, 180, SOFT_BLUE, '600 32px');
      // amplitude bars: target (solid) and the orbs now (outline), one pair per basis state
      const x0 = 60, base = 520, maxH = 270, colW = 230;
      text(g, 'target', x0, 236, DIM, '600 20px');
      text(g, 'your orbs', x0 + 70, 236, DIM, '600 20px');
      v.target.amps.forEach(([re, im], k) => {
        const x = x0 + k * colW;
        const ht = Math.hypot(re, im) * maxH;
        roundRect(g, x, base - ht, 70, Math.max(2, ht), 10);
        g.fillStyle = ht > 1 ? phaseOf(re, im) : LINE;
        g.fill();
        const [nr, ni] = v.now[k] ?? [0, 0];
        const hn = Math.hypot(nr, ni) * maxH;
        roundRect(g, x + 82, base - hn, 70, Math.max(2, hn), 10);
        g.lineWidth = 4;
        g.strokeStyle = hn > 1 ? phaseOf(nr, ni) : LINE;
        g.stroke();
        text(g, `|${k.toString(2).padStart(2, '0')}>`, x + 76, base + 42, INK, '600 28px', 'center');
      });
      text(g, 'Bar height: amplitude. Colour: phase. Match both.', x0, h - 40, DIM, '500 22px');
      // the clock
      const cx = 1330, cy = 330, r = 130;
      g.lineWidth = 18;
      g.strokeStyle = GRID;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
      const frac = Math.max(0, Math.min(1, v.secondsLeft / 60));
      g.strokeStyle = v.secondsLeft <= 10 ? CORAL : BLUE;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      g.stroke();
      g.lineCap = 'butt';
      text(g, `${secs}`, cx, cy + 30, INK, '700 92px', 'center');
      text(g, 'seconds', cx, cy + 70, DIM, '600 22px', 'center');
      // combo and solved
      roundRect(g, cx - 110, cy + r + 34, 220, 56, 28);
      g.fillStyle = v.combo > 1 ? 'rgba(61,220,151,0.18)' : '#26272b';
      g.fill();
      text(g, v.combo > 1 ? `combo x${v.combo}` : 'no combo', cx, cy + r + 72, v.combo > 1 ? MINT : DIM, '700 28px', 'center');
      text(g, `${v.solved} made`, cx - r - 90, cy - r + 10, DIM, '600 24px', 'center');
      if (v.last) text(g, `+${v.last.points}`, cx + r + 70, cy - r + 10, MINT, '700 34px', 'center');
    },
  };
}

// ---------------------------------------------------------------- the surface code

/** The Surface Code chapter's state, shared by the board, the 3D lattice and the chapter. */
export interface SurfaceView {
  d: number;
  p: number;
  round: import('../quantum/surface').SurfaceRound | null;
  /** Goes up with every new round (the lattice replays its animation). */
  id: number;
  /** The decoder's fix is shown for this round. */
  decoded: boolean;
  /** Cycling by itself. */
  auto: boolean;
  timer: number;
  cycles: number;
  /** Errors corrected, and corrections that went wrong (logical errors), so far. */
  fixed: number;
  logical: number;
  /** The threshold plot, and how much of it has been drawn (0..1). */
  curve: { d: number; points: [number, number][] }[] | null;
  curveT: number;
}

const D_COLOR: Record<number, string> = { 3: DIM, 5: SOFT_BLUE, 7: INK };

/** The board for the Surface Code chapter: what the lattice shows, the counters, and the threshold plot. */
export function surfaceFigure(v: SurfaceView): Figure {
  const data = v.d * v.d;
  return {
    key: `surface:${v.d}:${v.id}:${v.decoded}:${v.cycles}:${v.fixed}:${v.logical}:${v.p}:${v.curve ? Math.round(v.curveT * 40) : -1}`,
    draw: (g, w, h) => {
      panel(g, w, h, `Surface code  /  distance ${v.d}: ${data} data qubits + ${data - 1} measure qubits = ${2 * data - 1}`, `error rate ${Math.round(v.p * 100)}%`);
      // legend
      const items: [string, string, string][] = [
        ['#d5d9e0', 'data qubit', 'holds a share of the one logical qubit'],
        ['#ff5a4f', 'bit flip', 'an X error from noise'],
        ['#9b87f5', 'phase flip', 'a Z error from noise'],
        [BLUE, 'lit check', 'a measure qubit saw odd parity'],
        [MINT, 'correction', 'the decoder\'s shortest fix'],
      ];
      items.forEach(([c, name, what], i) => {
        const y = 124 + i * 50;
        dot(g, 60, y - 8, 12, c);
        text(g, name, 86, y, INK, '600 24px');
        text(g, what, 250, y, DIM, '500 22px');
      });
      // counters
      const cy = 400;
      const stat = (x: number, value: string, label: string, color = INK) => {
        text(g, value, x, cy, color, '700 52px');
        text(g, label, x, cy + 34, DIM, '500 22px');
      };
      stat(60, `${v.cycles}`, 'cycles');
      stat(230, `${v.fixed}`, 'errors fixed', MINT);
      stat(450, `${v.logical}`, 'logical errors', v.logical ? CORAL : INK);
      text(g, v.auto ? 'Running: a new cycle every three seconds (slowed down a million times).' : v.round && !v.decoded ? 'Waiting for the decoder.' : '', 60, h - 44, DIM, '500 22px');
      // the threshold plot, drawn in as it arrives
      if (!v.curve) {
        const lines = [
          'Every few microseconds each measure qubit checks the parity of its',
          'neighbours. An error lights the checks around it; the decoder pairs',
          'the lit checks along the shortest paths and flips those qubits back.',
          'It fails only when the real errors and its guess together stretch',
          'right across the grid: then the logical qubit flips.',
        ];
        lines.forEach((l, i) => text(g, l, 820, 150 + i * 40, INK, '500 25px'));
        return;
      }
      const a = axes(g, 880, 110, 620, 380, [0, 0.15], [0, 0.3], [0, 0.03, 0.06, 0.09, 0.12, 0.15], [0, 0.1, 0.2, 0.3], 'physical error rate p', 'logical error rate', (n) => `${Math.round(n * 100)}%`);
      polyline(g, a, [[0, 0], [0.15, 0.15]], LINE, 2, [8, 8]);
      for (const c of v.curve) {
        const shown = c.points.slice(0, Math.max(1, Math.ceil(c.points.length * v.curveT)));
        polyline(g, a, shown, D_COLOR[c.d] ?? INK, 4);
        for (const [p, f] of shown) dot(g, a.sx(p), a.sy(f), 6, D_COLOR[c.d] ?? INK);
        const [lp, lf] = shown[shown.length - 1];
        text(g, `d = ${c.d}`, a.sx(lp) + 12, a.sy(lf) + 8, D_COLOR[c.d] ?? INK, '700 22px');
      }
      if (v.curveT >= 1) {
        g.strokeStyle = LINE;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(a.sx(0.095), a.y0);
        g.lineTo(a.sx(0.095), a.y0 + a.h);
        g.stroke();
        text(g, 'threshold', a.sx(0.095) - 8, a.y0 + 26, DIM, '600 20px', 'right');
        text(g, 'bigger is better', a.sx(0.045), a.y0 + a.h - 30, MINT, '600 20px', 'center');
      }
    },
  };
}
