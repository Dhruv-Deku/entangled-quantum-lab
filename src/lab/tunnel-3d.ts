import { BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial } from '@iwsdk/core';
import { DX, GRID, X0 } from '../quantum/tunnel';
import { LabelCard } from './machine-kit';

/** Physics units shown either side of the wall. */
const VIEW = 70;
/** Columns across the track. */
const COLS = 280;
/** Metres per physics unit along the track. */
const SCALE = 0.21 / VIEW;
/** The wall's height in metres (its energy is 1). */
const WALL_H = 0.1;
/** Metres per unit of probability density. */
const LIFT = 1.2;
/** The far side drawn this much taller, so a few percent still shows. */
const ZOOM = 10;

/**
 * Tunnelling on the desk: a track with a wall across it. The wave packet
 * flies at the height of its energy (the blue line), as a curtain whose
 * height is the probability of finding the particle there and whose colour
 * is its quantum phase. The wall stands taller than the line: classically
 * nothing gets past. Beyond it the same curtain is traced again ten times
 * taller, so even a 2% tunnel shows.
 */
export class TunnelVisual {
  readonly root = new Group();
  private readonly geo = new BufferGeometry();
  private readonly pos = new Float32Array(COLS * 2 * 3);
  private readonly col = new Float32Array(COLS * 2 * 3);
  private readonly edge: Line;
  private readonly edgePos = new Float32Array(COLS * 3);
  private readonly zoom: Line;
  private readonly zoomPos = new Float32Array(COLS * 3);
  private readonly wall: Mesh;
  private readonly energyLine: Mesh;
  private readonly zoomLabel = new LabelCard(0.07, 'x10', '');
  private base = 0.06;
  private width = 1;
  private readonly c = new Color();

  constructor() {
    this.root.name = 'Tunnelling';
    const idx: number[] = [];
    for (let j = 0; j < COLS - 1; j++) {
      const a = j * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new BufferAttribute(this.col, 3));
    const curtain = new Mesh(this.geo, new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, side: DoubleSide, depthWrite: false }));
    curtain.frustumCulled = false;
    this.root.add(curtain);
    const eg = new BufferGeometry();
    eg.setAttribute('position', new BufferAttribute(this.edgePos, 3));
    this.edge = new Line(eg, new LineBasicMaterial({ color: '#f2f3f5' }));
    this.edge.frustumCulled = false;
    this.root.add(this.edge);
    const zg = new BufferGeometry();
    zg.setAttribute('position', new BufferAttribute(this.zoomPos, 3));
    this.zoom = new Line(zg, new LineBasicMaterial({ color: '#8a8d93', transparent: true, opacity: 0.9 }));
    this.zoom.frustumCulled = false;
    this.root.add(this.zoom);
    this.zoomLabel.mesh.position.set(0.2, 0.2, 0);
    this.root.add(this.zoomLabel.mesh);
    // the track, the wall and the energy line
    const track = new Mesh(new BoxGeometry(VIEW * 2 * SCALE + 0.02, 0.004, 0.06), new MeshStandardMaterial({ color: '#232427', roughness: 0.7 }));
    track.position.y = 0.002;
    this.root.add(track);
    this.wall = new Mesh(new BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0), new MeshStandardMaterial({ color: '#3a3d43', transparent: true, opacity: 0.8, roughness: 0.3, metalness: 0.2 }));
    this.root.add(this.wall);
    this.energyLine = new Mesh(new BoxGeometry(VIEW * 2 * SCALE, 0.0016, 0.0016), new MeshBasicMaterial({ color: '#2d7ff9', toneMapped: false }));
    this.root.add(this.energyLine);
    for (let j = 0; j < COLS; j++) {
      const x = this.colX(j) * SCALE;
      this.pos[j * 6] = this.pos[j * 6 + 3] = x;
      this.edgePos[j * 3] = this.zoomPos[j * 3] = x;
    }
    this.root.visible = false;
  }

  private colX(j: number): number {
    return -VIEW + (2 * VIEW * j) / (COLS - 1);
  }

  /** The wall's width (physics units) and the particle's energy (the wall is 1). */
  setup(energy: number, width: number): void {
    this.width = width;
    this.base = 0.006 + energy * WALL_H;
    this.wall.scale.set(width * SCALE, WALL_H, 0.05);
    this.wall.position.set(0, 0.004, 0);
    this.energyLine.position.set(0, this.base, 0.026);
    this.zoomLabel.mesh.position.set(0.16, this.base + 0.05, 0);
  }

  /** The wavefunction now (the solver's grid), or null to clear the track. */
  setWave(re: Float64Array | null, im: Float64Array | null): void {
    let beyondMax = 0;
    for (let j = 0; j < COLS; j++) {
      const x = this.colX(j);
      const i = Math.min(GRID - 1, Math.max(0, Math.round((x - X0) / DX)));
      const r = re ? re[i] : 0, m = im ? im[i] : 0;
      const p = r * r + m * m;
      const h = p * LIFT;
      this.pos[j * 6 + 1] = this.base;
      this.pos[j * 6 + 4] = this.base + h;
      this.edgePos[j * 3 + 1] = this.base + h;
      // past the wall, the magnified trace; elsewhere it rests on the line
      const beyond = x >= this.width;
      if (beyond) beyondMax = Math.max(beyondMax, h);
      this.zoomPos[j * 3 + 1] = beyond ? this.base + Math.min(0.16, h * ZOOM) : this.base;
      this.zoomPos[j * 3 + 2] = this.edgePos[j * 3 + 2] = 0;
      this.c.setHSL((((Math.atan2(m, r) / (2 * Math.PI)) % 1) + 1) % 1, 0.58, 0.62);
      const fade = Math.min(1, p * 60);
      for (const k of [0, 3]) {
        this.col[j * 6 + k] = this.c.r * fade;
        this.col[j * 6 + k + 1] = this.c.g * fade;
        this.col[j * 6 + k + 2] = this.c.b * fade;
      }
    }
    // the magnifier only when what got through is too small to see; a big share needs none
    const zoomed = beyondMax > 0.0004 && beyondMax * ZOOM < 0.12;
    this.zoom.visible = this.zoomLabel.mesh.visible = zoomed;
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('color').needsUpdate = true;
    this.edge.geometry.getAttribute('position').needsUpdate = true;
    this.zoom.geometry.getAttribute('position').needsUpdate = true;
  }
}
