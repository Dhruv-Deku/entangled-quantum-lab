/**
 * Write a complex number the way a textbook would: 1/√2, -i/2, e^{iπ/4}/√2,
 * √3/2. Numbers that are not one of these simple forms fall back to decimals.
 * The Unicode form is for the canvas board; the ASCII form is for the panels,
 * whose font has no special symbols.
 */

const EPS = 1e-6;

/** Magnitudes with a simple exact form. */
const MAGS: [number, string, string][] = [
  [1, '1', '1'],
  [Math.SQRT1_2, '1/√2', '1/sqrt2'],
  [0.5, '1/2', '1/2'],
  [Math.sqrt(3) / 2, '√3/2', 'sqrt3/2'],
  [1 / (2 * Math.SQRT2), '1/(2√2)', '1/(2sqrt2)'],
  [0.25, '1/4', '1/4'],
  [1 / Math.sqrt(3), '1/√3', '1/sqrt3'],
  [Math.sqrt(2 / 3), '√2/√3', 'sqrt2/sqrt3'],
  [Math.SQRT2, '√2', 'sqrt2'],
  [2, '2', '2'],
];

export interface Exact {
  /** For the board (√, π, superscripts as ^{...}). */
  text: string;
  /** For the panels: plain ASCII. */
  ascii: string;
  /** True if it is one of the simple forms, not a decimal. */
  exact: boolean;
}

const dec = (x: number) => {
  const s = (Math.abs(x) < 0.0005 ? 0 : x).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
};

/** A phase e^{iφ} as a unit: 1, i, -1, -i, or e^{±iπ/4}-style; null if φ is not a multiple of π/4. */
function phaseOf(re: number, im: number): { unit: string; ascii: string; sign: 1 | -1 } | null {
  const k8 = (Math.atan2(im, re) / Math.PI) * 4; // in units of π/4
  const k = Math.round(k8);
  if (Math.abs(k8 - k) > 1e-6) return null;
  switch (((k % 8) + 8) % 8) {
    case 0: return { unit: '', ascii: '', sign: 1 };
    case 2: return { unit: 'i', ascii: 'i', sign: 1 };
    case 4: return { unit: '', ascii: '', sign: -1 };
    case 6: return { unit: 'i', ascii: 'i', sign: -1 };
    case 1: return { unit: 'e^{iπ/4}', ascii: 'e^(i pi/4)', sign: 1 };
    case 3: return { unit: 'e^{i3π/4}', ascii: 'e^(i3pi/4)', sign: 1 };
    case 5: return { unit: 'e^{iπ/4}', ascii: 'e^(i pi/4)', sign: -1 };
    case 7: return { unit: 'e^{-iπ/4}', ascii: 'e^(-i pi/4)', sign: 1 };
  }
  return null;
}

export function exact(re: number, im: number): Exact {
  const r = Math.hypot(re, im);
  if (r < EPS) return { text: '0', ascii: '0', exact: true };
  const mag = MAGS.find(([m]) => Math.abs(r - m) < EPS);
  const ph = phaseOf(re, im);
  if (mag && ph) {
    const [, mt, ma] = mag;
    const sign = ph.sign < 0 ? '-' : '';
    if (!ph.unit) return { text: sign + mt, ascii: sign + ma, exact: true };
    // 1·i = i; 1/√2·i = i/√2; e^{iπ/4}/2
    const slash = mt.indexOf('/');
    const text = mt === '1' ? sign + ph.unit : slash > 0 && mt.startsWith('1/') ? `${sign}${ph.unit}${mt.slice(1)}` : `${sign}${mt}${ph.unit}`;
    const ascii = ma === '1' ? sign + ph.ascii : ma.startsWith('1/') ? `${sign}${ph.ascii}${ma.slice(1)}` : `${sign}${ma}*${ph.ascii}`;
    return { text, ascii, exact: true };
  }
  if (Math.abs(im) < EPS) return { text: dec(re), ascii: dec(re), exact: false };
  if (Math.abs(re) < EPS) return { text: `${dec(im)}i`, ascii: `${dec(im)}i`, exact: false };
  const s = `${dec(re)}${im < 0 ? '-' : '+'}${dec(Math.abs(im))}i`;
  return { text: s, ascii: s, exact: false };
}

/** A real angle as a multiple of π where it is one (π/4, -π/2, 3π/4), otherwise in radians. */
export function angleText(x: number): Exact {
  for (const d of [1, 2, 3, 4, 6, 8, 12]) {
    const k = (x / Math.PI) * d;
    if (Math.abs(k - Math.round(k)) < 1e-9) {
      const n = Math.round(k);
      if (n === 0) return { text: '0', ascii: '0', exact: true };
      const num = n === 1 ? 'π' : n === -1 ? '-π' : `${n}π`;
      const anum = n === 1 ? 'pi' : n === -1 ? '-pi' : `${n}pi`;
      return { text: d === 1 ? num : `${num}/${d}`, ascii: d === 1 ? anum : `${anum}/${d}`, exact: true };
    }
  }
  return { text: dec(x), ascii: dec(x), exact: false };
}
