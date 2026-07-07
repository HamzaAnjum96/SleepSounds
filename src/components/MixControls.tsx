import { useCallback, useEffect, useState } from 'react';
import type { Sound, SoundState } from '../types';
import { CATEGORY_ICONS } from '../lib/categoryIcons';
import { features } from '../config/features';
import { sliderFill } from '../lib/sliderFill';
import { haptic } from '../lib/haptics';
import { formatCountdown } from '../lib/time';

/**
 * The mix's control body: every active layer on its own slider, master volume,
 * the sleep timer, and the doorways to drift mode and saving. Shared by the
 * mobile now-playing sheet and the desktop side panel, so the two surfaces stay
 * in lockstep. The host (sheet vs panel) owns the chrome around it; this owns
 * the controls and the local save-name state.
 */

// `spoken` is the screen-reader label — the terse visible chip ("15m") reads as
// letters otherwise, and its sibling +30m / +1h / off buttons already carry full
// spoken labels, so the presets should match. [v0.0.23 a11y]
export const TIMER_PRESETS = [
  { label: '15m', secs: 15 * 60,  spoken: '15 minutes' },
  { label: '30m', secs: 30 * 60,  spoken: '30 minutes' },
  { label: '1h',  secs: 60 * 60,  spoken: '1 hour' },
  { label: '2h',  secs: 120 * 60, spoken: '2 hours' },
  { label: '4h',  secs: 240 * 60, spoken: '4 hours' },
  { label: '8h',  secs: 480 * 60, spoken: '8 hours' },
];

