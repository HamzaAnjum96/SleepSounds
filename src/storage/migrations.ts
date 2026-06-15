import type { Preset, SoundState } from '../types';

// Migrations: turn whatever is in localStorage (possibly from an older build,
// possibly corrupt) into clean, current-shape data. They never throw and never
// trust the input — the app must start even if storage is garbage.

const clamp01 = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Build a full sound-state map, taking only known ids and clamped volumes from
 *  `raw`; everything else defaults to disabled. */
function migrateState(raw: unknown, validIds: Set<string>): { state: Record<string, SoundState>; enabledCount: number } {
  const state: Record<string, SoundState> = {};
  for (const id of validIds) state[id] = { enabled: false, volume: 0.5 };
  let enabledCount = 0;
  if (isObject(raw)) {
    for (const [id, item] of Object.entries(raw)) {
      if (!validIds.has(id) || !isObject(item)) continue; // drop unknown sounds
      const enabled = Boolean(item.enabled);
      state[id] = { enabled, volume: clamp01(item.volume) };
      if (enabled) enabledCount++;
    }
  }
  return { state, enabledCount };
}

/** Normalise the saved-mixes list. Unknown sounds are dropped, volumes clamped,
 *  missing names become "Untitled Mix", missing ids/timestamps are filled. */
export function migrateSavedMixes(raw: unknown, validIds: Set<string>): Preset[] {
  if (!Array.isArray(raw)) return [];
  const out: Preset[] = [];
  for (const entry of raw) {
    if (!isObject(entry)) continue;
    const { state } = migrateState(entry.state, validIds);
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name : 'Untitled Mix';
    const id = typeof entry.id === 'string' && entry.id ? entry.id : safeId();
    const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt : new Date(0).toISOString();
    const masterVolume = typeof entry.masterVolume === 'number' && Number.isFinite(entry.masterVolume)
      ? clamp01(entry.masterVolume)
      : undefined;
    out.push({ id, name, createdAt, state, masterVolume });
  }
  return out;
}

/** Normalise the resume-your-night session. Returns null when nothing playable
 *  survives (no known, enabled sounds). */
export function migrateSession(
  raw: unknown,
  validIds: Set<string>,
): { state: Record<string, SoundState>; masterVolume: number } | null {
  if (!isObject(raw)) return null;
  const { state, enabledCount } = migrateState(raw.state, validIds);
  if (enabledCount === 0) return null;
  const masterVolume = typeof raw.masterVolume === 'number' && Number.isFinite(raw.masterVolume)
    ? clamp01(raw.masterVolume)
    : 0.8;
  return { state, masterVolume };
}

function safeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `mix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
