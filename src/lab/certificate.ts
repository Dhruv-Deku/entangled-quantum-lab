/**
 * The completion certificate: drawn on the circuit board in the headset, and
 * as a PNG to download on the 2D page. Paper, ink and one gold line (gold is
 * entanglement everywhere in the app; here it ties the pair in the seal).
 */

export interface CertificateInfo {
  name: string;
  modules: string[];
  /** "Class C7QF2, teacher Tia", or the whole course on one's own */
  context: string;
  date: Date;
}

const PAPER = '#f4f1ea';
const INK = '#1d1e21';
const MUTED = '#6b6e75';
const GOLD = '#c99a3a';

export function drawCertificate(g: CanvasRenderingContext2D, w: number, h: number, c: CertificateInfo): void {
  const u = Math.min(w / 1600, h / 1000);
  const font = (weight: number, px: number) => `${weight} ${Math.round(px * u)}px Inter, system-ui, sans-serif`;
  g.save();
  g.clearRect(0, 0, w, h);
  g.fillStyle = PAPER;
  round(g, 4, 4, w - 8, h - 8, 36 * u);
  g.fill();
  g.strokeStyle = GOLD;
  g.lineWidth = 3 * u;
  round(g, 30 * u, 30 * u, w - 60 * u, h - 60 * u, 24 * u);
  g.stroke();
  const cx = w / 2;
  const top = h * 0.16;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = MUTED;
  g.font = font(600, 30);
  g.fillText('ENTANGLED  /  HANDS-ON QUANTUM COMPUTING', cx, top);
  g.fillStyle = INK;
  g.font = font(700, 62);
  g.fillText('Certificate of completion', cx, top + 90 * u);
  g.fillStyle = MUTED;
  g.font = font(500, 30);
  g.fillText('This certifies that', cx, top + 160 * u);
  g.fillStyle = INK;
  g.font = font(700, 80);
  g.fillText(c.name || 'A student', cx, top + 250 * u);
  g.fillStyle = MUTED;
  g.font = font(500, 30);
  g.fillText(c.modules.length === 1 ? 'has completed the module' : `has completed ${c.modules.length} modules`, cx, top + 318 * u);
  // the modules, wrapped onto as many lines as they need
  g.fillStyle = INK;
  g.font = font(600, 32);
  const lines: string[] = [];
  let cur = '';
  for (const m of c.modules) {
    const next = cur ? `${cur}   /   ${m}` : m;
    if (cur && g.measureText(next).width > w * 0.78) {
      lines.push(cur);
      cur = m;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, Math.max(1, Math.floor((h - top - 520 * u) / (46 * u))));
  shown.forEach((l, i) => g.fillText(l, cx, top + 376 * u + i * 46 * u));
  // footer: context and date on the left, the seal on the right
  const fy = h - 90 * u;
  g.textAlign = 'left';
  g.fillStyle = MUTED;
  g.font = font(500, 26);
  g.fillText(c.context, 90 * u, fy);
  g.fillText(c.date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), 90 * u, fy - 40 * u);
  // seal: two qubits joined by the gold thread
  const sx = w - 190 * u, sy = fy - 30 * u, r = 22 * u;
  g.strokeStyle = GOLD;
  g.lineWidth = 5 * u;
  g.beginPath();
  g.moveTo(sx - 50 * u, sy);
  g.quadraticCurveTo(sx, sy - 40 * u, sx + 50 * u, sy);
  g.stroke();
  for (const dx of [-50, 50]) {
    g.beginPath();
    g.arc(sx + dx * u, sy, r, 0, Math.PI * 2);
    g.fillStyle = PAPER;
    g.fill();
    g.lineWidth = 3 * u;
    g.strokeStyle = INK;
    g.stroke();
  }
  g.restore();
}

/** Save the certificate as a PNG. */
export function downloadCertificate(c: CertificateInfo): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1000;
  drawCertificate(canvas.getContext('2d')!, canvas.width, canvas.height, c);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `entangled-certificate-${(c.name || 'student').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  a.click();
}

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
