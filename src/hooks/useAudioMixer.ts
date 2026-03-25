import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Sound, SoundState } from '../types';

const defaultSoundState = (): SoundState => ({ enabled: false, volume: 0.5 });

const createInitialState = (sounds: Sound[]) =>
  sounds.reduce<Record<string, SoundState>>((acc, sound) => {
    acc[sound.id] = defaultSoundState();
    return acc;
  }, {});

export const useAudioMixer = (sounds: Sound[]) => {
  const [soundState, setSoundState] = useState<Record<string, SoundState>>(() => createInitialState(sounds));
  const [masterVolume, setMasterVolume] = useState(0.8);
  const audioMapRef = useRef<Record<string, HTMLAudioElement>>({});

  useEffect(() => {
    const map: Record<string, HTMLAudioElement> = {};
    sounds.forEach((sound) => {
      const audio = new Audio(sound.url);
      audio.loop = true;
      audio.preload = 'auto';
      audioMapRef.current[sound.id] = audio;
      map[sound.id] = audio;
    });

    return () => {
      Object.values(map).forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
    };
  }, [sounds]);

  const applyVolume = useCallback(
    (soundId: string, volume: number) => {
      const audio = audioMapRef.current[soundId];
      if (!audio) return;
      audio.volume = Math.min(1, Math.max(0, volume * masterVolume));
    },
    [masterVolume],
  );

  useEffect(() => {
    Object.entries(soundState).forEach(([soundId, state]) => {
      applyVolume(soundId, state.volume);
    });
  }, [masterVolume, soundState, applyVolume]);

  const toggleSound = useCallback(
    async (soundId: string) => {
      const nextEnabled = !soundState[soundId]?.enabled;
      setSoundState((prev) => ({
        ...prev,
        [soundId]: { ...prev[soundId], enabled: nextEnabled },
      }));

      const audio = audioMapRef.current[soundId];
      if (!audio) return;
      if (nextEnabled) {
        applyVolume(soundId, soundState[soundId]?.volume ?? 0.5);
        try {
          await audio.play();
        } catch {
          setSoundState((prev) => ({
            ...prev,
            [soundId]: { ...prev[soundId], enabled: false },
          }));
        }
      } else {
        audio.pause();
        audio.currentTime = 0;
      }
    },
    [applyVolume, soundState],
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

  const pauseAll = useCallback(() => {
    Object.values(audioMapRef.current).forEach((audio) => audio.pause());
  }, []);

  const playAllActive = useCallback(async () => {
    for (const [soundId, state] of Object.entries(soundState)) {
      if (!state.enabled) continue;
      const audio = audioMapRef.current[soundId];
      if (!audio) continue;
      applyVolume(soundId, state.volume);
      try {
        await audio.play();
      } catch {
        // intentionally ignore transient play failures from autoplay constraints
      }
    }
  }, [applyVolume, soundState]);

  const stopAll = useCallback(() => {
    Object.entries(audioMapRef.current).forEach(([id, audio]) => {
      audio.pause();
      audio.currentTime = 0;
      if (soundState[id]?.enabled) {
        setSoundState((prev) => ({
          ...prev,
          [id]: { ...prev[id], enabled: false },
        }));
      }
    });
  }, [soundState]);

  const restoreMixerState = useCallback(async (
    nextState: Record<string, SoundState>,
    nextMasterVolume: number,
    shouldPlay = false,
  ) => {
    stopAll();
    setSoundState(nextState);
    setMasterVolume(nextMasterVolume);
    if (shouldPlay) {
      for (const [soundId, state] of Object.entries(nextState)) {
        if (!state.enabled) continue;
        const audio = audioMapRef.current[soundId];
        if (!audio) continue;
        audio.volume = Math.min(1, Math.max(0, state.volume * nextMasterVolume));
        try { await audio.play(); } catch { /* ignore autoplay constraints */ }
      }
    }
  }, [stopAll]);

  const activeSounds = useMemo(
    () => sounds.filter((sound) => soundState[sound.id]?.enabled),
    [soundState, sounds],
  );

  return {
    soundState,
    masterVolume,
    setMasterVolume,
    toggleSound,
    setSoundVolume,
    pauseAll,
    playAllActive,
    stopAll,
    activeSounds,
    restoreMixerState,
  };
};
