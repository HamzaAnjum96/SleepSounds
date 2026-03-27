import { lazy, Suspense, useState } from 'react';
import type { Sound } from '../types';
import { EDITABLE_SOUND_IDS } from './soundEditorDefs';

const LazySoundEditor = lazy(() => import('./SoundEditor'));

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
  waterfall:       'water',
  'tent-rain':     'camping',
  'tin-roof-rain': 'roofing',
  space:           'public',
  fan:             'mode_fan',
  cafe:            'local_cafe',
  airplane:        'flight',
  birdsong:        'raven',
  underwater:      'scuba_diving',
  dryer:           'local_laundry_service',
  train:           'train',
  frogs:           'grass',
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
  onToggle: () => void;
  onVolumeChange: (value: number) => void;
}

function sliderBg(value: number) {
  const pct = value * 100;
  return {
    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
  };
}

export default function SoundCard({ sound, enabled, playing, loading = false, volume, cardIndex, onToggle, onVolumeChange }: SoundCardProps) {
  const icon = SOUND_ICONS[sound.id] ?? 'music_note';
  const canEdit = EDITABLE_SOUND_IDS.includes(sound.id as 'fire' | 'birdsong');
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <div
      style={cardIndex !== undefined ? { animationDelay: `${0.34 + cardIndex * 0.025}s` } : undefined}
      className={`sound-card${enabled ? ' active' : ''}${playing ? ' playing' : ''}`}
    >
      <button type="button" className="sound-card-toggle" onClick={onToggle} aria-pressed={enabled}>
        <div className="card-top">
          <span className="material-symbols-rounded card-icon">{icon}</span>
          <div className="card-indicator">
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
          style={sliderBg(volume)}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
        />
      </div>

      {canEdit && (
        <div className="card-editor-wrap" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`sb-toggle card-editor-toggle${editorOpen ? ' active' : ''}`}
            onClick={() => setEditorOpen((v) => !v)}
          >
            <span className="material-symbols-rounded">tune</span>
            edit {sound.name.toLowerCase()}
            <span className="material-symbols-rounded sb-chevron">{editorOpen ? 'expand_less' : 'expand_more'}</span>
          </button>
          {editorOpen && (
            <Suspense fallback={<div className="sb-panel">Loading editor…</div>}>
              <LazySoundEditor soundId={sound.id as 'fire' | 'birdsong'} />
            </Suspense>
          )}
        </div>
      )}
    </div>
  );
}
