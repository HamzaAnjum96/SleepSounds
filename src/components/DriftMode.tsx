import { useCallback, useEffect, useRef, useState } from 'react';
import { formatCountdown } from '../lib/time';
import { platform } from '../platform';

/**
 * Drift mode: the fullscreen night surface for when the mix is set and the
 * phone goes on the nightstand. The mixer chrome fades away, the living sky
 * shows through, and what remains is a clock, the mix, a breathing play
 * control, and the wind-down countdown.
 *
 * - Controls quiet down after a few seconds of stillness; any touch wakes them.
 *   The clock always stays.
 * - Requests a screen wake lock while open (released on exit / re-acquired on
 *   tab return), so the bedside display stays softly lit.
 * - Esc or the close control exits. Focus is moved in on open and restored
 *   on close.
 */

interface DriftModeProps {
  open: boolean;
  onClose: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  /** Square-stop: end the whole mix (drift mode closes with it). */
  onStop: () => void;
  mixNames: string[];
  secondsLeft: number | null;
}

const QUIET_AFTER_MS = 5000;

function formatClock(d: Date) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function DriftMode({
  open,
  onClose,
  isPlaying,
  onTogglePlay,
  onStop,
  mixNames,
  secondsLeft,
}: DriftModeProps) {
  const [now, setNow] = useState(() => new Date());
  const [quiet, setQuiet] = useState(false);
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const wake = useCallback(() => {
    setQuiet(false);
    if (quietTimer.current) clearTimeout(quietTimer.current);
    quietTimer.current = setTimeout(() => setQuiet(true), QUIET_AFTER_MS);
  }, []);

  // Clock tick (minute resolution is enough; tick every 5s to catch the edge).
  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(id);
  }, [open]);

  // Quiet-down timer lifecycle.
  useEffect(() => {
    if (!open) return;
    wake();
    return () => {
      if (quietTimer.current) clearTimeout(quietTimer.current);
    };
  }, [open, wake]);

  // Focus in on open, restore on close.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      closeRef.current?.focus();
    } else {
      restoreFocusRef.current?.focus?.();
      restoreFocusRef.current = null;
    }
  }, [open]);

  // Esc to exit.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Screen wake lock: keep the bedside display softly lit while drifting. The
  // platform bridge owns acquiring, re-acquiring on tab return, and releasing.
  useEffect(() => {
    if (!open) return;
    void platform.requestWakeLock();
    return () => { void platform.releaseWakeLock(); };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`drift-mode${quiet ? ' quiet' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Drift mode"
      onPointerDown={wake}
    >
      <div className="drift-center">
        <div className="drift-clock">{formatClock(now)}</div>
        {mixNames.length > 0 && (
          <div className="drift-mix">{mixNames.join(' · ')}</div>
        )}
        {secondsLeft !== null && (
          <div className="drift-countdown">
            {formatCountdown(secondsLeft)}
            <span className="drift-countdown-label">until rest</span>
          </div>
        )}
      </div>

      <div className="drift-controls">
        <button
          ref={closeRef}
          type="button"
          className="drift-side drift-back"
          onClick={onClose}
          aria-label="Back to the mixer"
        >
          <span className="material-symbols-rounded">arrow_back</span>
        </button>
        <button
          type="button"
          className={`drift-orb${isPlaying ? ' playing' : ''}`}
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          <span className="material-symbols-rounded">
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
        </button>
        <button
          type="button"
          className="drift-side drift-stop"
          onClick={onStop}
          aria-label="Stop the mix"
        >
          <span className="material-symbols-rounded">stop</span>
        </button>
      </div>
    </div>
  );
}
