import type { UIKitMLAsset } from '@iwsdk/core';
import { qubitColor } from '../lab/visuals';
import type { BuildSession } from './build-session';
import { ALL_TOOLS, BUILD_COLS, BUILD_ROWS, parOf, TOOLS, type Tool } from './builder';
import { starsFor } from './puzzles';

type El = ReturnType<UIKitMLAsset['requireElementById']>;

const GOLD = '#e2b04a';
const WIRE = '#4a4c52';
const GRID_BG = '#1d1e21';
const PANEL = '#242528';
const CONTROLS = new Set<Tool>(['ctrl', 'anti']);

/**
 * Style one glyph (a palette tile or a grid cell). The outer box is the wire
 * running through the cell; dots, rings, crosses and swap marks are drawn by
 * the inner box sitting on that wire, so the wire never breaks. Gate boxes
 * replace the wire with a bordered square.
 */
function styleGlyph(g: El | undefined, label: El | undefined, tool: Tool | null, row: number, controlled: boolean): void {
  if (!g || !label) return;
  const wire = () => g.setProperties({ width: 26, height: 2, borderRadius: 0, backgroundColor: WIRE, borderWidth: 0 });
  const mark = (w: number, radius: number, bg: string, border: number, text = ' ', color = GOLD, fontSize = 1) =>
    label.setProperties({ width: w, height: w, borderRadius: radius, backgroundColor: bg, borderWidth: border, borderColor: GOLD, text, color, fontSize });
  switch (tool) {
    case null:
      wire();
      mark(1, 0, 'rgba(0,0,0,0)', 0);
      return;
    case 'ctrl':
      wire();
      mark(11, 5.5, GOLD, 0);
      return;
    case 'anti':
      wire();
      mark(12, 6, PANEL, 2);
      return;
    case 'target':
      wire();
      mark(22, 11, PANEL, 2, '+', GOLD, 16);
      return;
    case 'swap':
      wire();
      mark(20, 4, GRID_BG, 0, 'x', GOLD, 18);
      return;
    default: {
      const text = TOOLS[tool].label;
      g.setProperties({ width: 26, height: 26, borderRadius: 6, backgroundColor: '#2d2f33', borderWidth: 2, borderColor: controlled ? GOLD : row >= 0 ? qubitColor(row) : '#8a8d93' });
      label.setProperties({
        width: 22, height: 22, borderRadius: 0, backgroundColor: 'rgba(0,0,0,0)', borderWidth: 0,
        text, color: '#e4e6eb', fontSize: text.length > 2 ? 8 : text.length > 1 ? 10 : 12,
      });
    }
  }
}

/**
 * The Build tab's panel: tool palette, info line, the cross-dot grid and a
 * status line. Mirrors a BuildSession; taps call back into it.
 */
export class BuilderPanel {
  private els = new Map<string, El>();

  constructor(readonly asset: UIKitMLAsset, private session: BuildSession, onEdit: () => void) {
    const ids = ['b-title', 'b-clear', 'b-info', 'b-status'];
    for (const t of ALL_TOOLS) ids.push(`p-${t}`, `p-${t}-g`, `p-${t}-gl`);
    for (let r = 0; r < BUILD_ROWS; r++) {
      ids.push(`b-row-${r}`);
      for (let c = 0; c < BUILD_COLS; c++) for (const s of ['', '-t', '-g', '-gl', '-b']) ids.push(`c-${c}-${r}${s}`);
    }
    for (const id of ids) {
      const el = asset.requireElementById(id);
      el.name = id;
      this.els.set(id, el);
    }
    const on = (id: string, fn: () => void) => this.els.get(id)!.addEventListener('click', () => {
      fn();
      onEdit();
    });
    on('b-clear', () => this.session.clear());
    for (const t of ALL_TOOLS) on(`p-${t}`, () => this.session.selectTool(t));
    for (let r = 0; r < BUILD_ROWS; r++) for (let c = 0; c < BUILD_COLS; c++) on(`c-${c}-${r}`, () => this.session.place(c, r));
    // palette glyphs never change shape, only their tile
    for (const t of ALL_TOOLS) styleGlyph(this.els.get(`p-${t}-g`), this.els.get(`p-${t}-gl`), t, -1, false);
  }

  render(showCursor: boolean): void {
    const s = this.session;
    const ch = s.challenge;
    const n = ch.qubits;
    const par = parOf(ch);
    this.text('b-title', ch.target ? `${s.index}. ${ch.title}   (par ${par})` : ch.title);
    for (const t of ALL_TOOLS) {
      const allowed = ch.tools.includes(t);
      this.els.get(`p-${t}`)?.setProperties({ display: allowed ? 'flex' : 'none', backgroundColor: t === s.tool ? '#2d7ff9' : '#2d2f33' });
    }
    const info = TOOLS[s.tool];
    this.text('b-info', `${info.isNew ? 'New: ' : ''}${info.about}`);

    for (let r = 0; r < BUILD_ROWS; r++) this.els.get(`b-row-${r}`)?.setProperties({ display: r < n ? 'flex' : 'none' });
    for (let c = 0; c < BUILD_COLS; c++) {
      const col = s.cells[c];
      // a column with dots and a gate, or two swap marks, is one multi-qubit gate: link its cells
      const hasCtrl = col.some((v) => v && CONTROLS.has(v));
      const swaps = col.filter((v) => v === 'swap').length;
      const gates = col.some((v) => v && !CONTROLS.has(v) && v !== 'swap');
      const linked = (hasCtrl && (gates || swaps === 2)) || swaps === 2;
      const involved = col.flatMap((v, r) => (v ? [r] : []));
      const lo = linked ? Math.min(...involved) : -1, hi = linked ? Math.max(...involved) : -1;
      for (let r = 0; r < n; r++) {
        const k = `c-${c}-${r}`;
        const v = col[r];
        styleGlyph(this.els.get(`${k}-g`), this.els.get(`${k}-gl`), v, r, linked && hasCtrl);
        this.els.get(`${k}-t`)?.setProperties({ backgroundColor: linked && r > lo && r <= hi ? GOLD : GRID_BG });
        this.els.get(`${k}-b`)?.setProperties({ backgroundColor: linked && r >= lo && r < hi ? GOLD : GRID_BG });
        const cursor = showCursor && s.cursor.col === c && s.cursor.row === r;
        this.els.get(k)?.setProperties({ backgroundColor: cursor ? '#2a3550' : GRID_BG });
      }
    }

    const r = s.result;
    const [msg, color] =
      r.status === 'free'
        ? [`${s.cells.filter((c) => c.some(Boolean)).length} steps. The orbs, the board and the timeline follow the grid.`, '#8a8d93']
        : r.status === 'empty'
          ? ['Empty. Tap a tool, then a cell.', '#8a8d93']
          : r.status === 'error'
            ? [r.message, '#ff8a7a']
            : r.status === 'wrong'
              ? ['Not yet: some inputs still come out different.', '#c9ccd1']
              : [`Solved in ${r.columns} steps, par ${r.par}: ${starsFor(r.columns, r.par)} of 3 stars.`, '#3ddc97'];
    this.els.get('b-status')?.setProperties({ text: msg, color });
  }

  private text(id: string, text: string): void {
    this.els.get(id)?.setProperties({ text });
  }
}
