import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Sound, SoundState } from '../types';
import { generateSoundWav, defaultVolumeFor } from '../data';
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
  // The slider values a sound should play with right now (its global editor
  // config, or a preset's override). Worklet params persist on the node across
  // plays, so startSource re-asserts these every time the sound starts.
  const tuningRef = useRef<Record<string, Record<string, number>>>({});

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
  // sharpening together. Recomputed whenever the active set changes.
  const applyShaping = useCallback(() => {
    const activeIds = Object.entries(soundState)
      .filter(([, s]) => s.enabled)
      .map(([id]) => id);
    activeIds.forEach((soundId) => {
      audioMapRef.current[soundId]?.setShaping?.(layerShaping(activeIds, soundId, sleepSafe));
    });
  }, [soundState, sleepSafe]);

  useEffect(() => {
    Object.entries(soundState).forEach(([soundId, state]) => {
      applyVolume(soundId, state.volume);
    });
    applyShaping();
  }, [masterVolume, soundState, applyVolume, applyShaping, mutedIds, soloIds]);

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
   *  around the (async) play. Returns whether playback actually started, so
   *  callers can roll back optimistic UI on failure. Shared by the toggle,
   *  resume-all, and restore-mix paths. */
  const startSource = useCallback(
    async (soundId: string, targetVol: number): Promise<boolean> => {
      const source = audioMapRef.current[soundId];
      if (!source) return false;
      clearFade(soundId);
      // Re-assert the sound's intended worklet params (they linger on the node
      // from a previous mix/preset otherwise).
      const tuning = tuningRef.current[soundId];
      if (tuning && source.setParams) source.setParams(tuning);
      setLoadingState((prev) => ({ ...prev, [soundId]: true }));
      source.volume = 0;
      try {
        await source.play();
        doFadeIn(soundId, targetVol);
        return true;
      } catch {
        return false;
      } finally {
        setLoadingState((prev) => ({ ...prev, [soundId]: false }));
      }
    },
    [clearFade, doFadeIn],
  );

  const toggleSound = useCallback(
    async (soundId: string) => {
      const nextEnabled = !soundState[soundId]?.enabled;
      setSoundState((prev) => ({
        ...prev,
        [soundId]: { ...prev[soundId], enabled: nextEnabled },
      }));

      const source = audioMapRef.current[soundId];
      if (!source) return;

      if (nextEnabled) {
        const targetVol = Math.min(1, Math.max(0, (soundState[soundId]?.volume ?? 0.5) * masterVolume * masterFade));
        const ok = await startSource(soundId, targetVol);
        if (!ok) {
          setSoundState((prev) => ({
            ...prev,
            [soundId]: { ...prev[soundId], enabled: false },
          }));
        }
      } else {
        clearFade(soundId);
        setLoadingState((prev) => ({ ...prev, [soundId]: false }));
        // A removed layer shouldn't carry a stale mute/solo into its next life.
        setMutedIds((prev) => prev.filter((id) => id !== soundId));
        setSoloIds((prev) => prev.filter((id) => id !== soundId));
        doFadeOut(soundId, () => source.stop());
      }
    },
    [clearFade, doFadeOut, startSource, masterVolume, masterFade, soundState],
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
      if (!params) return;
      // Synthesis (loads the code-split generator) + element swap is best-effort:
      // a failure here must never take the app down, it just leaves the current
      // loop playing.
      void (async () => {
        try {
          const newUrl = await generateSoundWav(soundId, params);
          if (!newUrl) return;
          audioMapRef.current[soundId]?.swapUrl?.(newUrl);
        } catch (err) {
          logger.error('sound retune failed:', err);
        }
      })();
    }, 300);
  }, []);

  const pauseAll = useCallback(() => {
    Object.keys(audioMapRef.current).forEach((id) => clearFade(id));
    Object.values(audioMapRef.current).forEach((source) => source.pause());
    setLoadingState((prev) => {
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) next[key] = false;
      return next;
    });
  }, [clearFade]);

  const playAllActive = useCallback(async () => {
    for (const [soundId, state] of Object.entries(soundState)) {
      if (!state.enabled) continue;
      const targetVol = Math.min(1, Math.max(0, state.volume * masterVolume * masterFade));
      await startSource(soundId, targetVol); // transient autoplay failures are ignored
    }
  }, [startSource, masterVolume, masterFade, soundState]);

  const stopAll = useCallback(() => {
    Object.keys(audioMapRef.current).forEach((id) => clearFade(id));
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
  }, [clearFade]);

  const restoreMixerState = useCallback(
    async (nextState: Record<string, SoundState>, nextMasterVolume?: number, shouldPlay = false) => {
      const effectiveMaster = nextMasterVolume ?? masterVolume;
      stopAll();
      setSoundState(nextState);
      if (nextMasterVolume != null) setMasterVolume(nextMasterVolume);
      // Record each enabled sound's intended tuning up front, so it applies on
      // play now and on any later resume.
      Object.entries(nextState).forEach(([soundId, state]) => {
        if (state.enabled && state.tuning) tuningRef.current[soundId] = state.tuning;
      });
      if (shouldPlay) {
        await Promise.all(
          Object.entries(nextState)
            .filter(([, s]) => s.enabled)
            .map(async ([soundId, state]) => {
              const source = audioMapRef.current[soundId];
              // WAV loops bake their params into the buffer, so regenerate
              // before play; worklet params are applied live in startSource.
              if (state.tuning && source && !source.setParams) {
                try {
                  const url = await generateSoundWav(soundId, state.tuning);
                  if (url) source.swapUrl?.(url);
                } catch (err) {
                  logger.error('preset tuning failed:', err);
                }
              }
              const targetVol = Math.min(1, Math.max(0, state.volume * effectiveMaster * masterFade));
              return startSource(soundId, targetVol); // autoplay constraints are ignored
            }),
        );
      }
    },
    [startSource, masterVolume, masterFade, stopAll],
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

