import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Sound, SoundState } from '../types';
import { regenerateSound } from '../data';

const defaultSoundState = (): SoundState => ({ enabled: false, volume: 0.5 });

const createInitialState = (sounds: Sound[]) =>
  sounds.reduce<Record<string, SoundState>>((acc, sound) => {
    acc[sound.id] = defaultSoundState();
    return acc;
  }, {});

const FADE_MS = 700;
const FADE_STEPS = 28;

const LOOP_XFADE_MS = 1400;
const LOOP_XFADE_S = LOOP_XFADE_MS / 1000;
const LOOP_STEPS = 40;

interface MixerSource {
  volume: number;
  readonly paused: boolean;
  applyTuning?: (tuning: { playbackRate: number; gainMultiplier: number }) => void;
  swapUrl?: (newUrl: string) => void;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  destroy(): void;
}

class CrossfadeAudio implements MixerSource {
  private _url: string;
  private _els: [HTMLAudioElement, HTMLAudioElement];
  private _cur = 0;
  private _targetVol = 0;
  private _xfading = false;
  private _xfadeTimer: ReturnType<typeof setInterval> | null = null;
  private _timeupdateA: () => void;
  private _timeupdateB: () => void;
  private _monitorTimer: ReturnType<typeof setTimeout> | null = null;
  private _active = false;
  private _playbackRate = 1;
  private _gainMultiplier = 1;

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

  private get _primary() {
    return this._els[this._cur];
  }
  private get _secondary() {
    return this._els[1 - this._cur];
  }

  private _startMonitor() {
    if (this._monitorTimer !== null) return;
    const loop = () => {
      if (!this._active) {
        this._monitorTimer = null;
        return;
      }
      this._check(this._cur);
      this._monitorTimer = setTimeout(loop, 120);
    };
    loop();
  }

  private _stopMonitor() {
    if (this._monitorTimer === null) return;
    clearTimeout(this._monitorTimer);
    this._monitorTimer = null;
  }

  private _check(idx: number) {
    if (idx !== this._cur || this._xfading) return;
    const el = this._els[idx];
    if (el.paused || !isFinite(el.duration) || el.duration <= 0) return;
    const timeLeft = el.duration - el.currentTime;
    if (timeLeft <= LOOP_XFADE_S) this._startXfade();
  }

