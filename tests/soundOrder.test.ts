import { describe, it, expect, beforeEach } from 'vitest';
import { loadSoundOrder, saveSoundOrder, orderSounds, movedOrder } from '../src/storage/soundOrder';

// Node has no localStorage; a tiny stub is enough for the load/save contract.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
});

const sounds = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('loadSoundOrder', () => {
  it('returns null for missing or garbage storage', () => {
    expect(loadSoundOrder()).toBeNull();
    store.set('drift-sound-order', 'not json {');
    expect(loadSoundOrder()).toBeNull();
    store.set('drift-sound-order', '42');
    expect(loadSoundOrder()).toBeNull();
    store.set('drift-sound-order', '[]');
    expect(loadSoundOrder()).toBeNull();
  });

  it('keeps only unique string ids', () => {
    store.set('drift-sound-order', JSON.stringify(['b', 'a', 'b', 7, null, '', 'c']));
    expect(loadSoundOrder()).toEqual(['b', 'a', 'c']);
  });

  it('round-trips through saveSoundOrder', () => {
    saveSoundOrder(['c', 'a', 'b']);
    expect(loadSoundOrder()).toEqual(['c', 'a', 'b']);
  });
});

describe('orderSounds', () => {
  it('returns the input order when nothing is saved', () => {
    expect(orderSounds(sounds, null).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('applies the saved order, drops unknown ids, appends missing ones', () => {
    // 'x' no longer exists; 'b' and 'd' are new since the order was saved.
    expect(orderSounds(sounds, ['c', 'x', 'a']).map((s) => s.id)).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('movedOrder', () => {
  const ids = ['a', 'b', 'c', 'd'];
  it('moves before an anchor', () => {
    expect(movedOrder(ids, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
  });
  it('moves after an anchor', () => {
    expect(movedOrder(ids, 'a', 'd', 'after')).toEqual(['b', 'c', 'd', 'a']);
  });
  it('is a no-op for self, unknown drag, or unknown anchor', () => {
    expect(movedOrder(ids, 'b', 'b', 'before')).toEqual(ids);
    expect(movedOrder(ids, 'zz', 'b', 'before')).toEqual(ids);
    expect(movedOrder(ids, 'b', 'zz', 'before')).toEqual(ids);
  });
});
