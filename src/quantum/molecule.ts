import { H2 } from './h2-data';

/**
 * Pull a hydrogen molecule apart. At each bond length the four-qubit
 * Hamiltonian (the one the VQE chapter solves) is restricted to the two
 * configurations a singlet ground state can use: both electrons in the
 * bonding orbital (|HF>, qubits 0 and 1) or both in the antibonding one
 * (|D>, qubits 2 and 3). Its lowest eigenvalue is the exact energy, and its
 * mixture tells the story: near equilibrium it is almost all |HF> (the
 * classical mean-field picture works); stretched, |HF> and |D> mix half and
 * half, which is two atoms with one electron each and their spins in a Bell
 * pair. Mean-field (Hartree-Fock) energy, which cannot mix them, goes wrong
 * exactly there.
 */

export const R_MIN = H2[0].r;
export const R_MAX = H2[H2.length - 1].r;
export const R_EQ = 0.74;

/** Basis states with qubit w as bit w: |HF> fills qubits 0 and 1, |D> qubits 2 and 3. */
const HF = 0b0011;
const D = 0b1100;

/** <a| word |b> for a Pauli word listing qubit 0 first. */
export function element(word: string, a: number, b: number): [number, number] {
  let re = 1, im = 0;
  for (let w = 0; w < word.length; w++) {
    const x = (a >> w) & 1, y = (b >> w) & 1;
    let fr = 0, fi = 0;
    switch (word[w]) {
      case 'I':
        fr = x === y ? 1 : 0;
        break;
      case 'Z':
        fr = x === y ? 1 - 2 * y : 0;
        break;
      case 'X':
        fr = x !== y ? 1 : 0;
        break;
      case 'Y':
        // <0|Y|1> = -i, <1|Y|0> = i
        fi = x !== y ? (x === 0 ? -1 : 1) : 0;
        break;
    }
    const nr = re * fr - im * fi;
    im = re * fi + im * fr;
    re = nr;
    if (!re && !im) return [0, 0];
  }
  // + 0 turns a negative zero into zero
  return [re + 0, im + 0];
}

/** The Hamiltonian's Pauli terms at bond length r: a smooth (Catmull-Rom) curve through the computed points. */
export function termsAt(r: number): [number, string][] {
  const x = Math.min(R_MAX, Math.max(R_MIN, r));
  let i = 0;
  while (i < H2.length - 2 && H2[i + 1].r < x) i++;
  const p0 = H2[Math.max(0, i - 1)], p1 = H2[i], p2 = H2[i + 1], p3 = H2[Math.min(H2.length - 1, i + 2)];
  const h = p2.r - p1.r;
  const u = (x - p1.r) / h;
  const u2 = u * u, u3 = u2 * u;
  // Hermite basis with finite-difference slopes (the grid is not evenly spaced near 0.74)
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return p1.terms.map(([c1, w], k) => {
    const c0 = p0.terms[k][0], c2 = p2.terms[k][0], c3 = p3.terms[k][0];
    const m1 = p2.r === p0.r ? 0 : ((c2 - c0) / (p2.r - p0.r)) * h;
    const m2 = p3.r === p1.r ? 0 : ((c3 - c1) / (p3.r - p1.r)) * h;
    return [h00 * c1 + h10 * m1 + h01 * c2 + h11 * m2, w];
  });
}

export interface MoleculeState {
  r: number;
  /** Exact ground-state energy (Hartree). */
  energy: number;
  /** Mean-field energy: |HF> alone. */
  hf: number;
  /** Amplitudes of |HF> and |D>. */
  cHF: number;
  cD: number;
  /** How much the electrons sit one on each atom, 0.5 to 1 (1: two atoms, spins in a Bell pair). */
  covalent: number;
}

export function moleculeAt(r: number): MoleculeState {
  const terms = termsAt(r);
  let h11 = 0, h22 = 0, h12 = 0;
  for (const [c, w] of terms) {
    h11 += c * element(w, HF, HF)[0];
    h22 += c * element(w, D, D)[0];
    h12 += c * element(w, HF, D)[0];
  }
  // lowest eigenpair of [[h11, h12], [h12, h22]]
  const mean = (h11 + h22) / 2, half = (h11 - h22) / 2;
  const rad = Math.hypot(half, h12);
  const energy = mean - rad;
  let cHF = -h12, cD = h11 - energy;
  if (Math.abs(h12) < 1e-15) [cHF, cD] = h11 <= h22 ? [1, 0] : [0, 1];
  const norm = Math.hypot(cHF, cD);
  cHF /= norm;
  cD /= norm;
  if (cHF < 0) {
    cHF = -cHF;
    cD = -cD;
  }
  return { r, energy, hf: h11, cHF, cD, covalent: (Math.abs(cHF) + Math.abs(cD)) ** 2 / 2 };
}

/** The two curves for the board: exact and mean-field energy against bond length. */
export function dissociationCurves(points = 90): { r: number; exact: number; hf: number }[] {
  return Array.from({ length: points }, (_, i) => {
    const r = R_MIN + ((R_MAX - R_MIN) * i) / (points - 1);
    const m = moleculeAt(r);
    return { r, exact: m.energy, hf: m.hf };
  });
}
