import type { Preset, Sound, SoundQuality, SoundSource, SoundState } from './types';
import { SOUND_EDITOR_MODELS } from './components/soundEditorDefs';

// The procedural WAV generators are a sizeable DSP module that's only needed
// when a sound is first played (or retuned), never at page load — so it's
// code-split and imported on demand. The promise memoizes the one fetch.
let generatorsPromise: Promise<typeof import('./audio/generators')> | null = null;
const loadGenerators = () => (generatorsPromise ??= import('./audio/generators'));

/** Render a sound's WAV loop, loading the generator module on first use. */
export async function generateSoundWav(
  id: string,
  params: Record<string, number>,
): Promise<string | null> {
  return (await loadGenerators()).regenerateSound(id, params);
}

// ── Sound library ──────────────────────────────────────────────────────────

/** A sound's editor defaults — the slider values it plays with when a preset
 *  doesn't override them, so what plays always matches what the editor shows. */
export function editorDefaults(soundId: string): Record<string, number> {
  return Object.fromEntries(
    (SOUND_EDITOR_MODELS[soundId]?.groups ?? [])
      .flatMap((group) => group.params)
      .map((param) => [param.key, param.def]),
  );
}

/** Lazily render (and memoize) a sound's default WAV loop — synthesized on
 *  first use, never at page load, and seeded so it's identical every time. The
 *  promise is cached on success; a failure clears it so a later play can retry. */
function lazyWav(id: string): () => Promise<string> {
  let pending: Promise<string> | null = null;
  return () => {
    if (!pending) {
      // Render with the sound's editor defaults so the single source of truth for
      // a default WAV is its editor `def`s (which match the generator's internal
      // defaults today) — change a default once, in soundEditorDefs, and both the
      // played loop and the slider agree.
      pending = generateSoundWav(id, editorDefaults(id)).then((url) => {
        if (url == null) throw new Error(`no WAV generator for sound "${id}"`);
        return url;
      });
      pending.catch(() => { pending = null; });
    }
    return pending;
  };
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
  workletSound('rain',      'Rain',          'Water',    'rain.worklet.js',        'rain-gen'),
  workletSound('fire',      'Fire',          'Fire',     'fire.worklet.js',        'fire-synth'),
  wavSound('fan',           'Fan',           'Air'),
  wavSound('underwater',    'Underwater',    'Water'),
  workletSound('birdsong',  'Birdsong',      'Wildlife', 'birdsong.worklet.js',    'birdsong-synth'),
  wavSound('stream',        'Stream',        'Water'),
  wavSound('ocean',         'Ocean',         'Water'),
  wavSound('shower',        'Shower',        'Water'),
  wavSound('wind',          'Wind',          'Air'),
  workletSound('thunder',   'Thunder',       'Air',      'thunder.worklet.js',     'thunder-gen'),
  workletSound('forest',    'Windy Forest',  'Earth',    'windyforest.worklet.js', 'windyforest-gen'),
  wavSound('white-noise',   'White Noise',   'Noise'),
  wavSound('pink-noise',    'Pink Noise',    'Noise'),
  wavSound('brown-noise',   'Brown Noise',   'Noise'),
  wavSound('train',         'Train',         'Urban'),
  wavSound('airplane',      'Airplane',      'Urban'),
  wavSound('night',         'Night Insects', 'Wildlife'),
  wavSound('heartbeat',     'Heartbeat',     'Cozy'),
];

/** Ids whose audio is a live worklet (params apply instantly, and persist on the
 *  node across plays — so they must be re-asserted when context changes). */
export const WORKLET_SOUND_IDS = new Set(
  SOUND_LIBRARY.filter((s) => s.source.mode === 'worklet').map((s) => s.id),
);

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

/** An active layer in a built-in preset: id, volume, and optional editor
 *  tuning (slider overrides) so a scene can shape a sound, not just set its
 *  level — e.g. dropping the rain bed under the fan in "Fan & Rain". */
type ActiveLayer = [string, number] | [string, number, Record<string, number>];

function builtinState(active: ActiveLayer[]): Record<string, SoundState> {
  const result: Record<string, SoundState> = {};
  for (const s of SOUND_LIBRARY) result[s.id] = { enabled: false, volume: 0.5 };
  for (const [id, vol, tuning] of active) {
    result[id] = tuning
      ? { enabled: true, volume: vol, tuning }
      : { enabled: true, volume: vol };
  }
  return result;
}

export const BUILTIN_PRESETS: Preset[] = [
  // Mixed, not toggled-on: the focal layer leads, broad beds (rain, wind,
  // noise, ocean) sit underneath, and accents stay quiet and occasional.
  // The fan already supplies a broadband hush, so the rain here keeps its bed a
  // bit fainter than normal — present, but not a second competing curtain.
  { id: 'builtin-fan-rain',      name: 'Fan & Rain',        createdAt: '', masterVolume: 0.8,  state: builtinState([['fan', 0.25], ['rain', 0.50, { bed: 0.7 }]]) },
  { id: 'builtin-fireside',      name: 'Fireside',          createdAt: '', masterVolume: 0.8,  state: builtinState([['fire', 0.41], ['night', 0.05]]) },
  { id: 'builtin-deep-rest',     name: 'Deep Rest',         createdAt: '', masterVolume: 0.7,  state: builtinState([['brown-noise', 0.50], ['heartbeat', 0.24], ['night', 0.12]]) },
  { id: 'builtin-rainfall',      name: 'Rainfall',          createdAt: '', masterVolume: 0.8,  state: builtinState([['rain', 0.62]]) },
  { id: 'builtin-distant-storm', name: 'Distant Storm',     createdAt: '', masterVolume: 0.78, state: builtinState([['thunder', 0.62], ['rain', 0.40], ['wind', 0.16]]) },
  { id: 'builtin-windy-forest',  name: 'Windy Forest',      createdAt: '', masterVolume: 0.8,  state: builtinState([['forest', 0.60], ['wind', 0.32]]) },
  { id: 'builtin-ocean-night',   name: 'Ocean Night',       createdAt: '', masterVolume: 0.78, state: builtinState([['ocean', 0.55], ['wind', 0.18], ['night', 0.08]]) },
  { id: 'builtin-underwater',    name: 'Underwater',        createdAt: '', masterVolume: 0.75, state: builtinState([['underwater', 0.60]]) },
];

