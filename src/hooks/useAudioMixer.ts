import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Sound, SoundState } from '../types';

const defaultSoundState = (): SoundState => ({ enabled: false, volume: 0.5 });

const createInitialState = (sounds: Sound[]) =>
  sounds.reduce<Record<string, SoundState>>((acc, sound) => {
    acc[sound.id] = defaultSoundState();
    return acc;
  }, {});

// ── Toggle fade constants ───────────────────────────────────────────────────

const FADE_MS = 700;
const FADE_STEPS = 28;

// ── CrossfadeAudio — dual-element seamless loop with crossfade ──────────────
// Uses two HTMLAudioElements and swaps them at the loop point with a smooth
// overlap so the hard cut at the end of each loop is never heard.

const LOOP_XFADE_MS = 1400; // crossfade duration at loop boundary
const LOOP_XFADE_S  = LOOP_XFADE_MS / 1000;
const LOOP_STEPS    = 40;

class CrossfadeAudio {
  private _url: string;
  private _els: [HTMLAudioElement, HTMLAudioElement];
  private _cur = 0;        // index of currently playing element
  private _targetVol = 0;  // logical volume (0-1), pre-master
  private _xfading = false;
  private _xfadeTimer: ReturnType<typeof setInterval> | null = null;
  private _timeupdateA: () => void;
  private _timeupdateB: () => void;

  constructor(url: string) {
    this._url = url;
    this._els = [this._make(), this._make()];
    this._timeupdateA = () => this._check(0);
    this._timeupdateB = () => this._check(1);
    this._els[0].addEventListener('timeupdate', this._timeupdateA);
    this._els[1].addEventListener('timeupdate', this._timeupdateB);
  }

  private _make() {
    const el = new Audio(this._url);
    el.preload = 'auto';
    return el;
  }

  private get _primary()   { return this._els[this._cur]; }
  private get _secondary() { return this._els[1 - this._cur]; }

  private _check(idx: number) {
    // Only the playing element triggers crossfade
    if (idx !== this._cur || this._xfading) return;
    const el = this._els[idx];
    if (el.paused || !isFinite(el.duration) || el.duration <= 0) return;
    const timeLeft = el.duration - el.currentTime;
    if (timeLeft <= LOOP_XFADE_S) {
      this._startXfade();
    }
  }

  private _startXfade() {
    if (this._xfading) return;
    this._xfading = true;

    const outEl = this._primary;
    const inEl  = this._secondary;
    inEl.currentTime = 0;
    inEl.volume = 0;
    inEl.play().catch(() => {});

    const startOutVol = outEl.volume;
    const targetInVol = this._targetVol;
    let step = 0;

    this._xfadeTimer = setInterval(() => {
      step++;
      const t = Math.min(1, step / LOOP_STEPS);
      outEl.volume = Math.max(0, startOutVol * (1 - t));
      inEl.volume  = Math.min(1, targetInVol * t);

      if (step >= LOOP_STEPS) {
        clearInterval(this._xfadeTimer!);
        this._xfadeTimer = null;
        outEl.pause();
        outEl.currentTime = 0;
        this._cur = 1 - this._cur;
        this._xfading = false;
      }
    }, LOOP_XFADE_MS / LOOP_STEPS);
  }

  private _clearXfade() {
    if (this._xfadeTimer) {
      clearInterval(this._xfadeTimer);
      this._xfadeTimer = null;
    }
    this._xfading = false;
  }

  // ── Public interface ────────────────────────────────────────────────────

  get volume()         { return this._targetVol; }
  set volume(v: number) {
    this._targetVol = v;
    if (!this._xfading) this._primary.volume = v;
    // During xfade the timer manages volumes; let it finish
  }

  get paused() { return this._primary.paused; }

  async play() {
    this._primary.volume = this._targetVol;
    return this._primary.play();
  }

  pause() {
    this._clearXfade();
    this._primary.pause();
    this._secondary.pause();
  }

  stop() {
    this._clearXfade();
    this._els.forEach((el) => { el.pause(); el.currentTime = 0; });
    this._cur = 0;
  }

