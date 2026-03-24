import type { Sound } from '../types';

interface ActiveMixerProps {
  activeSounds: Sound[];
}

const ActiveMixer = ({ activeSounds }: ActiveMixerProps) => {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-card">
      <h2 className="text-base font-semibold text-white">Active Mixer</h2>
      {activeSounds.length === 0 ? (
        <p className="mt-2 animate-pulseSoft text-sm text-slate-400">No sounds active yet. Toggle a sound to begin.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {activeSounds.map((sound) => (
            <li key={sound.id} className="rounded-full bg-accent/20 px-3 py-1 text-xs text-accentSoft">
              {sound.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ActiveMixer;
