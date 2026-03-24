import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SoundCard from './components/SoundCard';
import { SOUND_LIBRARY } from './data';
import { useAudioMixer } from './hooks/useAudioMixer';

const TIMER_OPTIONS = [15, 30, 60] as const;

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
  } = useAudioMixer(SOUND_LIBRARY);

  const [isPaused, setIsPaused] = useState(false);
  const isPlaying = activeSounds.length > 0 && !isPaused;

  useEffect(() => {
    if (activeSounds.length === 0) setIsPaused(false);
  }, [activeSounds.length]);

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

  // Sleep timer
  const [activeTimer, setActiveTimer] = useState<number | null>(null);
  const [timerEndAt, setTimerEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!timerEndAt) {
      if (tickRef.current !== null) clearInterval(tickRef.current);
      return;
    }
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current !== null) clearInterval(tickRef.current);
    };
  }, [timerEndAt]);

  useEffect(() => {
    if (!timerEndAt) return;
    if (Date.now() >= timerEndAt) {
      stopAll();
      setIsPaused(false);
      setActiveTimer(null);
      setTimerEndAt(null);
    }
  }, [now, timerEndAt, stopAll]);

  const secondsLeft = useMemo(() => {
    if (!timerEndAt) return 0;
    return Math.max(0, Math.floor((timerEndAt - now) / 1000));
  }, [timerEndAt, now]);

  const handleTimerClick = (minutes: number) => {
    if (activeTimer === minutes) {
      setActiveTimer(null);
      setTimerEndAt(null);
    } else {
      setActiveTimer(minutes);
      setTimerEndAt(Date.now() + minutes * 60 * 1000);
    }
  };

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

          <div className="master-body">
            <div className="master-label">master volume</div>
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
              <span className="vol-pct">{Math.round(masterVolume * 100)}%</span>
            </div>
          </div>

          <div className="timers">
            <div className="timer-chips">
              {TIMER_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`timer-btn${activeTimer === m ? ' active' : ''}`}
                  onClick={() => handleTimerClick(m)}
                >
                  {m}m
                </button>
              ))}
            </div>
            {timerEndAt && (
              <div className="timer-countdown">{formatCountdown(secondsLeft)}</div>
            )}
          </div>
        </div>

        <div className="section-label">sounds</div>
        <div className="sounds-grid">
          {SOUND_LIBRARY.map((sound) => (
            <SoundCard
              key={sound.id}
              sound={sound}
              enabled={soundState[sound.id]?.enabled ?? false}
              volume={soundState[sound.id]?.volume ?? 0.5}
              onToggle={() => handleSoundToggle(sound.id)}
              onVolumeChange={(v) => setSoundVolume(sound.id, v)}
            />
          ))}
        </div>

        <div className="app-footer">rest well</div>
      </div>
    </>
  );
}
