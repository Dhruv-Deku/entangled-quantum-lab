import type { GateName } from '../quantum/gates';

/**
 * Voice commands: turn what the speech recogniser heard into an action.
 * Forgiving on purpose: "Hadamard on qubit two", "H on 2", "entangle zero and
 * one", "CNOT from one to two", "rotate qubit zero by pi over four around x",
 * "run a thousand shots". Recognisers often write "two" as "to" or "too", so
 * after the word "qubit" those count as 2.
 */

export type VoiceCommand =
  | { type: 'gate'; gate: GateName; qubit: number | null; params?: number[] }
  | { type: 'cnot'; control: number; target: number }
  | { type: 'swap'; a: number; b: number }
  | { type: 'measure'; qubit: number | 'all' | null }
  | { type: 'shots'; count: number }
  | { type: 'select'; qubit: number }
  | { type: 'answer'; index: number }
  | { type: 'claim'; qubit: number | null }
  | { type: 'join'; code: string }
  | { type: 'assign'; module: number; on: boolean }
  | { type: 'share' | 'leave' | 'classroom' }
  | { type: 'listen' | 'daily' | 'profile' | 'snapshot' }
  | { type: 'machine'; id: 'superconducting' | 'ions' | 'atoms' | 'photons' }
  | { type: 'compare' }
  | { type: 'fullsize'; on: boolean }
  | { type: 'view'; worlds?: boolean }
  | { type: 'rush' | 'skin' }
  | { type: 'play'; item: string }
  | { type: 'undo' | 'redo' | 'reset' | 'add' | 'remove' | 'next' | 'showme' | 'notes' | 'code' | 'simplify' | 'zoom' | 'noise' | 'library' | 'close' | 'debug' };

const NUMBERS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, won: 1, two: 2, three: 3, tree: 3, free: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  first: 0, second: 1, third: 2, fourth: 3, fifth: 4,
  hundred: 100, thousand: 1000,
};

const GATE_WORDS: [RegExp, GateName][] = [
  [/^(hadamard|h|age|aitch)$/, 'h'],
  [/^(not|x|ex|bit ?flip|pauli x)$/, 'x'],
  [/^(y|why|pauli y)$/, 'y'],
  [/^(z|zed|zee|phase ?flip|pauli z)$/, 'z'],
  [/^(s|ess|s gate)$/, 's'],
  [/^(t|tee|tea|t gate)$/, 't'],
];

/** Normalise: lower case, digits for number words, no punctuation. */
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** The number a word stands for, if any (qubit context makes "to"/"too" a 2). */
function num(word: string | undefined, afterQubit = false): number | null {
  if (word === undefined) return null;
  if (/^\d+$/.test(word)) return Number(word);
  if (afterQubit && (word === 'to' || word === 'too')) return 2;
  return word in NUMBERS ? NUMBERS[word] : null;
}

/** Qubit numbers mentioned, in order ("qubit to" counts as 2). */
function qubitNumbers(ts: string[]): number[] {
  const out: number[] = [];
  ts.forEach((w, i) => {
    const v = num(w, ts[i - 1] === 'qubit' || ts[i - 1] === 'qubits' || ts[i - 1] === 'cubit');
    if (v !== null && v < 100) out.push(v);
  });
  return out;
}

/** An angle: "pi over 4", "pi by 2", "45 degrees", "a quarter turn", "half turn", "pi". */
function angle(ts: string[]): number | null {
  const s = ts.join(' ');
  let m: RegExpExecArray | null;
  if ((m = /(\d+|\w+) degrees?/.exec(s))) {
    const v = num(m[1]);
    if (v !== null) return (v * Math.PI) / 180;
  }
  if ((m = /(minus |negative )?(\d+ )?pi (over|by|divided by) (\w+)/.exec(s))) {
    const k = m[2] ? Number(m[2]) : 1;
    const d = num(m[4]);
    if (d) return ((m[1] ? -1 : 1) * k * Math.PI) / d;
  }
  if (/quarter turn/.test(s)) return Math.PI / 2;
  if (/eighth turn/.test(s)) return Math.PI / 4;
  if (/half turn/.test(s) || /\bpi\b/.test(s)) return Math.PI;
  return null;
}

/** One spoken piece of a room code: a letter, a digit, a number word, or the whole code said as a word. */
function codeChar(w: string): string {
  if (w.length === 1) return w;
  const v = num(w);
  return v !== null && v < 10 ? String(v) : w;
}

