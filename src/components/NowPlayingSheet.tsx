import { useCallback, useEffect, useRef, useState } from 'react';
import type { Sound, SoundState } from '../types';
import { CATEGORY_ICONS } from '../lib/categoryIcons';
import { sliderFill } from '../lib/sliderFill';
import { haptic } from '../lib/haptics';
import { formatCountdown } from '../lib/time';

/**
 * The now-playing sheet: the mix's control room. Slides up over the shell
 * with every active layer on its own slider, master volume, the sleep timer,
 * and the doorways to drift mode and saving the mix.
 */

export const TIMER_PRESETS = [
  { label: '15m', secs: 15 * 60 },
  { label: '30m', secs: 30 * 60 },
  { label: '1h',  secs: 60 * 60 },
  { label: '90m', secs: 90 * 60 },
];

function endsAround(secondsLeft: number) {
  const d = new Date(Date.now() + secondsLeft * 1000);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

interface NowPlayingSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  activeSounds: Sound[];
  soundState: Record<string, SoundState>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSoundVolume: (id: string, v: number) => void;
  onRemoveSound: (id: string) => void;
  masterVolume: number;
  onMasterVolume: (v: number) => void;
  secondsLeft: number | null;
  timerTotal: number | null;
  onTimerSelect: (secs: number) => void;
  onDrift: () => void;
  onSave: (name: string) => void;
}

export default function NowPlayingSheet({
  open,
  onClose,
  title,
  activeSounds,
  soundState,
  isPlaying,
  onTogglePlay,
  onSoundVolume,
  onRemoveSound,
  masterVolume,
  onMasterVolume,
  secondsLeft,
  timerTotal,
  onTimerSelect,
  onDrift,
  onSave,
}: NowPlayingSheetProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      closeRef.current?.focus();
    } else {
      setSaving(false);
      setName('');
      restoreFocusRef.current?.focus?.();
      restoreFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSave = useCallback(() => {
    if (!name.trim()) return;
    haptic(12);
    onSave(name.trim());
    setName('');
    setSaving(false);
  }, [name, onSave]);

  if (!open) return null;

  return (
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Now playing">
        <div className="sheet-handle" aria-hidden="true" />

        <div className="sheet-head">
          <div className="sheet-head-text">
            <span className="sheet-eyebrow">now playing</span>
            <span className="sheet-title">{title}</span>
          </div>
          <button
            type="button"
            className={`sheet-play${isPlaying ? ' playing' : ''}`}
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            <span className="material-symbols-rounded">
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>
          <button
            ref={closeRef}
            type="button"
            className="sheet-close"
            onClick={onClose}
            aria-label="Close now playing"
          >
            <span className="material-symbols-rounded">keyboard_arrow_down</span>
          </button>
        </div>

        <div className="sheet-scroll">
          <div className="sheet-layers">
            {activeSounds.map((sound) => (
              <div key={sound.id} className="layer-row" data-cat={sound.category}>
                <span className="material-symbols-rounded layer-icon" aria-hidden="true">
                  {CATEGORY_ICONS[sound.category] ?? 'music_note'}
                </span>
                <div className="layer-main">
                  <span className="layer-name">{sound.name}</span>
                  <input
                    type="range"
                    className="drift-slider"
                    min={0}
                    max={1}
                    step={0.01}
                    value={soundState[sound.id]?.volume ?? 0.5}
                    style={sliderFill(soundState[sound.id]?.volume ?? 0.5)}
                    aria-label={`${sound.name} volume`}
                    onChange={(e) => onSoundVolume(sound.id, Number(e.target.value))}
                  />
                </div>
                <button
                  type="button"
                  className="layer-remove"
                  onClick={() => onRemoveSound(sound.id)}
                  aria-label={`Remove ${sound.name}`}
                >✕</button>
              </div>
            ))}
            {activeSounds.length === 0 && (
              <p className="sheet-empty">the mix is empty — add sounds from the library</p>
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
          </div>

          <div className="sheet-timer">
            <div className="sheet-row-head">
              <span className="sheet-label">sleep timer</span>
              {secondsLeft !== null && (
                <span className="sheet-value warm">
                  {formatCountdown(secondsLeft)} · ends ~{endsAround(secondsLeft)}
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
                    onClick={() => onTimerSelect(t.secs)}
                  >{t.label}</button>
                );
              })}
            </div>
            <p className="sheet-note">the mix fades out gently over the final 90 seconds</p>
          </div>

          <div className="sheet-actions">
            <button type="button" className="sheet-action accent" onClick={onDrift}>
              <span className="material-symbols-rounded">bedtime</span>
              drift mode
            </button>
            <button
              type="button"
              className="sheet-action warm"
              onClick={() => setSaving((v) => !v)}
              disabled={activeSounds.length === 0}
            >
              <span className="material-symbols-rounded">bookmark_add</span>
              save mix
            </button>
          </div>

          {saving && (
            <div className="preset-save-row">
              <input
                className="preset-input"
                placeholder="name this mix…"
                value={name}
                maxLength={40}
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
      </div>
    </div>
  );
}
