import type { Preset, Sound, SoundQuality, SoundSource, SoundState } from './types';
import { regenerateSound } from './audio/generators';
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

/** Lazily render (and memoize) a sound's default WAV loop — synthesized on
 *  first use, never at page load, and seeded so it's identical every time. */
function lazyWav(id: string): () => string {
  let url: string | null = null;
  return () => (url ??= regenerateSound(id, {}) as string);
}

interface SoundMeta { tags?: string[]; quality?: SoundQuality }

function wavSound(id: string, name: string, category: string, meta: SoundMeta = {}): Sound {
  return {
    id, name, category,
    source: { mode: 'wav', make: lazyWav(id) },
    tags: meta.tags ?? [],
    quality: meta.quality ?? 'good',
  };
}

/** A live AudioWorklet sound, with its procedural WAV loop as the fallback. */
function workletSound(id: string, name: string, category: string, module: string, processor: string, meta: SoundMeta = {}): Sound {
  const source: SoundSource = { mode: 'worklet', module, processor, params: editorDefaults(id), fallback: lazyWav(id) };
  return { id, name, category, source, tags: meta.tags ?? [], quality: meta.quality ?? 'good' };
}

export const SOUND_LIBRARY: Sound[] = [
  // Water
  workletSound('rain',     'Rain',          'Water',    'rain.worklet.js',        'rain-gen'),
  wavSound('stream',       'Stream',        'Water'),
  wavSound('ocean',        'Ocean',         'Water'),
  wavSound('underwater',   'Underwater',    'Water'),
  wavSound('shower',       'Shower',        'Water'),
  // Fire
  workletSound('fire',     'Fire',          'Fire',     'fire.worklet.js',        'fire-synth'),
  // Air
  wavSound('wind',         'Wind',          'Air'),
  workletSound('thunder',  'Thunder',       'Air',      'thunder.worklet.js',     'thunder-gen'),
  wavSound('fan',          'Fan',           'Air'),
  // Earth
  workletSound('forest',   'Windy Forest',  'Earth',    'windyforest.worklet.js', 'windyforest-gen'),
  // Noise
  wavSound('white-noise',  'White Noise',   'Noise'),
  wavSound('pink-noise',   'Pink Noise',    'Noise'),
  wavSound('brown-noise',  'Brown Noise',   'Noise'),
  // Urban
  wavSound('train',        'Train',         'Urban'),
  wavSound('airplane',     'Airplane',      'Urban'),
  // Wildlife
  wavSound('night',        'Night Insects', 'Wildlife'),
  workletSound('birdsong', 'Birdsong',      'Wildlife', 'birdsong.worklet.js',    'birdsong-synth'),
  // Cozy
  wavSound('heartbeat',    'Heartbeat',     'Cozy'),
];

/** The library minus unfinished sounds: experimental ones appear only when the
 *  experimentalSounds feature flag is on. */
export function releasableSounds(includeExperimental: boolean): Sound[] {
  return includeExperimental ? SOUND_LIBRARY : SOUND_LIBRARY.filter((s) => s.quality !== 'experimental');
}

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
  { id: 'builtin-fan-rain',      name: 'Fan & Rain',        createdAt: '', masterVolume: 0.8,  state: builtinState([['fan', 0.25], ['rain', 0.50]]) },
  { id: 'builtin-fireside',      name: 'Fireside',          createdAt: '', masterVolume: 0.8,  state: builtinState([['fire', 0.41], ['night', 0.05]]) },
  { id: 'builtin-deep-rest',     name: 'Deep Rest',         createdAt: '', masterVolume: 0.7,  state: builtinState([['brown-noise', 0.50], ['heartbeat', 0.24], ['night', 0.12]]) },
  { id: 'builtin-rainfall',      name: 'Rainfall',          createdAt: '', masterVolume: 0.8,  state: builtinState([['rain', 0.62]]) },
  { id: 'builtin-distant-storm', name: 'Distant Storm',     createdAt: '', masterVolume: 0.78, state: builtinState([['thunder', 0.62], ['rain', 0.40], ['wind', 0.16]]) },
  { id: 'builtin-windy-forest',  name: 'Windy Forest',      createdAt: '', masterVolume: 0.8,  state: builtinState([['forest', 0.60], ['wind', 0.32]]) },
  { id: 'builtin-ocean-night',   name: 'Ocean Night',       createdAt: '', masterVolume: 0.78, state: builtinState([['ocean', 0.55], ['wind', 0.18], ['night', 0.08]]) },
  { id: 'builtin-underwater',    name: 'Underwater',        createdAt: '', masterVolume: 0.75, state: builtinState([['underwater', 0.60]]) },
];

