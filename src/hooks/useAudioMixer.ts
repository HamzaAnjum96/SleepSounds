import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Sound, SoundState } from '../types';
import { regenerateSound, defaultVolumeFor } from '../data';
import { logger } from '../utils/logger';
import { makeSource, type MixerSource } from '../audio/sources';

const createInitialState = (sounds: Sound[]) =>
  sounds.reduce<Record<string, SoundState>>((acc, sound) => {
    acc[sound.id] = { enabled: false, volume: defaultVolumeFor(sound.id) };
    return acc;
  }, {});

const FADE_MS = 700;
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
  const audioMapRef = useRef<Record<string, MixerSource>>({});
  const fadeTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const tuningTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTuningRef = useRef<Record<string, Record<string, number>>>({});

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
      source.volume = Math.min(1, Math.max(0, volume * masterVolume * masterFade));
    },
    [masterVolume, masterFade],
  );

  useEffect(() => {
    Object.entries(soundState).forEach(([soundId, state]) => {
      applyVolume(soundId, state.volume);
    });
  }, [masterVolume, soundState, applyVolume]);

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
        source.volume = Math.min(1, (step / FADE_STEPS) * targetVol);
        if (step >= FADE_STEPS) clearFade(soundId);
      }, FADE_MS / FADE_STEPS);
    },
    [clearFade],
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
      }, FADE_MS / FADE_STEPS);
    },
    [clearFade],
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
        clearFade(soundId);
        const targetVol = Math.min(1, Math.max(0, (soundState[soundId]?.volume ?? 0.5) * masterVolume * masterFade));
        try {
          setLoadingState((prev) => ({ ...prev, [soundId]: true }));
          source.volume = 0;
          await source.play();
          doFadeIn(soundId, targetVol);
        } catch {
          setSoundState((prev) => ({
            ...prev,
            [soundId]: { ...prev[soundId], enabled: false },
          }));
        } finally {
          setLoadingState((prev) => ({ ...prev, [soundId]: false }));
        }
      } else {
        clearFade(soundId);
        setLoadingState((prev) => ({ ...prev, [soundId]: false }));
        doFadeOut(soundId, () => source.stop());
      }
    },
    [clearFade, doFadeIn, doFadeOut, masterVolume, masterFade, soundState],
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
      // Synthesis + element swap is best-effort: a failure here must never take
      // the app down, it just leaves the current loop playing.
      try {
        const newUrl = regenerateSound(soundId, params);
        if (!newUrl) return;
        audioMapRef.current[soundId]?.swapUrl?.(newUrl);
      } catch (err) {
        logger.error('sound retune failed:', err);
      }
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
      const source = audioMapRef.current[soundId];
      if (!source) continue;
      clearFade(soundId);
      setLoadingState((prev) => ({ ...prev, [soundId]: true }));
      const targetVol = Math.min(1, Math.max(0, state.volume * masterVolume * masterFade));
      source.volume = 0;
      try {
        await source.play();
        doFadeIn(soundId, targetVol);
      } catch {
        // ignore transient autoplay failures
      } finally {
        setLoadingState((prev) => ({ ...prev, [soundId]: false }));
      }
    }
  }, [clearFade, doFadeIn, masterVolume, masterFade, soundState]);

  const stopAll = useCallback(() => {
    Object.keys(audioMapRef.current).forEach((id) => clearFade(id));
    Object.values(audioMapRef.current).forEach((source) => source.stop());
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
      if (shouldPlay) {
        await Promise.all(
          Object.entries(nextState)
            .filter(([, s]) => s.enabled)
            .map(async ([soundId, state]) => {
              const source = audioMapRef.current[soundId];
              if (!source) return;
              setLoadingState((prev) => ({ ...prev, [soundId]: true }));
              const targetVol = Math.min(1, Math.max(0, state.volume * effectiveMaster * masterFade));
              source.volume = 0;
              try {
                await source.play();
                if (fadeTimersRef.current[soundId] != null) return;
                doFadeIn(soundId, targetVol);
              } catch {
                // ignore autoplay constraints
              } finally {
                setLoadingState((prev) => ({ ...prev, [soundId]: false }));
              }
            }),
        );
      }
    },
    [doFadeIn, masterVolume, masterFade, stopAll],
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
  };
};

