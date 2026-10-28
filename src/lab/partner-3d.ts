import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, Line, LineDashedMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3 } from '@iwsdk/core';

const W = 1024;
const H = 300;
const BUBBLE_W = 0.3;
const BLUE = '#8fb7ff';

/**
 * Ket's body beside the desk: a small pearl with a thin ring around it, like
 * an electron's orbit, bobbing gently. When it speaks, the ring spins up, a
 * card with its words turns to face you, and a dashed line points at the orb
 * it is talking about.
 */
export class PartnerVisual {
  readonly root = new Group();
  private readonly body: Mesh;
  private readonly ring: Mesh;
  private readonly ringMat: MeshBasicMaterial;
  private readonly bubble: Mesh;
  private readonly bubbleMat: MeshBasicMaterial;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private readonly pointer: Line;
  private readonly pointerMat: LineDashedMaterial;
  private readonly pts = new Float32Array(6);
  private life = 0;
  private talk = 0;
  private t = 0;
  private target: Vector3 | null = null;
  private readonly tmp = new Vector3();
  private readonly home = new Vector3();
  /** How far the card's empty lower part reaches below its words (metres). */
  private cardLift = 0;

  constructor() {
    this.root.name = 'Ket';
    this.body = new Mesh(new SphereGeometry(0.014, 24, 16), new MeshStandardMaterial({ color: '#f2f4f8', roughness: 0.25, metalness: 0.05, emissive: new Color('#6f8fc8'), emissiveIntensity: 0.25 }));
    this.root.add(this.body);
    this.ringMat = new MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.75, toneMapped: false });
    this.ring = new Mesh(new TorusGeometry(0.024, 0.0012, 6, 48), this.ringMat);
    this.ring.rotation.x = 1.2;
    this.root.add(this.ring);
    this.canvas.width = W;
    this.canvas.height = H;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.bubbleMat = new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false });
    this.bubble = new Mesh(new PlaneGeometry(BUBBLE_W, BUBBLE_W * (H / W)), this.bubbleMat);
    this.bubble.visible = false;
    this.bubble.renderOrder = 10;
    this.root.add(this.bubble);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(this.pts, 3));
    this.pointerMat = new LineDashedMaterial({ color: BLUE, dashSize: 0.008, gapSize: 0.006, transparent: true, opacity: 0.8 });
    this.pointer = new Line(geo, this.pointerMat);
    this.pointer.frustumCulled = false;
    this.pointer.visible = false;
  }

  /** The pointer lives in the world (it spans from Ket to an orb). */
  get pointerLine(): Line {
    return this.pointer;
  }

  /** Where Ket floats (workspace coordinates). */
  setHome(p: Vector3): void {
    this.home.copy(p);
  }

  /** Say something; `at` is the world point it is about (an orb), if any. */
  say(text: string, at: Vector3 | null): void {
    this.draw(text);
    this.life = Math.min(16, 6 + text.length * 0.07);
    this.talk = 1;
    this.target = at ? at.clone() : null;
    this.bubble.visible = true;
  }

  hush(): void {
    this.life = 0;
  }

  get speaking(): boolean {
    return this.life > 0;
  }

  private draw(text: string): void {
    const g = this.canvas.getContext('2d')!;
    // wrap the words into at most four lines, shrinking the type if needed
    let size = 40;
    let lines: string[] = [];
    for (; size >= 26; size -= 2) {
      g.font = `600 ${size}px Inter, system-ui, sans-serif`;
      lines = [];
      let line = '';
      for (const word of text.split(' ')) {
        const tryLine = line ? `${line} ${word}` : word;
        if (g.measureText(tryLine).width > W - 80 && line) {
          lines.push(line);
          line = word;
        } else line = tryLine;
      }
      if (line) lines.push(line);
      if (lines.length * size * 1.3 <= H - 90) break;
    }
    lines = lines.slice(0, 5);
    // the card is as tall as its words, hanging down from the top (the rest stays clear)
    const cardH = Math.min(H - 8, 84 + lines.length * size * 1.3);
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(27,28,31,0.94)';
    g.beginPath();
    g.roundRect(4, 4, W - 8, cardH, 44);
    g.fill();
    g.strokeStyle = '#34363b';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = BLUE;
    g.font = '700 30px Inter, system-ui, sans-serif';
    g.textBaseline = 'alphabetic';
    g.fillText('Ket', 40, 58);
    g.fillStyle = '#eef0f3';
    g.font = `600 ${size}px Inter, system-ui, sans-serif`;
    lines.forEach((l, i) => g.fillText(l, 40, 106 + i * size * 1.3));
    this.tex.needsUpdate = true;
    // keep the card's bottom edge just above Ket
    this.cardLift = (1 - cardH / H) * ((BUBBLE_W * H) / W);
  }

  /** Each frame: bob, spin, face the head, fade the words. */
  update(dt: number, head: Vector3): void {
    this.t += dt;
    this.root.position.copy(this.home);
    this.root.position.y += Math.sin(this.t * 1.4) * 0.006;
    this.talk = Math.max(0, this.talk - dt * 0.6);
    this.ring.rotation.z += dt * (0.6 + 4 * this.talk);
    this.ringMat.opacity = 0.55 + 0.4 * this.talk;
    // the card sits above Ket and faces you
    this.bubble.position.set(0, 0.03 + (BUBBLE_W * H) / W / 2 - this.cardLift, 0);
    this.root.updateWorldMatrix(true, false);
    this.bubble.lookAt(head);
    if (this.life > 0) {
      this.life -= dt;
      const fade = Math.min(1, this.life / 0.5);
      this.bubbleMat.opacity = fade;
      this.bubble.visible = this.life > 0;
      if (this.target) {
        this.root.getWorldPosition(this.tmp);
        this.pts.set([this.tmp.x, this.tmp.y, this.tmp.z, this.target.x, this.target.y, this.target.z]);
        const pos = this.pointer.geometry.getAttribute('position');
        pos.needsUpdate = true;
        this.pointer.computeLineDistances();
        this.pointerMat.opacity = 0.8 * fade * Math.min(1, this.talk * 3 + 0.2);
        this.pointer.visible = this.talk > 0.05;
      } else this.pointer.visible = false;
    } else {
      this.bubble.visible = false;
      this.pointer.visible = false;
    }
  }
}
