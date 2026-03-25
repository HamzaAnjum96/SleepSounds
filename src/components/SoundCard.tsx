import type { Sound } from '../types';

const SOUND_ICONS: Record<string, string> = {
  rain:          'water_drop',
  ocean:         'waves',
  wind:          'air',
  forest:        'park',
  fireplace:     'local_fire_department',
  'white-noise': 'graphic_eq',
  'brown-noise': 'noise_aware',
  night:         'bedtime',
  thunder:       'thunderstorm',
  stream:        'stream',
  space:         'public',
  fan:           'mode_fan',
  cafe:          'local_cafe',
  airplane:      'flight',
  birdsong:      'yard',
};

interface SoundCardProps {
  sound: Sound;
  enabled: boolean;
  playing: boolean;
  volume: number;
  onToggle: () => void;
  onVolumeChange: (value: number) => void;
}

function sliderBg(value: number) {
  const pct = value * 100;
  return {
    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
  };
}

export default function SoundCard({ sound, enabled, playing, volume, onToggle, onVolumeChange }: SoundCardProps) {
  const icon = SOUND_ICONS[sound.id] ?? 'music_note';

  return (
    <button
      type="button"
      className={`sound-card${enabled ? ' active' : ''}${playing ? ' playing' : ''}`}
      onClick={onToggle}
      aria-pressed={enabled}
    >
      <div className="card-top">
        <span className="material-symbols-rounded card-icon">{icon}</span>
        <div className="card-indicator">
          <div className={`card-dot${enabled ? ' active' : ''}`} />
          <div className="eq-bars">
            <span /><span /><span />
          </div>
        </div>
      </div>

      <div className="card-name">{sound.name}</div>

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
          style={sliderBg(volume)}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
        />
      </div>
    </button>
  );
}
