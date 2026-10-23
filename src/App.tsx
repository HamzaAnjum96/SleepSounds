import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { MixCard, SceneCard } from './components/ShelfCards';
import { CATEGORIES, SOUND_LIBRARY, WORKLET_SOUND_IDS, releasableSounds, editorDefaults, type Category } from './data';
import { features } from './config/features';
import { loadSavedMixes, saveSavedMixes, loadLastSession, saveLastSession, newMixId } from './storage/savedMixes';
import { loadSoundOrder, saveSoundOrder, orderSounds, movedOrder } from './storage/soundOrder';
import { useGridReorder } from './hooks/useGridReorder';
import { useAudioMixer } from './hooks/useAudioMixer';
import { useSleepTimer } from './hooks/useSleepTimer';
import { useToast } from './hooks/useToast';
import { useMediaSession } from './hooks/useMediaSession';
import { useAppUpdate } from './hooks/useAppUpdate';
import { useGreeting, useOnline } from './hooks/useAmbient';
import { useShelfHint } from './hooks/useShelfHint';
import type { Preset, SoundState } from './types';
import { EDITABLE_SOUND_IDS, SOUND_EDITOR_MODELS } from './components/soundEditorDefs';
import { CATEGORY_ICONS } from './lib/categoryIcons';
import { haptic } from './lib/haptics';
import { whenIdle } from './lib/idle';
import { primeBackgroundAudio, setKeepAlive, setKeepAliveInterruptionHandler } from './lib/backgroundAudio';
import { setAudioInterruptionHandler, setAudioIntent } from './audio/graph';
import { SCENES } from './lib/scenes';
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

  const [isPaused, setIsPaused] = useState(false);
  const [category, setCategory] = useState<Category>('All');
  const greetingText = useGreeting();
  // Dev mode: spam-tap the moon (5 taps inside 3s) to toggle. Session-only by
  // design — a refresh always lands back in the normal app.
  const [devMode, setDevMode] = useState(false);
  // Dev mode drains the colour out of the whole app. The class goes on the
  // document element, not into the React tree, because the things that need
  // desaturating include every fixed layer painted outside the shell — the
  // starfield, the aurora, the moon, the player, the sheets and the toast.
  // Removing it on cleanup keeps a hot reload from stranding the page grey.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dev-mono', devMode);
    return () => root.classList.remove('dev-mono');
  }, [devMode]);
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
  const appScrollRef = useRef<HTMLDivElement | null>(null);
  const sceneRowRef = useRef<HTMLDivElement | null>(null);
  const miniPlayerRef = useRef<HTMLDivElement | null>(null);
  const [soundsGridColumns, setSoundsGridColumns] = useState(2);
  // Each editable sound's current slider values (its "global editor config").
  const [editorValuesBySound, setEditorValuesBySound] = useState<Record<string, Record<string, number>>>(() => (
    Object.fromEntries(Object.keys(SOUND_EDITOR_MODELS).map((id) => [id, editorDefaults(id)]))
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
  useEffect(() => whenIdle(() => {
    void import('./components/NowPlayingSheet');
    void import('./components/DriftMode');
    void import('./components/SoundEditor');
  }, 2500), []);

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

  /** Update the mixes and write them through. Returns false if the write was
   *  refused, so a caller that confirms the action can tell the truth. */
  const persistPresets = (next: Preset[]) => {
    setPresets(next);
    return saveSavedMixes(next);
  };

  // Screen-reader status line: playback and timer state are otherwise only
  // conveyed visually. A polite live region speaks the changes.
  const [status, setStatus] = useState('');
  const announce = useCallback((msg: string) => {
    // Re-set even if identical so repeated actions still announce.
    setStatus('');
    requestAnimationFrame(() => setStatus(msg));
  }, []);

  // The single forgiving snackbar (see useToast): destructive actions leave an
  // "undo" there for a few seconds.
  const { toast, showToast, dismissToast, holdToast, releaseToast } = useToast();
  const presetsRef = useRef(presets);
  presetsRef.current = presets;

  const handleDeletePreset = (id: string) => {
    const index = presets.findIndex((p) => p.id === id);
    if (index < 0) return;
    const removed = presets[index];
    persistPresets(presets.filter((p) => p.id !== id));
    if (activeMixId === id) setActiveMixId(null);
    announce(`deleted mix ${removed.name}, undo available`);
    showToast(`deleted "${removed.name}"`, 'undo', () => {
      const cur = presetsRef.current;
      if (cur.some((p) => p.id === removed.id)) return;
      const next = [...cur];
      next.splice(Math.min(index, next.length), 0, removed);
      persistPresets(next);
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
    const stored = persistPresets([...presets, preset]);
    setActiveMixId(preset.id);
    // [v0.0.29 a11y] Confirm the save to screen readers — deleting a mix already
    // announces ("deleted mix …"), but saving was silent, so a non-sighted user
    // got no acknowledgement that the key action succeeded.
    if (stored) {
      announce(`saved mix ${name}`);
      return;
    }
    // The write was refused (private browsing, exhausted quota, storage off).
    // The mix stays in this session — it plays, and dropping it would help
    // nobody — but confirming a save that did not happen is the one thing not
    // to do here: the user would find it gone tomorrow with no idea why.
    announce(`${name} could not be saved`);
    showToast(`couldn’t save “${name}” — it won’t be here next time`);
  };

  // Open the sheet straight into its save field (from the mini-player save tap).
  const handleSaveIntent = useCallback(() => {
    haptic(8);
    setSheetStartSaving(true);
    setSheetOpen(true);
  }, []);

  const isPlaying = activeSounds.length > 0 && !isPaused;

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

  /** Point each enabled layer's editor at what the mix actually plays, so the
   *  sound editor shows the real variant (e.g. rain's "At a Window") instead of
   *  a stale default ("Steady") — and so manually re-toggling a layer keeps
   *  that character rather than reverting to defaults. */
  const syncEditorValues = useCallback((state: Record<string, SoundState>) => {
    setEditorValuesBySound((prev) => {
      const next = { ...prev };
      for (const [id, s] of Object.entries(state)) {
        if (s.enabled) next[id] = { ...editorDefaults(id), ...(s.tuning ?? {}) };
      }
      return next;
    });
  }, []);

  // Stop the whole mix, but leave an undo: snapshot the live layers first, so
  // a mistaken stop in the dark is one tap to bring back, playing. The snapshot
  // is baked like a save, so a hand-tuned layer comes back with its tuning.
  const handleStopMix = useCallback(() => {
    const snapshot = { state: bakeForSave(soundState), master: masterVolume };
    const restoredId = activeMixId;
    stopAll();
    setIsPaused(false);
    showToast('mix stopped', 'undo', () => {
      restoreMixerState(snapshot.state, snapshot.master, true);
      setActiveMixId(restoredId);
      setIsPaused(false);
    });
  }, [soundState, masterVolume, activeMixId, stopAll, restoreMixerState, showToast, bakeForSave]);

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
    syncEditorValues(preset.state);
    setActiveMixId(preset.id);
    setIsPaused(false);
  }, [activeMixId, activeSounds.length, dismissHint, handleMasterToggle, restoreMixerState, enrichPresetState, syncEditorValues]);

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
      syncEditorValues(last.state);
      setIsPaused(true);
    }
  }, [handlePlayPreset, restoreMixerState, enrichPresetState, syncEditorValues]);

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

  // The lock-screen / notification player (see useMediaSession). Prime first on
  // play: an explicit resume must mark the keep-alive as intended before the
  // element plays, so the auto-resume guard doesn't suppress it.
  const mediaTitle = useMemo(
    () => (activeSounds.length > 0 ? activeSounds.map((s) => s.name).join(' · ') : 'starlight'),
    [activeSounds],
  );
  useMediaSession(mediaTitle, isPlaying, {
    play: () => { primeBackgroundAudio(); void playAllActive(); setIsPaused(false); },
    pause: () => { pauseAll(); setIsPaused(true); },
    stop: () => { stopAll(); setIsPaused(false); },
  });

  // [v0.0.36 perf] Stable names array for the memo'd DriftMode — the inline
  // `activeSounds.map(...)` minted a fresh array every render, which would
  // defeat its memo on every unrelated update.
  const mixNames = useMemo(() => activeSounds.map((s) => s.name), [activeSounds]);

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
    const started = await toggleSound(soundId);
    // A layer the user deliberately switched on that fails to start used to
    // just flip itself back off, leaving a control that looks broken and a
    // status line that said "stopped" — as if they had done it on purpose.
    // Say what happened, and offer the tap back.
    if (!started) {
      const name = SOUND_LIBRARY.find((s) => s.id === soundId)?.name ?? 'that sound';
      showToast(`couldn’t start ${name}`, 'retry', () => {
        void handleSoundToggleRef.current(soundId);
      });
      announce(`${name} could not start`);
    }
  }, [soundState, isPaused, toggleSound, dismissHint, setSoundTuning, editorValuesBySound, showToast, announce]);

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
  // Removing a layer from the player. Taking out the last one empties the mix,
  // which is stopping it — so it goes the same way as "stop mix" and leaves the
  // same undo, rather than ending the night with no way back.
  const activeCountRef = useRef(0);
  activeCountRef.current = activeSounds.length;
  const stableRemoveLayer = useCallback((id: string) => {
    if (activeCountRef.current <= 1) stopMixRef.current();
    else void handleSoundToggleRef.current(id);
  }, []);
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
  // Drift mode's stop is the easiest one to hit by mistake in the dark, so it
  // leaves the same undo as "stop mix" (the toast waits on the main screen).
  const stableDriftStop = useCallback(() => { haptic(10); stopMixRef.current(); }, []);

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
  // [0.1.0] The user's own arrangement (hold-to-drag / keyboard grip) applies
  // over the whole library first, then the visibility filters — so hidden
  // sounds keep a stable place in the order and reordering works the same in
  // any category view.
  const [soundOrder, setSoundOrder] = useState<string[] | null>(loadSoundOrder);
  const soundOrderRef = useRef(soundOrder);
  soundOrderRef.current = soundOrder;
  const library = useMemo(() => {
    const releasable = new Set(releasableSounds(features.experimentalSounds || devMode, devMode).map((s) => s.id));
    return orderSounds(SOUND_LIBRARY, soundOrder).filter((s) => releasable.has(s.id));
  }, [devMode, soundOrder]);
  const visibleSounds = useMemo(
    () => (category === 'All' ? library : library.filter((s) => s.category === category)),
    [library, category],
  );
  const visibleSoundsRef = useRef(visibleSounds);
  visibleSoundsRef.current = visibleSounds;

  /** Commit a reorder: splice dragId next to anchorId in the full order. */
  const commitReorder = useCallback((dragId: string, anchorId: string, side: 'before' | 'after') => {
    const ids = orderSounds(SOUND_LIBRARY, soundOrderRef.current).map((s) => s.id);
    const next = movedOrder(ids, dragId, anchorId, side);
    setSoundOrder(next);
    saveSoundOrder(next);
  }, []);

  /** Keyboard reorder from a card's grip: step or jump within the visible grid. */
  const moveSound = useCallback((id: string, dir: -1 | 1 | 'start' | 'end') => {
    const visible = visibleSoundsRef.current;
    const idx = visible.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const name = visible[idx].name;
    let anchor: string; let side: 'before' | 'after'; let to: number;
    if (dir === -1 || dir === 'start') {
      if (idx === 0) { announce(`${name} is already first`); return; }
      to = dir === -1 ? idx - 1 : 0;
      anchor = visible[to].id; side = 'before';
    } else {
      if (idx === visible.length - 1) { announce(`${name} is already last`); return; }
      to = dir === 1 ? idx + 1 : visible.length - 1;
      anchor = visible[to].id; side = 'after';
    }
    commitReorder(id, anchor, side);
    haptic(6);
    announce(`${name} moved to position ${to + 1} of ${visible.length}`);
  }, [commitReorder, announce]);

  // Pointer path: hold a card to lift it, drag to a new slot. Lifting closes
  // an open editor (its inline panel would otherwise reflow mid-drag).
  const handleDragLift = useCallback(() => {
    haptic(12);
    // [0.1.3] flushSync: the hook measures the grid immediately after this
    // callback, and closing the inline editor relayouts the whole grid — an
    // async close left every cached rect stale by the editor's height, so the
    // shift/landing glides wiped cards to positions from the wrong layout.
    flushSync(() => setOpenEditorSoundId(null));
  }, []);
  const soundNameOf = useCallback(
    (id: string) => SOUND_LIBRARY.find((s) => s.id === id)?.name ?? id,
    [],
  );
  useGridReorder({
    gridRef: soundsGridRef,
    scrollRef: appScrollRef,
    onCommit: commitReorder,
    onLift: handleDragLift,
    announce,
    getLabel: soundNameOf,
  });

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

  // Connectivity badge: reassurance ("offline — still works"), not a warning.
  const online = useOnline();

  // Refresh into a newer deployed build, but only while nothing is playing.
  useAppUpdate(activeSounds.length === 0);

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

  // Teach the scenes shelf's horizontal scroll, until the user has handled it.
  useShelfHint(sceneRowRef);

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
        >
          {/* The dev-mode crescent: a night-sky disc that cross-fades in and
              out with dev mode. A real child (not a one-shot ::before animation)
              so the fade is symmetric — smooth entering AND leaving. */}
          <span className="moon-crescent" aria-hidden="true" />
        </button>
      </div>

      <div className="layout">
      <div
        ref={appScrollRef}
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
            <span className="section-meta">{library.length} sounds · hold to arrange</span>
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
                  // The badge is a bare numeral, which a screen reader would
                  // read as "Water 1" — 1 what? Spell the count out here and
                  // hide the visual badge from the a11y tree. The visible label
                  // still leads the accessible name (WCAG 2.5.3 Label in Name).
                  aria-label={hasCount ? `${cat}, ${n} playing` : cat}
                  onClick={() => selectCategory(cat)}
                >
                  {CATEGORY_ICONS[cat] && <span className="material-symbols-rounded cat-icon" aria-hidden="true">{CATEGORY_ICONS[cat]}</span>}
                  {cat}
                  {hasCount && <span className="cat-count" aria-hidden="true">{n}</span>}
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
                  onMove={moveSound}
                />
                {i === editorInsertAfter && openEditorSoundId && (
                  <div
                    className="sound-editor-inline"
                    data-cat={SOUND_LIBRARY.find((s) => s.id === openEditorSoundId)?.category}
                  >
                    {/* Stays open on a failure so its line is actually read; the
                        card's tune button closes it like any other editor. */}
                    <ErrorBoundary
                      key={openEditorSoundId}
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
            {/* The reassurance used to live only in a `title`, which never
                reaches a touch user and is announced inconsistently by screen
                readers — so the word "offline" arrived bare, reading as a
                warning in an app that works perfectly well without a network.
                Say it in the document instead, visually hidden. */}
            <span className={`net-badge${online ? '' : ' offline'}`}>
              <span className="net-dot" aria-hidden="true" />
              {online ? 'online' : 'offline'}
              {!online && <span className="sr-only"> — everything still works</span>}
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
            onRemoveSound={stableRemoveLayer}
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
            onRemoveSound={stableRemoveLayer}
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
          onHold={holdToast}
          onRelease={releaseToast}
        />
      )}

      <div className="sr-only" role="status" aria-live="polite">{status}</div>
    </>
  );
}
