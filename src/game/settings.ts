/**
 * Settings: the room, the view and accessibility. Kept in localStorage on this
 * device (they describe this headset and this room, so they are not synced).
 */

export type FovLayout = 'auto' | 'wide' | 'compact';
export type DwellSpeed = 'slow' | 'normal' | 'fast';

export interface Settings {
  /** Put the lab on your real table when the headset finds one within reach. */
  realDesk: boolean;
  /** Persistent anchor for the pinned lab (null: not pinned). */
  pinned: string | null;
  /** Use the real wall in front of you as the screen for the double slit. */
  wallScreen: boolean;
  /** Field of view layout: Auto picks compact on a headset with a narrow view. */
  fov: FovLayout;
  /** Look to select: rest your gaze (head or eyes) on a button or an orb to press it. */
  lookSelect: boolean;
  dwell: DwellSpeed;
  /** Brighter text and borders on darker panels. */
  contrast: boolean;
  /** No confetti, no camera shake, calmer animations. */
  reduceMotion: boolean;
  /** Show every sound cue as a caption under the dock. */
  captions: boolean;
  /** Which palm opens the wrist menu. */
  wristHand: 'left' | 'right';
  /** Ket, the lab partner, explains and helps. */
  partner: boolean;
  /** Ket reads its words aloud. */
  speak: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  realDesk: true,
  pinned: null,
  wallScreen: true,
  fov: 'auto',
  lookSelect: false,
  dwell: 'normal',
  contrast: false,
  reduceMotion: false,
  captions: false,
  wristHand: 'left',
  partner: true,
  speak: false,
};

export const DWELL_SECONDS: Record<DwellSpeed, number> = { slow: 1.6, normal: 1.0, fast: 0.6 };

const KEY = 'entangled.settings.v1';

/** Settings from stored JSON, keeping only known keys with the right types. */
export function parseSettings(raw: string | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!data || typeof data !== 'object') return out;
  const d = data as Record<string, unknown>;
  for (const k of ['realDesk', 'wallScreen', 'lookSelect', 'contrast', 'reduceMotion', 'captions', 'partner', 'speak'] as const) if (typeof d[k] === 'boolean') out[k] = d[k] as boolean;
  if (typeof d.pinned === 'string' && d.pinned.length > 0 && d.pinned.length < 200) out.pinned = d.pinned;
  if (d.fov === 'auto' || d.fov === 'wide' || d.fov === 'compact') out.fov = d.fov;
  if (d.dwell === 'slow' || d.dwell === 'normal' || d.dwell === 'fast') out.dwell = d.dwell;
  if (d.wristHand === 'left' || d.wristHand === 'right') out.wristHand = d.wristHand;
  return out;
}

function load(): Settings {
  try {
    return parseSettings(globalThis.localStorage?.getItem(KEY) ?? null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** The live settings (mutate, then call saveSettings). */
export const settings: Settings = load();

export function saveSettings(): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // private mode or storage full: settings last for this session only
  }
}

/**
 * The layout for a headset whose per-eye horizontal field of view is
 * `fovDegrees` (null before the first frame): compact below 90 degrees.
 */
export function layoutFor(choice: FovLayout, fovDegrees: number | null): 'wide' | 'compact' {
  if (choice !== 'auto') return choice;
  return fovDegrees !== null && fovDegrees < 90 ? 'compact' : 'wide';
}

/** Horizontal field of view, degrees, from a WebXR projection matrix (column-major). */
export function horizontalFov(projection: ArrayLike<number>): number {
  // x' = m0 x + m8 z: the left and right edges are where x / -z = (m8 -/+ 1) / m0
  const m0 = projection[0], m8 = projection[8];
  const left = Math.atan((m8 - 1) / m0), right = Math.atan((m8 + 1) / m0);
  return ((right - left) * 180) / Math.PI;
}
