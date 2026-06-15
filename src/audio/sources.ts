// drift away — the audio engine, free of React. Mixer sources (crossfaded WAV
// loops and live AudioWorklet generators with a WAV fallback) and the factory
// that builds the right one per sound. The React hook orchestrates these.

import type { Sound } from '../types';
import { SOUND_EDITOR_MODELS } from '../components/soundEditorDefs';

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


export { makeSource };
export type { MixerSource };
