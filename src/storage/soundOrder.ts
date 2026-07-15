import { STORAGE_KEYS } from './keys';

// [0.1.0] The user's custom library order (drag-and-drop / keyboard reorder).
// Same contract as the rest of the storage layer: never throws, never trusts
// the input — unknown ids are dropped on read, and sounds missing from a saved
// order (e.g. added in a later release) append in library order, so an old
// saved order can never hide a new sound.

/** The saved order as a clean id list, or null when none is saved. */
export function loadSoundOrder(): string[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.soundOrder) ?? 'null');
    if (!Array.isArray(raw)) return null;
    const out: string[] = [];
    for (const v of raw) {
      if (typeof v === 'string' && v && !out.includes(v)) out.push(v);
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

export function saveSoundOrder(order: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.soundOrder, JSON.stringify(order));
  } catch { /* private mode / quota */ }
}

/** Apply a saved order to a sound list: saved ids first (unknown ones are
 *  ignored), then any sounds the order doesn't mention, in their given order. */
export function orderSounds<T extends { id: string }>(sounds: T[], order: string[] | null): T[] {
  if (!order || order.length === 0) return sounds;
  const byId = new Map(sounds.map((s) => [s.id, s]));
  const out: T[] = [];
  for (const id of order) {
    const s = byId.get(id);
    if (s) { out.push(s); byId.delete(id); }
  }
  for (const s of sounds) if (byId.has(s.id)) { out.push(s); byId.delete(s.id); }
  return out;
}

/** A new full order with `dragId` moved next to `anchorId`. `ids` is the
 *  current full ordering; unknown anchor leaves the order unchanged. */
export function movedOrder(ids: string[], dragId: string, anchorId: string, side: 'before' | 'after'): string[] {
  if (dragId === anchorId) return ids;
  const without = ids.filter((i) => i !== dragId);
  const at = without.indexOf(anchorId);
  if (at < 0 || !ids.includes(dragId)) return ids;
  without.splice(side === 'before' ? at : at + 1, 0, dragId);
  return without;
}