export function parseVoice(text: string): VoiceCommand | null {
  const ts = tokens(text);
  if (!ts.length) return null;
  const s = ts.join(' ');
  const has = (...w: string[]) => w.some((x) => ts.includes(x));
  const qs = qubitNumbers(ts);

  if (/^(leave|exit|quit) (the )?(room|lab|class|shared lab)/.test(s)) return { type: 'leave' };
  const joining = /^(join|enter) (the )?(room|lab|class|code)? ?(.+)$/.exec(s);
  if (joining) {
    // spoken codes come letter by letter: "l k seven q f"
    const code = tokens(joining[4]).map(codeChar).join('').toUpperCase();
    return { type: 'join', code };
  }
  if (/^(claim|hold|take|release|let go of)\b/.test(s) && /qubit|cubit|this|it\b/.test(s)) return { type: 'claim', qubit: qs[0] ?? null };
  const assigning = /^(un ?assign|assign|remove) (module |lesson )?(\w+)/.exec(s);
  if (assigning && num(assigning[3]) !== null) return { type: 'assign', module: num(assigning[3])! - 1, on: assigning[1] === 'assign' };
  if (/(start|share|open) (a |the )?(shared )?lab|share (this|the circuit)/.test(s)) return { type: 'share' };
  if (/class ?room|class panel|my class|the class/.test(s)) return { type: 'classroom' };
  if (/\b(listen|play (the|this) (state|chord)|hear (it|the state))\b/.test(s)) return { type: 'listen' };
  if (/daily|today'?s (puzzle|challenge)/.test(s)) return { type: 'daily' };
  if (/compare (the |all )?(machines|computers|platforms|three)/.test(s)) return { type: 'compare' };
  if (/(full|life|real|actual) size/.test(s)) return { type: 'fullsize', on: !/\b(shrink|small|desk|back|off)\b/.test(s) };
  if (/^(shrink|make it small|back on the desk)/.test(s)) return { type: 'fullsize', on: false };
  if (/trapped ions?|ion trap|\bions\b/.test(s)) return { type: 'machine', id: 'ions' };
  if (/neutral atoms?|atom array|\batoms\b/.test(s)) return { type: 'machine', id: 'atoms' };
  if (/superconduct/.test(s)) return { type: 'machine', id: 'superconducting' };
  if (/photon|photonic|light chip|optical computer/.test(s)) return { type: 'machine', id: 'photons' };
  if (/trophies|achievements|my (progress|profile|level)/.test(s)) return { type: 'profile' };
  if (/snapshot|(take|save) a (picture|photo)|screenshot/.test(s)) return { type: 'snapshot' };
  if (/^(undo|go back|take that back)/.test(s)) return { type: 'undo' };
  if (/^redo/.test(s)) return { type: 'redo' };
  if (/^(reset|start over|clear)/.test(s)) return { type: 'reset' };
  if (/(add|new) (a )?qubit/.test(s)) return { type: 'add' };
  if (/remove (a )?qubit/.test(s)) return { type: 'remove' };
  // before Show me and Continue: "next view", "show me the matrix"
  if (/code lab|write (my )?(own )?code|my own code|program (it|my own)/.test(s)) return { type: 'play', item: 'Code lab' };
  if (/many worlds|every path|all the paths|feynman/.test(s)) return { type: 'view', worlds: true };
  const play: [RegExp, string][] = [
    [/\bzen\b/, 'Zen Rush'],
    [/\bdice\b|\bdie\b/, 'Quantum dice'],
    [/penny|coin flip|flip a coin/, 'Penny flip'],
    [/schrodinger|\bcat\b/, 'Schrodinger cat'],
    [/\balbum\b|collection/, 'State album'],
    [/giant|big sphere|inside the sphere/, 'Giant sphere'],
    [/inside (a |the )?qubit|transmon|josephson/, 'Inside a qubit'],
    [/night|stars|\bsky\b/, 'Night sky'],
    [/history|timeline/, 'History'],
    [/ambient|music/, 'Ambient music'],
  ];
  for (const [re, item] of play) if (re.test(s)) return { type: 'play', item };
  if (/\brush\b|arcade|time attack/.test(s)) return { type: 'rush' };
  if (/(next|change|new|switch) (skin|look|finish)|skins?$/.test(s)) return { type: 'skin' };
  if (/(change|switch|next) view|state city|q sphere|cue sphere|heat ?map|unitary|the matrix/.test(s)) return { type: 'view' };
  if (/show me/.test(s)) return { type: 'showme' };
  if (/^(next|continue|go on|okay next)/.test(s)) return { type: 'next' };
  if (/notes?\b/.test(s) && has('open', 'show', 'read', 'notes')) return { type: 'notes' };
  if (/simplify/.test(s)) return { type: 'simplify' };
  if (/\bzoom/.test(s)) return { type: 'zoom' };
  if (/\bnoise\b/.test(s)) return { type: 'noise' };
  if (/library|my circuits/.test(s)) return { type: 'library' };
  if (/debug/.test(s)) return { type: 'debug' };
  if (/\b(code|qiskit|kiss kit)\b/.test(s) && has('open', 'show', 'code', 'qiskit')) return { type: 'code' };
  if (/^(close|cancel|hide)/.test(s)) return { type: 'close' };
  let m: RegExpExecArray | null;
  if ((m = /^(answer|option|choice|number) (\w+)/.exec(s))) {
    const v = num(m[2]);
    if (v !== null && v >= 1 && v <= 3) return { type: 'answer', index: v - 1 };
  }
  if (/shots?\b/.test(s) || /^(run|fire|sample)\b/.test(s)) {
    const count = has('thousand') ? 1000 : (ts.map((w) => num(w)).find((v) => v !== null && v >= 10) ?? 100);
    return { type: 'shots', count };
  }
  if ((m = /^select (qubit |cubit )?(\w+)/.exec(s))) {
    const v = num(m[2], true);
    if (v !== null) return { type: 'select', qubit: v };
  }
  if (/^(entangle|cnot|c not|see not|controlled not|link)\b/.test(s)) {
    if (qs.length >= 2) return { type: 'cnot', control: qs[0], target: qs[1] };
    return null;
  }
  if (/^swap\b/.test(s)) return qs.length >= 2 ? { type: 'swap', a: qs[0], b: qs[1] } : null;
  if (/^(measure|look at|observe)\b/.test(s)) return { type: 'measure', qubit: has('all', 'everything', 'every') ? 'all' : (qs[0] ?? null) };
  if (/^(rotate|turn|spin)\b/.test(s)) {
    const a = angle(ts) ?? Math.PI / 4;
    const axisWord = ts.find((w, i) => (ts[i - 1] === 'around' || ts[i - 1] === 'about' || ts[i - 1] === 'axis') && /^(x|y|z|ex|why|zed|zee)$/.test(w));
    const axis = axisWord ? (axisWord === 'x' || axisWord === 'ex' ? 'rx' : axisWord === 'z' || axisWord === 'zed' || axisWord === 'zee' ? 'rz' : 'ry') : 'ry';
    const q = qubitNumbers(ts.slice(0, ts.findIndex((w) => w === 'by' || w === 'around' || w === 'about') === -1 ? ts.length : ts.findIndex((w) => w === 'by' || w === 'around' || w === 'about')));
    return { type: 'gate', gate: axis, qubit: q[0] ?? null, params: [a] };
  }
  // "s dagger on 1", "t dagger", "square root of x"
  if (/(s|ess) dagger/.test(s)) return { type: 'gate', gate: 'sdg', qubit: qs[0] ?? null };
  if (/(t|tee) dagger/.test(s)) return { type: 'gate', gate: 'tdg', qubit: qs[0] ?? null };
  if (/square root of (x|not)/.test(s)) return { type: 'gate', gate: 'sx', qubit: qs[0] ?? null };
  // a single gate: "<gate> (gate)? (on|to)? (qubit)? N", possibly after "apply"
  const words = ts[0] === 'apply' || ts[0] === 'do' ? ts.slice(1) : ts;
  for (const len of [2, 1]) {
    const head = words.slice(0, len).join(' ');
    const hit = GATE_WORDS.find(([re]) => re.test(head));
    if (hit) return { type: 'gate', gate: hit[1], qubit: qubitNumbers(words.slice(len))[0] ?? (num(words[words.length - 1], true) ?? null) };
  }
  return null;
}

/** A short line to show what was understood. */
export function describe(c: VoiceCommand): string {
  switch (c.type) {
    case 'gate':
      return `${c.gate.toUpperCase()}${c.params ? `(${(c.params[0] / Math.PI).toFixed(2)} pi)` : ''} on ${c.qubit === null ? 'the selected qubit' : `q${c.qubit}`}`;
    case 'cnot':
      return `CNOT q${c.control} -> q${c.target}`;
    case 'swap':
      return `SWAP q${c.a}, q${c.b}`;
    case 'measure':
      return c.qubit === 'all' ? 'measure every qubit' : `measure ${c.qubit === null ? 'the selected qubit' : `q${c.qubit}`}`;
    case 'shots':
      return `${c.count} shots`;
    case 'select':
      return `select q${c.qubit}`;
    case 'answer':
      return `answer ${c.index + 1}`;
    case 'claim':
      return `claim ${c.qubit === null ? 'the selected qubit' : `q${c.qubit}`}`;
    case 'join':
      return `join room ${c.code}`;
    case 'share':
      return 'start a shared lab';
    case 'assign':
      return `${c.on ? 'assign' : 'unassign'} module ${c.module + 1}`;
    case 'leave':
      return 'leave the room';
    case 'listen':
      return 'listen to the state';
    case 'daily':
      return "today's daily challenge";
    case 'profile':
      return 'your progress';
    case 'snapshot':
      return 'save a picture of the circuit';
    case 'machine':
      return c.id === 'ions' ? 'the trapped-ion computer' : c.id === 'atoms' ? 'the neutral-atom computer' : c.id === 'photons' ? 'the photonic chip' : 'the superconducting chip';
    case 'compare':
      return 'run on all three machines';
    case 'rush':
      return 'Quantum Rush';
    case 'play':
      return c.item;
    case 'skin':
      return 'the next orb finish';
    case 'view':
      return c.worlds ? 'the many-worlds view' : 'the next view';
    case 'fullsize':
      return c.on ? 'the machine at full size' : 'the machine back on the desk';
    default:
      return c.type;
  }
}