  destroy() {
    this._clearXfade();
    this._els[0].removeEventListener('timeupdate', this._timeupdateA);
    this._els[1].removeEventListener('timeupdate', this._timeupdateB);
    this._els.forEach((el) => { el.pause(); (el as HTMLAudioElement & { src: string }).src = ''; });
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export const useAudioMixer = (sounds: Sound[]) => {
  const [soundState, setSoundState] = useState<Record<string, SoundState>>(() => createInitialState(sounds));
  const [masterVolume, setMasterVolume] = useState(0.8);
  const audioMapRef    = useRef<Record<string, CrossfadeAudio>>({});
  const fadeTimersRef  = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    const map: Record<string, CrossfadeAudio> = {};
    sounds.forEach((sound) => {
      const cfa = new CrossfadeAudio(sound.url);
      audioMapRef.current[sound.id] = cfa;
      map[sound.id] = cfa;
    });
    return () => { Object.values(map).forEach((cfa) => cfa.destroy()); };
  }, [sounds]);

  const applyVolume = useCallback(
    (soundId: string, volume: number) => {
      const cfa = audioMapRef.current[soundId];
      if (!cfa) return;
      cfa.volume = Math.min(1, Math.max(0, volume * masterVolume));
    },
    [masterVolume],
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

  // ── Toggle fade helpers ─────────────────────────────────────────────────

  const doFadeIn = useCallback((soundId: string, targetVol: number) => {
    const cfa = audioMapRef.current[soundId];
    if (!cfa) return;
    cfa.volume = 0;
    let step = 0;
    fadeTimersRef.current[soundId] = setInterval(() => {
      step++;
      cfa.volume = Math.min(1, (step / FADE_STEPS) * targetVol);
      if (step >= FADE_STEPS) clearFade(soundId);
    }, FADE_MS / FADE_STEPS);
  }, [clearFade]);

  const doFadeOut = useCallback((soundId: string, onDone: () => void) => {
    const cfa = audioMapRef.current[soundId];
    if (!cfa) return;
    const start = cfa.volume;
    let step = 0;
    fadeTimersRef.current[soundId] = setInterval(() => {
      step++;
      cfa.volume = Math.max(0, start * (1 - step / FADE_STEPS));
      if (step >= FADE_STEPS) { clearFade(soundId); onDone(); }
    }, FADE_MS / FADE_STEPS);
  }, [clearFade]);

  // ── Public actions ──────────────────────────────────────────────────────

  const toggleSound = useCallback(
    async (soundId: string) => {
      const nextEnabled = !soundState[soundId]?.enabled;
      setSoundState((prev) => ({
        ...prev,
        [soundId]: { ...prev[soundId], enabled: nextEnabled },
      }));

      const cfa = audioMapRef.current[soundId];
      if (!cfa) return;

      if (nextEnabled) {
        clearFade(soundId);
        const targetVol = Math.min(1, Math.max(0, (soundState[soundId]?.volume ?? 0.5) * masterVolume));
        try {
          cfa.volume = 0;
          await cfa.play();
          doFadeIn(soundId, targetVol);
        } catch {
          setSoundState((prev) => ({
            ...prev,
            [soundId]: { ...prev[soundId], enabled: false },
          }));
        }
      } else {
        clearFade(soundId);
        doFadeOut(soundId, () => cfa.stop());
      }
    },
    [clearFade, doFadeIn, doFadeOut, masterVolume, soundState],
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
    Object.keys(audioMapRef.current).forEach((id) => clearFade(id));
    Object.values(audioMapRef.current).forEach((cfa) => cfa.pause());
  }, [clearFade]);

  const playAllActive = useCallback(async () => {
    for (const [soundId, state] of Object.entries(soundState)) {
      if (!state.enabled) continue;
      const cfa = audioMapRef.current[soundId];
      if (!cfa) continue;
      clearFade(soundId);
      const targetVol = Math.min(1, Math.max(0, state.volume * masterVolume));
      cfa.volume = 0;
      try {
        await cfa.play();
        doFadeIn(soundId, targetVol);
      } catch {
        // ignore transient autoplay failures
      }
    }
  }, [clearFade, doFadeIn, masterVolume, soundState]);

  const stopAll = useCallback(() => {
    Object.keys(audioMapRef.current).forEach((id) => clearFade(id));
    Object.entries(audioMapRef.current).forEach(([id, cfa]) => {
      cfa.stop();
      if (soundState[id]?.enabled) {
        setSoundState((prev) => ({
          ...prev,
          [id]: { ...prev[id], enabled: false },
        }));
      }
    });
  }, [clearFade, soundState]);

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
        const cfa = audioMapRef.current[soundId];
        if (!cfa) continue;
        const targetVol = Math.min(1, Math.max(0, state.volume * nextMasterVolume));
        cfa.volume = 0;
        try {
          await cfa.play();
          doFadeIn(soundId, targetVol);
        } catch { /* ignore autoplay constraints */ }
      }
    }
  }, [doFadeIn, stopAll]);

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
