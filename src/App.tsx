import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { version } from '../package.json';
import CookieNotice from './components/CookieNotice';
import DriftMode from './components/DriftMode';
import InstallPrompt from './components/InstallPrompt';
import MiniPlayer from './components/MiniPlayer';
import NightSky from './components/NightSky';
import NowPlayingSheet from './components/NowPlayingSheet';
import SoundCard from './components/SoundCard';
import { CATEGORIES, PRESET_STORAGE_KEY, SOUND_LIBRARY } from './data';
import type { Category } from './data';
import { useAudioMixer } from './hooks/useAudioMixer';
import type { Preset } from './types';
import { EDITABLE_SOUND_IDS, SOUND_EDITOR_MODELS } from './components/soundEditorDefs';
import { CATEGORY_ICONS } from './lib/categoryIcons';
import { haptic } from './lib/haptics';
import { primeBackgroundAudio, setKeepAlive } from './lib/backgroundAudio';
import { SCENES, presetSoundIds } from './lib/scenes';
import { formatCountdown } from './lib/time';

const LazySoundEditor = lazy(() => import('./components/SoundEditor'));

/** Seconds before timer end over which the mix gently fades out. */
const FADE_WINDOW_S = 90;

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
  } = useAudioMixer(SOUND_LIBRARY);

  const mediaArtwork = useMemo(() => buildMediaArtwork(512), []);

  const [isPaused, setIsPaused] = useState(false);
  const [category, setCategory] = useState<Category>('All');
  const [openEditorSoundId, setOpenEditorSoundId] = useState<string | null>(null);
  const [driftOpen, setDriftOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Id of the last loaded scene or saved mix; cleared once the user edits
   *  the mix by hand, so the "playing" badge never lies. */
  const [activeMixId, setActiveMixId] = useState<string | null>(null);
  // First-run whisper: shown until the first scene or sound is ever chosen.
  const [showHint, setShowHint] = useState(() => {
    try { return localStorage.getItem('drift-onboarded') === null; }
    catch { return false; }
  });
  const soundsGridRef = useRef<HTMLDivElement | null>(null);
  const [soundsGridColumns, setSoundsGridColumns] = useState(2);
  const [editorValuesBySound, setEditorValuesBySound] = useState<Record<string, Record<string, number>>>(() => (
    Object.fromEntries(
      Object.entries(SOUND_EDITOR_MODELS).map(([id, model]) => ([
        id,
        Object.fromEntries(model.groups.flatMap((group) => group.params).map((param) => [param.key, param.def])),
      ])),
    )
  ));

  const dismissHint = useCallback(() => {
    setShowHint((shown) => {
      if (shown) {
        try { localStorage.setItem('drift-onboarded', '1'); } catch { /* private mode */ }
      }
      return false;
    });
  }, []);

  const makeDefaultState = useCallback(() => (
    SOUND_LIBRARY.reduce<Record<string, { enabled: boolean; volume: number }>>((acc, sound) => {
      acc[sound.id] = { enabled: false, volume: 0.5 };
      return acc;
    }, {})
  ), []);

  const normalizePreset = useCallback((raw: unknown): Preset | null => {
    if (!raw || typeof raw !== 'object') return null;
    const candidate = raw as Partial<Preset>;
    if (!candidate.id || !candidate.name || !candidate.createdAt || !candidate.state) return null;
    const base = makeDefaultState();
    for (const sound of SOUND_LIBRARY) {
      const item = (candidate.state as Record<string, { enabled?: unknown; volume?: unknown }>)[sound.id];
      if (!item) continue;
      base[sound.id] = {
        enabled: Boolean(item.enabled),
        volume: typeof item.volume === 'number' ? Math.min(1, Math.max(0, item.volume)) : 0.5,
      };
    }
    return {
      id: candidate.id,
      name: candidate.name,
      createdAt: candidate.createdAt,
      state: base,
      masterVolume: typeof candidate.masterVolume === 'number'
        ? Math.min(1, Math.max(0, candidate.masterVolume))
        : undefined,
    };
  }, [makeDefaultState]);

  // Saved mixes
  const [presets, setPresets] = useState<Preset[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) ?? '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .map((preset) => normalizePreset(preset))
        .filter((preset): preset is Preset => preset !== null);
    }
    catch { return []; }
  });

  const persistPresets = (next: Preset[]) => {
    setPresets(next);
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
  };

  const handleDeletePreset = (id: string) => {
    persistPresets(presets.filter((p) => p.id !== id));
    if (activeMixId === id) setActiveMixId(null);
  };

  const handleSaveMix = (name: string) => {
    const preset: Preset = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      state: soundState,
      masterVolume,
    };
    persistPresets([...presets, preset]);
    setActiveMixId(preset.id);
  };

  const isPlaying = activeSounds.length > 0 && !isPaused;

  const handleMasterToggle = useCallback(async () => {
    haptic(10);
    primeBackgroundAudio();
    if (isPlaying) {
      pauseAll();
      setIsPaused(true);
    } else if (activeSounds.length > 0) {
      await playAllActive();
      setIsPaused(false);
    }
  }, [isPlaying, activeSounds.length, pauseAll, playAllActive]);

  const handlePlayPreset = useCallback((preset: Preset) => {
    dismissHint();
    haptic(10);
    primeBackgroundAudio();
    if (activeMixId === preset.id && activeSounds.length > 0) {
      // Tapping the playing scene pauses/resumes it.
      void handleMasterToggle();
      return;
    }
    restoreMixerState(preset.state, undefined, true);
    setActiveMixId(preset.id);
    setIsPaused(false);
  }, [activeMixId, activeSounds.length, dismissHint, handleMasterToggle, restoreMixerState]);

  useEffect(() => {
    if (activeSounds.length === 0) {
      setIsPaused(false);
      setDriftOpen(false);
      setSheetOpen(false);
      setActiveMixId(null);
    }
  }, [activeSounds.length]);

  // Keep the silent background-audio element in sync with playback, so iOS
  // keeps the session alive and the lock-screen player reflects true state.
  useEffect(() => {
    setKeepAlive(isPlaying);
  }, [isPlaying]);

  // Scene deep links (?scene=builtin-rainfall) power the app-icon shortcuts.
  // If autoplay is blocked (no gesture on launch), the mix loads paused with
  // the mini player ready: one tap to play.
  const launchedRef = useRef(false);
  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    const sceneId = new URLSearchParams(window.location.search).get('scene');
    if (!sceneId) return;
    const scene = SCENES.find((s) => s.preset.id === sceneId);
    if (scene) handlePlayPreset(scene.preset);
    // Clean the param so refreshes don't re-trigger.
    window.history.replaceState(null, '', window.location.pathname);
  }, [handlePlayPreset]);

  // Media Session API — powers lock-screen / notification player on Android & iOS
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const base = import.meta.env.BASE_URL;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: activeSounds.length > 0
        ? activeSounds.map((s) => s.name).join(' · ')
        : 'drift away',
      artist: 'drift away',
      album: 'sleep sounds',
      artwork: [
        { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
        { src: mediaArtwork,          sizes: '512x512', type: 'image/png' },
      ],
    });
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    navigator.mediaSession.setActionHandler('play',  () => { playAllActive(); setIsPaused(false); });
    navigator.mediaSession.setActionHandler('pause', () => { pauseAll();      setIsPaused(true); });
    navigator.mediaSession.setActionHandler('stop',  () => { stopAll();       setIsPaused(false); });
    try { navigator.mediaSession.setActionHandler('seekbackward', null); } catch { /* ok */ }
    try { navigator.mediaSession.setActionHandler('seekforward',  null); } catch { /* ok */ }
    try { navigator.mediaSession.setActionHandler('seekto',       null); } catch { /* ok */ }
    try {
      (navigator.mediaSession as MediaSession & { setPositionState?: (s: object) => void })
        .setPositionState?.({ duration: Infinity, playbackRate: 1, position: 0 });
    } catch { /* ok */ }
  }, [isPlaying, activeSounds, mediaArtwork, playAllActive, pauseAll, stopAll]);

  const handleSoundToggle = useCallback(async (soundId: string) => {
    haptic(8);
    primeBackgroundAudio();
    dismissHint();
    // A hand-edited mix is its own thing; the scene badge comes off.
    setActiveMixId(null);
    const wasEnabled = soundState[soundId]?.enabled;
    if (!wasEnabled && isPaused) setIsPaused(false);
    await toggleSound(soundId);
  }, [soundState, isPaused, toggleSound, dismissHint]);

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

  // Sleep timer — counts down playing-time only (pauses when audio pauses)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timerTotal, setTimerTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!isPlaying || secondsLeft === null) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s !== null && s > 1 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [isPlaying, secondsLeft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (secondsLeft === 0) {
      stopAll();
      setIsPaused(false);
      setSecondsLeft(null);
      setTimerTotal(null);
    }
  }, [secondsLeft, stopAll]);

  // Wind-down: ease the mix out over the timer's final stretch, so sleep is
  // never interrupted by an abrupt stop. Playback-gain only.
  useEffect(() => {
    if (secondsLeft === null) {
      setMasterFade(1);
    } else if (secondsLeft <= FADE_WINDOW_S) {
      setMasterFade(Math.pow(secondsLeft / FADE_WINDOW_S, 1.4));
    }
  }, [secondsLeft, setMasterFade]);

  const handleTimerSelect = (secs: number) => {
    haptic(8);
    if (timerTotal === secs && secondsLeft !== null) {
      setSecondsLeft(null);
      setTimerTotal(null);
    } else {
      setSecondsLeft(secs);
      setTimerTotal(secs);
    }
  };

  const visibleSounds = category === 'All'
    ? SOUND_LIBRARY
    : SOUND_LIBRARY.filter((s) => s.category === category);

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
    const scrollY = (e.target as HTMLDivElement).scrollTop;
    document.documentElement.style.setProperty('--moon-scroll', `${scrollY}px`);
  }, []);

  // The sky settles with the mix over the last five minutes of the timer.
  const skyDim = secondsLeft !== null ? Math.max(0, Math.min(1, 1 - secondsLeft / 300)) : 0;

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

  return (
    <>
      <div className="bg-layer" />
      <div className="aurora" aria-hidden="true" />
      <NightSky
        playing={isPlaying}
        intensity={Math.min(1, activeSounds.length / 4)}
        dim={skyDim}
      />
      <div className="moon" />

      <div
        className={`app${driftOpen ? ' app-quiet' : ''}${hasPlayer ? ' has-player' : ''}`}
        onScroll={handleAppScroll}
      >
        <header>
          <div className="wordmark">drift away</div>
          <div className="greeting">{greeting()}</div>
        </header>

        <InstallPrompt />

        {showHint && (
          <p className="first-hint">begin with a scene, or layer your own mix below</p>
        )}

        <section className="section" style={{ animationDelay: '0.1s' }}>
          <div className="section-head">
            <h2 className="section-title">tonight</h2>
            <span className="section-meta">curated scenes</span>
          </div>
          <div className="scene-row" role="list">
            {SCENES.map((scene) => {
              const current = activeMixId === scene.preset.id && activeSounds.length > 0;
              const ids = presetSoundIds(scene.preset);
              return (
                <button
                  key={scene.preset.id}
                  type="button"
                  role="listitem"
                  className={`scene-card${current ? ' current' : ''}`}
                  style={{ background: scene.art }}
                  onClick={() => handlePlayPreset(scene.preset)}
                  aria-label={`${current && isPlaying ? 'Pause' : 'Play'} scene ${scene.preset.name}`}
                >
                  <span className="scene-icons" aria-hidden="true">
                    {ids.slice(0, 3).map((id) => {
                      const sound = SOUND_LIBRARY.find((s) => s.id === id);
                      return sound ? (
                        <span key={id} className="material-symbols-rounded">
                          {CATEGORY_ICONS[sound.category] ?? 'music_note'}
                        </span>
                      ) : null;
                    })}
                  </span>
                  {current && (
                    <span className={`scene-state${isPlaying ? ' playing' : ''}`} aria-hidden="true">
                      <span /><span /><span />
                    </span>
                  )}
                  <span className="scene-name">{scene.preset.name}</span>
                  <span className="scene-mood">{scene.mood}</span>
                </button>
              );
            })}
          </div>
        </section>

        {presets.length > 0 && (
          <section className="section" style={{ animationDelay: '0.18s' }}>
            <div className="section-head">
              <h2 className="section-title">your mixes</h2>
            </div>
            <div className="mix-row" role="list">
              {presets.map((preset) => {
                const current = activeMixId === preset.id && activeSounds.length > 0;
                const count = presetSoundIds(preset).length;
                return (
                  <div key={preset.id} role="listitem" className={`mix-card${current ? ' current' : ''}`}>
                    <button
                      type="button"
                      className="mix-card-body"
                      onClick={() => handlePlayPreset(preset)}
                      aria-label={`${current && isPlaying ? 'Pause' : 'Play'} mix ${preset.name}`}
                    >
                      <span className="mix-name">{preset.name}</span>
                      <span className="mix-count">{count} layer{count === 1 ? '' : 's'}</span>
                    </button>
                    <button
                      type="button"
                      className="mix-del"
                      onClick={() => handleDeletePreset(preset.id)}
                      aria-label={`Delete mix ${preset.name}`}
                    >✕</button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="section" style={{ animationDelay: '0.26s' }}>
          <div className="section-head">
            <h2 className="section-title">the library</h2>
            <span className="section-meta">{SOUND_LIBRARY.length} generated sounds</span>
          </div>

          <div className="cat-pills">
            {CATEGORIES.map((cat) => {
              const n = activeInCategory(cat);
              const hasCount = n > 0;
              return (
                <button
                  key={cat}
                  type="button"
                  className={`cat-pill${category === cat ? ' active' : ''}`}
                  data-cat={cat}
                  aria-pressed={category === cat}
                  onClick={() => setCategory(cat)}
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
                  onToggleEditor={() => {
                    if (!EDITABLE_SOUND_IDS.includes(sound.id)) return;
                    setOpenEditorSoundId((prev) => (prev === sound.id ? null : sound.id));
                  }}
                  onToggle={() => handleSoundToggle(sound.id)}
                  onVolumeChange={(v) => setSoundVolume(sound.id, v)}
                />
                {i === editorInsertAfter && openEditorSoundId && (
                  <div className="sound-editor-inline">
                    <Suspense fallback={<div className="sb-panel">Loading editor…</div>}>
                      <LazySoundEditor
                        soundId={openEditorSoundId}
                        initialValues={editorValuesBySound[openEditorSoundId]}
                        onValuesChange={(values) => {
                          setEditorValuesBySound((prev) => ({ ...prev, [openEditorSoundId]: values }));
                          if (SOUND_EDITOR_MODELS[openEditorSoundId]?.mode === 'simple') {
                            setSoundTuning(openEditorSoundId, values);
                          }
                        }}
                        onClose={() => setOpenEditorSoundId(null)}
                      />
                    </Suspense>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </section>

        <div className="app-footer">
          <div className="footer-rest">rest well</div>
          <div className="footer-meta">
            <a
              className="footer-privacy"
              href={`${import.meta.env.BASE_URL}privacy.html`}
              target="_blank"
              rel="noopener noreferrer"
            >privacy</a>
            <span className="footer-sep" aria-hidden="true">·</span>
            <span className="footer-version">v{version}</span>
          </div>
        </div>
      </div>

      {hasPlayer && !driftOpen && (
        <MiniPlayer
          title={mixTitle}
          subtitle={mixSubtitle}
          isPlaying={isPlaying}
          timerFrac={secondsLeft !== null && timerTotal !== null ? secondsLeft / timerTotal : null}
          onTogglePlay={handleMasterToggle}
          onOpen={() => setSheetOpen(true)}
        />
      )}

      <NowPlayingSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={mixTitle || 'your mix'}
        activeSounds={activeSounds}
        soundState={soundState}
        isPlaying={isPlaying}
        onTogglePlay={handleMasterToggle}
        onSoundVolume={setSoundVolume}
        onRemoveSound={(id) => { void handleSoundToggle(id); }}
        masterVolume={masterVolume}
        onMasterVolume={setMasterVolume}
        secondsLeft={secondsLeft}
        timerTotal={timerTotal}
        onTimerSelect={handleTimerSelect}
        onDrift={() => { setSheetOpen(false); setDriftOpen(true); }}
        onSave={handleSaveMix}
      />

      <DriftMode
        open={driftOpen}
        onClose={() => setDriftOpen(false)}
        isPlaying={isPlaying}
        onTogglePlay={handleMasterToggle}
        mixNames={activeSounds.map((s) => s.name)}
        secondsLeft={secondsLeft}
      />

      <CookieNotice />
    </>
  );
}
