import type { Rng } from '../quantum/measure';

/**
 * The quantum penny flip (David Meyer, 1999). A coin starts heads up (|0>).
 * You move, the computer secretly flips it or not, you move again, then the
 * coin is looked at: heads, you win. A classical player can only win half the
 * time. A quantum player who puts the coin in superposition (H) wins every
 * time: a flip does nothing to |+>, and the second H brings it back to heads.
 */

export type PennyPhase = 'first' | 'computer' | 'second' | 'reveal';

export interface PennyRecord {
  you: number;
  computer: number;
}

/** The computer's secret move: flip (X) or leave the coin, at random. */
export const computerFlips = (rng: Rng) => rng() < 0.5;

/** Who won a reveal: heads (0) is yours. */
export function score(r: PennyRecord, outcome: 0 | 1): PennyRecord {
  return outcome === 0 ? { ...r, you: r.you + 1 } : { ...r, computer: r.computer + 1 };
}
