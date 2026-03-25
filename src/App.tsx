import { useCallback, useEffect, useState } from 'react';
import SoundCard from './components/SoundCard';
import { BUILTIN_PRESETS, CATEGORIES, PRESET_STORAGE_KEY, SOUND_LIBRARY } from './data';
import type { Category } from './data';
import { useAudioMixer } from './hooks/useAudioMixer';
import type { Preset } from './types';

const TIMER_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

function timerLabel(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h${rem}` : `${h}h`;
}

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

export default function App() {
  const {
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
  } = useAudioMixer(SOUND_LIBRARY);

  const [isPaused, setIsPaused] = useState(false);
  const [category, setCategory] = useState<Category>('All');

  // Presets
  const [presets, setPresets] = useState<Preset[]>(() => {
    try { return JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) ?? '[]'); }
    catch { return []; }
  });
  const [presetName, setPresetName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);

  const persistPresets = (next: Preset[]) => {
    setPresets(next);
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
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
    restoreMixerState(preset.state, preset.masterVolume, true);
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
      artwork: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    navigator.mediaSession.setActionHandler('play', () => { playAllActive(); setIsPaused(false); });
    navigator.mediaSession.setActionHandler('pause', () => { pauseAll(); setIsPaused(true); });
    navigator.mediaSession.setActionHandler('stop', () => { stopAll(); setIsPaused(false); });
  }, [isPlaying, activeSounds, playAllActive, pauseAll, stopAll]);

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
  const [activeTimer, setActiveTimer] = useState<number | null>(null);
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
      setActiveTimer(null);
      setSecondsLeft(null);
    }
  }, [secondsLeft, stopAll]);

  const handleTimerClick = (minutes: number) => {
    if (activeTimer === minutes) {
      setActiveTimer(null);
      setSecondsLeft(null);
    } else {
      setActiveTimer(minutes);
      setSecondsLeft(minutes * 60);
    }
  };

  const visibleSounds = category === 'All'
    ? SOUND_LIBRARY
    : SOUND_LIBRARY.filter((s) => s.category === category);

  const activeInCategory = (cat: Category) =>
    cat === 'All'
      ? activeSounds.length
      : activeSounds.filter((s) => s.category === cat).length;

  return (
    <>
      <div className="bg-layer" />
      <div className="stars" />
      <div className="moon" />

      <div className="app">
        <header>
          <div className="wordmark">drift</div>
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
                {TIMER_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`timer-btn${activeTimer === m ? ' active' : ''}`}
                    onClick={() => handleTimerClick(m)}
                  >
                    {timerLabel(m)}
                  </button>
                ))}
              </div>
              {secondsLeft !== null && (
                <div className="timer-countdown">{formatCountdown(secondsLeft)}</div>
              )}
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

        <div className="section-header">
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
            <button
              key={preset.id}
              type="button"
              className="builtin-preset-btn saved"
              onClick={() => handleLoadPreset(preset.id)}
            >
              {preset.name}
            </button>
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
              autoFocus
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
          {visibleSounds.map((sound) => (
            <SoundCard
              key={sound.id}
              sound={sound}
              enabled={soundState[sound.id]?.enabled ?? false}
              playing={(soundState[sound.id]?.enabled ?? false) && !isPaused}
              volume={soundState[sound.id]?.volume ?? 0.5}
              onToggle={() => handleSoundToggle(sound.id)}
              onVolumeChange={(v) => setSoundVolume(sound.id, v)}
            />
          ))}
        </div>

        <div className="app-footer">
          {activeSounds.length > 0 && (
            <div className="footer-playing">{activeSounds.map((s) => s.name).join(' · ')}</div>
          )}
          <div className="footer-rest">rest well</div>
        </div>
      </div>
    </>
  );
}
