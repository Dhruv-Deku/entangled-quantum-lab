import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

/**
 * A banner that pops up above the gate dock for a moment: an achievement, or
 * the daily challenge solved. Dark card, one mint dot, title and a line of
 * text; it fades in, stays about three seconds and fades out. Several wait
 * their turn.
 */

const W = 1024;
const H = 176;
const SHOW = 3.6;

export class Banner {
  readonly root: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private readonly mat: MeshBasicMaterial;
  private queue: { eyebrow: string; title: string; text: string }[] = [];
  private t = -1;

  constructor(width = 0.3) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0 });
    this.root = new Mesh(new PlaneGeometry(width, (width * H) / W), this.mat);
    this.root.visible = false;
    this.root.renderOrder = 10;
  }

  show(eyebrow: string, title: string, text: string): void {
    this.queue.push({ eyebrow, title, text });
    if (this.t < 0) this.next();
  }

  get busy(): boolean {
    return this.t >= 0;
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) {
      this.t = -1;
      this.root.visible = false;
      return;
    }
    this.draw(item.eyebrow, item.title, item.text);
    this.t = 0;
    this.root.visible = true;
  }

  private draw(eyebrow: string, title: string, text: string): void {
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    const r = 40;
    g.beginPath();
    g.moveTo(r + 4, 4);
    g.arcTo(W - 4, 4, W - 4, H - 4, r);
    g.arcTo(W - 4, H - 4, 4, H - 4, r);
    g.arcTo(4, H - 4, 4, 4, r);
    g.arcTo(4, 4, W - 4, 4, r);
    g.closePath();
    g.fillStyle = 'rgba(27,28,31,0.96)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(61,220,151,0.6)';
    g.stroke();
    g.beginPath();
    g.arc(88, H / 2, 30, 0, Math.PI * 2);
    g.fillStyle = '#3ddc97';
    g.fill();
    // a check mark in the dot
    g.strokeStyle = '#10261c';
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(74, H / 2 + 1);
    g.lineTo(85, H / 2 + 12);
    g.lineTo(104, H / 2 - 10);
    g.stroke();
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#8a8d93';
    g.font = '600 26px Inter, system-ui, sans-serif';
    g.fillText(eyebrow.toUpperCase(), 150, 56);
    g.fillStyle = '#e4e6eb';
    g.font = '700 46px Inter, system-ui, sans-serif';
    g.fillText(title, 150, 106);
    g.fillStyle = '#b8bbc1';
    g.font = '500 28px Inter, system-ui, sans-serif';
    let line = text;
    while (g.measureText(line).width > W - 190 && line.length > 4) line = `${line.slice(0, -2).trimEnd()}…`;
    g.fillText(line, 150, 146);
    this.tex.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const fadeIn = Math.min(1, this.t / 0.25), fadeOut = Math.min(1, (SHOW - this.t) / 0.5);
    this.mat.opacity = Math.max(0, Math.min(fadeIn, fadeOut));
    this.root.scale.setScalar(0.94 + 0.06 * fadeIn);
    if (this.t >= SHOW) this.next();
  }
}
