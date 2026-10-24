import qrcode from 'qrcode-generator';

/**
 * A picture of the circuit to share: the circuit board as it is right now, a
 * title, and a QR code of the link that opens the same circuit.
 */

export interface SnapshotInfo {
  title: string;
  subtitle: string;
  link: string;
  date: Date;
}

export function drawSnapshot(g: CanvasRenderingContext2D, board: CanvasImageSource, info: SnapshotInfo): void {
  const W = 1600, H = 1000;
  g.fillStyle = '#18191b';
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.fillStyle = '#8a8d93';
  g.font = '600 26px Inter, system-ui, sans-serif';
  g.fillText('ENTANGLED  /  HANDS-ON QUANTUM COMPUTING', 60, 80);
  g.fillStyle = '#e4e6eb';
  g.font = '700 54px Inter, system-ui, sans-serif';
  g.fillText(info.title, 60, 148);
  g.fillStyle = '#b8bbc1';
  g.font = '500 28px Inter, system-ui, sans-serif';
  g.fillText(info.subtitle, 60, 194);
  g.drawImage(board, 60, 214, 1480, 592);
  // the link as a QR code, bottom right
  const qr = qrcode(0, 'M');
  qr.addData(info.link);
  qr.make();
  const cells = qr.getModuleCount(), size = 132, cell = size / cells, qx = W - 60 - size, qy = H - 40 - size;
  g.fillStyle = '#ffffff';
  g.fillRect(qx - 8, qy - 8, size + 16, size + 16);
  g.fillStyle = '#000000';
  for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) if (qr.isDark(r, c)) g.fillRect(qx + c * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
  g.textAlign = 'right';
  g.fillStyle = '#e4e6eb';
  g.font = '600 26px Inter, system-ui, sans-serif';
  g.fillText('Scan to open this circuit', qx - 28, qy + 60);
  g.fillStyle = '#8a8d93';
  g.font = '500 22px Inter, system-ui, sans-serif';
  g.fillText(info.date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), qx - 28, qy + 98);
}

/** Save the picture as a PNG. */
export function downloadSnapshot(board: CanvasImageSource, info: SnapshotInfo): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1000;
  drawSnapshot(canvas.getContext('2d')!, board, info);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'entangled-circuit.png';
  a.click();
}
