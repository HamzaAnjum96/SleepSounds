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

// Ordered by build maturity — how many tuning passes each synth has survived —
// so the grid leads with the most convincing sounds. Rain and fire are the
// flagship worklets; fan / birdsong / insects are long-settled; then the rest,
// newest builds last. The hidden (pulled) sounds close the list.
export const SOUND_LIBRARY: Sound[] = [
  workletSound('rain',      'Rain',          'Water',    'rain.worklet.js',        'rain-gen'),
  workletSound('fire',      'Fire',          'Fire',     'fire.worklet.js',        'fire-synth'),
  wavSound('fan',           'Fan',           'Air'),
  workletSound('birdsong',  'Birdsong',      'Wildlife', 'birdsong.worklet.js',    'birdsong-synth'),
  wavSound('night',         'Night Insects', 'Wildlife'),
  workletSound('thunder',   'Thunder',       'Air',      'thunder.worklet.js',     'thunder-gen'),
  workletSound('forest',    'Windy Forest',  'Earth',    'windyforest.worklet.js', 'windyforest-gen'),
  wavSound('ocean',         'Ocean',         'Water'),
  wavSound('wind',          'Wind',          'Air'),
  wavSound('underwater',    'Underwater',    'Water'),
  wavSound('white-noise',   'White Noise',   'Noise'),
  wavSound('pink-noise',    'Pink Noise',    'Noise'),
  wavSound('brown-noise',   'Brown Noise',   'Noise'),
  wavSound('train',         'Train',         'Urban'),
  wavSound('airplane',      'Airplane',      'Urban'),
  wavSound('heartbeat',     'Heartbeat',     'Cozy'),
  wavSound('purr',          'Cat Purr',      'Wildlife'),
  wavSound('chimes',        'Wind Chimes',   'Cozy'),
  wavSound('clock',         'Ticking Clock', 'Cozy'),
  wavSound('stream',        'Stream',        'Water'),
  wavSound('shower',        'Shower',        'Water'),
];

/** Ids whose audio is a live worklet (params apply instantly, and persist on the
 *  node across plays — so they must be re-asserted when context changes). */
export const WORKLET_SOUND_IDS = new Set(
  SOUND_LIBRARY.filter((s) => s.source.mode === 'worklet').map((s) => s.id),
);

/** Finished sounds pulled from the library for now. Unlike `experimental`, these
 *  are always hidden (the feature flag doesn't reveal them) — delete an id to
 *  bring a sound back into the lineup. Their generators and editors stay intact,
 *  so saved mixes or presets that reference them still play. */
export const HIDDEN_SOUND_IDS = new Set(['stream', 'shower']);

/** The library minus hidden sounds, and minus unfinished (experimental) ones
 *  unless the experimentalSounds feature flag is on. `includeHidden` (dev
 *  mode's moon toggle) brings the pulled sounds back for auditioning. */
export function releasableSounds(includeExperimental: boolean, includeHidden = false): Sound[] {
  return SOUND_LIBRARY.filter(
    (s) =>
      (includeHidden || !HIDDEN_SOUND_IDS.has(s.id)) &&
      (includeExperimental || s.quality !== 'experimental'),
  );
}

// Filter order: the elemental families people reach for first (water, fire,
// wind, wildlife), then the indoor/textural ones.
export const CATEGORIES = ['All', 'Water', 'Fire', 'Air', 'Wildlife', 'Cozy', 'Earth', 'Noise', 'Urban'] as const;
export type Category = typeof CATEGORIES[number];

/** Per-sound starting volume. Fire is synthesized +1.5x louder for headroom,
 *  so its default is lowered by the same factor: what you hear by default is
 *  unchanged, but the slider can reach louder. Birdsong's live worklet is
 *  level-matched to its peak-normalised WAV fallback (which runs hot), so the
 *  lowered default keeps both routes at a normal loudness. */
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
  // Rain on glass — the exact "At a Window" variant (so the editor shows that
  // name, not "custom"), matching the scene's mood line. The fan's hush and the
  // masking graph keep the rain bed from competing, so no extra bed trim here.
  { id: 'builtin-fan-rain',      name: 'Fan & Rain',        createdAt: '', masterVolume: 0.8,  state: builtinState([['fan', 0.06], ['rain', 0.50, { surface: 0.40, heaviness: 0.40, intensity: 0.50, drops: 0.55, bed: 0.66, space: 0.62, movement: 0.28, metallic: 0.30 }]]) },
  { id: 'builtin-fireside',      name: 'Fireside',          createdAt: '', masterVolume: 0.8,  state: builtinState([['fire', 0.41], ['night', 0.05]]) },
  { id: 'builtin-deep-rest',     name: 'Deep Rest',         createdAt: '', masterVolume: 0.7,  state: builtinState([['brown-noise', 0.50], ['heartbeat', 0.24], ['night', 0.12]]) },
  { id: 'builtin-rainfall',      name: 'Rainfall',          createdAt: '', masterVolume: 0.8,  state: builtinState([['rain', 0.62]]) },
  { id: 'builtin-distant-storm', name: 'Distant Storm',     createdAt: '', masterVolume: 0.78, state: builtinState([['thunder', 0.62], ['rain', 0.40], ['wind', 0.16]]) },
  { id: 'builtin-windy-forest',  name: 'Windy Forest',      createdAt: '', masterVolume: 0.8,  state: builtinState([['forest', 0.60], ['wind', 0.32]]) },
  { id: 'builtin-ocean-night',   name: 'Ocean Night',       createdAt: '', masterVolume: 0.78, state: builtinState([['ocean', 0.55], ['wind', 0.18], ['night', 0.08]]) },
  { id: 'builtin-underwater',    name: 'Underwater',        createdAt: '', masterVolume: 0.75, state: builtinState([['underwater', 0.60]]) },
  // The purr leads; the rain is the exact "Light Rain" variant (so the editor
  // shows that name), a thin far-off patter under the breathing.
  { id: 'builtin-curled-up',     name: 'Curled Up',         createdAt: '', masterVolume: 0.75, state: builtinState([['purr', 0.55], ['rain', 0.24, { intensity: 0.18, heaviness: 0.22, surface: 0.55, bed: 0.50, drops: 0.08, movement: 0.40, space: 0.20, metallic: 0 }]]) },
  // Chimes over night insects, and the exact "Night Breeze" wind variant
  // barely moving underneath (so the editor shows that name).
  { id: 'builtin-evening-porch', name: 'Evening Porch',     createdAt: '', masterVolume: 0.78, state: builtinState([['chimes', 0.52], ['night', 0.14], ['wind', 0.14, { gusts: 0.22, whistle: 0.04, tone: 0.32 }]]) },
];

