import type { Sound } from '../types';
import { EDITABLE_SOUND_IDS } from './soundEditorDefs';
import { sliderFill } from '../lib/sliderFill';

const SOUND_ICONS: Record<string, string> = {
  rain:            'rainy',
  ocean:           'waves',
  wind:            'air',
  forest:          'forest',
  fire:            'local_fire_department',
  'white-noise':   'graphic_eq',
  'pink-noise':    'equalizer',
  'brown-noise':   'noise_aware',
  night:           'bedtime',
  thunder:         'thunderstorm',
  stream:          'stream',
  fan:             'mode_fan',
  airplane:        'flight',
  birdsong:        'raven',
  underwater:      'scuba_diving',
  train:           'train',
  heartbeat:       'cardiology',
  shower:          'shower',
};

interface SoundCardProps {
  sound: Sound;
  enabled: boolean;
  playing: boolean;
  loading?: boolean;
  volume: number;
  cardIndex?: number;
  editorOpen?: boolean;
  onToggleEditor?: () => void;
  onToggle: () => void;
  onVolumeChange: (value: number) => void;
}

export default function SoundCard({
  sound,
  enabled,
  playing,
  loading = false,
  volume,
  cardIndex,
  editorOpen = false,
  onToggleEditor,
  onToggle,
  onVolumeChange,
}: SoundCardProps) {
  const icon = SOUND_ICONS[sound.id] ?? 'music_note';
  const canEdit = EDITABLE_SOUND_IDS.includes(sound.id);

  return (
    <div
      style={cardIndex !== undefined ? { animationDelay: `${0.34 + cardIndex * 0.025}s` } : undefined}
      className={`sound-card${enabled ? ' active' : ''}${playing ? ' playing' : ''}${canEdit ? ' has-editor' : ''}`}
      data-cat={sound.category}
    >
      <button type="button" className="sound-card-toggle" onClick={onToggle} aria-pressed={enabled}>
        <div className="card-top">
          <span className="material-symbols-rounded card-icon">{icon}</span>
          <div className="card-indicator" aria-hidden="true">
            {loading ? (
              <div className="card-loader" aria-hidden="true" />
            ) : (
              <>
                <div className={`card-dot${enabled ? ' active' : ''}`} />
                <div className="eq-bars">
                  <span /><span /><span />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card-name">{sound.name}</div>
      </button>

      <div
        className="card-vol"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="material-symbols-rounded">volume_down</span>
        <input
          type="range"
          className="drift-slider"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          style={sliderFill(volume)}
          aria-label={`${sound.name} volume`}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
        />
      </div>

      {canEdit && (
        <button
          type="button"
          className={`card-editor-icon${editorOpen ? ' active' : ''}`}
          aria-label={`Edit ${sound.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleEditor?.();
          }}
        >
          <span className="material-symbols-rounded">tune</span>
        </button>
      )}
    </div>
  );
}
