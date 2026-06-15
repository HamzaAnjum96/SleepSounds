import type { Preset, SoundState } from '../types';
import { SOUND_LIBRARY } from '../data';
import { STORAGE_KEYS } from './keys';
import { migrateSavedMixes, migrateSession } from './migrations';

const validIds = new Set(SOUND_LIBRARY.map((s) => s.id));

/** The user's saved mixes, migrated and safe — never throws on bad storage. */
export function loadSavedMixes(): Preset[] {
  try {
    return migrateSavedMixes(JSON.parse(localStorage.getItem(STORAGE_KEYS.savedMixes) ?? '[]'), validIds);
  } catch {
    return [];
  }
}

export function saveSavedMixes(mixes: Preset[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.savedMixes, JSON.stringify(mixes));
  } catch { /* private mode / quota */ }
}

/** Last night's mix (enabled layers + master volume), or null. */
export function loadLastSession(): { state: Record<string, SoundState>; masterVolume: number } | null {
  try {
    return migrateSession(JSON.parse(localStorage.getItem(STORAGE_KEYS.lastSession) ?? 'null'), validIds);
  } catch {
    return null;
  }
}

/** Persist only the enabled layers; clears the key when the mix is empty. */
export function saveLastSession(state: Record<string, SoundState>, masterVolume: number): void {
  try {
    const enabled = Object.entries(state).filter(([, s]) => s.enabled);
    if (enabled.length === 0) { localStorage.removeItem(STORAGE_KEYS.lastSession); return; }
    const slim = Object.fromEntries(enabled.map(([id, s]) => [id, { enabled: true, volume: s.volume }]));
    localStorage.setItem(STORAGE_KEYS.lastSession, JSON.stringify({ state: slim, masterVolume }));
  } catch { /* private mode / quota */ }
}
