import { BoxGeometry, CanvasTexture, Color, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from '@iwsdk/core';

const TICKS = 60;
const RADIUS = 0.21;
const LIVE = new Color('#e4e6eb');
const LATE = new Color('#ff8a7a');
const GONE = new Color('#34363b');
const MINT = '#3ddc97';

/** Text on a transparent canvas: a big line and a small one under it. */
function popTexture(big: string, small: string, color: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 120px Inter, system-ui, sans-serif';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(20,21,23,0.85)';
  g.strokeText(big, 256, 100);
  g.fillStyle = color;
  g.fillText(big, 256, 100);
  if (small) {
    g.font = '700 52px Inter, system-ui, sans-serif';
    g.strokeText(small, 256, 200);
    g.fillStyle = '#e4e6eb';
    g.fillText(small, 256, 200);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Quantum Rush on the desk: a ring of sixty ticks around the orbs, one per
 * second, that go out as the clock runs down (the last ten in coral), and
 * score pop-ups that rise out of the orbs when a target is made.
 */
export class RushFx {
  readonly root = new Group();
  private readonly ticks: InstancedMesh;
  private pops: { sprite: Sprite; mat: SpriteMaterial; t: number }[] = [];
  private shown = -1;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3(1, 1, 1);

  constructor() {
    this.root.name = 'RushFx';
    this.ticks = new InstancedMesh(new BoxGeometry(0.004, 0.002, 0.018), new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), TICKS);
    for (let i = 0; i < TICKS; i++) {
      // clockwise from the far side, like a watch face lying on the desk
      const a = Math.PI - (i / TICKS) * Math.PI * 2;
      this.v.set(Math.sin(a) * RADIUS, 0, Math.cos(a) * RADIUS);
      this.q.setFromAxisAngle(new Vector3(0, 1, 0), a);
      this.m.compose(this.v, this.q, this.s);
      this.ticks.setMatrixAt(i, this.m);
      this.ticks.setColorAt(i, LIVE);
    }
    this.ticks.frustumCulled = false;
    this.root.add(this.ticks);
    this.root.visible = false;
  }

  /** Show the clock (seconds left, out of 60), or hide it (null). */
  clock(secondsLeft: number | null): void {
    this.root.visible = secondsLeft !== null || this.pops.length > 0;
    this.ticks.visible = secondsLeft !== null;
    if (secondsLeft === null) return;
    const lit = Math.max(0, Math.min(TICKS, Math.ceil(secondsLeft)));
    if (lit === this.shown) return;
    this.shown = lit;
    for (let i = 0; i < TICKS; i++) this.ticks.setColorAt(i, i >= lit ? GONE : lit <= 10 ? LATE : LIVE);
    if (this.ticks.instanceColor) this.ticks.instanceColor.needsUpdate = true;
  }

  /** "+240" rising out of the orbs, with a smaller line under it. */
  pop(big: string, small = '', color = MINT): void {
    const mat = new SpriteMaterial({ map: popTexture(big, small, color), transparent: true, depthWrite: false, depthTest: false });
    const sprite = new Sprite(mat);
    sprite.scale.set(0.16, 0.08, 1);
    sprite.position.set(0, 0.24, 0);
    sprite.renderOrder = 10;
    this.root.add(sprite);
    this.pops.push({ sprite, mat, t: 0 });
    this.root.visible = true;
  }

  update(dt: number): void {
    for (const p of this.pops) {
      p.t += dt;
      const u = p.t / 1.3;
      p.sprite.position.y = 0.24 + 0.09 * (1 - (1 - Math.min(1, u)) ** 2);
      p.mat.opacity = u < 0.7 ? 1 : Math.max(0, 1 - (u - 0.7) / 0.3);
      const pop = Math.min(1, p.t / 0.12);
      p.sprite.scale.set(0.16 * (0.6 + 0.4 * pop), 0.08 * (0.6 + 0.4 * pop), 1);
    }
    for (const p of this.pops.filter((x) => x.t >= 1.3)) {
      this.root.remove(p.sprite);
      p.mat.map?.dispose();
      p.mat.dispose();
    }
    this.pops = this.pops.filter((x) => x.t < 1.3);
    if (!this.pops.length && !this.ticks.visible) this.root.visible = false;
  }
}
