import { useCallback, useEffect, useMemo, useState } from 'react';
import SoundCard from './components/SoundCard';
import { BUILTIN_PRESETS, CATEGORIES, PRESET_STORAGE_KEY, SOUND_LIBRARY } from './data';
import type { Category } from './data';
import { useAudioMixer } from './hooks/useAudioMixer';
import type { Preset } from './types';

function sliderBg(value: number, max = 1) {
  const pct = (value / max) * 100;
  return {
    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
  };
}

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** Generate a blue-gradient crescent canvas for the media-session artwork.
 *  Android extracts a palette from this image to colour the notification. */
function buildMediaArtwork(size: number): string {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return '/icon-512.png';
    // Deep blue gradient background
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#0c1e50');
    g.addColorStop(1, '#1a3880');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [x, y, r] of [[0.14, 0.14, 0.004], [0.30, 0.08, 0.003], [0.82, 0.19, 0.004],
                              [0.88, 0.74, 0.003], [0.11, 0.68, 0.004], [0.76, 0.11, 0.003]] as const) {
      ctx.beginPath(); ctx.arc(x * size, y * size, r * size, 0, Math.PI * 2); ctx.fill();
    }
    // Crescent moon
    ctx.fillStyle = '#d4b878';
    ctx.beginPath(); ctx.arc(0.53 * size, 0.43 * size, 0.23 * size, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#142660';
    ctx.beginPath(); ctx.arc(0.65 * size, 0.37 * size, 0.20 * size, 0, Math.PI * 2); ctx.fill();
    return c.toDataURL('image/png');
  } catch { return '/icon-512.png'; }
}

export default function App() {
  const {
    soundState,
    loadingState,
    masterVolume,
    setMasterVolume,
    toggleSound,
    setSoundVolume,
    pauseAll,
    playAllActive,
    stopAll,
    activeSounds,
    restoreMixerState,
  } = useAudioMixer(SOUND_LIBRARY);

  const mediaArtwork = useMemo(() => buildMediaArtwork(512), []);

  const [isPaused, setIsPaused] = useState(false);
  const [category, setCategory] = useState<Category>('All');

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
    if (activeSounds.length === 0) setIsPaused(false);
  }, [activeSounds.length]);

  // Media Session API — powers lock-screen / notification player on Android & iOS
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'drift',
      artist: activeSounds.length > 0
        ? activeSounds.map((s) => s.name).join(' · ')
        : 'sleep sounds',
      album: 'sleep sounds',
      artwork: [
        { src: mediaArtwork, sizes: '512x512', type: 'image/png' },
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
    if (isPlaying) {
      pauseAll();
      setIsPaused(true);
    } else if (activeSounds.length > 0) {
      await playAllActive();
      setIsPaused(false);
    }
  }, [isPlaying, activeSounds.length, pauseAll, playAllActive]);

  const handleSoundToggle = useCallback(async (soundId: string) => {
    const wasEnabled = soundState[soundId]?.enabled;
    if (!wasEnabled && isPaused) setIsPaused(false);
    await toggleSound(soundId);
  }, [soundState, isPaused, toggleSound]);

  // Sleep timer — counts down playing-time only (pauses when audio pauses)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

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
    }
  }, [secondsLeft, stopAll]);

  const handleTimerAdjust = (minutes: number) => {
    setSecondsLeft((prev) => {
      const next = (prev ?? 0) + minutes * 60;
      return next <= 0 ? null : next;
    });
  };

  const handleTimerReset = () => setSecondsLeft(null);

  const visibleSounds = category === 'All'
    ? SOUND_LIBRARY
    : SOUND_LIBRARY.filter((s) => s.category === category);

  const activeInCategory = (cat: Category) =>
    cat === 'All'
      ? activeSounds.length
      : activeSounds.filter((s) => s.category === cat).length;

  const handleAppScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollY = (e.target as HTMLDivElement).scrollTop;
    document.documentElement.style.setProperty('--moon-scroll', `${scrollY}px`);
  }, []);

  return (
    <>
      <div className="bg-layer" />
      <div className="stars" />
      <div className="moon" />

      <div className="app" onScroll={handleAppScroll}>
        <header>
          <div className="wordmark">drift<sup style={{fontSize:'0.35em', verticalAlign:'super', marginLeft:'0.3em', opacity:0.55, fontFamily:'sans-serif', fontWeight:400, letterSpacing:'0.02em'}}>v2.3</sup></div>
          <div className="tagline">sleep sounds</div>
        </header>

        <div className="master">
          {/* Row 1: play + timer chips */}
          <div className="master-top">
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

            <div className="timers">
              <div className="timer-chips">
                <button type="button" className="timer-btn" onClick={() => handleTimerAdjust(-30)}>−30m</button>
                <button type="button" className="timer-btn" onClick={() => handleTimerAdjust(15)}>+15m</button>
                <button type="button" className="timer-btn" onClick={() => handleTimerAdjust(30)}>+30m</button>
                <button
                  type="button"
                  className={`timer-btn timer-reset${secondsLeft === null ? ' dim' : ''}`}
                  onClick={handleTimerReset}
                >✕</button>
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
                style={sliderBg(masterVolume)}
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
              return (
                <button
                  key={cat}
                  type="button"
                  className={`cat-pill${category === cat ? ' active' : ''}`}
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                  {n > 0 && <span className="cat-count">{n}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="sounds-grid">
          {visibleSounds.map((sound, i) => (
            <SoundCard
              key={sound.id}
              sound={sound}
              enabled={soundState[sound.id]?.enabled ?? false}
              playing={(soundState[sound.id]?.enabled ?? false) && !isPaused && !(loadingState[sound.id] ?? false)}
              loading={loadingState[sound.id] ?? false}
              volume={soundState[sound.id]?.volume ?? 0.5}
              cardIndex={i}
              onToggle={() => handleSoundToggle(sound.id)}
              onVolumeChange={(v) => setSoundVolume(sound.id, v)}
            />
          ))}
        </div>

        <div className="app-footer">
          {activeSounds.length > 0 && (
            <div className="footer-playing">{activeSounds.map((s) => s.name).join(' · ')}</div>
          )}
          {(activeSounds.length > 0 || isPaused) && (
            <div className="footer-rest">rest well</div>
          )}
        </div>
      </div>
    </>
  );
}
