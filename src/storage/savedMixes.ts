import type { Preset, SoundState } from '../types';
import { SOUND_LIBRARY } from '../data';
import { STORAGE_KEYS } from './keys';
import { migrateSavedMixes, migrateSession, safeId } from './migrations';

/** A fresh mix id that never throws (see safeId) — the crash-proof replacement
 *  for a bare `crypto.randomUUID()`, which is undefined in insecure contexts. */
export const newMixId = safeId;

const validIds = new Set(SOUND_LIBRARY.map((s) => s.id));

/** The user's saved mixes, migrated and safe — never throws on bad storage. */
export function loadSavedMixes(): Preset[] {
  try {
    return migrateSavedMixes(JSON.parse(localStorage.getItem(STORAGE_KEYS.savedMixes) ?? '[]'), validIds);
  } catch {
    return [];
  }
}

/**
 * Persist the saved mixes. Returns false when the browser refused the write —
 * private browsing, an exhausted quota, storage switched off. The caller has to
 * know: saving a mix is a deliberate act the app confirms out loud, and
 * swallowing the failure meant confirming a save that had not happened and
 * would be gone on the next open.
 */
export function saveSavedMixes(mixes: Preset[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEYS.savedMixes, JSON.stringify(mixes));
    return true;
  } catch {
    return false; // private mode / quota
  }
}

/** Last night's mix (enabled layers + master volume), or null. */
export function loadLastSession(): { state: Record<string, SoundState>; masterVolume: number } | null {
  try {
    return migrateSession(JSON.parse(localStorage.getItem(STORAGE_KEYS.lastSession) ?? 'null'), validIds);
  } catch {
    return null;
  }
}

/** Persist only the enabled layers; clears the key when the mix is empty.
 *  [v0.0.15 fix] Each layer's `tuning` is kept too, so "resume your night"
 *  brings a mix back with the exact character it was playing — e.g. a scene's
 *  reduced rain bed — instead of silently reverting tuned layers to their
 *  defaults. The load path (migrateSession → sanitizeTuning) already restores
 *  tuning; only this write side was dropping it. */
export function saveLastSession(state: Record<string, SoundState>, masterVolume: number): void {
  try {
    const enabled = Object.entries(state).filter(([, s]) => s.enabled);
    if (enabled.length === 0) { localStorage.removeItem(STORAGE_KEYS.lastSession); return; }
    const slim = Object.fromEntries(enabled.map(([id, s]) => [
      id,
      s.tuning ? { enabled: true, volume: s.volume, tuning: s.tuning } : { enabled: true, volume: s.volume },
    ]));
    localStorage.setItem(STORAGE_KEYS.lastSession, JSON.stringify({ state: slim, masterVolume }));
  } catch { /* private mode / quota */ }
}
