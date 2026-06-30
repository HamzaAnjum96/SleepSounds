import { useCallback, useEffect, useState } from 'react';

/** Seconds before timer end over which the mix gently fades out. */
const FADE_WINDOW_S = 90;

/** A sleep-timer duration in plain words, for the screen-reader announcement. */
function humanizeSecs(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  const parts: string[] = [];
  if (h) parts.push(`${h} hour${h > 1 ? 's' : ''}`);
  if (m) parts.push(`${m} minute${m > 1 ? 's' : ''}`);
  return parts.join(' ') || `${secs} seconds`;
}

interface UseSleepTimerArgs {
  /** Whether audio is currently playing — the countdown only runs while it is,
   *  so a paused mix doesn't burn the timer down. */
  isPlaying: boolean;
  /** Set the playback-level wind-down multiplier (1 = no fade). */
  setMasterFade: (fade: number) => void;
  /** Called once when the countdown reaches zero — stop the mix here. */
  onExpire: () => void;
  /** Speak a change to the screen-reader live region. */
  announce: (message: string) => void;
}

export interface SleepTimer {
  /** Seconds remaining, or null when no timer is set. */
  secondsLeft: number | null;
  /** The timer's full duration (for the active-chip highlight), or null. */
  timerTotal: number | null;
  /** 0→1 dimming of the night sky over the final five minutes. */
  skyDim: number;
  /** Toggle a timer of `secs`: sets it, or clears it if that duration is already
   *  the running timer. */
  toggle: (secs: number) => void;
  /** Add `secs` to a running timer (or start one of that length). */
  extend: (secs: number) => void;
  /** Clear any running timer. */
  clear: () => void;
}

/** The sleep timer: a playing-time countdown that gently winds the mix down over
 *  its final stretch and stops it at zero. Self-contained — it owns its own
 *  state and effects, and reaches back into the app only through the callbacks. */
export function useSleepTimer({ isPlaying, setMasterFade, onExpire, announce }: UseSleepTimerArgs): SleepTimer {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timerTotal, setTimerTotal] = useState<number | null>(null);

  // Tick down one second at a time, but only while playing. Keyed on whether a
  // timer exists (not its value), so the interval isn't torn down every second.
  useEffect(() => {
    if (!isPlaying || secondsLeft === null) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s !== null && s > 1 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [isPlaying, secondsLeft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reaching zero stops the mix and clears the timer.
  useEffect(() => {
    if (secondsLeft === 0) {
      onExpire();
      setSecondsLeft(null);
      setTimerTotal(null);
    }
  }, [secondsLeft, onExpire]);

  // Wind-down: ease the mix out over the timer's final stretch, so sleep is
  // never interrupted by an abrupt stop. Playback-gain only.
  useEffect(() => {
    if (secondsLeft === null) {
      setMasterFade(1);
    } else if (secondsLeft <= FADE_WINDOW_S) {
      setMasterFade(Math.pow(secondsLeft / FADE_WINDOW_S, 1.4));
    }
  }, [secondsLeft, setMasterFade]);

  const toggle = useCallback((secs: number) => {
    // Tapping the running duration again turns the timer off.
    if (timerTotal === secs && secondsLeft !== null) {
      setSecondsLeft(null);
      setTimerTotal(null);
      announce('sleep timer off');
    } else {
      setSecondsLeft(secs);
      setTimerTotal(secs);
      announce(`sleep timer set for ${humanizeSecs(secs)}`);
    }
  }, [timerTotal, secondsLeft, announce]);

  const extend = useCallback((secs: number) => {
    setSecondsLeft((s) => (s !== null ? s + secs : secs));
    setTimerTotal((t) => (t !== null ? t + secs : secs));
    announce(`added ${humanizeSecs(secs)} to the sleep timer`);
  }, [announce]);

  const clear = useCallback(() => {
    setSecondsLeft(null);
    setTimerTotal(null);
    announce('sleep timer off');
  }, [announce]);

  // The sky settles with the mix over the last five minutes of the timer.
  const skyDim = secondsLeft !== null ? Math.max(0, Math.min(1, 1 - secondsLeft / 300)) : 0;

  return { secondsLeft, timerTotal, skyDim, toggle, extend, clear };
}
