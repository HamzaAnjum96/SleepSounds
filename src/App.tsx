import { Fragment, lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { version } from '../package.json';
import CookieNotice from './components/CookieNotice';
import ErrorBoundary from './components/ErrorBoundary';
import InstallPrompt from './components/InstallPrompt';
import MiniPlayer from './components/MiniPlayer';
import NightSky from './components/NightSky';
import SoundCard from './components/SoundCard';
import SidePanel from './components/SidePanel';
import Toast from './components/Toast';
import { CATEGORIES, SOUND_LIBRARY, WORKLET_SOUND_IDS, releasableSounds, editorDefaults } from './data';
import { features } from './config/features';
import { loadSavedMixes, saveSavedMixes, loadLastSession, saveLastSession, newMixId } from './storage/savedMixes';
import { platform } from './platform';
import type { Category } from './data';
import { useAudioMixer } from './hooks/useAudioMixer';
import { useSleepTimer } from './hooks/useSleepTimer';
import type { Preset, SoundState } from './types';
import { EDITABLE_SOUND_IDS, SOUND_EDITOR_MODELS } from './components/soundEditorDefs';
import { CATEGORY_COLORS, CATEGORY_ICONS } from './lib/categoryIcons';
import { SOUND_ICONS } from './lib/soundIcons';
import { haptic } from './lib/haptics';
import { primeBackgroundAudio, setKeepAlive, setKeepAliveInterruptionHandler } from './lib/backgroundAudio';
import { setAudioInterruptionHandler, setAudioIntent } from './audio/graph';
import { SCENES, presetSoundIds, type Scene } from './lib/scenes';
import { formatCountdown } from './lib/time';

// Post-interaction surfaces are split out of the initial bundle: the sound
// editor, the now-playing sheet, and drift mode are only reached after a tap,
// so their code is fetched on demand (and idle-prefetched after first paint).
const LazySoundEditor = lazy(() => import('./components/SoundEditor'));
const LazyNowPlayingSheet = lazy(() => import('./components/NowPlayingSheet'));
const LazyDriftMode = lazy(() => import('./components/DriftMode'));

/** True when the browser can run the moon parallax as a CSS scroll-driven
 *  animation (compositor, off main thread). When so, the JS scroll fallback
 *  stands down. */
const CSS_SCROLL_TIMELINE =
  typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()');

// Saved mixes and "resume your night" persistence live in src/storage, behind
// migrations that keep bad/old localStorage from ever breaking startup.

/** The categories of a preset's layers, in library order, deduplicated. */
function presetCategories(preset: Preset): string[] {
  const cats: string[] = [];
  for (const sound of SOUND_LIBRARY) {
    if (preset.state[sound.id]?.enabled && !cats.includes(sound.category)) {
      cats.push(sound.category);
    }
  }
  return cats;
}

/** A saved mix's card tint, derived from the hues of its own layers — each
 *  blend gets a quiet color identity, the way scenes carry their art. */
function mixArt(preset: Preset): string {
  const colors = presetCategories(preset).map((cat) => CATEGORY_COLORS[cat] ?? '123,167,232');
  const a = colors[0] ?? '184,154,106';
  const b = colors[1] ?? a;
  return `linear-gradient(135deg, rgba(${a},0.16) 0%, rgba(${b},0.09) 52%, rgba(8,12,20,0.25) 100%)`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 4 && h < 12) return 'good morning';
  if (h >= 12 && h < 18) return 'good afternoon';
  if (h >= 18 && h < 23) return 'good evening';
  return 'up late, rest soon';
}

/** Generate the media-session artwork: a crescent-moon night scene matching
 *  the app icon. Android extracts a palette from this image to colour the
 *  notification, so the deep navy keeps the player on-brand. */
