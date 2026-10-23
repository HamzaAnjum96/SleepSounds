import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Sound, SoundState } from '../types';
import { generateSoundWav, defaultVolumeFor, editorDefaults } from '../data';
import { logger } from '../utils/logger';
import { makeSource, type MixerSource } from '../audio/sources';
import { layerShaping } from '../audio/layerMeta';
import { setMasterSleepSafe } from '../audio/graph';

const SLEEP_SAFE_KEY = 'drift-sleep-safe';

const createInitialState = (sounds: Sound[]) =>
  sounds.reduce<Record<string, SoundState>>((acc, sound) => {
    acc[sound.id] = { enabled: false, volume: defaultVolumeFor(sound.id) };
    return acc;
  }, {});

// Fades are asymmetric on purpose: starting a sound eases in slowly (a harsh
// kick-off is exactly what a sleep app must not do), while stopping stays
// responsive.
const FADE_IN_MS = 1600;
const FADE_OUT_MS = 700;
const FADE_STEPS = 28;

/** How a start attempt ended. 'superseded' means the layer was paused, stopped
 *  or restarted while it was still loading — not a failure, nothing to report. */
type StartResult = 'started' | 'failed' | 'superseded';

/** Whether two tunings play the same loop, each read over the sound's editor
 *  defaults (undefined = the defaults themselves). */
function sameTuning(soundId: string, a?: Record<string, number>, b?: Record<string, number>): boolean {
  if (a === b) return true;
  const def = editorDefaults(soundId);
  const ra = { ...def, ...a };
  const rb = { ...def, ...b };
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const k of keys) if (Math.abs((ra[k] ?? 0) - (rb[k] ?? 0)) > 1e-9) return false;
  return true;
}

