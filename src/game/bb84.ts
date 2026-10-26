import type { Rng } from '../quantum/measure';

/**
 * BB84 (Bennett and Brassard, 1984): quantum key distribution. Alice sends
 * single photons, each a random bit in a random basis (+ or x). Bob measures
 * each in a random basis of his own; where the bases match, he gets Alice's
 * bit. They compare bases (not bits) in public and keep the matches: a shared
 * secret key. A spy, Eve, cannot copy a photon (no cloning); she must measure
 * and resend, guessing the basis, and half her guesses are wrong. Each wrong
 * guess gives Bob a coin toss where he should have had Alice's bit, so a
 * quarter of the kept bits come out wrong. Alice and Bob check a sample of
 * their key: errors mean Eve was there.
 */

export type Basis = '+' | 'x';

export interface Photon {
  bit: 0 | 1;
  alice: Basis;
  /** Eve's basis and what she read (null: she was not there). */
  eve: Basis | null;
  eveBit: 0 | 1 | null;
  bob: Basis;
  bobBit: 0 | 1;
  /** Bases matched: the bit goes into the key. */
  kept: boolean;
  /** Compared in public to look for Eve. */
  checked: boolean;
  error: boolean;
}

export interface Bb84Round {
  photons: Photon[];
  eve: boolean;
  kept: number;
  checked: number;
  errors: number;
  /** Errors among the checked bits. */
  errorRate: number;
  /** The rest of the kept bits: the secret key. */
  key: string;
}

/** Reading a photon prepared in `sent` with basis `measured`: the bit if the bases match, a coin toss if not. */
const read = (bit: 0 | 1, sent: Basis, measured: Basis, rng: Rng): 0 | 1 => (sent === measured ? bit : rng() < 0.5 ? 0 : 1);

export function bb84Round(n: number, eve: boolean, rng: Rng): Bb84Round {
  const basis = (): Basis => (rng() < 0.5 ? '+' : 'x');
  const photons: Photon[] = [];
  for (let i = 0; i < n; i++) {
    const bit: 0 | 1 = rng() < 0.5 ? 0 : 1;
    const alice = basis();
    let sentBit = bit, sentBasis = alice;
    let eb: Basis | null = null, ebit: 0 | 1 | null = null;
    if (eve) {
      // Eve measures in a basis of her own and sends on what she saw
      eb = basis();
      ebit = read(bit, alice, eb, rng);
      sentBit = ebit;
      sentBasis = eb;
    }
    const bob = basis();
    const bobBit = read(sentBit, sentBasis, bob, rng);
    photons.push({ bit, alice, eve: eb, eveBit: ebit, bob, bobBit, kept: alice === bob, checked: false, error: false });
  }
  // check every other kept bit in public; the rest is the key
  const kept = photons.filter((p) => p.kept);
  kept.forEach((p, i) => {
    p.checked = i % 2 === 0;
    p.error = p.bobBit !== p.bit;
  });
  const checked = kept.filter((p) => p.checked);
  const errors = checked.filter((p) => p.error).length;
  return {
    photons,
    eve,
    kept: kept.length,
    checked: checked.length,
    errors,
    errorRate: checked.length ? errors / checked.length : 0,
    key: kept.filter((p) => !p.checked).map((p) => p.bobBit).join(''),
  };
}

// ---------------------------------------------------------------- the Grover maze

/** Grover's best number of rounds for N items: about (pi / 4) sqrt(N). */
export const groverRounds = (n: number) => Math.max(1, Math.round((Math.PI / 4) * Math.sqrt(n)));
