import { useCallback, useEffect, useRef, useState } from 'react';

/** Seconds before timer end over which the mix gently fades out. */
const FADE_WINDOW_S = 90;

/** The playback-gain wind-down multiplier for a given time remaining: full level
 *  (1) with no timer or while still outside the final window, easing toward 0
 *  over the last `FADE_WINDOW_S` seconds. Returning 1 above the window is what
 *  restores full volume when a timer is *extended* back out of the fade. */
export function windDownFade(secondsLeft: number | null): number {
  if (secondsLeft !== null && secondsLeft <= FADE_WINDOW_S) {
    return Math.pow(Math.max(0, secondsLeft) / FADE_WINDOW_S, 1.4);
  }
  return 1;
}

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

  // [v0.0.17 fix] The countdown runs off the wall clock, not a count of interval
  // ticks. A sleep mixer is used with the screen off, where the browser throttles
  // — or, on a locked phone, suspends — background timers, so decrementing once
  // per fired tick made the timer run far too slow (a throttled tick can fire as
  // little as once a minute, stretching a 30-minute timer into hours). `deadline`
  // is the real clock time the timer expires *while playing*; every tick and every
  // foreground return recomputes the remaining seconds from it, so elapsed real
  // time is always honoured and a backgrounded timer catches up the instant JS
  // runs again. Kept in a ref so it can be adjusted (extend) and read (pause)
  // without re-running the tick effect each second.
  const deadlineRef = useRef<number | null>(null);
  const secondsLeftRef = useRef<number | null>(null);
  secondsLeftRef.current = secondsLeft;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  /** Recompute the displayed seconds from the wall-clock deadline. */
  const sync = useCallback(() => {
    if (deadlineRef.current === null) return;
    setSecondsLeft(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
  }, []);

  // Start the clock when playback starts, freeze it when playback stops — the
  // deadline is only live while playing, so a paused mix never burns down. Keyed
  // on `isPlaying` alone; the duration-setting paths adjust the deadline directly
  // (below), since they don't flip `isPlaying`.
  useEffect(() => {
    if (secondsLeftRef.current === null) return;
    if (isPlaying) {
      deadlineRef.current = Date.now() + secondsLeftRef.current * 1000;
    } else if (deadlineRef.current !== null) {
      // Freeze: bank the seconds remaining right now, then stop the clock.
      setSecondsLeft(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
      deadlineRef.current = null;
    }
  }, [isPlaying]);

  // Tick while playing, but only re-establish the interval when a timer appears
  // or disappears (keyed on presence, not value) — not every second.
  useEffect(() => {
    if (!isPlaying || secondsLeft === null) return;
    const id = window.setInterval(sync, 1000);
    return () => clearInterval(id);
  }, [isPlaying, secondsLeft !== null, sync]); // eslint-disable-line react-hooks/exhaustive-deps

  // A foreground return corrects, at once, any drift that built up while the tab
  // was backgrounded, throttled, or suspended.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) sync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [sync]);

  // Reaching zero stops the mix and clears the timer.
  useEffect(() => {
    if (secondsLeft === 0) {
      deadlineRef.current = null;
      onExpire();
      setSecondsLeft(null);
      setTimerTotal(null);
    }
  }, [secondsLeft, onExpire]);

  // Wind-down: ease the mix out over the timer's final stretch, so sleep is
  // never interrupted by an abrupt stop. Playback-gain only. Setting the fade
  // unconditionally (not just inside the window) means extending a timer mid-fade
  // restores full level instead of leaving the mix stuck quiet.
  useEffect(() => {
    setMasterFade(windDownFade(secondsLeft));
  }, [secondsLeft, setMasterFade]);

  const toggle = useCallback((secs: number) => {
    // Tapping the running duration again turns the timer off.
    if (timerTotal === secs && secondsLeft !== null) {
      deadlineRef.current = null;
      setSecondsLeft(null);
      setTimerTotal(null);
      announce('sleep timer off');
    } else {
      setSecondsLeft(secs);
      setTimerTotal(secs);
      // Set the live deadline now if playing — the play/pause effect won't re-run
      // when only the duration changes on an already-running timer.
      deadlineRef.current = isPlayingRef.current ? Date.now() + secs * 1000 : null;
      announce(`sleep timer set for ${humanizeSecs(secs)}`);
    }
  }, [timerTotal, secondsLeft, announce]);

  const extend = useCallback((secs: number) => {
    setSecondsLeft((s) => (s !== null ? s + secs : secs));
    setTimerTotal((t) => (t !== null ? t + secs : secs));
    // Push the live deadline out; if paused, the banked seconds above carry the
    // extension and the deadline is re-derived on resume.
    if (deadlineRef.current !== null) deadlineRef.current += secs * 1000;
    else if (isPlayingRef.current) deadlineRef.current = Date.now() + secs * 1000;
    announce(`added ${humanizeSecs(secs)} to the sleep timer`);
  }, [announce]);

  const clear = useCallback(() => {
    deadlineRef.current = null;
    setSecondsLeft(null);
    setTimerTotal(null);
    announce('sleep timer off');
  }, [announce]);

  // The sky settles with the mix over the last five minutes of the timer.
  const skyDim = secondsLeft !== null ? Math.max(0, Math.min(1, 1 - secondsLeft / 300)) : 0;

  return { secondsLeft, timerTotal, skyDim, toggle, extend, clear };
}