export const useAudioMixer = (sounds: Sound[]) => {
  const [soundState, setSoundState] = useState<Record<string, SoundState>>(() => createInitialState(sounds));
  const [loadingState, setLoadingState] = useState<Record<string, boolean>>(() =>
    sounds.reduce<Record<string, boolean>>((acc, sound) => {
      acc[sound.id] = false;
      return acc;
    }, {}),
  );
  const [masterVolume, setMasterVolume] = useState(0.8);
  // Playback-level wind-down multiplier (sleep-timer fade). 1 = no fade.
  // Applied on top of master volume; owned by the UI's timer logic.
  const [masterFade, setMasterFade] = useState(1);
  // Per-layer mute / solo (silence without removing). A non-empty solo set means
  // only soloed layers are audible.
  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [soloIds, setSoloIds] = useState<string[]>([]);
  // Sleep-safe mode: calmer DSP policy (darker master shelf + spectral slotting
  // of stacked broadband). On by default; persisted.
  const [sleepSafe, setSleepSafeState] = useState(() => {
    try { return localStorage.getItem(SLEEP_SAFE_KEY) !== '0'; }
    catch { return true; }
  });
  // Mirror mute/solo into refs so the (long-lived) fade-timer closures read the
  // current state, not the value captured when the fade started — otherwise a
  // fade-in started just before a mute would keep ramping the volume back up.
  const mutedRef = useRef<string[]>([]);
  const soloRef = useRef<string[]>([]);
  useEffect(() => { mutedRef.current = mutedIds; }, [mutedIds]);
  useEffect(() => { soloRef.current = soloIds; }, [soloIds]);

  /** A layer is audible unless muted, or unless something else is soloed.
   *  Reads refs, so it's always current and stable across renders. */
  const audible = useCallback(
    (soundId: string) => !mutedRef.current.includes(soundId) && (soloRef.current.length === 0 || soloRef.current.includes(soundId)),
    [],
  );
  const audioMapRef = useRef<Record<string, MixerSource>>({});
  const fadeTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const tuningTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTuningRef = useRef<Record<string, Record<string, number>>>({});
  // WAV-only layers bake their tuning into the rendered loop, and keep that loop
  // until something renders another. Track what each one holds (undefined = the
  // default render) and the render in flight, so a mix that wants a different
  // character re-renders first — instead of replaying whatever was tuned last.
  const renderedTuningRef = useRef<Record<string, Record<string, number> | undefined>>({});
  const renderJobRef = useRef<Record<string, Promise<void>>>({});
  // The slider values a sound should play with right now (its global editor
  // config, or a preset's override). Worklet params persist on the node across
  // plays, so startSource re-asserts these every time the sound starts.
  const tuningRef = useRef<Record<string, Record<string, number>>>({});
  // A layer's first start can wait seconds on its render. Every start, stop and
  // pause bumps the layer's sequence number, so a start that resolves after the
  // user has already moved on knows to stand down rather than fade in a sound
  // whose card says it is off.
  const startSeqRef = useRef<Record<string, number>>({});
  const supersede = useCallback((soundId: string) => {
    startSeqRef.current[soundId] = (startSeqRef.current[soundId] ?? 0) + 1;
    return startSeqRef.current[soundId];
  }, []);

  /** Make a WAV-only layer's loop match `tuning` (undefined = defaults),
   *  re-rendering only when it doesn't already. Worklet layers take their
   *  params live and are left alone. Best-effort: a failed render keeps the
   *  current loop playing rather than taking anything down. */
  const ensureRendered = useCallback((soundId: string, tuning: Record<string, number> | undefined): Promise<void> => {
    const source = audioMapRef.current[soundId];
    if (!source || source.setParams || !source.swapUrl) return Promise.resolve();
    const had = renderedTuningRef.current[soundId];
    if (sameTuning(soundId, had, tuning)) return renderJobRef.current[soundId] ?? Promise.resolve();
    // Claim it now, so a repeat request doesn't render twice and a newer one
    // can tell this render is stale when it lands.
    renderedTuningRef.current[soundId] = tuning;
    const job = (async () => {
      try {
        const url = await generateSoundWav(soundId, tuning ?? editorDefaults(soundId));
        if (!url) return;
        if (renderedTuningRef.current[soundId] === tuning) source.swapUrl?.(url);
        else URL.revokeObjectURL(url);
      } catch (err) {
        logger.error('sound render failed:', err);
        if (renderedTuningRef.current[soundId] === tuning) renderedTuningRef.current[soundId] = had;
      }
    })();
    renderJobRef.current[soundId] = job;
    void job.finally(() => {
      if (renderJobRef.current[soundId] === job) delete renderJobRef.current[soundId];
    });
    return job;
  }, []);

  useEffect(() => {
    const map: Record<string, MixerSource> = {};
    sounds.forEach((sound) => {
      const source = makeSource(sound);
      audioMapRef.current[sound.id] = source;
      map[sound.id] = source;
    });
    return () => {
      Object.values(map).forEach((source) => source.destroy());
      // Clean up tuning timers
      Object.values(tuningTimerRef.current).forEach(timer => clearTimeout(timer));
      tuningTimerRef.current = {};
    };
  }, [sounds]);

  const applyVolume = useCallback(
    (soundId: string, volume: number) => {
      const source = audioMapRef.current[soundId];
      if (!source) return;
      // The user's level, gated by mute/solo. Masking (gain trim + spectral
      // darkening) lives on each layer's bus via applyShaping, so it can shape
      // tone, not just level.
      const gate = audible(soundId) ? 1 : 0;
      source.volume = Math.min(1, Math.max(0, volume * masterVolume * masterFade * gate));
    },
    [masterVolume, masterFade, audible],
  );

  // Masking-aware shaping: duck and darken stacked beds / piled-up broadband so
  // several broadband sounds at once stay clear and soft instead of fogging or
  // sharpening together. Depends only on the *active set* and sleep-safe mode —
  // not on per-sound volume — so it reads soundState through a ref (keeping its
  // own identity stable) and the effect below is keyed on the active-id set.
  const soundStateRef = useRef(soundState);
  soundStateRef.current = soundState;
  const applyShaping = useCallback(() => {
    const activeIds = Object.entries(soundStateRef.current)
      .filter(([, s]) => s.enabled)
      .map(([id]) => id);
    activeIds.forEach((soundId) => {
      audioMapRef.current[soundId]?.setShaping?.(layerShaping(activeIds, soundId, sleepSafe));
    });
  }, [sleepSafe]);

  // Volume/gate: re-apply each layer's level on any volume, master, or mute/solo
  // change (the mute/solo gate lives in applyVolume via the audible() refs).
  useEffect(() => {
    Object.entries(soundState).forEach(([soundId, state]) => {
      applyVolume(soundId, state.volume);
    });
  }, [masterVolume, soundState, applyVolume, mutedIds, soloIds]);

  // [v0.0.33 perf] Shaping recomputes only when the active set (or sleep-safe)
  // actually changes — keyed on the joined enabled-id list, a string, so an
  // unchanged set during a volume drag is a no-op dependency. Previously this
  // rebuilt every layer's masking on every volume tick (redundantly, since the
  // set was unchanged); the applied shaping targets are identical, so this is a
  // pure work reduction with no audible effect.
  const activeKey = useMemo(
    () => Object.entries(soundState).filter(([, s]) => s.enabled).map(([id]) => id).join(','),
    [soundState],
  );
  useEffect(() => {
    applyShaping();
  }, [activeKey, applyShaping]);

  // Reflect sleep-safe mode onto the master shelf, and persist the choice.
  useEffect(() => {
    setMasterSleepSafe(sleepSafe);
    try { localStorage.setItem(SLEEP_SAFE_KEY, sleepSafe ? '1' : '0'); } catch { /* private mode */ }
  }, [sleepSafe]);

  const toggleMute = useCallback((soundId: string) => {
    setMutedIds((prev) => (prev.includes(soundId) ? prev.filter((id) => id !== soundId) : [...prev, soundId]));
  }, []);

  const toggleSolo = useCallback((soundId: string) => {
    setSoloIds((prev) => (prev.includes(soundId) ? prev.filter((id) => id !== soundId) : [...prev, soundId]));
  }, []);

  const setSleepSafe = useCallback((on: boolean) => setSleepSafeState(on), []);

  const clearFade = useCallback((soundId: string) => {
    if (fadeTimersRef.current[soundId] != null) {
      clearInterval(fadeTimersRef.current[soundId]);
      delete fadeTimersRef.current[soundId];
    }
  }, []);

  const doFadeIn = useCallback(
    (soundId: string, targetVol: number) => {
      const source = audioMapRef.current[soundId];
      if (!source) return;
      clearFade(soundId);
      source.volume = 0;
      let step = 0;
      fadeTimersRef.current[soundId] = setInterval(() => {
        step++;
        // Respect a mute/solo set mid-fade, so muting a just-started layer sticks
        // instead of being overridden by the fade ramp.
        const gate = audible(soundId) ? 1 : 0;
        const t = step / FADE_STEPS;
        // Quadratic ease-in: the first moments arrive as a swell, not a step.
        source.volume = Math.min(1, t * t * targetVol) * gate;
        if (step >= FADE_STEPS) clearFade(soundId);
      }, FADE_IN_MS / FADE_STEPS);
    },
    [clearFade, audible],
  );

  const doFadeOut = useCallback(
    (soundId: string, onDone: () => void) => {
      const source = audioMapRef.current[soundId];
      if (!source) return;
      clearFade(soundId);
      const start = source.volume;
      let step = 0;
      fadeTimersRef.current[soundId] = setInterval(() => {
        step++;
        source.volume = Math.max(0, start * (1 - step / FADE_STEPS));
        if (step >= FADE_STEPS) {
          clearFade(soundId);
          onDone();
        }
      }, FADE_OUT_MS / FADE_STEPS);
    },
    [clearFade],
  );

  /** Start one source from silence and fade it in, flipping its loading flag
   *  around the (async) play. Reports how it ended, so callers can roll back
   *  optimistic UI on a real failure. Shared by the toggle, resume-all, and
   *  restore-mix paths. */
  const startSource = useCallback(
    async (soundId: string, targetVol: number): Promise<StartResult> => {
      const source = audioMapRef.current[soundId];
      if (!source) return 'failed';
      clearFade(soundId);
      const seq = supersede(soundId);
      // Re-assert the sound's intended worklet params (they linger on the node
      // from a previous mix/preset otherwise).
      const tuning = tuningRef.current[soundId];
      if (tuning && source.setParams) source.setParams(tuning);
      setLoadingState((prev) => ({ ...prev, [soundId]: true }));
      source.volume = 0;
      const current = () => startSeqRef.current[soundId] === seq;
      try {
        // A WAV layer re-rendering for this mix plays the new loop, not the old.
        // Only await when a render is in flight: otherwise play() (and the
        // context resume inside it) must run in the tap's own call stack,
        // where strict browsers still count it as part of the gesture.
        const pending = renderJobRef.current[soundId];
        if (pending) {
          await pending;
          if (!current()) return 'superseded';
        }
        await source.play();
        if (!current()) return 'superseded';
        doFadeIn(soundId, targetVol);
        return 'started';
      } catch {
        // A pause or stop during a pending play() rejects it (AbortError);
        // that is the user's own action, not a failure to report.
        return current() ? 'failed' : 'superseded';
      } finally {
        // A newer start owns the flag now; the stop paths clear it themselves.
        if (current()) setLoadingState((prev) => ({ ...prev, [soundId]: false }));
      }
    },
    [clearFade, doFadeIn, supersede],
  );

  /**
   * Toggle a layer in or out of the mix.
   *
   * Returns false only when a layer the user deliberately switched ON failed to
   * start. That case is worth reporting: the tap is itself a user gesture, so
   * autoplay policy is not the cause — something actually broke (a worklet that
   * would not load, a generation that threw, a dead context). Turning the card
   * back off without a word leaves the user tapping a control that appears to
   * do nothing. The resume paths (playAllActive, restoreMixerState) stay quiet
   * on purpose: a blocked autoplay there is expected and fixes itself on the
   * next tap.
   */
  const toggleSound = useCallback(
    async (soundId: string): Promise<boolean> => {
      const nextEnabled = !soundState[soundId]?.enabled;
      setSoundState((prev) => ({
        ...prev,
        [soundId]: { ...prev[soundId], enabled: nextEnabled },
      }));

      const source = audioMapRef.current[soundId];
      if (!source) return false;

      if (nextEnabled) {
        const targetVol = Math.min(1, Math.max(0, (soundState[soundId]?.volume ?? 0.5) * masterVolume * masterFade));
        const result = await startSource(soundId, targetVol);
        if (result === 'failed') {
          setSoundState((prev) => ({
            ...prev,
            [soundId]: { ...prev[soundId], enabled: false },
          }));
          return false;
        }
      } else {
        clearFade(soundId);
        supersede(soundId);
        setLoadingState((prev) => ({ ...prev, [soundId]: false }));
        // A removed layer shouldn't carry a stale mute/solo into its next life.
        setMutedIds((prev) => prev.filter((id) => id !== soundId));
        setSoloIds((prev) => prev.filter((id) => id !== soundId));
        doFadeOut(soundId, () => source.stop());
      }
      return true;
    },
    [clearFade, doFadeOut, startSource, supersede, masterVolume, masterFade, soundState],
  );

  const setSoundVolume = useCallback(
    (soundId: string, volume: number) => {
      setSoundState((prev) => ({
        ...prev,
        [soundId]: { ...prev[soundId], volume },
      }));
      applyVolume(soundId, volume);
    },
    [applyVolume],
  );

  const setSoundTuning = useCallback((soundId: string, values: Record<string, number>) => {
    // Remember the intended params so a later (re)start re-asserts them.
    tuningRef.current[soundId] = values;
    // Worklet-backed sounds (fire, birdsong, rain, thunder, forest) take
    // their params live; everything else regenerates its WAV loop.
    const source = audioMapRef.current[soundId];
    if (source?.setParams) {
      source.setParams(values);
      return;
    }

    lastTuningRef.current[soundId] = values;

    // Debounce regeneration at 300ms
    if (tuningTimerRef.current[soundId]) {
      clearTimeout(tuningTimerRef.current[soundId]);
    }

    tuningTimerRef.current[soundId] = setTimeout(() => {
      delete tuningTimerRef.current[soundId];
      const params = lastTuningRef.current[soundId];
      if (params) void ensureRendered(soundId, params);
    }, 300);
  }, [ensureRendered]);

  const pauseAll = useCallback(() => {
    Object.keys(audioMapRef.current).forEach((id) => { clearFade(id); supersede(id); });
    Object.values(audioMapRef.current).forEach((source) => source.pause());
    setLoadingState((prev) => {
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) next[key] = false;
      return next;
    });
  }, [clearFade, supersede]);

  // Every layer starts at once, as restoreMixerState does: one layer still
  // rendering its first loop no longer holds back the ones that are ready.
  const playAllActive = useCallback(async () => {
    await Promise.all(
      Object.entries(soundState)
        .filter(([, state]) => state.enabled)
        .map(([soundId, state]) => {
          const targetVol = Math.min(1, Math.max(0, state.volume * masterVolume * masterFade));
          return startSource(soundId, targetVol); // transient autoplay failures are ignored
        }),
    );
  }, [startSource, masterVolume, masterFade, soundState]);

  const stopAll = useCallback(() => {
    Object.keys(audioMapRef.current).forEach((id) => { clearFade(id); supersede(id); });
    Object.values(audioMapRef.current).forEach((source) => source.stop());
    setMutedIds([]);
    setSoloIds([]);
    setSoundState((prev) => {
      const next: Record<string, SoundState> = {};
      let changed = false;
      for (const [id, s] of Object.entries(prev)) {
        if (s.enabled) {
          next[id] = { ...s, enabled: false };
          changed = true;
        } else next[id] = s;
      }
      return changed ? next : prev;
    });
    setLoadingState((prev) => {
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) next[key] = false;
      return next;
    });
  }, [clearFade, supersede]);

  const restoreMixerState = useCallback(
    async (nextState: Record<string, SoundState>, nextMasterVolume?: number, shouldPlay = false) => {
      const effectiveMaster = nextMasterVolume ?? masterVolume;
      stopAll();
      // A slider retune still waiting on its debounce belongs to the old mix.
      Object.values(tuningTimerRef.current).forEach((timer) => clearTimeout(timer));
      tuningTimerRef.current = {};
      setSoundState(nextState);
      if (nextMasterVolume != null) setMasterVolume(nextMasterVolume);
      // Record each enabled sound's intended tuning up front, so it applies on
      // play now and on any later resume. WAV loops bake their params into the
      // buffer, so start any re-render they need now (even when restoring
      // paused); startSource waits for it, and worklets apply theirs live.
      Object.entries(nextState).forEach(([soundId, state]) => {
        if (!state.enabled) return;
        if (state.tuning) tuningRef.current[soundId] = state.tuning;
        void ensureRendered(soundId, state.tuning);
      });
      if (shouldPlay) {
        await Promise.all(
          Object.entries(nextState)
            .filter(([, s]) => s.enabled)
            .map(([soundId, state]) => {
              const targetVol = Math.min(1, Math.max(0, state.volume * effectiveMaster * masterFade));
              return startSource(soundId, targetVol); // autoplay constraints are ignored
            }),
        );
      }
    },
    [startSource, ensureRendered, masterVolume, masterFade, stopAll],
  );

  const activeSounds = useMemo(() => sounds.filter((sound) => soundState[sound.id]?.enabled), [soundState, sounds]);

  return {
    soundState,
    loadingState,
    masterVolume,
    setMasterVolume,
    setMasterFade,
    toggleSound,
    setSoundVolume,
    setSoundTuning,
    pauseAll,
    playAllActive,
    stopAll,
    activeSounds,
    restoreMixerState,
    mutedIds,
    soloIds,
    toggleMute,
    toggleSolo,
    sleepSafe,
    setSleepSafe,
  };
};