function endsAround(secondsLeft: number) {
  const d = new Date(Date.now() + secondsLeft * 1000);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

interface MixControlsProps {
  activeSounds: Sound[];
  soundState: Record<string, SoundState>;
  isPlaying: boolean;
  onSoundVolume: (id: string, v: number) => void;
  onRemoveSound: (id: string) => void;
  masterVolume: number;
  onMasterVolume: (v: number) => void;
  secondsLeft: number | null;
  timerTotal: number | null;
  onTimerSelect: (secs: number) => void;
  onTimerExtend: (secs: number) => void;
  onTimerClear: () => void;
  onClearMix: () => void;
  onDrift: () => void;
  onSave: (name: string) => void;
  /** Open straight into the save-name field. */
  startSaving?: boolean;
  mutedIds: string[];
  soloIds: string[];
  onToggleMute: (id: string) => void;
  onToggleSolo: (id: string) => void;
  sleepSafe: boolean;
  onSleepSafe: (on: boolean) => void;
}

export default function MixControls({
  activeSounds,
  soundState,
  isPlaying,
  onSoundVolume,
  onRemoveSound,
  masterVolume,
  onMasterVolume,
  secondsLeft,
  timerTotal,
  onTimerSelect,
  onTimerExtend,
  onTimerClear,
  onClearMix,
  onDrift,
  onSave,
  startSaving = false,
  mutedIds,
  soloIds,
  onToggleMute,
  onToggleSolo,
  sleepSafe,
  onSleepSafe,
}: MixControlsProps) {
  const [saving, setSaving] = useState(startSaving);
  const [name, setName] = useState('');

  // The host re-mounts/keys this when its open/save intent changes, but also
  // sync if the intent flips while mounted (desktop panel stays mounted).
  useEffect(() => { setSaving(startSaving); }, [startSaving]);

  const handleSave = useCallback(() => {
    if (!name.trim()) return;
    haptic(12);
    onSave(name.trim());
    setName('');
    setSaving(false);
  }, [name, onSave]);

  return (
    <>
      <div className="sheet-layers">
        <div className="sheet-row-head">
          <span className="sheet-label">the mix</span>
          {activeSounds.length > 0 && (
            <button
              type="button"
              className="sheet-clear"
              onClick={onClearMix}
              aria-label="Stop the whole mix"
            >stop mix</button>
          )}
        </div>
        {activeSounds.map((sound) => {
          const volume = soundState[sound.id]?.volume ?? 0.5;
          const muted = mutedIds.includes(sound.id);
          const soloed = soloIds.includes(sound.id);
          return (
            <div key={sound.id} className="layer-row" data-cat={sound.category}>
              <span className="material-symbols-rounded layer-icon" aria-hidden="true">
                {CATEGORY_ICONS[sound.category] ?? 'music_note'}
              </span>
              <div className="layer-main">
                <div className="layer-head">
                  <span className="layer-name">{sound.name}</span>
                  <span className="layer-pct">{Math.round(volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="drift-slider"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  style={sliderFill(volume)}
                  aria-label={`${sound.name} volume`}
                  onChange={(e) => onSoundVolume(sound.id, Number(e.target.value))}
                />
              </div>
              {features.layerMuteSolo && (
                <div className="layer-toggles">
                  <button
                    type="button"
                    className={`layer-toggle${muted ? ' on' : ''}`}
                    aria-pressed={muted}
                    onClick={() => onToggleMute(sound.id)}
                    aria-label={`${muted ? 'Unmute' : 'Mute'} ${sound.name}`}
                  >M</button>
                  <button
                    type="button"
                    className={`layer-toggle${soloed ? ' on' : ''}`}
                    aria-pressed={soloed}
                    onClick={() => onToggleSolo(sound.id)}
                    aria-label={`${soloed ? 'Unsolo' : 'Solo'} ${sound.name}`}
                  >S</button>
                </div>
              )}
              <button
                type="button"
                className="layer-remove"
                onClick={() => onRemoveSound(sound.id)}
                aria-label={`Remove ${sound.name}`}
              >✕</button>
            </div>
          );
        })}
        {activeSounds.length === 0 && (
          <p className="sheet-empty">the mix is empty · add sounds from the library</p>
        )}
      </div>

      <div className="sheet-master">
        <div className="sheet-row-head">
          <span className="sheet-label">master volume</span>
          <span className="sheet-value">{Math.round(masterVolume * 100)}%</span>
        </div>
        <input
          type="range"
          className="drift-slider"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          style={sliderFill(masterVolume)}
          aria-label="Master volume"
          onChange={(e) => onMasterVolume(Number(e.target.value))}
        />
        <button
          type="button"
          className={`sleep-safe${sleepSafe ? ' on' : ''}`}
          aria-pressed={sleepSafe}
          onClick={() => onSleepSafe(!sleepSafe)}
        >
          <span className="sleep-safe-dot" aria-hidden="true" />
          sleep-safe
          <span className="sleep-safe-hint">{sleepSafe ? 'softer when layered' : 'off'}</span>
        </button>
      </div>

      <div className="sheet-timer">
        <div className="sheet-row-head">
          <span className="sheet-label">sleep timer</span>
          {secondsLeft !== null && (
            <span className="sheet-value warm">
              {formatCountdown(secondsLeft)}
              {isPlaying ? ` · ends ~${endsAround(secondsLeft)}` : ' · paused'}
            </span>
          )}
        </div>
        <div className="timer-chips">
          {TIMER_PRESETS.map((t) => {
            const active = timerTotal === t.secs && secondsLeft !== null;
            return (
              <button
                key={t.label}
                type="button"
                className={`timer-btn${active ? ' active' : ''}`}
                aria-pressed={active}
                aria-label={`Sleep timer, ${t.spoken}`}
                onClick={() => onTimerSelect(t.secs)}
              >{t.label}</button>
            );
          })}
          {secondsLeft !== null && (
            <>
              <button
                type="button"
                className="timer-btn timer-extend"
                onClick={() => onTimerExtend(30 * 60)}
                aria-label="Add 30 minutes to the sleep timer"
              >+30m</button>
              <button
                type="button"
                className="timer-btn timer-extend"
                onClick={() => onTimerExtend(60 * 60)}
                aria-label="Add an hour to the sleep timer"
              >+1h</button>
              <button
                type="button"
                className="timer-btn timer-off"
                onClick={onTimerClear}
                aria-label="Turn the sleep timer off"
              >off</button>
            </>
          )}
        </div>
        <p className="sheet-note">the mix fades out gently over the final 90 seconds</p>
      </div>

      <div className="sheet-actions">
        <button type="button" className="sheet-action accent" onClick={onDrift}>
          <span className="material-symbols-rounded">bedtime</span>
          drift mode
        </button>
        {!saving ? (
          <button
            type="button"
            className="sheet-action warm"
            onClick={() => setSaving(true)}
            disabled={activeSounds.length === 0}
          >
            <span className="material-symbols-rounded">bookmark_add</span>
            save mix
          </button>
        ) : (
          <div className="preset-save-row">
            <input
              className="preset-input"
              placeholder="name this mix…"
              value={name}
              maxLength={40}
              // Focus is user-initiated: the field only appears after the user
              // taps "save mix" (or the player's save), so auto-focus is expected.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') { e.stopPropagation(); setSaving(false); setName(''); }
              }}
            />
            <button
              type="button"
              className="preset-save-btn"
              disabled={!name.trim()}
              onClick={handleSave}
            >save</button>
          </div>
        )}
      </div>
    </>
  );
}
