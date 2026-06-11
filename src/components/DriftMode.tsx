import { useCallback, useEffect, useRef, useState } from 'react';
import { formatCountdown } from '../lib/time';

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
  mixNames,
  secondsLeft,
}: DriftModeProps) {
  const [now, setNow] = useState(() => new Date());
  const [quiet, setQuiet] = useState(false);
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

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

  // Screen wake lock: keep the bedside display softly lit while drifting.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const acquire = async () => {
      try {
        if ('wakeLock' in navigator && !document.hidden) {
          const sentinel = await (navigator as Navigator & {
            wakeLock: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
          }).wakeLock.request('screen');
          if (cancelled) void sentinel.release();
          else wakeLockRef.current = sentinel;
        }
      } catch {
        // Wake lock is best-effort (low battery, unsupported): drift on.
      }
    };

    const onVisibility = () => {
      if (!document.hidden) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
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
      <button
        ref={closeRef}
        type="button"
        className="drift-exit"
        aria-label="Exit drift mode"
        onClick={onClose}
      >
        <span className="material-symbols-rounded">close</span>
      </button>

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
    </div>
  );
}
