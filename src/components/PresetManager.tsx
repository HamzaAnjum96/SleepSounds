import { useMemo, useState } from 'react';
import type { Preset } from '../types';

interface PresetManagerProps {
  presets: Preset[];
  onSave: (name: string) => void;
  onLoad: (presetId: string) => void;
  onDelete: (presetId: string) => void;
}

const PresetManager = ({ presets, onSave, onLoad, onDelete }: PresetManagerProps) => {
  const [name, setName] = useState('');

  const hasName = useMemo(() => name.trim().length > 0, [name]);

  return (
    <section className="rounded-2xl border border-white/10 bg-cardBlue/60 p-4 shadow-card">
      <h2 className="text-base font-semibold text-white">Presets</h2>

      <div className="mt-3 flex items-center gap-2">
        <input
          className="w-full rounded-xl border border-white/10 bg-midnight/90 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          placeholder="Preset name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
        />
        <button
          type="button"
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-deepBlue disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasName}
          onClick={() => {
            onSave(name.trim());
            setName('');
          }}
        >
          Save
        </button>
      </div>

      {presets.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No presets saved yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {presets.map((preset) => (
            <li
              key={preset.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-white">{preset.name}</p>
                <p className="text-xs text-slate-400">{new Date(preset.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-white/10 px-3 py-1 text-xs text-white"
                  onClick={() => onLoad(preset.id)}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-rose-500/20 px-3 py-1 text-xs text-rose-200"
                  onClick={() => onDelete(preset.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default PresetManager;