  private _startXfade() {
    if (this._xfading) return;
    this._xfading = true;

    const outEl = this._primary;
    const inEl = this._secondary;
    inEl.currentTime = 0;
    inEl.volume = 0;
    void inEl.play();

    const startOutVol = outEl.volume;
    const targetInVol = Math.min(1, this._targetVol * this._gainMultiplier);
    let step = 0;

    this._xfadeTimer = setInterval(() => {
      step++;
      const t = Math.min(1, step / LOOP_STEPS);
      outEl.volume = Math.max(0, startOutVol * Math.sqrt(Math.max(0, 1 - t)));
      inEl.volume = Math.min(1, targetInVol * Math.sqrt(t));

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

  get volume() {
    return this._targetVol;
  }

  set volume(v: number) {
    this._targetVol = v;
    if (!this._xfading) this._primary.volume = Math.min(1, v * this._gainMultiplier);
  }

  get paused() {
    return this._primary.paused;
  }

  async play() {
    this._active = true;
    this._startMonitor();
    this._primary.volume = Math.min(1, this._targetVol * this._gainMultiplier);
    await this._primary.play();
  }

  applyTuning(tuning: { playbackRate: number; gainMultiplier: number }) {
    this._playbackRate = Math.min(1.7, Math.max(0.6, tuning.playbackRate));
    this._gainMultiplier = Math.min(1.45, Math.max(0.6, tuning.gainMultiplier));
    this._els.forEach((el) => {
      el.playbackRate = this._playbackRate;
      el.defaultPlaybackRate = this._playbackRate;
    });
    if (!this._xfading) {
      this._primary.volume = Math.min(1, this._targetVol * this._gainMultiplier);
    }
  }

  swapUrl(newUrl: string) {
    const oldUrl = this._url;
    this._url = newUrl;

    if (!this._active || this._primary.paused) {
      // Not playing: just rebuild elements with new URL
      this._clearXfade();
      this._stopMonitor();
      this._els[0].removeEventListener('timeupdate', this._timeupdateA);
      this._els[1].removeEventListener('timeupdate', this._timeupdateB);
      this._els.forEach(el => { el.pause(); el.currentTime = 0; });
      this._els = [this._make(), this._make()];
      this._els[0].addEventListener('timeupdate', this._timeupdateA);
      this._els[1].addEventListener('timeupdate', this._timeupdateB);
      this._cur = 0;
      this._els.forEach(el => {
        el.playbackRate = this._playbackRate;
        el.defaultPlaybackRate = this._playbackRate;
      });
      URL.revokeObjectURL(oldUrl);
      return;
    }

    // Currently playing: quick crossfade to new URL
    this._clearXfade();
    const outEl = this._primary;
    const secIdx = 1 - this._cur as 0 | 1;

    // Replace secondary element with new URL
    this._els[secIdx].removeEventListener('timeupdate', secIdx === 0 ? this._timeupdateA : this._timeupdateB);
    this._els[secIdx].pause();
    this._els[secIdx] = this._make();
    this._els[secIdx].playbackRate = this._playbackRate;
    this._els[secIdx].defaultPlaybackRate = this._playbackRate;
    this._els[secIdx].addEventListener('timeupdate', secIdx === 0 ? this._timeupdateA : this._timeupdateB);

    const inEl = this._els[secIdx];
    inEl.currentTime = 0;
    inEl.volume = 0;
    void inEl.play();

    const startOutVol = outEl.volume;
    const targetInVol = Math.min(1, this._targetVol * this._gainMultiplier);
    let step = 0;
    const SWAP_STEPS = 20;
    const SWAP_MS = 400;

    this._xfading = true;
    this._xfadeTimer = setInterval(() => {
      step++;
      const t = Math.min(1, step / SWAP_STEPS);
      outEl.volume = Math.max(0, startOutVol * Math.sqrt(Math.max(0, 1 - t)));
      inEl.volume = Math.min(1, targetInVol * Math.sqrt(t));

      if (step >= SWAP_STEPS) {
        clearInterval(this._xfadeTimer!);
        this._xfadeTimer = null;
        outEl.pause();
        outEl.currentTime = 0;
        this._cur = 1 - this._cur;
        this._xfading = false;

        // Update the now-inactive element with new URL too
        const nowSecIdx = 1 - this._cur as 0 | 1;
        this._els[nowSecIdx].removeEventListener('timeupdate', nowSecIdx === 0 ? this._timeupdateA : this._timeupdateB);
        this._els[nowSecIdx].pause();
        this._els[nowSecIdx] = this._make();
        this._els[nowSecIdx].playbackRate = this._playbackRate;
        this._els[nowSecIdx].defaultPlaybackRate = this._playbackRate;
        this._els[nowSecIdx].addEventListener('timeupdate', nowSecIdx === 0 ? this._timeupdateA : this._timeupdateB);
      }
    }, SWAP_MS / SWAP_STEPS);

    URL.revokeObjectURL(oldUrl);
  }

  pause() {
    this._active = false;
    this._stopMonitor();
    this._clearXfade();
    this._primary.pause();
    this._secondary.pause();
  }

  stop() {
    this._active = false;
    this._stopMonitor();
    this._clearXfade();
    this._els.forEach((el) => {
      el.pause();
      el.currentTime = 0;
    });
    this._cur = 0;
  }

  destroy() {
    this._active = false;
    this._stopMonitor();
    this._clearXfade();
    this._els[0].removeEventListener('timeupdate', this._timeupdateA);
    this._els[1].removeEventListener('timeupdate', this._timeupdateB);
    this._els.forEach((el) => {
      el.pause();
      (el as HTMLAudioElement & { src: string }).src = '';
    });
  }
}

class FireWorkletSource implements MixerSource {
  private static ctx: AudioContext | null = null;
  private static modulePromise: Promise<void> | null = null;

  private gainNode: GainNode | null = null;
  private outNode: GainNode | null = null;
  private node: AudioWorkletNode | null = null;
  private _volume = 0;
  private started = false;
  private playing = false;

  private static getContext() {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  /** Returns the shared fire AudioContext with the worklet module loaded — for external use (e.g. SoundBuilder). */
  static async openContext(): Promise<AudioContext> {
    const ctx = FireWorkletSource.getContext();
    if (!FireWorkletSource.modulePromise) {
      FireWorkletSource.modulePromise = ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/fire.worklet.js`);
    }
    await FireWorkletSource.modulePromise;
    await ctx.resume();
    return ctx;
  }

  private async ensureNode() {
    const ctx = FireWorkletSource.getContext();
    if (!FireWorkletSource.modulePromise) {
      FireWorkletSource.modulePromise = ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/fire.worklet.js`);
    }
    await FireWorkletSource.modulePromise;

    if (this.node) return;

    this.node = new AudioWorkletNode(ctx, 'fire-synth', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      parameterData: {
        intensity: 0.62,
        dryness: 0.55,
        wind: 0.22,
        size: 0.45,
        distance: 0.2,
        crackleBias: 0.5,
        running: 0,
      },
    });

    this.gainNode = new GainNode(ctx, { gain: 0 });
    this.outNode = new GainNode(ctx, { gain: 0.95 });

    this.node.connect(this.gainNode);
    this.gainNode.connect(this.outNode);
    this.outNode.connect(ctx.destination);
  }

  get volume() {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = v;
    if (!this.gainNode) return;
    const ctx = FireWorkletSource.getContext();
    this.gainNode.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  get paused() {
    return !this.playing;
  }

  async play() {
    await this.ensureNode();
    const ctx = FireWorkletSource.getContext();
    await ctx.resume();
    this.started = true;
    this.playing = true;
    this.node?.parameters.get('running')?.setTargetAtTime(1, ctx.currentTime, 0.01);
    this.gainNode?.gain.setTargetAtTime(this._volume, ctx.currentTime, 0.05);
  }

  pause() {
    if (!this.started) return;
    const ctx = FireWorkletSource.getContext();
    this.playing = false;
    this.node?.parameters.get('running')?.setTargetAtTime(0, ctx.currentTime, 0.02);
    this.gainNode?.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
  }

  stop() {
    this.pause();
  }

  destroy() {
    this.pause();
    this.node?.disconnect();
    this.gainNode?.disconnect();
    this.outNode?.disconnect();
    this.node = null;
    this.gainNode = null;
    this.outNode = null;
    this.started = false;
  }
}

class FireSourceWithFallback implements MixerSource {
  private primary = new FireWorkletSource();
  private fallback: CrossfadeAudio;
  private active: MixerSource = this.primary;
  private _volume = 0;
  private failedOver = false;

  constructor(fallbackUrl: string) {
    this.fallback = new CrossfadeAudio(fallbackUrl);
  }

  get volume() {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = v;
    this.active.volume = v;
  }

  get paused() {
    return this.active.paused;
  }

  async play() {
    this.active.volume = this._volume;
    if (this.failedOver) {
      await this.active.play();
      return;
    }
    try {
      await this.primary.play();
    } catch {
      this.failedOver = true;
      this.primary.destroy();
      this.active = this.fallback;
      this.active.volume = this._volume;
      await this.active.play();
    }
  }

  swapUrl(newUrl: string) {
    if (this.failedOver) {
      this.fallback.swapUrl(newUrl);
    }
    // If using worklet primary, ignore URL swap
  }

  pause() {
    this.active.pause();
  }

  stop() {
    this.active.stop();
  }

  destroy() {
    this.primary.destroy();
    this.fallback.destroy();
  }
}

const makeSource = (sound: Sound): MixerSource => {
  if (sound.id === 'fire') return new FireSourceWithFallback(sound.url);
  return new CrossfadeAudio(sound.url);
};

export const useAudioMixer = (sounds: Sound[]) => {
  const [soundState, setSoundState] = useState<Record<string, SoundState>>(() => createInitialState(sounds));
  const [loadingState, setLoadingState] = useState<Record<string, boolean>>(() =>
    sounds.reduce<Record<string, boolean>>((acc, sound) => {
      acc[sound.id] = false;
      return acc;
    }, {}),
  );
  const [masterVolume, setMasterVolume] = useState(0.8);
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
      source.volume = Math.min(1, Math.max(0, volume * masterVolume));
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
        const targetVol = Math.min(1, Math.max(0, (soundState[soundId]?.volume ?? 0.5) * masterVolume));
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

  const setSoundTuning = useCallback((soundId: string, values: Record<string, number>) => {
    // Fire and birdsong use worklets - don't regenerate
    if (soundId === 'fire' || soundId === 'birdsong') return;

    lastTuningRef.current[soundId] = values;

    // Debounce regeneration at 300ms
    if (tuningTimerRef.current[soundId]) {
      clearTimeout(tuningTimerRef.current[soundId]);
    }

    tuningTimerRef.current[soundId] = setTimeout(() => {
      const params = lastTuningRef.current[soundId];
      if (!params) return;

      const newUrl = regenerateSound(soundId, params);
      if (!newUrl) return;

      const source = audioMapRef.current[soundId];
      if (source?.swapUrl) {
        source.swapUrl(newUrl);
      }

      delete tuningTimerRef.current[soundId];
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
      const targetVol = Math.min(1, Math.max(0, state.volume * masterVolume));
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
  }, [clearFade, doFadeIn, masterVolume, soundState]);

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
              const targetVol = Math.min(1, Math.max(0, state.volume * effectiveMaster));
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
    [doFadeIn, masterVolume, stopAll],
  );

  const activeSounds = useMemo(() => sounds.filter((sound) => soundState[sound.id]?.enabled), [soundState, sounds]);

  return {
    soundState,
    loadingState,
    masterVolume,
    setMasterVolume,
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

export const openFireContext = () => FireWorkletSource.openContext();
