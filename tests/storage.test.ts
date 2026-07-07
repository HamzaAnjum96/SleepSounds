import { describe, it, expect } from 'vitest';
import { migrateSavedMixes, migrateSession } from '../src/storage/migrations';

const ids = new Set(['rain', 'fire', 'fan']);

describe('migrateSavedMixes', () => {
  it('returns [] for any non-array / garbage input', () => {
    for (const bad of [null, undefined, 42, 'nope', {}, true]) {
      expect(migrateSavedMixes(bad, ids)).toEqual([]);
    }
  });

  it('skips non-object entries', () => {
    expect(migrateSavedMixes([null, 5, 'x', []], ids)).toEqual([]);
  });

  it('rebuilds state with only known sounds and clamps volumes', () => {
    const [mix] = migrateSavedMixes([{
      id: 'a', name: 'Test', createdAt: 't',
      state: { rain: { enabled: true, volume: 9 }, bogus: { enabled: true, volume: 0.5 } },
      masterVolume: 0.7,
    }], ids);
    expect(Object.keys(mix.state).sort()).toEqual(['fan', 'fire', 'rain']); // only known
    expect(mix.state.rain).toEqual({ enabled: true, volume: 1 });            // clamped
    expect(mix.state).not.toHaveProperty('bogus');                          // dropped
    expect(mix.masterVolume).toBe(0.7);
  });

  it('fills missing id / name / createdAt and clamps master volume', () => {
    const [mix] = migrateSavedMixes([{ state: { fan: { enabled: true, volume: 0.3 } }, masterVolume: -2 }], ids);
    expect(mix.id).toBeTruthy();
    expect(mix.name).toBe('Untitled Mix');
    expect(typeof mix.createdAt).toBe('string');
    expect(mix.masterVolume).toBe(0);
  });

  it('leaves masterVolume undefined when absent', () => {
    const [mix] = migrateSavedMixes([{ id: 'b', name: 'X', createdAt: 't', state: {} }], ids);
    expect(mix.masterVolume).toBeUndefined();
  });
});

describe('migrateSession', () => {
  it('returns null for garbage or empty sessions', () => {
    for (const bad of [null, 'x', 42, {}, { state: {} }, { state: { rain: { enabled: false } } }]) {
      expect(migrateSession(bad, ids)).toBeNull();
    }
  });

  it('drops unknown sounds, and is null if nothing enabled survives', () => {
    expect(migrateSession({ state: { ghost: { enabled: true, volume: 0.5 } } }, ids)).toBeNull();
  });

  it('keeps enabled known sounds, clamps volumes, defaults master to 0.8', () => {
    const s = migrateSession({ state: { rain: { enabled: true, volume: 5 } } }, ids);
    expect(s).not.toBeNull();
    expect(s!.state.rain).toEqual({ enabled: true, volume: 1 });
    expect(s!.masterVolume).toBe(0.8);
  });

  it('clamps an out-of-range master volume', () => {
    const s = migrateSession({ state: { fire: { enabled: true, volume: 0.5 } }, masterVolume: 9 }, ids);
    expect(s!.masterVolume).toBe(1);
  });

  it('preserves a layer\'s finite tuning so a resumed mix keeps its character', () => {
    const s = migrateSession(
      { state: { rain: { enabled: true, volume: 0.5, tuning: { intensity: 0.2, drops: 0.55, junk: 'x', bad: NaN } } } },
      ids,
    );
    // Only finite numbers survive; the string and NaN are dropped.
    expect(s!.state.rain.tuning).toEqual({ intensity: 0.2, drops: 0.55 });
  });
});