function buildMediaArtwork(size: number): string {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return `${import.meta.env.BASE_URL}icon-512.png`;
    const sky = ctx.createRadialGradient(
      0.4 * size, 0.32 * size, 0,
      0.5 * size, 0.5 * size, 0.85 * size,
    );
    sky.addColorStop(0, '#15264f');
    sky.addColorStop(0.55, '#0b1430');
    sky.addColorStop(1, '#070b18');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const [x, y, r] of [[0.16, 0.18, 0.006], [0.30, 0.10, 0.004], [0.80, 0.20, 0.005],
                              [0.86, 0.74, 0.004], [0.14, 0.66, 0.005], [0.74, 0.12, 0.004],
                              [0.58, 0.80, 0.004]] as const) {
      ctx.beginPath(); ctx.arc(x * size, y * size, r * size, 0, Math.PI * 2); ctx.fill();
    }
    const halo = ctx.createRadialGradient(
      0.58 * size, 0.45 * size, 0,
      0.58 * size, 0.45 * size, 0.34 * size,
    );
    halo.addColorStop(0, 'rgba(217,189,128,0.5)');
    halo.addColorStop(1, 'rgba(217,189,128,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);
    const moon = ctx.createLinearGradient(0.4 * size, 0.25 * size, 0.75 * size, 0.7 * size);
    moon.addColorStop(0, '#f4ead0');
    moon.addColorStop(1, '#bd9a55');
    ctx.fillStyle = moon;
    ctx.beginPath(); ctx.arc(0.57 * size, 0.45 * size, 0.225 * size, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(0.67 * size, 0.38 * size, 0.2 * size, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    return c.toDataURL('image/png');
  } catch { return `${import.meta.env.BASE_URL}icon-512.png`; }
}

// [v0.0.21 perf] The scenes shelf and saved-mixes row are extracted into memo'd
// cards. App re-renders once a second while a sleep-timer counts down (and on
// every volume/master change), which re-ran these whole rows each time even
// though a card's own inputs — its scene/preset, whether it's the current mix,
// and play state — hadn't changed. Memo + stable (ref-backed) handlers mean a
// countdown tick now repaints none of them.
const SceneCard = memo(function SceneCard({ scene, current, isPlaying, onPlay }: {
  scene: Scene;
  current: boolean;
  isPlaying: boolean;
  onPlay: (preset: Preset) => void;
}) {
  const ids = presetSoundIds(scene.preset);
  return (
    <div role="listitem" className="scene-item">
      <button
        type="button"
        className={`scene-card${current ? ' current' : ''}`}
        style={{ background: scene.art }}
        onClick={() => onPlay(scene.preset)}
        aria-label={`${current && isPlaying ? 'Pause' : 'Play'} scene ${scene.preset.name}`}
      >
        <span className="scene-icons" aria-hidden="true">
          {ids.slice(0, 3).map((id) => (
            <span key={id} className="material-symbols-rounded">{SOUND_ICONS[id] ?? 'music_note'}</span>
          ))}
        </span>
        {current && (
          <span className={`scene-state${isPlaying ? ' playing' : ''}`} aria-hidden="true">
            <span /><span /><span />
          </span>
        )}
        <span className="scene-name">{scene.preset.name}</span>
        <span className="scene-mood">{scene.mood}</span>
        <span className="scene-count">{ids.length} layer{ids.length === 1 ? '' : 's'}</span>
      </button>
    </div>
  );
});

const MixCard = memo(function MixCard({ preset, current, isPlaying, onPlay, onDelete }: {
  preset: Preset;
  current: boolean;
  isPlaying: boolean;
  onPlay: (preset: Preset) => void;
  onDelete: (id: string) => void;
}) {
  const ids = presetSoundIds(preset);
  const count = ids.length;
  return (
    <div role="listitem" className={`mix-card${current ? ' current' : ''}`}>
      <button
        type="button"
        className="mix-card-body"
        style={{ backgroundImage: mixArt(preset) }}
        onClick={() => onPlay(preset)}
        aria-label={`${current && isPlaying ? 'Pause' : 'Play'} mix ${preset.name}`}
      >
        <span className="mix-icons" aria-hidden="true">
          {ids.slice(0, 3).map((id) => (
            <span key={id} className="material-symbols-rounded">{SOUND_ICONS[id] ?? 'music_note'}</span>
          ))}
        </span>
        {current && (
          <span className={`mix-state${isPlaying ? ' playing' : ''}`} aria-hidden="true">
            <span /><span /><span />
          </span>
        )}
        <span className="mix-name">{preset.name}</span>
        <span className="mix-count">{count} layer{count === 1 ? '' : 's'}</span>
      </button>
      <button
        type="button"
        className="mix-del"
        onClick={() => onDelete(preset.id)}
        aria-label={`Delete mix ${preset.name}`}
      >✕</button>
    </div>
  );
});

export default function App() {
  const {
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
  } = useAudioMixer(SOUND_LIBRARY);

  // [v0.0.19 perf] The crescent-moon lock-screen artwork is a ~one-off canvas
  // draw + synchronous PNG encode (~12 ms here, more on a low-end phone) that
  // isn't needed until the first play — so build it after first paint, on idle,
  // instead of in a useMemo during the first render. The media-session effect
  // folds it in the moment it's ready (it already depends on mediaArtwork), and
  // until then the on-brand icon PNGs stand in.
  const [mediaArtwork, setMediaArtwork] = useState<string | null>(null);
  useEffect(() => {
    const build = () => setMediaArtwork(buildMediaArtwork(512));
    const ric = (window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    if (ric) {
      const id = ric(build);
      return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(build, 200);
    return () => window.clearTimeout(t);
  }, []);

  const [isPaused, setIsPaused] = useState(false);
  const [category, setCategory] = useState<Category>('All');
  // [v0.0.25 fix] Keep the greeting honest over time. It used to be recomputed
  // only when App happened to re-render, so a phone left playing overnight (no
  // timer, nothing forcing a render) could still say "good evening" past
  // midnight, and returning to a long-backgrounded tab showed the wrong line.
  // Hold it in state and refresh on a one-minute cadence (boundaries are on the
  // hour, and setting the same string is a no-op in React, so this only actually
  // re-renders the handful of times a day the greeting changes) plus an
  // immediate refresh whenever the tab returns to the foreground.
  const [greetingText, setGreetingText] = useState(greeting);
  useEffect(() => {
    const refresh = () => setGreetingText(greeting());
    const id = window.setInterval(refresh, 60000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  // Dev mode: spam-tap the moon (5 taps inside 3s) to toggle. Session-only by
  // design — a refresh always lands back in the normal app.
  const [devMode, setDevMode] = useState(false);
  const moonTapsRef = useRef<number[]>([]);
  const handleMoonTap = useCallback(() => {
    const now = Date.now();
    const taps = [...moonTapsRef.current.filter((t) => now - t < 3000), now];
    if (taps.length >= 5) {
      moonTapsRef.current = [];
      setDevMode((d) => !d);
    } else {
      moonTapsRef.current = taps;
    }
  }, []);
  const [openEditorSoundId, setOpenEditorSoundId] = useState<string | null>(null);
  const [driftOpen, setDriftOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Lazy surfaces mount on first open, then stay mounted so their open/close
  // lifecycle (focus restore, exit animation) is unchanged — only the initial
  // load is deferred.
  const [sheetMounted, setSheetMounted] = useState(false);
  const [driftMounted, setDriftMounted] = useState(false);
  // On wide screens the mix controls live in a persistent side panel instead of
  // the slide-up sheet; the mini player and sheet stand down there.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1000px)').matches,
  );
  /** Id of the last loaded scene or saved mix; cleared once the user edits
   *  the mix by hand, so the "playing" badge never lies. */
  const [activeMixId, setActiveMixId] = useState<string | null>(null);
  // First-run whisper: shown until the first scene or sound is ever chosen.
  const [showHint, setShowHint] = useState(() => {
    try { return localStorage.getItem('drift-onboarded') === null; }
    catch { return false; }
  });
  // Prompt discipline: the storage notice and the install row are held back
  // until the first sound has actually played, and never appear together — the
  // path to sound stays clear on first load. `hasPlayed` latches on the first
  // playback; the storage notice shows first, the install row only once it's
  // acknowledged (or was on a prior visit).
  const [hasPlayed, setHasPlayed] = useState(false);
  const [storageAck, setStorageAck] = useState(() => {
    try { return localStorage.getItem('drift-cookie-ack') !== null; }
    catch { return true; } // storage unavailable: don't nag
  });
  const ackStorage = useCallback(() => {
    setStorageAck(true);
    try { localStorage.setItem('drift-cookie-ack', '1'); } catch { /* private mode */ }
  }, []);
  const soundsGridRef = useRef<HTMLDivElement | null>(null);
  const sceneRowRef = useRef<HTMLDivElement | null>(null);
  const miniPlayerRef = useRef<HTMLDivElement | null>(null);
  const [soundsGridColumns, setSoundsGridColumns] = useState(2);
  const [editorValuesBySound, setEditorValuesBySound] = useState<Record<string, Record<string, number>>>(() => (
    Object.fromEntries(
      Object.entries(SOUND_EDITOR_MODELS).map(([id, model]) => ([
        id,
        Object.fromEntries(model.groups.flatMap((group) => group.params).map((param) => [param.key, param.def])),
      ])),
    )
  ));

  useEffect(() => { if (sheetOpen) setSheetMounted(true); }, [sheetOpen]);
  useEffect(() => { if (driftOpen) setDriftMounted(true); }, [driftOpen]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1000px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Moving to the desktop panel closes the mobile overlays (and vice-versa is
  // moot — the panel is always present), so a resize never strands an open sheet.
  useEffect(() => {
    if (isDesktop) setSheetOpen(false);
  }, [isDesktop]);

  // Warm the split surfaces once the page is idle, so the first open is instant
  // even before the service worker has them cached.
  useEffect(() => {
    const prefetch = () => {
      void import('./components/NowPlayingSheet');
      void import('./components/DriftMode');
      void import('./components/SoundEditor');
    };
    const ric = (window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    if (ric) {
      const id = ric(prefetch);
      return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(prefetch, 2500);
    return () => window.clearTimeout(t);
  }, []);

  const dismissHint = useCallback(() => {
    setShowHint((shown) => {
      if (shown) {
        try { localStorage.setItem('drift-onboarded', '1'); } catch { /* private mode */ }
      }
      return false;
    });
  }, []);

  // Saved mixes — loaded through the storage migration, so bad/old data can't
  // break startup.
  const [presets, setPresets] = useState<Preset[]>(loadSavedMixes);
  // Open the sheet straight into its save field (mini-player save tap).
  const [sheetStartSaving, setSheetStartSaving] = useState(false);

  const persistPresets = (next: Preset[]) => {
    setPresets(next);
    saveSavedMixes(next);
  };

  // A single forgiving snackbar. Destructive actions (stopping a mix, deleting
  // a saved one) leave an "undo" here for a few seconds — forgiving in the dark.
  const [toast, setToast] = useState<{ id: number; message: string; actionLabel?: string; onAction?: () => void } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);
  const showToast = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    window.clearTimeout(toastTimer.current);
    const id = Date.now();
    setToast({ id, message, actionLabel, onAction });
    toastTimer.current = window.setTimeout(
      () => setToast((t) => (t?.id === id ? null : t)),
      5000,
    );
  }, []);

  const handleDeletePreset = (id: string) => {
    const index = presets.findIndex((p) => p.id === id);
    if (index < 0) return;
    const removed = presets[index];
    persistPresets(presets.filter((p) => p.id !== id));
    if (activeMixId === id) setActiveMixId(null);
    announce(`deleted mix ${removed.name}`);
    showToast(`deleted "${removed.name}"`, 'undo', () => {
      setPresets((cur) => {
        if (cur.some((p) => p.id === removed.id)) return cur;
        const next = [...cur];
        next.splice(Math.min(index, next.length), 0, removed);
        saveSavedMixes(next);
        return next;
      });
      announce(`restored mix ${removed.name}`);
    });
  };

  const handleSaveMix = (name: string) => {
    const preset: Preset = {
      // [v0.0.18 fix] newMixId (not a bare crypto.randomUUID, which is undefined
      // in insecure contexts / older browsers) so saving a mix can never throw.
      id: newMixId(),
      name,
      createdAt: new Date().toISOString(),
      // [v0.0.16/0.0.20 fix] Bake each layer's effective tuning into the saved
      // state (via bakeForSave) instead of storing raw soundState. Hand tuning
      // lives in editorValuesBySound, which resets on reload — so without this a
      // saved mix reopened later replayed its tuned layers (e.g. a rain shaped to
      // "at a window", or an ocean variant) at their defaults. Baking pins it.
      state: bakeForSave(soundState),
      masterVolume,
    };
    persistPresets([...presets, preset]);
    setActiveMixId(preset.id);
    // [v0.0.29 a11y] Confirm the save to screen readers — deleting a mix already
    // announces ("deleted mix …"), but saving was silent, so a non-sighted user
    // got no acknowledgement that the key action succeeded.
    announce(`saved mix ${name}`);
  };

  // Stop the whole mix, but leave an undo: snapshot the live layers first, so
  // a mistaken stop in the dark is one tap to bring back, playing.
  const handleStopMix = useCallback(() => {
    const snapshot = { state: soundState, master: masterVolume };
    const restoredId = activeMixId;
    stopAll();
    setIsPaused(false);
    showToast('mix stopped', 'undo', () => {
      restoreMixerState(snapshot.state, snapshot.master, true);
      setActiveMixId(restoredId);
      setIsPaused(false);
    });
  }, [soundState, masterVolume, activeMixId, stopAll, restoreMixerState, showToast]);

  // Open the sheet straight into its save field (from the mini-player save tap).
  const handleSaveIntent = useCallback(() => {
    haptic(8);
    setSheetStartSaving(true);
    setSheetOpen(true);
  }, []);

  const isPlaying = activeSounds.length > 0 && !isPaused;

  // Screen-reader status line: playback and timer state are otherwise only
  // conveyed visually. A polite live region speaks the changes.
  const [status, setStatus] = useState('');
  const announce = useCallback((msg: string) => {
    // Re-set even if identical so repeated actions still announce.
    setStatus('');
    requestAnimationFrame(() => setStatus(msg));
  }, []);

  // Sleep timer — a playing-time countdown that winds the mix down and stops it.
  const onTimerExpire = useCallback(() => { stopAll(); setIsPaused(false); }, [stopAll]);
  const { secondsLeft, timerTotal, skyDim, toggle: toggleTimer, extend: extendTimer, clear: clearTimer } =
    useSleepTimer({ isPlaying, setMasterFade, onExpire: onTimerExpire, announce });
  const handleTimerSelect = (secs: number) => { haptic(8); toggleTimer(secs); };
  const handleTimerExtend = (secs: number) => { haptic(8); extendTimer(secs); };
  const handleTimerClear = () => { haptic(8); clearTimer(); };

  const handleMasterToggle = useCallback(async () => {
    haptic(10);
    if (isPlaying) {
      pauseAll();
      setIsPaused(true);
    } else if (activeSounds.length > 0) {
      // Prime only on the play path (inside the gesture, before the await) — never
      // when pausing, or the keep-alive can be left murmuring after the mix stops.
      primeBackgroundAudio();
      await playAllActive();
      setIsPaused(false);
    }
  }, [isPlaying, activeSounds.length, pauseAll, playAllActive]);

  // Bake each enabled worklet layer's effective slider values into a preset's
  // state — the sound's global editor config overlaid with the preset's own
  // override. So loading a scene both applies its character (e.g. a quieter rain
  // bed under the fan) and resets layers it doesn't override back to normal.
  const enrichPresetState = useCallback((state: Record<string, SoundState>): Record<string, SoundState> => {
    const out: Record<string, SoundState> = {};
    for (const [id, s] of Object.entries(state)) {
      out[id] = s.enabled && (WORKLET_SOUND_IDS.has(id) || s.tuning)
        ? { ...s, tuning: { ...editorValuesBySound[id], ...(s.tuning ?? {}) } }
        : s;
    }
    return out;
  }, [editorValuesBySound]);

  // [v0.0.20 fix] Persist-time enrichment: bake the effective editor tuning of
  // every enabled layer into the saved state, so a saved or resumed mix replays
  // exactly what's tuned now — including hand-tuned WAV sounds (ocean, wind,
  // chimes…), whose tuning otherwise lives only in editorValuesBySound and was
  // lost on reload. Worklet layers bake unconditionally (params apply live, no
  // cost); a WAV layer bakes only when actually tuned away from its defaults, so
  // an untouched WAV keeps using its memoized default render instead of
  // needlessly regenerating on load. Kept separate from enrichPresetState, which
  // runs on the *play* path and must not fold stale session editor values into a
  // preset being loaded.
  const bakeForSave = useCallback((state: Record<string, SoundState>): Record<string, SoundState> => {
    const out: Record<string, SoundState> = {};
    for (const [id, s] of Object.entries(state)) {
      if (!s.enabled) { out[id] = s; continue; }
      const vals = editorValuesBySound[id];
      let tuned = false;
      if (vals) {
        if (WORKLET_SOUND_IDS.has(id) || s.tuning) {
          tuned = true;
        } else {
          const def = editorDefaults(id);
          tuned = Object.keys(def).some((k) => Math.abs((vals[k] ?? def[k]) - def[k]) > 1e-9);
        }
      }
      out[id] = tuned ? { ...s, tuning: { ...vals, ...(s.tuning ?? {}) } } : s;
    }
    return out;
  }, [editorValuesBySound]);

  const handlePlayPreset = useCallback((preset: Preset) => {
    dismissHint();
    haptic(10);
    if (activeMixId === preset.id && activeSounds.length > 0) {
      // Tapping the playing scene pauses/resumes it — handleMasterToggle primes
      // on its own play path, so don't prime here (it might be a pause).
      void handleMasterToggle();
      return;
    }
    // About to play a fresh preset — prime within the gesture.
    primeBackgroundAudio();
    restoreMixerState(enrichPresetState(preset.state), preset.masterVolume, true);
    // Sync each layer's editor values to what the preset actually plays, so the
    // sound editor shows the real variant (e.g. rain's "At a Window") instead of
    // a stale default ("Steady") — and so manually re-toggling a layer keeps that
    // character rather than reverting to defaults.
    setEditorValuesBySound((prev) => {
      const next = { ...prev };
      for (const [id, s] of Object.entries(preset.state)) {
        if (s.enabled) next[id] = { ...editorDefaults(id), ...(s.tuning ?? {}) };
      }
      return next;
    });
    setActiveMixId(preset.id);
    setIsPaused(false);
  }, [activeMixId, activeSounds.length, dismissHint, handleMasterToggle, restoreMixerState, enrichPresetState]);

  // [v0.0.21 perf] Stable handlers for the memo'd scene/mix cards. handlePlayPreset
  // and handleDeletePreset both change identity as the mix changes; routing through
  // refs keeps a constant identity so a timer tick never invalidates the cards.
  const handlePlayPresetRef = useRef(handlePlayPreset);
  handlePlayPresetRef.current = handlePlayPreset;
  const stablePlayPreset = useCallback((preset: Preset) => handlePlayPresetRef.current(preset), []);
  const handleDeletePresetRef = useRef(handleDeletePreset);
  handleDeletePresetRef.current = handleDeletePreset;
  const stableDeletePreset = useCallback((id: string) => handleDeletePresetRef.current(id), []);

  useEffect(() => {
    if (activeSounds.length === 0) {
      setIsPaused(false);
      setDriftOpen(false);
      setSheetOpen(false);
      setActiveMixId(null);
      // [v0.0.22 fix] Clear any running sleep timer when the mix empties, so a
      // stale countdown can't silently carry over onto the next mix you start.
      // Silent — stopping the mix is already announced — and a no-op on timer
      // expiry (the timer has already cleared itself by then). A scene/preset
      // swap never lands here: restoreMixerState replaces the layers in one
      // batch, so activeSounds goes straight from old to new, never through 0.
      clearTimer(true);
    }
  }, [activeSounds.length, clearTimer]);

  // Keep the silent background-audio element in sync with playback, so iOS
  // keeps the session alive and the lock-screen player reflects true state. The
  // same intent drives the interruption guard (so an OS auto-resume after another
  // app finishes is pushed back down while we're paused).
  useEffect(() => {
    setKeepAlive(isPlaying);
    setAudioIntent(isPlaying);
  }, [isPlaying]);

  // When another app takes audio focus (a call, a video, music) — or the user
  // hits pause in the media notification — pause our mix and leave it paused. It
  // resumes only on a deliberate tap, never on its own. Both signals route here:
  // iOS via the AudioContext 'interrupted' state, Android via the OS pausing our
  // keep-alive element.
  useEffect(() => {
    const pause = () => { pauseAll(); setIsPaused(true); };
    setAudioInterruptionHandler(pause);
    setKeepAliveInterruptionHandler(pause);
  }, [pauseAll]);

  // Latch the first real playback — it releases the held-back prompts.
  useEffect(() => {
    if (isPlaying) setHasPlayed(true);
  }, [isPlaying]);

  // Scene deep links (?scene=builtin-rainfall) power the app-icon shortcuts.
  // If autoplay is blocked (no gesture on launch), the mix loads paused with
  // the mini player ready: one tap to play.
  const launchedRef = useRef(false);
  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    const sceneId = new URLSearchParams(window.location.search).get('scene');
    if (sceneId) {
      // Clean the param so refreshes don't re-trigger.
      window.history.replaceState(null, '', window.location.pathname);
      const scene = SCENES.find((s) => s.preset.id === sceneId);
      if (scene) { handlePlayPreset(scene.preset); return; }
      // [v0.0.26 fix] Unknown/stale scene id — a retired or renamed scene, or a
      // typo in the link — used to return here and strand the user on a blank
      // app. Fall through instead, so they still land on last night's mix.
    }
    // No deep link: bring back last night's mix, paused and ready (autoplay is
    // blocked without a gesture anyway, and a sudden sound would be jarring).
    const last = loadLastSession();
    if (last) {
      restoreMixerState(enrichPresetState(last.state), last.masterVolume, false);
      setIsPaused(true);
    }
  }, [handlePlayPreset, restoreMixerState, enrichPresetState]);

  // Persist the live mix so it survives a reload or a closed tab. Debounced so
  // a volume drag doesn't hammer storage; clears itself when the mix is empty.
  // [v0.0.16/0.0.20 fix] Persist the *baked* state so a resumed night keeps each
  // layer's hand tuning (which lives in editorValuesBySound, not soundState);
  // editorValuesBySound is a dep (via bakeForSave) so a retune re-triggers the save.
  useEffect(() => {
    if (!launchedRef.current) return;
    const t = window.setTimeout(() => saveLastSession(bakeForSave(soundState), masterVolume), 500);
    return () => window.clearTimeout(t);
  }, [soundState, masterVolume, bakeForSave]);

  // Media Session API — powers lock-screen / notification player on Android & iOS.
  // [v0.0.30 perf] Split into three narrow effects so a volume drag — which mints
  // a fresh activeSounds array and a fresh playAllActive every tick — no longer
  // rebuilds the metadata and re-registers every action handler each frame. The
  // title/artwork update only when they change (mediaTitle is a string, so an
  // identical active set is a no-op dep), playbackState only on play/pause, and
  // the transport handlers register once and read the latest fns through a ref.
  const mediaTitle = useMemo(
    () => (activeSounds.length > 0 ? activeSounds.map((s) => s.name).join(' · ') : 'starlight'),
    [activeSounds],
  );
  const mediaTransportRef = useRef({ playAllActive, pauseAll, stopAll, setIsPaused });
  mediaTransportRef.current = { playAllActive, pauseAll, stopAll, setIsPaused };

  // [v0.0.36 perf] Stable names array for the memo'd DriftMode — the inline
  // `activeSounds.map(...)` minted a fresh array every render, which would
  // defeat its memo on every unrelated update.
  const mixNames = useMemo(() => activeSounds.map((s) => s.name), [activeSounds]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const base = import.meta.env.BASE_URL;
    platform.setMediaMetadata({
      title: mediaTitle,
      artist: 'starlight',
      album: 'sleep sounds',
      artwork: [
        { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
        // Folded in once the idle build (above) has produced it.
        ...(mediaArtwork ? [{ src: mediaArtwork, sizes: '512x512', type: 'image/png' }] : []),
      ],
    });
  }, [mediaTitle, mediaArtwork]);

  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const t = mediaTransportRef;
    // Prime first: an explicit resume must mark the keep-alive as intended before
    // the element plays, so the auto-resume guard doesn't suppress it.
    navigator.mediaSession.setActionHandler('play',  () => { primeBackgroundAudio(); t.current.playAllActive(); t.current.setIsPaused(false); });
    navigator.mediaSession.setActionHandler('pause', () => { t.current.pauseAll();  t.current.setIsPaused(true); });
    navigator.mediaSession.setActionHandler('stop',  () => { t.current.stopAll();   t.current.setIsPaused(false); });
    try { navigator.mediaSession.setActionHandler('seekbackward', null); } catch { /* ok */ }
    try { navigator.mediaSession.setActionHandler('seekforward',  null); } catch { /* ok */ }
    try { navigator.mediaSession.setActionHandler('seekto',       null); } catch { /* ok */ }
    try {
      (navigator.mediaSession as MediaSession & { setPositionState?: (s: object) => void })
        .setPositionState?.({ duration: Infinity, playbackRate: 1, position: 0 });
    } catch { /* ok */ }
  }, []);

  const handleSoundToggle = useCallback(async (soundId: string) => {
    haptic(8);
    dismissHint();
    // A hand-edited mix is its own thing; the scene badge comes off.
    setActiveMixId(null);
    const wasEnabled = soundState[soundId]?.enabled;
    if (!wasEnabled) {
      // Only prime when we're about to *play* — priming on a toggle-off would
      // start the keep-alive just as the mix empties, and the race between that
      // play() and the effect's pause() can leave it murmuring with no player.
      primeBackgroundAudio();
      // Starting a sound on its own: restore its global editor config, clearing
      // any lingering preset override (e.g. the reduced rain bed from Fan & Rain).
      if (WORKLET_SOUND_IDS.has(soundId)) setSoundTuning(soundId, editorValuesBySound[soundId]);
      if (isPaused) setIsPaused(false);
    }
    await toggleSound(soundId);
  }, [soundState, isPaused, toggleSound, dismissHint, setSoundTuning, editorValuesBySound]);

  // [v0.0.11 perf] Stable, id-parameterized card handlers. handleSoundToggle
  // and setSoundVolume both change identity whenever soundState (or master
  // volume) changes, so passing them straight to the memoized SoundCard would
  // re-render every card on any single-card edit. Routing through refs keeps a
  // constant function identity, so only the card whose own props changed
  // repaints — dragging one slider no longer re-renders all ~19 cards.
  const handleSoundToggleRef = useRef(handleSoundToggle);
  handleSoundToggleRef.current = handleSoundToggle;
  const stableToggleSound = useCallback((id: string) => { void handleSoundToggleRef.current(id); }, []);

  const setSoundVolumeRef = useRef(setSoundVolume);
  setSoundVolumeRef.current = setSoundVolume;
  const stableSetSoundVolume = useCallback((id: string, v: number) => setSoundVolumeRef.current(id, v), []);

  const stableToggleEditor = useCallback((id: string) => {
    if (!EDITABLE_SOUND_IDS.includes(id)) return;
    setOpenEditorSoundId((prev) => (prev === id ? null : id));
  }, []);

  // [v0.0.35 perf] Constant-identity handlers for the memoized player surfaces
  // (the mini player, and the sheet / side-panel layer rows). Master toggle,
  // stop, save, and the timer actions otherwise change identity whenever
  // soundState or the timer state changes — passed to memoized children, that
  // would defeat the memoization on every volume drag and every countdown tick.
  // Ref indirection keeps a stable identity while still calling the latest
  // closure; the setState-only ones are plain empty-dep callbacks.
  const masterToggleRef = useRef(handleMasterToggle);
  masterToggleRef.current = handleMasterToggle;
  const stableMasterToggle = useCallback(() => { void masterToggleRef.current(); }, []);
  const stopMixRef = useRef(handleStopMix);
  stopMixRef.current = handleStopMix;
  const stableStopMix = useCallback(() => stopMixRef.current(), []);
  const saveMixRef = useRef(handleSaveMix);
  saveMixRef.current = handleSaveMix;
  const stableSaveMix = useCallback((name: string) => saveMixRef.current(name), []);
  const timerSelectRef = useRef(handleTimerSelect);
  timerSelectRef.current = handleTimerSelect;
  const stableTimerSelect = useCallback((secs: number) => timerSelectRef.current(secs), []);
  const timerExtendRef = useRef(handleTimerExtend);
  timerExtendRef.current = handleTimerExtend;
  const stableTimerExtend = useCallback((secs: number) => timerExtendRef.current(secs), []);
  const timerClearRef = useRef(handleTimerClear);
  timerClearRef.current = handleTimerClear;
  const stableTimerClear = useCallback(() => timerClearRef.current(), []);
  const stableOpenSheet = useCallback(() => setSheetOpen(true), []);
  const stableCloseSheet = useCallback(() => { setSheetOpen(false); setSheetStartSaving(false); }, []);
  const stableDriftFromSheet = useCallback(() => { setSheetOpen(false); setDriftOpen(true); }, []);
  const stableDriftFromPanel = useCallback(() => setDriftOpen(true), []);
  const stableDriftClose = useCallback(() => setDriftOpen(false), []);
  const stableDriftStop = useCallback(() => { haptic(10); stopAll(); setIsPaused(false); }, [stopAll]);

  // Space plays/pauses when no control has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && target !== document.body) return;
      e.preventDefault();
      void handleMasterToggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMasterToggle]);

  // Switch the library filter through a View Transition where supported, so the
  // grid crossfades instead of snapping. Falls back to a plain set otherwise,
  // and reduced-motion users get the instant swap (the CSS zeroes the anim).
  const selectCategory = useCallback((cat: Category) => {
    if (cat === category) return;
    type VTDoc = Document & { startViewTransition?: (cb: () => void) => unknown };
    const doc = document as VTDoc;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (doc.startViewTransition && !reduce) {
      doc.startViewTransition(() => flushSync(() => setCategory(cat)));
    } else {
      setCategory(cat);
    }
  }, [category]);

  // Experimental sounds are hidden unless the feature flag opts them in; dev
  // mode (spam-tap the moon) also reveals the pulled-from-lineup sounds.
  // Memoized so the array identity is stable: a fresh array each render would
  // re-run every effect that depends on the visible list.
  const library = useMemo(
    () => releasableSounds(features.experimentalSounds || devMode, devMode),
    [devMode],
  );
  const visibleSounds = useMemo(
    () => (category === 'All' ? library : library.filter((s) => s.category === category)),
    [library, category],
  );

  const openEditorIndex = openEditorSoundId
    ? visibleSounds.findIndex((sound) => sound.id === openEditorSoundId)
    : -1;
  const editorInsertAfter = useMemo(() => {
    if (openEditorIndex < 0) return -1;
    const columns = Math.max(1, soundsGridColumns);
    const targetIndex = Math.ceil((openEditorIndex + 1) / columns) * columns - 1;
    return Math.min(visibleSounds.length - 1, targetIndex);
  }, [openEditorIndex, soundsGridColumns, visibleSounds.length]);

  const activeInCategory = (cat: Category) =>
    cat === 'All'
      ? activeSounds.length
      : activeSounds.filter((s) => s.category === cat).length;

  useEffect(() => {
    if (!openEditorSoundId) return;
    if (!visibleSounds.some((sound) => sound.id === openEditorSoundId)) {
      setOpenEditorSoundId(null);
    }
  }, [openEditorSoundId, visibleSounds]);

  useEffect(() => {
    const grid = soundsGridRef.current;
    if (!grid) return;
    const updateLayout = () => {
      const template = window.getComputedStyle(grid).gridTemplateColumns;
      const columns = template.split(' ').filter(Boolean).length;
      setSoundsGridColumns(Math.max(1, columns));
    };
    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(grid);
    window.addEventListener('resize', updateLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateLayout);
    };
  }, []);

  const handleAppScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    // Where CSS scroll-driven animation drives the parallax (on the
    // compositor), skip the JS path entirely; this is only the fallback.
    if (CSS_SCROLL_TIMELINE) return;
    const scrollY = (e.target as HTMLDivElement).scrollTop;
    document.documentElement.style.setProperty('--moon-scroll', `${scrollY}px`);
  }, []);

  // Title of the current mix: the loaded scene's name, or a hand-mix summary.
  const mixTitle = useMemo(() => {
    if (activeMixId) {
      const scene = SCENES.find((s) => s.preset.id === activeMixId);
      if (scene) return scene.preset.name;
      const saved = presets.find((p) => p.id === activeMixId);
      if (saved) return saved.name;
    }
    if (activeSounds.length === 0) return '';
    const names = activeSounds.map((s) => s.name);
    return names.length <= 3 ? names.join(' · ') : `${names.slice(0, 2).join(' · ')} +${names.length - 2}`;
  }, [activeMixId, activeSounds, presets]);

  const mixSubtitle = secondsLeft !== null
    ? `${formatCountdown(secondsLeft)} left`
    : `${activeSounds.length} layer${activeSounds.length === 1 ? '' : 's'}`;

  const hasPlayer = activeSounds.length > 0;

  // Connectivity badge. The app is fully offline-capable, so this is reassurance
  // ("offline — still works"), not a warning.
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // Silent auto-update. The active service worker reports its build version;
  // if it's newer than the running app, this session is behind. The app is
  // tiny and fully cached, so we just refresh into the new version — but only
  // while nothing is playing, so an update can never cut off a mix.
  const [updatePending, setUpdatePending] = useState(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;
    const swVersion = (): Promise<string | null> => new Promise((resolve) => {
      const ctrl = navigator.serviceWorker.controller;
      if (!ctrl) { resolve(null); return; }
      const ch = new MessageChannel();
      const t = window.setTimeout(() => resolve(null), 2000);
      ch.port1.onmessage = (e) => { window.clearTimeout(t); resolve(e.data as string); };
      ctrl.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
    });
    const check = async () => {
      const v = await swVersion();
      if (!cancelled && v && v !== version) setUpdatePending(true);
    };
    void check();
    const onChange = () => { void check(); };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => { cancelled = true; navigator.serviceWorker.removeEventListener('controllerchange', onChange); };
  }, []);

  // Apply a pending update at a safe moment: foreground, online, and only when
  // no mix is loaded — so the refresh is invisible, never interrupts playback,
  // and never updates in the background while the screen is off. Once per
  // session (sessionStorage) so it can never loop, even if a stale offline
  // shell is served.
  useEffect(() => {
    if (!updatePending) return;
    const tryReload = () => {
      if (activeSounds.length !== 0) return;
      if (!navigator.onLine) return;
      if (document.visibilityState !== 'visible') return;
      if (sessionStorage.getItem('drift-reloaded')) return;
      sessionStorage.setItem('drift-reloaded', '1');
      window.location.reload();
    };
    tryReload();
    document.addEventListener('visibilitychange', tryReload);
    return () => document.removeEventListener('visibilitychange', tryReload);
  }, [updatePending, activeSounds.length]);

  const firstStatusRef = useRef(true);
  useEffect(() => {
    if (firstStatusRef.current) { firstStatusRef.current = false; return; }
    if (activeSounds.length === 0) setStatus('stopped');
    else setStatus(isPlaying ? 'playing' : 'paused');
  }, [isPlaying, activeSounds.length]);

  // Reflect playback in the tab title, so the app is findable among many tabs
  // (the awake-but-focused, masking-noise user especially).
  useEffect(() => {
    const base = 'starlight — sleep sounds';
    document.title = isPlaying && mixTitle ? `▸ ${mixTitle} · starlight` : base;
  }, [isPlaying, mixTitle]);

  // Teach the horizontal scroll: a gentle wink of the scenes shelf on every
  // load so it reads as "there's more this way."
  useEffect(() => {
    const row = sceneRowRef.current;
    if (!row) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (row.scrollWidth <= row.clientWidth + 8) return;
    // Suspend scroll-snap during the wink, or proximity-snap yanks the peek
    // straight back before it's seen; restore it after.
    row.style.scrollSnapType = 'none';
    const peek = window.setTimeout(() => row.scrollTo({ left: 56, behavior: 'smooth' }), 900);
    const settle = window.setTimeout(() => row.scrollTo({ left: 0, behavior: 'smooth' }), 1650);
    const restore = window.setTimeout(() => { row.style.scrollSnapType = ''; }, 2250);
    return () => {
      window.clearTimeout(peek);
      window.clearTimeout(settle);
      window.clearTimeout(restore);
      row.style.scrollSnapType = '';
    };
  }, []);

  // Keep the footer clear of the floating mini player. Its height varies with
  // safe-area insets, font scaling, and how the subtitle wraps, so measure the
  // live element rather than guess a fixed gap — the footer padding tracks it.
  useEffect(() => {
    const root = document.documentElement;
    const el = miniPlayerRef.current;
    if (!el) { root.style.removeProperty('--mini-player-h'); return; }
    const update = () => root.style.setProperty('--mini-player-h', `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--mini-player-h'); };
  }, [hasPlayer, driftOpen]);

  return (
    <>
      <div className="bg-layer" />
      <div className="aurora" aria-hidden="true" />
      <NightSky
        playing={isPlaying}
        intensity={Math.min(1, activeSounds.length / 4)}
        dim={skyDim}
      />
      {/* Scenery, but also the dev-mode latch: 5 quick taps toggles it, and
          the moon wanes to a crescent while it's on. Hidden from the a11y
          tree and tab order — it's an easter egg, not a control. */}
      <div className="moon-track" aria-hidden="true">
        <button
          type="button"
          className={`moon${devMode ? ' moon-dev' : ''}`}
          tabIndex={-1}
          onClick={handleMoonTap}
        />
      </div>

      <div className="layout">
      <div
        className={`app${driftOpen ? ' app-quiet' : ''}${hasPlayer ? ' has-player' : ''}`}
        onScroll={handleAppScroll}
      >
        <header>
          {/* The h1 gives the page its accessible title; visually it's the same
              wordmark (the preflight reset zeroes heading defaults). */}
          <h1 className="wordmark">starlight</h1>
          <div className="greeting">{devMode ? `${greetingText} · in dev mode` : greetingText}</div>
        </header>

        {/* The main landmark: everything that is the app — the install
            prompt, first-run hint, scenes, saved mixes, and the library —
            as opposed to the header above and footer below. */}
        <main>
        <InstallPrompt ready={hasPlayed && storageAck} />

        {showHint && (
          <p className="first-hint">begin with a scene, or layer your own mix below</p>
        )}
        <section className="section" style={{ animationDelay: '0.1s' }}>
          <div className="section-head">
            <h2 className="section-title">the scenes</h2>
            <span className="section-meta">curated mixes</span>
          </div>
          <div className="scene-row" role="list" ref={sceneRowRef}>
            {SCENES.map((scene) => (
              <SceneCard
                key={scene.preset.id}
                scene={scene}
                current={activeMixId === scene.preset.id && activeSounds.length > 0}
                isPlaying={isPlaying}
                onPlay={stablePlayPreset}
              />
            ))}
          </div>
        </section>

        {/* Only shown once there's something saved — an empty "your mixes"
            placeholder appearing the moment a sound starts shoves the library
            down, which reads as jarring. Saving lives in the player instead. */}
        {presets.length > 0 && (
          <section className="section" style={{ animationDelay: '0.18s' }}>
            <div className="section-head">
              <h2 className="section-title">your mixes</h2>
              <span className="section-meta">{presets.length} saved</span>
            </div>
            <div className="mix-row" role="list">
              {presets.map((preset) => (
                <MixCard
                  key={preset.id}
                  preset={preset}
                  current={activeMixId === preset.id && activeSounds.length > 0}
                  isPlaying={isPlaying}
                  onPlay={stablePlayPreset}
                  onDelete={stableDeletePreset}
                />
              ))}
            </div>
          </section>
        )}

        <section className="section" style={{ animationDelay: '0.26s' }}>
          <div className="section-head">
            <h2 className="section-title">the library</h2>
            <span className="section-meta">{library.length} generated sounds</span>
          </div>

          <div className="cat-filters">
            {CATEGORIES.map((cat) => {
              const n = activeInCategory(cat);
              const hasCount = n > 0;
              return (
                <button
                  key={cat}
                  type="button"
                  className={`cat-filter${category === cat ? ' active' : ''}`}
                  data-cat={cat}
                  aria-pressed={category === cat}
                  onClick={() => selectCategory(cat)}
                >
                  {CATEGORY_ICONS[cat] && <span className="material-symbols-rounded cat-icon">{CATEGORY_ICONS[cat]}</span>}
                  {cat}
                  <span className={`cat-count${hasCount ? ' active' : ''}`}>{hasCount ? n : ''}</span>
                </button>
              );
            })}
          </div>

          <div ref={soundsGridRef} className="sounds-grid">
            {visibleSounds.map((sound, i) => (
              <Fragment key={sound.id}>
                <SoundCard
                  sound={sound}
                  enabled={soundState[sound.id]?.enabled ?? false}
                  playing={(soundState[sound.id]?.enabled ?? false) && !isPaused && !(loadingState[sound.id] ?? false)}
                  loading={loadingState[sound.id] ?? false}
                  volume={soundState[sound.id]?.volume ?? 0.5}
                  cardIndex={i}
                  editorOpen={openEditorSoundId === sound.id}
                  onToggleEditor={stableToggleEditor}
                  onToggle={stableToggleSound}
                  onVolumeChange={stableSetSoundVolume}
                />
                {i === editorInsertAfter && openEditorSoundId && (
                  <div
                    className="sound-editor-inline"
                    data-cat={SOUND_LIBRARY.find((s) => s.id === openEditorSoundId)?.category}
                  >
                    <ErrorBoundary
                      key={openEditorSoundId}
                      onError={() => setOpenEditorSoundId(null)}
                      fallback={<div className="sb-loading">couldn’t open these controls — the mix keeps playing</div>}
                    >
                      <Suspense fallback={<div className="sb-loading">opening the controls…</div>}>
                        <LazySoundEditor
                          soundId={openEditorSoundId}
                          active={(soundState[openEditorSoundId]?.enabled ?? false) && !isPaused}
                          onPlay={() => {
                            // Resume the paused mix if the sound is already in it;
                            // otherwise add the sound so the shaping is audible.
                            if (soundState[openEditorSoundId]?.enabled) void handleMasterToggle();
                            else void handleSoundToggle(openEditorSoundId);
                          }}
                          initialValues={editorValuesBySound[openEditorSoundId]}
                          onValuesChange={(values) => {
                            setEditorValuesBySound((prev) => ({ ...prev, [openEditorSoundId]: values }));
                            setSoundTuning(openEditorSoundId, values);
                          }}
                          onClose={() => setOpenEditorSoundId(null)}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </section>
        </main>

        <footer className="app-footer">
          <div className="footer-rest">rest well</div>
          <div className="footer-meta">
            <span className={`net-badge${online ? '' : ' offline'}`} title={online ? 'Online' : 'Offline — everything still works'}>
              <span className="net-dot" aria-hidden="true" />
              {online ? 'online' : 'offline'}
            </span>
            <span className="footer-sep" aria-hidden="true">·</span>
            <a
              className="footer-privacy"
              href={`${import.meta.env.BASE_URL}privacy.html`}
              target="_blank"
              rel="noopener noreferrer"
            >privacy</a>
            <span className="footer-sep" aria-hidden="true">·</span>
            <span className="footer-version">v{version}</span>
          </div>
        </footer>
      </div>

        {isDesktop && (
          <SidePanel
            title={mixTitle || 'your mix'}
            hasPlayer={hasPlayer}
            isPlaying={isPlaying}
            quiet={driftOpen}
            onTogglePlay={stableMasterToggle}
            activeSounds={activeSounds}
            soundState={soundState}
            onSoundVolume={stableSetSoundVolume}
            onRemoveSound={stableToggleSound}
            masterVolume={masterVolume}
            onMasterVolume={setMasterVolume}
            secondsLeft={secondsLeft}
            timerTotal={timerTotal}
            onTimerSelect={stableTimerSelect}
            onTimerExtend={stableTimerExtend}
            onTimerClear={stableTimerClear}
            onClearMix={stableStopMix}
            onDrift={stableDriftFromPanel}
            onSave={stableSaveMix}
            mutedIds={mutedIds}
            soloIds={soloIds}
            onToggleMute={toggleMute}
            onToggleSolo={toggleSolo}
            sleepSafe={sleepSafe}
            onSleepSafe={setSleepSafe}
          />
        )}
      </div>

      {hasPlayer && !driftOpen && !isDesktop && (
        <MiniPlayer
          ref={miniPlayerRef}
          title={mixTitle}
          subtitle={mixSubtitle}
          isPlaying={isPlaying}
          timerFrac={secondsLeft !== null && timerTotal !== null ? secondsLeft / timerTotal : null}
          onTogglePlay={stableMasterToggle}
          onOpen={stableOpenSheet}
          onSave={handleSaveIntent}
        />
      )}

      {sheetMounted && !isDesktop && (
        <Suspense fallback={null}>
          <LazyNowPlayingSheet
            open={sheetOpen}
            onClose={stableCloseSheet}
            startSaving={sheetStartSaving}
            title={mixTitle || 'your mix'}
            activeSounds={activeSounds}
            soundState={soundState}
            isPlaying={isPlaying}
            onTogglePlay={stableMasterToggle}
            onSoundVolume={stableSetSoundVolume}
            onRemoveSound={stableToggleSound}
            masterVolume={masterVolume}
            onMasterVolume={setMasterVolume}
            secondsLeft={secondsLeft}
            timerTotal={timerTotal}
            onTimerSelect={stableTimerSelect}
            onTimerExtend={stableTimerExtend}
            onTimerClear={stableTimerClear}
            onClearMix={stableStopMix}
            onDrift={stableDriftFromSheet}
            onSave={stableSaveMix}
            mutedIds={mutedIds}
            soloIds={soloIds}
            onToggleMute={toggleMute}
            onToggleSolo={toggleSolo}
            sleepSafe={sleepSafe}
            onSleepSafe={setSleepSafe}
          />
        </Suspense>
      )}

      {driftMounted && (
        <Suspense fallback={null}>
          <LazyDriftMode
            open={driftOpen}
            onClose={stableDriftClose}
            isPlaying={isPlaying}
            onTogglePlay={stableMasterToggle}
            onStop={stableDriftStop}
            mixNames={mixNames}
            secondsLeft={secondsLeft}
          />
        </Suspense>
      )}

      {/* [v0.0.13 fix] The storage notice is a fixed banner at the top of the
          stack (--z-toast), so with the now-playing sheet or drift mode open it
          floated over them and covered the sleep-timer controls. Hold it back
          while either is open — one prompt surface at a time — and it returns
          the moment they close, still unacknowledged. */}
      <CookieNotice show={hasPlayed && !storageAck && !sheetOpen && !driftOpen} onDismiss={ackStorage} />

      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
          onDismiss={dismissToast}
        />
      )}

      <div className="sr-only" role="status" aria-live="polite">{status}</div>
    </>
  );
}
