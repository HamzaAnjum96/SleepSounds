import type { Sound, SoundState } from '../types';
import SoundCard from './SoundCard';

interface SoundLibraryProps {
  sounds: Sound[];
  state: Record<string, SoundState>;
  onToggle: (soundId: string) => void;
  onVolumeChange: (soundId: string, volume: number) => void;
}

const SoundLibrary = ({ sounds, state, onToggle, onVolumeChange }: SoundLibraryProps) => {
  return (
    <section className="space-y-3" aria-label="Sound library">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Sound Library</h2>
        <p className="text-xs text-slate-400">Mix multiple sounds</p>
      </div>
      <div className="grid gap-3">
        {sounds.map((sound) => (
          <SoundCard
            key={sound.id}
            sound={sound}
            enabled={state[sound.id]?.enabled ?? false}
            volume={state[sound.id]?.volume ?? 0.5}
            onToggle={() => onToggle(sound.id)}
            onVolumeChange={(value) => onVolumeChange(sound.id, value)}
          />
        ))}
      </div>
    </section>
  );
};

export default SoundLibrary;
