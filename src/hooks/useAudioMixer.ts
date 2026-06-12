import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Sound, SoundState } from '../types';
import { regenerateSound } from '../data';
import { SOUND_EDITOR_MODELS } from '../components/soundEditorDefs';

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
  /** Live k-rate control for worklet-backed sounds (rain, thunder, forest, fire). */
  setParams?: (values: Record<string, number>) => void;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  destroy(): void;
}

class CrossfadeAudio implements MixerSource {
  /** Lazily resolved: the WAV is synthesized and elements built on first
   *  play, never at page load. */
  private _getUrl: () => string;
  private _url: string | null = null;
  /** Set by swapUrl() before the elements exist (tuning an unplayed sound). */
  private _urlOverride: string | null = null;
  private _els: [HTMLAudioElement, HTMLAudioElement] | null = null;
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

  constructor(getUrl: () => string) {
    this._getUrl = getUrl;
    this._timeupdateA = () => this._check(0);
    this._timeupdateB = () => this._check(1);
  }

  private _ensureEls(): [HTMLAudioElement, HTMLAudioElement] {
    if (this._els) return this._els;
    this._url = this._urlOverride ?? this._getUrl();
    this._urlOverride = null;
    this._els = [this._make(), this._make()];
    this._els[0].addEventListener('timeupdate', this._timeupdateA);
    this._els[1].addEventListener('timeupdate', this._timeupdateB);
    this._els.forEach((el) => {
      el.playbackRate = this._playbackRate;
      el.defaultPlaybackRate = this._playbackRate;
    });
    return this._els;
  }

  private _make() {
    const el = new Audio(this._url ?? undefined);
    el.preload = 'auto';
    return el;
  }

  private get _primary() {
    return this._ensureEls()[this._cur];
  }
  private get _secondary() {
    return this._ensureEls()[1 - this._cur];
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
    if (!this._els || idx !== this._cur || this._xfading) return;
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
    if (this._els && !this._xfading) {
      this._els[this._cur].volume = Math.min(1, v * this._gainMultiplier);
    }
  }

  get paused() {
    return !this._els || this._els[this._cur].paused;
  }

  async play() {
    this._ensureEls();
    this._active = true;
    this._startMonitor();
    this._primary.volume = Math.min(1, this._targetVol * this._gainMultiplier);
    await this._primary.play();
  }

  applyTuning(tuning: { playbackRate: number; gainMultiplier: number }) {
    this._playbackRate = Math.min(1.7, Math.max(0.6, tuning.playbackRate));
    this._gainMultiplier = Math.min(1.45, Math.max(0.6, tuning.gainMultiplier));
    this._els?.forEach((el) => {
      el.playbackRate = this._playbackRate;
      el.defaultPlaybackRate = this._playbackRate;
    });
    if (this._els && !this._xfading) {
      this._els[this._cur].volume = Math.min(1, this._targetVol * this._gainMultiplier);
    }
  }

  swapUrl(newUrl: string) {
    // Never played: just remember the new URL for when the elements are built.
    if (!this._els) {
      if (this._urlOverride) URL.revokeObjectURL(this._urlOverride);
      this._urlOverride = newUrl;
      return;
    }

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
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      return;
    }

    // Currently playing: quick crossfade to new URL
    this._clearXfade();
    const els = this._els;
    const outEl = this._primary;
    const secIdx = 1 - this._cur as 0 | 1;

    // Replace secondary element with new URL
    els[secIdx].removeEventListener('timeupdate', secIdx === 0 ? this._timeupdateA : this._timeupdateB);
    els[secIdx].pause();
    els[secIdx] = this._make();
    els[secIdx].playbackRate = this._playbackRate;
    els[secIdx].defaultPlaybackRate = this._playbackRate;
    els[secIdx].addEventListener('timeupdate', secIdx === 0 ? this._timeupdateA : this._timeupdateB);

