/**
 * Three classic experiments, computed: the double slit, Stern-Gerlach and the
 * Elitzur-Vaidman bomb tester (with its quantum Zeno upgrade). Each gives exact
 * probabilities and a sampler for one particle at a time.
 */

export type Rng = () => number;

// ---------------------------------------------------------------- the double slit

export type SlitSetup = 'both' | 'watched' | 'one';

/** Bright fringes across the screen (x from -1 to 1). */
export const FRINGES = 5;
/** Width of the single-slit envelope: its first zero sits at x = 1 / ENVELOPE. */
export const ENVELOPE = 1.15;
/** Where the left slit's own pattern is centred (one slit open). */
export const SLIT_OFFSET = -0.06;

const sinc2 = (u: number) => (Math.abs(u) < 1e-9 ? 1 : (Math.sin(u) / u) ** 2);

/**
 * Relative brightness at x on the screen. Both slits open and unwatched: the
 * two waves add, and the single-slit envelope is striped by cos^2 fringes.
 * Watched (a detector at the slits says which one the photon took): the two
 * patterns add as probabilities instead, and the stripes are gone. One slit:
 * just its own envelope.
 */
export function slitIntensity(x: number, setup: SlitSetup): number {
  if (setup === 'one') return sinc2(Math.PI * ENVELOPE * (x - SLIT_OFFSET));
  const env = 0.5 * (sinc2(Math.PI * ENVELOPE * (x - SLIT_OFFSET)) + sinc2(Math.PI * ENVELOPE * (x + SLIT_OFFSET)));
  if (setup === 'watched') return env;
  return sinc2(Math.PI * ENVELOPE * x) * Math.cos(FRINGES * Math.PI * x) ** 2;
}

/** Where one photon lands (x from -1 to 1), drawn from the pattern. */
export function sampleSlit(setup: SlitSetup, rng: Rng): number {
  for (let i = 0; i < 10000; i++) {
    const x = rng() * 2 - 1;
    if (rng() < slitIntensity(x, setup)) return x;
  }
  return 0;
}

/** Hits counted into `bins` equal bins across the screen. */
export function histogram(hits: readonly number[], bins: number): number[] {
  const out = Array(bins).fill(0);
  for (const x of hits) out[Math.min(bins - 1, Math.max(0, Math.floor(((x + 1) / 2) * bins)))]++;
  return out;
}

// ---------------------------------------------------------------- Stern-Gerlach

export type Axis = 'z' | 'x';
export type Spin = 'up' | 'down';

export interface Stage {
  axis: Axis;
  /** The beam stopped after this magnet (null: both go on to the screen). */
  block: Spin | null;
}

export interface SgExperiment {
  id: string;
  name: string;
  stages: Stage[];
}

export const SG_EXPERIMENTS: SgExperiment[] = [
  { id: 'z', name: 'Z', stages: [{ axis: 'z', block: null }] },
  { id: 'zz', name: 'Z then Z', stages: [{ axis: 'z', block: 'down' }, { axis: 'z', block: null }] },
  { id: 'zxz', name: 'Z, X, Z', stages: [{ axis: 'z', block: 'down' }, { axis: 'x', block: 'down' }, { axis: 'z', block: null }] },
];

/** Probability of "up" along `axis` for a spin that is `spin` along `from`. */
const pUp = (from: Axis, spin: Spin, axis: Axis) => (from === axis ? (spin === 'up' ? 1 : 0) : 0.5);

export interface AtomPath {
  /** The result at each magnet it reached. */
  outcomes: Spin[];
  /** The magnet after which it was stopped, or null if it reached the screen. */
  blockedAt: number | null;
}

/** One silver atom from the oven (unpolarised: either way along any axis, half the time). */
export function runAtom(stages: readonly Stage[], rng: Rng): AtomPath {
  const outcomes: Spin[] = [];
  let from: Axis | null = null;
  let spin: Spin = 'up';
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    const p: number = from === null ? 0.5 : pUp(from, spin, st.axis);
    spin = rng() < p ? 'up' : 'down';
    from = st.axis;
    outcomes.push(spin);
    if (st.block === spin && i < stages.length - 1) return { outcomes, blockedAt: i };
  }
  return { outcomes, blockedAt: null };
}

/** Of the atoms that reach the screen, the fraction landing up and down; and the fraction stopped on the way. */
export function sgExpected(stages: readonly Stage[]): { up: number; down: number; stopped: number } {
  let reach = 1;
  let from: Axis | null = null;
  let spin: Spin = 'up';
  for (let i = 0; i < stages.length - 1; i++) {
    const st = stages[i];
    const p: number = from === null ? 0.5 : pUp(from, spin, st.axis);
    const keep: Spin = st.block === 'up' ? 'down' : 'up';
    reach *= keep === 'up' ? p : 1 - p;
    from = st.axis;
    spin = keep;
  }
  const last = stages[stages.length - 1];
  const up = from === null ? 0.5 : pUp(from, spin, last.axis);
  return { up, down: 1 - up, stopped: 1 - reach };
}

// ---------------------------------------------------------------- the bomb tester

export type BombOutcome = 'C' | 'D' | 'boom';

/**
 * One photon through a Mach-Zehnder interferometer with a bomb in its lower
 * arm (the bomb's trigger is a single-photon detector). Beam splitters act as
 * Hadamards on the path qubit. A dud lets both paths interfere: the photon
 * always leaves by the bright port C. A live bomb looks: half the time the
 * photon was there (boom); otherwise it is now surely in the upper arm, and
 * the second beam splitter sends it to C or to the dark port D, half and half.
 * D can only click if the bomb is live, and then it never went off.
 */
export function bombOdds(live: boolean): Record<BombOutcome, number> {
  // amplitudes over the two arms after the first beam splitter
  const s = Math.SQRT1_2;
  const arms: [number, number] = [s, s];
  if (!live) {
    const c = s * arms[0] + s * arms[1];
    const d = s * arms[0] - s * arms[1];
    return { C: c * c, D: d * d, boom: 0 };
  }
  const boom = arms[1] * arms[1];
  // otherwise the photon is in the upper arm alone, with the rest of the probability
  const rest = 1 - boom;
  return { C: rest * s * s, D: rest * s * s, boom };
}

export function fireBomb(live: boolean, rng: Rng): BombOutcome {
  const o = bombOdds(live);
  const r = rng();
  return r < o.boom ? 'boom' : r < o.boom + o.D ? 'D' : 'C';
}

export const ZENO_PASSES = 10;

/**
 * The quantum Zeno version: the photon's polarisation is turned by 90 / n
 * degrees on each of n passes, and its vertical part goes past the bomb. A
 * dud lets the turns add up to vertical: "dud", every time. A live bomb looks
 * on every pass, which (unless it goes off, with chance sin^2 each time) keeps
 * the photon horizontal: "live", and the bomb untouched.
 */
export function zenoOdds(live: boolean, n = ZENO_PASSES): { live: number; dud: number; boom: number } {
  if (!live) return { live: 0, dud: 1, boom: 0 };
  const keep = Math.cos(Math.PI / (2 * n)) ** 2;
  const survive = keep ** n;
  return { live: survive, dud: 0, boom: 1 - survive };
}

export function fireZeno(live: boolean, rng: Rng, n = ZENO_PASSES): { result: 'live' | 'dud' | 'boom'; pass: number } {
  if (!live) return { result: 'dud', pass: n };
  const keep = Math.cos(Math.PI / (2 * n)) ** 2;
  for (let k = 1; k <= n; k++) if (rng() >= keep) return { result: 'boom', pass: k };
  return { result: 'live', pass: n };
}
