import { memo } from 'react';
import type { Preset } from '../types';
import { SOUND_LIBRARY } from '../data';
import { CATEGORY_COLORS } from '../lib/categoryIcons';
import { SOUND_ICONS } from '../lib/soundIcons';
import { presetSoundIds, type Scene } from '../lib/scenes';

// The two horizontal shelves above the library: curated scenes and the user's
// saved mixes. [v0.0.21 perf] Both cards are memoized. The app re-renders once
// a second while a sleep timer counts down (and on every volume change), and a
// card's own inputs — its scene/preset, whether it's the current mix, and play
// state — rarely change, so with stable (ref-backed) handlers from App a
// countdown tick repaints none of them.

/** The categories of a preset's layers, in library order, deduplicated. */
function presetCategories(preset: Preset): string[] {
  const cats: string[] = [];
  for (const sound of SOUND_LIBRARY) {
    if (preset.state[sound.id]?.enabled && !cats.includes(sound.category)) {
      cats.push(sound.category);
    }
  }
  return cats;
}

/** A saved mix's card tint, derived from the hues of its own layers — each
 *  blend gets a quiet color identity, the way scenes carry their art.
 *
 *  Each hue keeps its own corner over a cool ink wash. Blending the two hues
 *  through each other in one linear gradient went muddy whenever a warm family
 *  was involved: thinly spread over the night-blue, Cozy gold and Fire ember
 *  read as brown, and against a cool partner they cancelled to grey (measured
 *  chroma ~0.010 on "just chimes" or "fire & chimes", against 0.020-0.029 for
 *  cool blends). A concentrated corner core keeps the warm hues reading as
 *  light rather than as a stain — the same fix as the scene art. */
function mixArt(preset: Preset): string {
  const colors = presetCategories(preset).map((cat) => CATEGORY_COLORS[cat] ?? '123,167,232');
  const a = colors[0] ?? '184,154,106';
  const b = colors[1];
  return [
    `radial-gradient(110% 95% at 0% 0%, rgba(${a},0.26) 0%, rgba(${a},0.08) 42%, transparent 68%)`,
    ...(b ? [`radial-gradient(95% 90% at 100% 100%, rgba(${b},0.18) 0%, transparent 62%)`] : []),
    'linear-gradient(135deg, rgba(30,40,62,0.24) 0%, rgba(8,12,20,0.25) 100%)',
  ].join(', ');
}

/** Up to three layer glyphs, and the "now playing" bars on the current card. */
function CardMarks({ ids, current, isPlaying, prefix }: {
  ids: string[];
  current: boolean;
  isPlaying: boolean;
  prefix: 'scene' | 'mix';
}) {
  return (
    <>
      <span className={`${prefix}-icons`} aria-hidden="true">
        {ids.slice(0, 3).map((id) => (
          <span key={id} className="material-symbols-rounded">{SOUND_ICONS[id] ?? 'music_note'}</span>
        ))}
      </span>
      {current && (
        <span className={`${prefix}-state${isPlaying ? ' playing' : ''}`} aria-hidden="true">
          <span /><span /><span />
        </span>
      )}
    </>
  );
}

const layerCount = (n: number) => `${n} layer${n === 1 ? '' : 's'}`;

export const SceneCard = memo(function SceneCard({ scene, current, isPlaying, onPlay }: {
  scene: Scene;
  current: boolean;
  isPlaying: boolean;
  onPlay: (preset: Preset) => void;
}) {
  const ids = presetSoundIds(scene.preset);
  return (
    <div role="listitem" className="scene-item">
      <button
        type="button"
        className={`scene-card${current ? ' current' : ''}`}
        style={{ background: scene.art }}
        onClick={() => onPlay(scene.preset)}
        aria-label={`${current && isPlaying ? 'Pause' : 'Play'} scene ${scene.preset.name}`}
      >
        <CardMarks ids={ids} current={current} isPlaying={isPlaying} prefix="scene" />
        <span className="scene-name">{scene.preset.name}</span>
        <span className="scene-mood">{scene.mood}</span>
        <span className="scene-count">{layerCount(ids.length)}</span>
      </button>
    </div>
  );
});

export const MixCard = memo(function MixCard({ preset, current, isPlaying, onPlay, onDelete }: {
  preset: Preset;
  current: boolean;
  isPlaying: boolean;
  onPlay: (preset: Preset) => void;
  onDelete: (id: string) => void;
}) {
  const ids = presetSoundIds(preset);
  return (
    <div role="listitem" className={`mix-card${current ? ' current' : ''}`}>
      <button
        type="button"
        className="mix-card-body"
        style={{ backgroundImage: mixArt(preset) }}
        onClick={() => onPlay(preset)}
        aria-label={`${current && isPlaying ? 'Pause' : 'Play'} mix ${preset.name}`}
      >
        <CardMarks ids={ids} current={current} isPlaying={isPlaying} prefix="mix" />
        <span className="mix-name">{preset.name}</span>
        <span className="mix-count">{layerCount(ids.length)}</span>
      </button>
      <button
        type="button"
        className="mix-del"
        onClick={() => onDelete(preset.id)}
        aria-label={`Delete mix ${preset.name}`}
      >✕</button>
    </div>
  );
});
