import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';
import type { Cue } from './feedback';

/** What each sound cue means, for people who cannot hear it. */
export const CUE_CAPTIONS: Record<Cue, string | null> = {
  gate: 'Chime: a gate turned the qubit',
  measure: 'Click: measured',
  entangle: 'Chord: entangled',
  shots: 'Rattle: shots fired',
  success: 'Fanfare: done',
  select: null,
  reject: 'Buzz: not allowed',
  storm: 'Thunder: an error struck',
};

/**
 * Sound captions: a small strip at the front of the desk, low in the view,
 * that names each sound as it plays (and the words being read aloud). It
 * fades after a few seconds.
 */
export class CaptionStrip {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private readonly mat: MeshBasicMaterial;
  private life = 0;
  private shown = '';

  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 112;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false });
    this.mesh = new Mesh(new PlaneGeometry(0.34, 0.034 * (112 / 96)), this.mat);
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
  }

  show(text: string, seconds = 2.6): void {
    this.life = seconds;
    this.mesh.visible = true;
    if (text === this.shown) return;
    this.shown = text;
    const g = this.canvas.getContext('2d')!;
    const W = 1024, H = 112;
    g.clearRect(0, 0, W, H);
    let size = 46;
    g.font = `600 ${size}px Inter, system-ui, sans-serif`;
    while (size > 24 && g.measureText(text).width > W - 80) g.font = `600 ${(size -= 2)}px Inter, system-ui, sans-serif`;
    const w = Math.min(W - 8, g.measureText(text).width + 64);
    g.fillStyle = 'rgba(0,0,0,0.86)';
    g.beginPath();
    g.roundRect((W - w) / 2, 6, w, H - 12, 40);
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 2);
    this.tex.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.life <= 0) return;
    this.life -= dt;
    this.mat.opacity = Math.min(1, this.life / 0.4);
    if (this.life <= 0) this.mesh.visible = false;
  }
}
