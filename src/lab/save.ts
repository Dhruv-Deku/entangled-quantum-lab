/**
 * Autosave and quick resume. Storage can be blocked (private mode, previews),
 * so every access is wrapped and the app works without it.
 */
const KEY = 'entangled.save.v1';

export interface SaveData {
  lab: unknown;
  campaign: unknown;
  savedAt: number;
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
}