    const inEl = els[secIdx];
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
        els[nowSecIdx].removeEventListener('timeupdate', nowSecIdx === 0 ? this._timeupdateA : this._timeupdateB);
        els[nowSecIdx].pause();
        els[nowSecIdx] = this._make();
        els[nowSecIdx].playbackRate = this._playbackRate;
        els[nowSecIdx].defaultPlaybackRate = this._playbackRate;
        els[nowSecIdx].addEventListener('timeupdate', nowSecIdx === 0 ? this._timeupdateA : this._timeupdateB);
      }
    }, SWAP_MS / SWAP_STEPS);

    if (oldUrl) URL.revokeObjectURL(oldUrl);
  }

  pause() {
    this._active = false;
    this._stopMonitor();
    this._clearXfade();
    this._els?.forEach((el) => el.pause());
  }

  stop() {
    this._active = false;
    this._stopMonitor();
    this._clearXfade();
    this._els?.forEach((el) => {
      el.pause();
      el.currentTime = 0;
    });
    this._cur = 0;
  }

  destroy() {
    this._active = false;
    this._stopMonitor();
    this._clearXfade();
    if (!this._els) return;
    this._els[0].removeEventListener('timeupdate', this._timeupdateA);
    this._els[1].removeEventListener('timeupdate', this._timeupdateB);
    this._els.forEach((el) => {
      el.pause();
      (el as HTMLAudioElement & { src: string }).src = '';
    });
  }
}

/**
 * Configuration for a real-time AudioWorklet generator. These sounds are
 * synthesised live (event-based: drops, claps, leaf bursts) rather than looped
 * from a pre-rendered WAV, which is what makes them read as the real thing.
 */
interface WorkletConfig {
  module: string;                       // file under worklets/
  processor: string;                    // registerProcessor name
  params: Record<string, number>;       // initial AudioParam values (excl. running)
  /** Maps the 3-slider editor keys to worklet param names (identity if omitted). */
  paramMap?: Record<string, string>;
}

/** The editor's defaults are the single source of truth for a worklet's
 *  initial params, so what plays always matches what the editor shows. */
const editorDefaults = (soundId: string): Record<string, number> =>
  Object.fromEntries(
    (SOUND_EDITOR_MODELS[soundId]?.groups ?? [])
      .flatMap((group) => group.params)
      .map((param) => [param.key, param.def]),
  );

const WORKLET_CONFIGS: Record<string, WorkletConfig> = {
  fire: {
    module: 'fire.worklet.js',
    processor: 'fire-synth',
    params: editorDefaults('fire'),
  },
  birdsong: {
    module: 'birdsong.worklet.js',
    processor: 'birdsong-synth',
    params: editorDefaults('birdsong'),
  },
  rain: {
    module: 'rain.worklet.js',
    processor: 'rain-gen',
    params: editorDefaults('rain'),
  },
  thunder: {
    module: 'thunder.worklet.js',
    processor: 'thunder-gen',
    params: editorDefaults('thunder'),
  },
  forest: {
    module: 'windyforest.worklet.js',
    processor: 'windyforest-gen',
    params: editorDefaults('forest'),
  },
};

/** One AudioContext shared across every worklet source, plus a per-module
 *  load promise so each worklet file is fetched and registered only once. */
let sharedWorkletCtx: AudioContext | null = null;
const workletModulePromises = new Map<string, Promise<void>>();

function getWorkletCtx(): AudioContext {
  if (!sharedWorkletCtx) sharedWorkletCtx = new AudioContext();
  return sharedWorkletCtx;
}

