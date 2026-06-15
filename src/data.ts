import type { Preset, Sound, SoundSource, SoundState } from './types';
import {
  genForest, genWhite, genBrown, genFan, genPink, genRain, genOcean, genWind, genFire, genBirdsong, genStream, genThunder, genTrain, genUnderwater, genShower, genAirplane, genSpace, genHeartbeat,
} from './audio/generators';
import { SOUND_EDITOR_MODELS } from './components/soundEditorDefs';

export { regenerateSound } from './audio/generators';

// ── Sound library ──────────────────────────────────────────────────────────

/** A worklet's initial params come from its editor defaults, so what plays
 *  always matches what the editor shows. */
function editorDefaults(soundId: string): Record<string, number> {
  return Object.fromEntries(
    (SOUND_EDITOR_MODELS[soundId]?.groups ?? [])
      .flatMap((group) => group.params)
      .map((param) => [param.key, param.def]),
  );
}

/** Memoize a generator so its WAV is synthesized once, on first use — never at
 *  page load (eagerly generating all loops cost a second-plus on mid phones). */
function lazy(gen: () => string): () => string {
  let url: string | null = null;
  return () => (url ??= gen());
}

function wavSound(id: string, name: string, category: string, gen: () => string): Sound {
  return { id, name, category, source: { mode: 'wav', make: lazy(gen) } };
}

/** A live AudioWorklet sound, with its procedural WAV loop as the fallback. */
function workletSound(
  id: string, name: string, category: string,
  module: string, processor: string, fallbackGen: () => string,
): Sound {
  const source: SoundSource = { mode: 'worklet', module, processor, params: editorDefaults(id), fallback: lazy(fallbackGen) };
  return { id, name, category, source };
}

export const SOUND_LIBRARY: Sound[] = [
  // Water
  workletSound('rain',     'Rain',         'Water',    'rain.worklet.js',       'rain-gen',       genRain),
  wavSound('stream',       'Stream',       'Water',    genStream),
  wavSound('ocean',        'Ocean',        'Water',    genOcean),
  wavSound('underwater',   'Underwater',   'Water',    genUnderwater),
  wavSound('shower',       'Shower',       'Water',    genShower),
  // Fire
  workletSound('fire',     'Fire',         'Fire',     'fire.worklet.js',       'fire-synth',     genFire),
  // Air
  wavSound('wind',         'Wind',         'Air',      genWind),
  workletSound('thunder',  'Thunder',      'Air',      'thunder.worklet.js',    'thunder-gen',    genThunder),
  wavSound('fan',          'Fan',          'Air',      genFan),
  // Earth
  workletSound('forest',   'Windy Forest', 'Earth',    'windyforest.worklet.js', 'windyforest-gen', genForest),
  // Noise
  wavSound('white-noise',  'White Noise',  'Noise',    genWhite),
  wavSound('pink-noise',   'Pink Noise',   'Noise',    genPink),
  wavSound('brown-noise',  'Brown Noise',  'Noise',    genBrown),
  // Urban
  wavSound('train',        'Train',        'Urban',    genTrain),
  wavSound('airplane',     'Airplane',     'Urban',    genAirplane),
  // Wildlife
  wavSound('night',        'Night Insects', 'Wildlife', genSpace),
  workletSound('birdsong', 'Birdsong',     'Wildlife', 'birdsong.worklet.js',   'birdsong-synth', genBirdsong),
  // Cozy
  wavSound('heartbeat',    'Heartbeat',    'Cozy',     genHeartbeat),
];

export const CATEGORIES = ['All', 'Water', 'Fire', 'Air', 'Earth', 'Noise', 'Urban', 'Wildlife', 'Cozy'] as const;
export type Category = typeof CATEGORIES[number];

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

