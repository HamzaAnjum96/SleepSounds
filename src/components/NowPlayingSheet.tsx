import { useCallback, useEffect, useRef, useState } from 'react';
import type { Sound, SoundState } from '../types';
import { haptic } from '../lib/haptics';
import MixControls from './MixControls';

/**
 * The now-playing sheet: the mix's control room on mobile. Slides up over the
 * shell wrapping the shared MixControls (layers, master, timer, drift, save),
 * and closes with a matching slide-down (Esc, backdrop, the close button, or
 * dragging the sheet down). On desktop the same controls live in a persistent
 * side panel instead (see App's .side-panel).
 */

const CLOSE_MS = 260;

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
  onTimerExtend: (secs: number) => void;
  onTimerClear: () => void;
  onClearMix: () => void;
  onDrift: () => void;
  onSave: (name: string) => void;
  /** Open straight into the save-name field — used when the user taps save on
   *  the mini player rather than opening the sheet to browse. */
  startSaving?: boolean;
  mutedIds: string[];
  soloIds: string[];
  onToggleMute: (id: string) => void;
  onToggleSolo: (id: string) => void;
  sleepSafe: boolean;
  onSleepSafe: (on: boolean) => void;
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
  startSaving = false,
  mutedIds,
  soloIds,
  onToggleMute,
  onToggleSolo,
  sleepSafe,
  onSleepSafe,
}: NowPlayingSheetProps) {
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
      // When opening to save, MixControls auto-focuses its name field instead.
      if (!startSaving) closeRef.current?.focus();
    } else {
      restoreFocusRef.current?.focus?.();
      restoreFocusRef.current = null;
    }
  }, [open, startSaving]);

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

  /** End the whole mix: let the sheet slide away first, then stop the sound. */
  const handleClearMix = useCallback(() => {
    haptic(10);
    requestClose();
    window.setTimeout(onClearMix, CLOSE_MS);
  }, [onClearMix, requestClose]);

  /** Removing the final layer empties the mix, which unmounts the sheet —
   *  so give it the same graceful slide-away as clearing. */
  const handleRemove = useCallback((id: string) => {
    if (activeSounds.length <= 1) {
      requestClose();
      window.setTimeout(() => onRemoveSound(id), CLOSE_MS);
    } else {
      onRemoveSound(id);
    }
  }, [activeSounds.length, onRemoveSound, requestClose]);

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
          <MixControls
            activeSounds={activeSounds}
            soundState={soundState}
            isPlaying={isPlaying}
            onSoundVolume={onSoundVolume}
            onRemoveSound={handleRemove}
            masterVolume={masterVolume}
            onMasterVolume={onMasterVolume}
            secondsLeft={secondsLeft}
            timerTotal={timerTotal}
            onTimerSelect={onTimerSelect}
            onTimerExtend={onTimerExtend}
            onTimerClear={onTimerClear}
            onClearMix={handleClearMix}
            onDrift={onDrift}
            onSave={onSave}
            startSaving={startSaving}
            mutedIds={mutedIds}
            soloIds={soloIds}
            onToggleMute={onToggleMute}
            onToggleSolo={onToggleSolo}
            sleepSafe={sleepSafe}
            onSleepSafe={onSleepSafe}
          />
        </div>
      </div>
    </div>
  );
}
