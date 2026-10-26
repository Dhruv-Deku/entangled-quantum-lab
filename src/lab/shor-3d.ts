import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from '@iwsdk/core';
import { LabelCard } from './machine-kit';

const N = 15;
const A = 7;
const X = 16;
const PHASE_SECONDS = 3.4;
const MAX_H = 0.13;
const PALETTE = ['#8fb7ff', '#3ddc97', '#ff8a7a', '#9b87f5'];

const powmod = (a: number, e: number, m: number) => {
  let r = 1;
  for (let k = 0; k < e; k++) r = (r * a) % m;
  return r;
};
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** The five pictures of the period finding, as bar heights (0..1) and colours, worked out for real. */
export function shorStages(): { title: string; sub: string; heights: number[]; colors: string[] }[] {
  const f = Array.from({ length: X }, (_, x) => powmod(A, x, N));
  const values = [...new Set(f)];
  const colorOf = (v: number) => PALETTE[values.indexOf(v) % PALETTE.length];
  // measure f(x): it lands on one value; the x register keeps only the x that give it
  const f0 = f[2];
  const comb = f.map((v) => (v === f0 ? 1 : 0));
  // QFT of that comb: |sum over kept x of e^(2 pi i x y / 16)|^2, normalised
  const kept = comb.map((c, x) => (c ? x : -1)).filter((x) => x >= 0);
  const spectrum = Array.from({ length: X }, (_, y) => {
    let re = 0, im = 0;
    for (const x of kept) {
      re += Math.cos((2 * Math.PI * x * y) / X);
      im += Math.sin((2 * Math.PI * x * y) / X);
    }
    return (re * re + im * im) / (kept.length * X);
  });
  const peak = Math.max(...spectrum);
  let r = 1;
  while (powmod(A, r, N) !== 1) r++;
  const half = powmod(A, r / 2, N);
  const p = gcd(half - 1, N), q = gcd(half + 1, N);
  const peaks = spectrum.map((s, y) => (s > 1e-9 ? y : -1)).filter((y) => y >= 0);
  return [
    { title: 'x = 0 to 15, all at once', sub: 'four qubits in superposition', heights: Array(X).fill(0.25), colors: Array(X).fill('#55585e') },
    { title: `f(x) = ${A}^x mod ${N}`, sub: `${f.slice(0, 8).join(', ')} ... repeats: that period is the secret`, heights: f.map((v) => v / 13), colors: f.map(colorOf) },
    { title: `Measure f: it reads ${f0}`, sub: `only x = ${kept.join(', ')} are left: a comb`, heights: comb.map((c) => c * 0.5), colors: f.map(colorOf) },
    { title: 'Quantum Fourier transform', sub: `the comb becomes spikes at ${peaks.join(', ')}: every 16 / ${r}`, heights: spectrum.map((s) => s / peak), colors: Array(X).fill('#3ddc97') },
    { title: `${N} = ${p} x ${q}`, sub: `period ${r}: gcd(${A}^${r / 2} - 1, ${N}) = ${p}, gcd(${A}^${r / 2} + 1, ${N}) = ${q}`, heights: spectrum.map((s) => s / peak), colors: Array(X).fill('#3ddc97') },
  ];
}

/**
 * Shor's algorithm in 3D, factoring 15: a row of sixteen bars, one per value
 * of the input register. First even (superposition), then the function's
 * values with their repeating pattern, then the comb left after measuring the
 * function, then the quantum Fourier transform turning the comb into spikes
 * spaced by 16 over the period, and finally the factors. Plays on a loop.
 */
export class ShorVisual {
  readonly root = new Group();
  private bars: { mesh: Mesh; mat: MeshStandardMaterial; h: number }[] = [];
  private readonly card = new LabelCard(0.36, '', '');
  private readonly stages = shorStages();
  private t = 0;
  private stage = -1;

  constructor() {
    this.root.name = 'Shor';
    for (let x = 0; x < X; x++) {
      const mat = new MeshStandardMaterial({ color: '#55585e', emissive: '#55585e', emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.2 });
      const mesh = new Mesh(new BoxGeometry(0.026, 1, 0.026), mat);
      mesh.position.set((x - (X - 1) / 2) * 0.036, 0, 0);
      this.root.add(mesh);
      this.bars.push({ mesh, mat, h: 0.01 });
      const n = new LabelCard(0.035, `${x}`, '');
      n.mesh.position.set(mesh.position.x, -0.016, 0.016);
      this.root.add(n.mesh);
    }
    this.card.mesh.position.set(0, MAX_H + 0.045, 0);
    this.root.add(this.card.mesh);
    this.root.visible = false;
  }

  /** Start from the first picture. */
  restart(): void {
    this.t = 0;
    this.stage = -1;
  }

  update(dt: number): void {
    this.t += dt;
    const s = Math.floor(this.t / PHASE_SECONDS) % this.stages.length;
    const st = this.stages[s];
    if (s !== this.stage) {
      this.stage = s;
      this.card.set(st.title, st.sub);
    }
    const k = 1 - Math.exp(-dt * 4);
    this.bars.forEach((b, x) => {
      b.h += (Math.max(0.004, st.heights[x] * MAX_H) - b.h) * k;
      b.mesh.scale.y = b.h;
      b.mesh.position.y = b.h / 2;
      const c = new Color(st.colors[x]);
      b.mat.color.lerp(c, k);
      b.mat.emissive.lerp(c, k);
    });
  }
}
