import type { Preset, Sound, SoundState } from './types';
import {
  genForest, genWhite, genBrown, genFan, genPink, genRain, genOcean, genWind, genFire, genBirdsong, genStream, genThunder, genTrain, genUnderwater, genShower, genAirplane, genSpace, genHeartbeat,
} from './audio/generators';

export { regenerateSound } from './audio/generators';

// ── Sound library ──────────────────────────────────────────────────────────

/** A sound whose WAV is synthesized on first use, not at page load. Eagerly
 *  generating all 18 loops blocked startup for over a second on mid-range
 *  phones; lazily, the app paints instantly and each sound pays its ~50ms
 *  synthesis cost inside the tap that first plays it (under its spinner). */
function lazySound(id: string, name: string, category: string, make: () => string): Sound {
  let url: string | null = null;
  return {
    id,
    name,
    category,
    get url() { return (url ??= make()); },
  };
}

export const SOUND_LIBRARY: Sound[] = [
  // Water
  lazySound('rain',        'Rain',         'Water',    genRain),
  lazySound('stream',      'Stream',       'Water',    genStream),
  lazySound('ocean',       'Ocean',        'Water',    genOcean),
  lazySound('underwater',  'Underwater',   'Water',    genUnderwater),
  lazySound('shower',      'Shower',       'Water',    genShower),
  // Fire
  lazySound('fire',        'Fire',         'Fire',     genFire),
  // Air
  lazySound('wind',        'Wind',         'Air',      genWind),
  lazySound('thunder',     'Thunder',      'Air',      genThunder),
  lazySound('fan',         'Fan',          'Air',      genFan),
  // Earth
  lazySound('forest',      'Windy Forest', 'Earth',    genForest),
  // Noise
  lazySound('white-noise', 'White Noise',  'Noise',    genWhite),
  lazySound('pink-noise',  'Pink Noise',   'Noise',    genPink),
  lazySound('brown-noise', 'Brown Noise',  'Noise',    genBrown),
  // Urban
  lazySound('train',       'Train',        'Urban',    genTrain),
  lazySound('airplane',    'Airplane',     'Urban',    genAirplane),
  // Wildlife
  lazySound('night',       'Night Insects', 'Wildlife', genSpace),
  lazySound('birdsong',    'Birdsong',     'Wildlife', genBirdsong),
  // Cozy
  lazySound('heartbeat',   'Heartbeat',    'Cozy',     genHeartbeat),
];

export const CATEGORIES = ['All', 'Water', 'Fire', 'Air', 'Earth', 'Noise', 'Urban', 'Wildlife', 'Cozy'] as const;
export type Category = typeof CATEGORIES[number];

export const PRESET_STORAGE_KEY = 'sleep-mixer-presets-v2';

/** Per-sound starting volume. Fire and birdsong are synthesized +1.5x louder
 *  for headroom, so their defaults are lowered by the same factor: what you
 *  hear by default is unchanged, but their sliders can now reach louder. */
const DEFAULT_VOLUME: Record<string, number> = { fire: 0.34, birdsong: 0.34 };
export const defaultVolumeFor = (id: string): number => DEFAULT_VOLUME[id] ?? 0.5;

// ── Built-in presets ───────────────────────────────────────────────────────

function builtinState(active: Array<[string, number]>): Record<string, SoundState> {
  const result: Record<string, SoundState> = {};
  for (const s of SOUND_LIBRARY) result[s.id] = { enabled: false, volume: 0.5 };
  for (const [id, vol] of active) result[id] = { enabled: true, volume: vol };
  return result;
}

export const BUILTIN_PRESETS: Preset[] = [
  // Mixed, not toggled-on: the focal layer leads, broad beds (rain, wind,
  // noise, ocean) sit underneath, and accents stay quiet and occasional.
  { id: 'builtin-fan-rain',      name: 'Fan & Rain',        createdAt: '', masterVolume: 0.8,  state: builtinState([['fan', 0.50], ['rain', 0.50]]) },
  { id: 'builtin-fireside',      name: 'Fireside',          createdAt: '', masterVolume: 0.8,  state: builtinState([['fire', 0.41], ['night', 0.05]]) },
  { id: 'builtin-deep-rest',     name: 'Deep Rest',         createdAt: '', masterVolume: 0.7,  state: builtinState([['brown-noise', 0.50], ['heartbeat', 0.24], ['night', 0.12]]) },
  { id: 'builtin-rainfall',      name: 'Rainfall',          createdAt: '', masterVolume: 0.8,  state: builtinState([['rain', 0.62]]) },
  { id: 'builtin-distant-storm', name: 'Distant Storm',     createdAt: '', masterVolume: 0.78, state: builtinState([['thunder', 0.62], ['rain', 0.40], ['wind', 0.16]]) },
  { id: 'builtin-windy-forest',  name: 'Windy Forest',      createdAt: '', masterVolume: 0.8,  state: builtinState([['forest', 0.60], ['wind', 0.32]]) },
  { id: 'builtin-ocean-night',   name: 'Ocean Night',       createdAt: '', masterVolume: 0.78, state: builtinState([['ocean', 0.55], ['wind', 0.18], ['night', 0.08]]) },
  { id: 'builtin-underwater',    name: 'Underwater',        createdAt: '', masterVolume: 0.75, state: builtinState([['underwater', 0.60]]) },
];

