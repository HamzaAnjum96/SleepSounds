import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { version } from '../package.json';
import DriftMode from './components/DriftMode';
import InstallPrompt from './components/InstallPrompt';
import NightSky from './components/NightSky';
import SoundCard from './components/SoundCard';
import { BUILTIN_PRESETS, CATEGORIES, PRESET_STORAGE_KEY, SOUND_LIBRARY } from './data';
import type { Category } from './data';
import { useAudioMixer } from './hooks/useAudioMixer';
import type { Preset } from './types';
import { EDITABLE_SOUND_IDS, SOUND_EDITOR_MODELS } from './components/soundEditorDefs';
import { CATEGORY_ICONS } from './lib/categoryIcons';
import { haptic } from './lib/haptics';
import { sliderFill } from './lib/sliderFill';

const LazySoundEditor = lazy(() => import('./components/SoundEditor'));

const TIMER_PRESETS = [
  { label: '15m', secs: 15 * 60 },
  { label: '30m', secs: 30 * 60 },
  { label: '1h',  secs: 60 * 60 },
  { label: '90m', secs: 90 * 60 },
];

/** Seconds before timer end over which the mix gently fades out. */
const FADE_WINDOW_S = 90;

const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
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
    // Deep radial night sky (matches icon.svg).
    const sky = ctx.createRadialGradient(
      0.4 * size, 0.32 * size, 0,
      0.5 * size, 0.5 * size, 0.85 * size,
    );
    sky.addColorStop(0, '#15264f');
    sky.addColorStop(0.55, '#0b1430');
    sky.addColorStop(1, '#070b18');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, size, size);
    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const [x, y, r] of [[0.16, 0.18, 0.006], [0.30, 0.10, 0.004], [0.80, 0.20, 0.005],
                              [0.86, 0.74, 0.004], [0.14, 0.66, 0.005], [0.74, 0.12, 0.004],
                              [0.58, 0.80, 0.004]] as const) {
      ctx.beginPath(); ctx.arc(x * size, y * size, r * size, 0, Math.PI * 2); ctx.fill();
    }
    // Soft moon halo
    const halo = ctx.createRadialGradient(
      0.58 * size, 0.45 * size, 0,
      0.58 * size, 0.45 * size, 0.34 * size,
    );
    halo.addColorStop(0, 'rgba(217,189,128,0.5)');
    halo.addColorStop(1, 'rgba(217,189,128,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);
    // Crescent moon, gold
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
  // First-run whisper: shown until the first sound is ever toggled.
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

  // Presets
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
  const [presetName, setPresetName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);

  const persistPresets = (next: Preset[]) => {
    setPresets(next);
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
  };

  const handleDeletePreset = (id: string) => {
    persistPresets(presets.filter((p) => p.id !== id));
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    haptic(12);
    persistPresets([...presets, {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      createdAt: new Date().toISOString(),
      state: soundState,
      masterVolume,
    }]);
    setPresetName('');
    setSavingPreset(false);
  };

  const handleLoadPreset = (id: string, builtinSearch = false) => {
    const pool = builtinSearch ? BUILTIN_PRESETS : presets;
    const preset = pool.find((p) => p.id === id);
    if (!preset) return;
    restoreMixerState(preset.state, undefined, true);
    setIsPaused(false);
  };

const isPlaying = activeSounds.length > 0 && !isPaused;

  useEffect(() => {
    if (activeSounds.length === 0) {
      setIsPaused(false);
      setDriftOpen(false);
    }
  }, [activeSounds.length]);

  // Media Session API — powers lock-screen / notification player on Android & iOS
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const base = import.meta.env.BASE_URL;
    navigator.mediaSession.metadata = new MediaMetadata({
      // The mix is the headline; "drift" is the artist line beneath it.
      title: activeSounds.length > 0
        ? activeSounds.map((s) => s.name).join(' · ')
        : 'drift',
      artist: 'drift',
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
    // Live-stream mode: no scrubber or duration shown
    try { navigator.mediaSession.setActionHandler('seekbackward', null); } catch { /* ok */ }
    try { navigator.mediaSession.setActionHandler('seekforward',  null); } catch { /* ok */ }
    try { navigator.mediaSession.setActionHandler('seekto',       null); } catch { /* ok */ }
    try {
      (navigator.mediaSession as MediaSession & { setPositionState?: (s: object) => void })
        .setPositionState?.({ duration: Infinity, playbackRate: 1, position: 0 });
    } catch { /* ok */ }
  }, [isPlaying, activeSounds, mediaArtwork, playAllActive, pauseAll, stopAll]);

  const handleMasterToggle = useCallback(async () => {
    haptic(10);
    if (isPlaying) {
      pauseAll();
      setIsPaused(true);
    } else if (activeSounds.length > 0) {
      await playAllActive();
      setIsPaused(false);
    }
  }, [isPlaying, activeSounds.length, pauseAll, playAllActive]);

  const handleSoundToggle = useCallback(async (soundId: string) => {
    haptic(8);
    if (showHint) {
      setShowHint(false);
      try { localStorage.setItem('drift-onboarded', '1'); } catch { /* private mode */ }
    }
    const wasEnabled = soundState[soundId]?.enabled;
    if (!wasEnabled && isPaused) setIsPaused(false);
    await toggleSound(soundId);
  }, [soundState, isPaused, toggleSound, showHint]);

  // Sleep timer — counts down playing-time only (pauses when audio pauses)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timerTotal, setTimerTotal] = useState<number | null>(null);

  // Tick only while playing
  useEffect(() => {
    if (!isPlaying || secondsLeft === null) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s !== null && s > 1 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [isPlaying, secondsLeft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop when timer hits zero
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

  return (
    <>
      <div className="bg-layer" />
      <NightSky
        playing={isPlaying}
        intensity={Math.min(1, activeSounds.length / 4)}
        dim={skyDim}
      />
      <div className="moon" />

      <div className={`app${driftOpen ? ' app-quiet' : ''}`} onScroll={handleAppScroll}>
        <header>
          <div className="wordmark">drift</div>
          <div className="tagline">sleep sounds</div>
        </header>

        <InstallPrompt />

        <div className="master">
          {/* Row 1: play + timer chips */}
          <div className="master-top">
            <div className="play-wrap">
              <button
                type="button"
                className={`play-btn${isPlaying ? ' playing' : ''}`}
                onClick={handleMasterToggle}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                <span className="material-symbols-rounded">
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>
              {secondsLeft !== null && timerTotal !== null && (
                <svg className="timer-ring" viewBox="0 0 56 56" aria-hidden="true">
                  <circle
                    cx="28" cy="28" r={RING_R}
                    fill="none"
                    stroke="var(--warm)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    strokeDashoffset={RING_C * (1 - secondsLeft / timerTotal)}
                  />
                </svg>
              )}
            </div>

            <button
              type="button"
              className="drift-btn"
              onClick={() => setDriftOpen(true)}
              disabled={activeSounds.length === 0}
              aria-label="Enter drift mode"
              title="Drift mode"
            >
              <span className="material-symbols-rounded">bedtime</span>
            </button>

            <div className="timers">
              <div className="timer-chips">
                {TIMER_PRESETS.map((t) => {
                  const active = timerTotal === t.secs && secondsLeft !== null;
                  return (
                    <button
                      key={t.label}
                      type="button"
                      className={`timer-btn${active ? ' active' : ''}`}
                      aria-pressed={active}
                      onClick={() => handleTimerSelect(t.secs)}
                    >{t.label}</button>
                  );
                })}
              </div>
              <div className="timer-countdown">
                {secondsLeft !== null ? formatCountdown(secondsLeft) : ''}
              </div>
            </div>
          </div>

          {/* Row 2: volume — full width */}
          <div className="vol-section">
            <div className="vol-header">
              <span className="master-label">master volume</span>
              <span className="vol-pct">{Math.round(masterVolume * 100)}%</span>
            </div>
            <div className="vol-row">
              <span className="material-symbols-rounded">volume_mute</span>
              <input
                type="range"
                className="drift-slider"
                min={0}
                max={1}
                step={0.01}
                value={masterVolume}
                style={sliderFill(masterVolume)}
                aria-label="Master volume"
                onChange={(e) => setMasterVolume(Number(e.target.value))}
              />
              <span className="material-symbols-rounded">volume_up</span>
            </div>
          </div>
        </div>

        <div className="section-header" style={{ animationDelay: '0.18s' }}>
          <span className="section-label">presets</span>
        </div>

        <div className="builtin-presets">
          {BUILTIN_PRESETS.map((bp) => (
            <button
              key={bp.id}
              type="button"
              className="builtin-preset-btn"
              onClick={() => handleLoadPreset(bp.id, true)}
            >
              {bp.name}
            </button>
          ))}
          {presets.map((preset) => (
            <div key={preset.id} className="preset-chip-wrap">
              <button
                type="button"
                className="builtin-preset-btn saved"
                onClick={() => handleLoadPreset(preset.id)}
              >
                {preset.name}
              </button>
              <button
                type="button"
                className="preset-chip-del"
                onClick={(e) => { e.stopPropagation(); handleDeletePreset(preset.id); }}
                aria-label={`Delete preset ${preset.name}`}
              >✕</button>
            </div>
          ))}
          <button
            type="button"
            className="builtin-preset-btn preset-add-btn"
            onClick={() => setSavingPreset((v) => !v)}
            aria-label="Save current mix"
          >+</button>
        </div>

        {savingPreset && (
          <div className="preset-save-row">
            <input
              className="preset-input"
              placeholder="name this mix…"
              value={presetName}
              maxLength={40}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSavePreset();
                if (e.key === 'Escape') { setSavingPreset(false); setPresetName(''); }
              }}
            />
            <button
              type="button"
              className="preset-save-btn"
              disabled={!presetName.trim()}
              onClick={handleSavePreset}
            >save</button>
          </div>
        )}

        <div className="section-header" style={{ marginTop: '6px' }}>
          <span className="section-label">sounds</span>
          <div className="cat-pills">
            {CATEGORIES.map((cat) => {
              const n = activeInCategory(cat);
              const hasCount = n > 0;
              return (
                <button
                  key={cat}
                  type="button"
                  className={`cat-pill${category === cat ? ' active' : ''}`}
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
        </div>

        {showHint && (
          <p className="first-hint">tap a sound to begin · layer as many as you like</p>
        )}

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

        <div className="app-footer">
          {activeSounds.length > 0 && (
            <div className="footer-playing">{activeSounds.map((s) => s.name).join(' · ')}</div>
          )}
          {(activeSounds.length > 0 || isPaused) && (
            <div className="footer-rest">rest well</div>
          )}
          <a
            className="footer-privacy"
            href={`${import.meta.env.BASE_URL}privacy.html`}
            target="_blank"
            rel="noopener noreferrer"
          >privacy</a>
          <div className="footer-version" aria-hidden="true">v{version}</div>
        </div>
      </div>

      <DriftMode
        open={driftOpen}
        onClose={() => setDriftOpen(false)}
        isPlaying={isPlaying}
        onTogglePlay={handleMasterToggle}
        mixNames={activeSounds.map((s) => s.name)}
        secondsLeft={secondsLeft}
      />
    </>
  );
}