function loadWorkletModule(ctx: AudioContext, module: string): Promise<void> {
  let p = workletModulePromises.get(module);
  if (!p) {
    p = ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/${module}`);
    workletModulePromises.set(module, p);
  }
  return p;
}

/** Generic real-time worklet generator with a `running` on/off param and live
 *  k-rate parameter control. */
class WorkletSource implements MixerSource {
  private gainNode: GainNode | null = null;
  private node: AudioWorkletNode | null = null;
  private _volume = 0;
  private started = false;
  private playing = false;
  private pending: Record<string, number> | null = null;

  constructor(private cfg: WorkletConfig) {}

  private async ensureNode() {
    const ctx = getWorkletCtx();
    await loadWorkletModule(ctx, this.cfg.module);
    if (this.node) return;

    this.node = new AudioWorkletNode(ctx, this.cfg.processor, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      parameterData: { ...this.cfg.params, running: 0 },
    });
    this.gainNode = new GainNode(ctx, { gain: 0 });
    this.node.connect(this.gainNode);
    this.gainNode.connect(ctx.destination);
    if (this.pending) { this.applyParams(this.pending); this.pending = null; }
  }

  private applyParams(values: Record<string, number>) {
    if (!this.node) { this.pending = { ...this.pending, ...values }; return; }
    const ctx = getWorkletCtx();
    const map = this.cfg.paramMap;
    for (const [k, v] of Object.entries(values)) {
      const name = map?.[k] ?? k;
      this.node.parameters.get(name)?.setTargetAtTime(v, ctx.currentTime, 0.05);
    }
  }

  setParams(values: Record<string, number>) { this.applyParams(values); }

  get volume() { return this._volume; }
  set volume(v: number) {
    this._volume = v;
    if (!this.gainNode) return;
    this.gainNode.gain.setTargetAtTime(v, getWorkletCtx().currentTime, 0.05);
  }

  get paused() { return !this.playing; }

  async play() {
    await this.ensureNode();
    const ctx = getWorkletCtx();
    await ctx.resume();
    this.started = true;
    this.playing = true;
    this.node?.parameters.get('running')?.setValueAtTime(1, ctx.currentTime);
    this.gainNode?.gain.setTargetAtTime(this._volume, ctx.currentTime, 0.05);
  }

  pause() {
    if (!this.started) return;
    this.playing = false;
    // The worklet fades itself to silence on running=0; no hard gain cut.
    this.node?.parameters.get('running')?.setValueAtTime(0, getWorkletCtx().currentTime);
  }

  stop() { this.pause(); }

  destroy() {
    this.playing = false;
    this.node?.parameters.get('running')?.setValueAtTime(0, getWorkletCtx().currentTime);
    this.node?.disconnect();
    this.gainNode?.disconnect();
    this.node = null;
    this.gainNode = null;
    this.started = false;
  }
}

/** A worklet primary with the pre-rendered WAV as a safety net: if the worklet
 *  fails to load (old browser, blocked module), playback falls back seamlessly. */
class WorkletWithFallback implements MixerSource {
  private primary: WorkletSource;
  private fallback: CrossfadeAudio;
  private active: MixerSource;
  private _volume = 0;
  private failedOver = false;

  constructor(cfg: WorkletConfig, getFallbackUrl: () => string) {
    this.primary = new WorkletSource(cfg);
    this.fallback = new CrossfadeAudio(getFallbackUrl);
    this.active = this.primary;
  }

  get volume() { return this._volume; }
  set volume(v: number) { this._volume = v; this.active.volume = v; }
  get paused() { return this.active.paused; }

  async play() {
    this.active.volume = this._volume;
    if (this.failedOver) { await this.active.play(); return; }
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

  setParams(values: Record<string, number>) {
    // Live params apply to the worklet; the WAV fallback can't change live.
    if (!this.failedOver) this.primary.setParams?.(values);
  }

  swapUrl(newUrl: string) {
    if (this.failedOver) this.fallback.swapUrl(newUrl);
  }

  pause() { this.active.pause(); }
  stop() { this.active.stop(); }
  destroy() { this.primary.destroy(); this.fallback.destroy(); }
}

const makeSource = (sound: Sound): MixerSource => {
  // `sound.url` stays a lazy getter behind these closures: no WAV is
  // synthesized until a source actually needs to play it.
  const cfg = WORKLET_CONFIGS[sound.id];
  if (cfg) return new WorkletWithFallback(cfg, () => sound.url);
  return new CrossfadeAudio(() => sound.url);
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
