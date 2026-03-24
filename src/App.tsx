import { useEffect, useMemo, useState } from 'react';
import ActiveMixer from './components/ActiveMixer';
import Header from './components/Header';
import MasterControls from './components/MasterControls';
import PresetManager from './components/PresetManager';
import SleepTimer from './components/SleepTimer';
import SoundLibrary from './components/SoundLibrary';
import { PRESET_STORAGE_KEY, SOUND_LIBRARY } from './data';
import { useAudioMixer } from './hooks/useAudioMixer';
import type { Preset } from './types';

const App = () => {
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

  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Preset[];
      setPresets(Array.isArray(parsed) ? parsed : []);
    } catch {
      setPresets([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
  }, [presets]);

  const savePreset = (name: string) => {
    const preset: Preset = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      state: soundState,
      masterVolume,
    };
    setPresets((prev) => [preset, ...prev].slice(0, 12));
  };

  const loadPreset = async (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    restoreMixerState(preset.state, preset.masterVolume);

    for (const [soundId, state] of Object.entries(preset.state)) {
      if (state.enabled) {
        await toggleSound(soundId);
      }
      setSoundVolume(soundId, state.volume);
    }
  };

  const deletePreset = (presetId: string) => {
    setPresets((prev) => prev.filter((preset) => preset.id !== presetId));
  };

  const usageCount = useMemo(
    () => Object.values(soundState).filter((state) => state.enabled).length,
    [soundState],
  );

  return (
    <div className="min-h-screen bg-hero-gradient px-4 pb-8 pt-6 text-slate-100">
      <main className="mx-auto max-w-xl space-y-4">
        <Header />

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 shadow-card">
          {usageCount} sound{usageCount === 1 ? '' : 's'} active
        </div>

        <MasterControls
          masterVolume={masterVolume}
          onMasterVolumeChange={setMasterVolume}
          onPlayAll={playAllActive}
          onPauseAll={pauseAll}
          onStopAll={stopAll}
        />

        <ActiveMixer activeSounds={activeSounds} />
        <SleepTimer onExpire={stopAll} />
        <PresetManager presets={presets} onSave={savePreset} onLoad={loadPreset} onDelete={deletePreset} />
        <SoundLibrary sounds={SOUND_LIBRARY} state={soundState} onToggle={toggleSound} onVolumeChange={setSoundVolume} />
      </main>
    </div>
  );
};

export default App;
