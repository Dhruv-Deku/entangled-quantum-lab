import type { DailyRecord } from '../game/daily';
import type { ProfileData } from '../game/profile';

/** The profile (achievements, stats) and the daily record live beside the save; storage can be blocked, so every access is wrapped. */
const PROFILE = 'entangled.profile.v1';
const DAILY = 'entangled.daily.v1';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // not saved: progress still counts for this session
  }
}

export const loadProfile = () => read<ProfileData>(PROFILE);
export const saveProfile = (p: ProfileData) => write(PROFILE, p);
export const loadDaily = () => read<DailyRecord>(DAILY);
export const saveDaily = (d: DailyRecord) => write(DAILY, d);
