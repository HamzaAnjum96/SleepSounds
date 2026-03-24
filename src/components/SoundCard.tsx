import type { Sound } from '../types';
import VolumeSlider from './VolumeSlider';

interface SoundCardProps {
  sound: Sound;
  enabled: boolean;
  volume: number;
  onToggle: () => void;
  onVolumeChange: (value: number) => void;
}

const SoundCard = ({ sound, enabled, volume, onToggle, onVolumeChange }: SoundCardProps) => {
  return (
    <article className="rounded-2xl border border-white/10 bg-cardBlue/75 p-4 shadow-card transition duration-300 hover:border-accent/50">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{sound.name}</h3>
          <p className="text-xs text-slate-400">{sound.category}</p>
        </div>
        <button
          className={`h-9 min-w-[64px] rounded-full px-3 text-xs font-semibold transition ${
            enabled ? 'bg-accent text-deepBlue' : 'bg-white/10 text-slate-100'
          }`}
          type="button"
          onClick={onToggle}
          aria-pressed={enabled}
        >
          {enabled ? 'On' : 'Off'}
        </button>
      </div>
      <VolumeSlider value={volume} onChange={onVolumeChange} label="Volume" />
    </article>
  );
};

export default SoundCard;
