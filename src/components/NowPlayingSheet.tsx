import { useCallback, useEffect, useRef, useState } from 'react';
import type { Sound, SoundState } from '../types';
import { CATEGORY_ICONS } from '../lib/categoryIcons';
import { sliderFill } from '../lib/sliderFill';
import { haptic } from '../lib/haptics';
import { formatCountdown } from '../lib/time';

/**
 * The now-playing sheet: the mix's control room. Slides up over the shell
 * with every active layer on its own slider, master volume, the sleep timer,
 * and the doorways to drift mode and saving the mix. Closes with a matching
 * slide-down (Esc, backdrop, the close button, or dragging the sheet down).
 */

export const TIMER_PRESETS = [
  { label: '15m', secs: 15 * 60 },
  { label: '30m', secs: 30 * 60 },
  { label: '1h',  secs: 60 * 60 },
  { label: '2h',  secs: 120 * 60 },
  { label: '4h',  secs: 240 * 60 },
  { label: '8h',  secs: 480 * 60 },
];

const CLOSE_MS = 260;

function endsAround(secondsLeft: number) {
  const d = new Date(Date.now() + secondsLeft * 1000);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

interface NowPlayingSheetProps {
  open: boolean;
  /** Open straight into the naming field (the save-this-mix card). */
  promptSave?: boolean;
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
  onTimerExtend: (secs: number) => void;
  onTimerClear: () => void;
  onClearMix: () => void;
  onDrift: () => void;
  onSave: (name: string) => void;
}

interface DragState {
  startY: number;
  lastY: number;
  lastT: number;
  dy: number;
  velocity: number;
}

export default function NowPlayingSheet({
  open,
  promptSave = false,
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
  onTimerExtend,
  onTimerClear,
  onClearMix,
  onDrift,
  onSave,
}: NowPlayingSheetProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  /** Play the slide-down exit, then hand control back to the parent. */
  const requestClose = useCallback((fromDragY = 0) => {
    if (closingRef.current) return;
    closingRef.current = true;
    sheetRef.current?.style.setProperty('--sheet-drag-y', `${fromDragY}px`);
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      closingRef.current = false;
      setClosing(false);
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      closeRef.current?.focus();
    } else {
      setSaving(false);
      setName('');
      restoreFocusRef.current?.focus?.();
      restoreFocusRef.current = null;
    }
  }, [open]);

  // Arriving via "save this mix": open with the naming field ready.
  useEffect(() => {
    if (open && promptSave) setSaving(true);
  }, [open, promptSave]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, requestClose]);

  // Drag-to-dismiss from the handle / header. The sheet follows the finger
  // down; release past the threshold (or a quick flick) lets it go.
  const onGripTouchStart = useCallback((e: React.TouchEvent) => {
    if (closingRef.current) return;
    const y = e.touches[0].clientY;
    dragRef.current = { startY: y, lastY: y, lastT: performance.now(), dy: 0, velocity: 0 };
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  }, []);

  const onGripTouchMove = useCallback((e: React.TouchEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const y = e.touches[0].clientY;
    const now = performance.now();
    d.velocity = (y - d.lastY) / Math.max(1, now - d.lastT);
    d.lastY = y;
    d.lastT = now;
    d.dy = Math.max(0, y - d.startY);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${d.dy}px)`;
  }, []);

  const onGripTouchEnd = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    const sheet = sheetRef.current;
    if (!sheet || !d) return;
    sheet.style.transition = '';
    const flick = d.velocity > 0.5 && d.dy > 24;
    if (d.dy > 96 || flick) {
      requestClose(d.dy);
    } else {
      sheet.style.transform = '';
    }
  }, [requestClose]);

  const handleSave = useCallback(() => {
    if (!name.trim()) return;
    haptic(12);
    onSave(name.trim());
    setName('');
    setSaving(false);
  }, [name, onSave]);

  /** End the whole mix: let the sheet slide away first, then stop the sound. */
  const handleClearMix = useCallback(() => {
    haptic(10);
    requestClose();
    window.setTimeout(onClearMix, CLOSE_MS);
  }, [onClearMix, requestClose]);

  if (!open) return null;

  return (
    <div className={`sheet-root${closing ? ' closing' : ''}`}>
      <div className="sheet-backdrop" onClick={() => requestClose()} aria-hidden="true" />
      <div ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-label="Now playing">
        <div
          className="sheet-grip"
          onTouchStart={onGripTouchStart}
          onTouchMove={onGripTouchMove}
          onTouchEnd={onGripTouchEnd}
          onTouchCancel={onGripTouchEnd}
        >
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
              onClick={() => requestClose()}
              aria-label="Close now playing"
            >
              <span className="material-symbols-rounded">keyboard_arrow_down</span>
            </button>
          </div>
        </div>

        <div className="sheet-scroll">
          <div className="sheet-layers">
            <div className="sheet-row-head">
              <span className="sheet-label">the mix</span>
              {activeSounds.length > 0 && (
                <button
                  type="button"
                  className="sheet-clear"
                  onClick={handleClearMix}
                  aria-label="Stop and clear the whole mix"
                >clear all</button>
              )}
            </div>
            {activeSounds.map((sound) => {
              const volume = soundState[sound.id]?.volume ?? 0.5;
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
