import { BoxGeometry, CatmullRomCurve3, Color, Group, Mesh, MeshStandardMaterial, Vector3, type Texture } from '@iwsdk/core';
import { Kit, LabelCard, useStudio } from './machine-kit';
import { qubitColor } from './visuals';

/** Energy levels of the well (heights in the diagram): the gaps shrink, so |1> to |2> has its own colour of microwave. */
const LEVELS = [0.035, 0.105, 0.162];

/**
 * Inside a qubit: one superconducting qubit (a transmon) magnified about a
 * thousand times. An aluminium cross is the capacitor; at the end of one arm
 * a small loop holds two Josephson junctions, shown again blown up as two
 * aluminium layers with a sliver of oxide between them, the one ingredient
 * that makes the circuit quantum. A drive line and a meandering readout
 * resonator reach in. Beside it, the energy well: its levels get closer as
 * they climb, so a pulse tuned to the 0-1 gap leaves |2> alone. The selected
 * qubit's chance of 0 and 1 fill the two lowest levels live.
 */
export class TransmonVisual {
  readonly root = new Group();
  private readonly fill: Mesh[] = [];
  private readonly fillMat: MeshStandardMaterial[] = [];
  env: Texture | null = null;
  private built = false;

  constructor() {
    this.root.name = 'Transmon';
    this.root.visible = false;
  }

  private build(): void {
    this.built = true;
    const kit = new Kit();
    const P = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const sub = new MeshStandardMaterial({ color: '#1f2733', roughness: 0.35, metalness: 0.4 });
    const al = new MeshStandardMaterial({ color: '#c9ced6', roughness: 0.25, metalness: 1 });
    const oxide = new MeshStandardMaterial({ color: '#9b87f5', emissive: '#9b87f5', emissiveIntensity: 0.35, roughness: 0.4 });
    const line = new MeshStandardMaterial({ color: '#8d9199', roughness: 0.3, metalness: 0.9 });
    // the chip, lying flat on the left
    kit.box(0.22, 0.004, 0.22, sub, P(-0.13, 0, 0));
    for (const [w, d] of [[0.15, 0.022], [0.022, 0.15]]) kit.box(w, 0.003, d, al, P(-0.13, 0.0035, 0));
    // the SQUID: a little loop at the end of the front arm, two junctions on its sides
    const sq = P(-0.13, 0.0035, 0.092);
    for (const [w, d, x, z] of [[0.03, 0.004, 0, -0.013], [0.03, 0.004, 0, 0.013], [0.004, 0.03, -0.013, 0], [0.004, 0.03, 0.013, 0]]) kit.box(w, 0.003, d, al, sq.clone().add(P(x, 0, z)));
    for (const sx of [-1, 1]) kit.box(0.007, 0.0045, 0.007, oxide, sq.clone().add(P(sx * 0.013, 0.001, 0)));
    kit.box(0.004, 0.003, 0.02, al, P(-0.13, 0.0035, 0.115));
    // the drive line from the left, the readout resonator meandering in from the right
    kit.box(0.05, 0.002, 0.004, line, P(-0.235, 0.003, 0));
    const pts: Vector3[] = [P(-0.055, 0.004, 0.0)];
    for (let k = 0; k < 7; k++) pts.push(P(-0.04 + (k % 2) * 0.03, 0.004, -0.02 - k * 0.012));
    kit.tube(new CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 0.0018, line, 80, 5);
    // the junction blown up, floating above the loop: aluminium, oxide, aluminium
    const up = sq.clone().add(P(0, 0.09, 0));
    kit.box(0.06, 0.008, 0.026, al, up.clone().add(P(-0.012, 0, 0)));
    kit.box(0.034, 0.003, 0.03, oxide, up.clone().add(P(0.008, 0.0055, 0)));
    kit.box(0.06, 0.008, 0.026, al, up.clone().add(P(0.022, 0.011, 0)));
    kit.rod(sq.clone().add(P(0, 0.004, 0)), up.clone().add(P(0, -0.006, 0)), 0.0008, line);
    // the energy well, standing up on the right: a cosine valley with three levels
    const well: Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const u = (i / 60) * 2 - 1;
      well.push(P(0.13 + u * 0.09, 0.2 * (1 - Math.cos(u * Math.PI * 0.9)) / 2, -0.02));
    }
    kit.tube(new CatmullRomCurve3(well), 0.0025, al, 120, 6);
    LEVELS.forEach((y, i) => {
      // each level as wide as the well is at that height
      const u = Math.acos(1 - (2 * y) / 0.2) / (Math.PI * 0.9);
      kit.box(u * 0.18, 0.003, 0.004, i < 2 ? al : line, P(0.13, y, -0.02));
    });
    kit.build(this.root);
    // the populations of |0> and |1>, filling their levels live
    for (let i = 0; i < 2; i++) {
      const mat = new MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
      const m = new Mesh(new BoxGeometry(1, 0.012, 0.012), mat);
      m.position.set(0.13, LEVELS[i] + 0.009, -0.02);
      this.root.add(m);
      this.fill.push(m);
      this.fillMat.push(mat);
    }
    const cards: [string, string, Vector3][] = [
      ['Transmon qubit', 'an aluminium cross, a thousand times bigger', P(-0.13, 0.03, 0.15)],
      ['Josephson junction', 'two metal layers, 2 nm of oxide between', P(-0.13, 0.135, 0.092)],
      ['Energy levels', 'they get closer as they climb', P(0.13, 0.235, -0.02)],
      ['|0> and |1>', 'the qubit; |2> is left alone', P(0.26, 0.07, -0.02)],
    ];
    for (const [t, s, at] of cards) {
      const c = new LabelCard(0.15, t, s);
      c.mesh.position.copy(at);
      this.root.add(c.mesh);
    }
    if (this.env) useStudio(this.root, this.env);
  }

  /** Show the selected qubit: p1 is its chance of 1. */
  set(p1: number, qubit: number): void {
    if (!this.built) this.build();
    const col = new Color(qubitColor(qubit));
    [1 - p1, p1].forEach((p, i) => {
      const w = Math.max(0.002, p * 0.12);
      this.fill[i].scale.x = w;
      this.fillMat[i].color.copy(col);
      this.fillMat[i].emissive.copy(col);
    });
  }
}
