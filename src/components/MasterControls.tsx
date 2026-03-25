
interface MasterControlsProps {
  masterVolume: number;
  onMasterVolumeChange: (value: number) => void;
  onPlayAll: () => void;
  onPauseAll: () => void;
  onStopAll: () => void;
}

const buttonClass =
  'rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.98] border border-white/10 bg-white/10 text-white hover:bg-white/20';

const MasterControls = ({
  masterVolume,
  onMasterVolumeChange,
  onPlayAll,
  onPauseAll,
  onStopAll,
}: MasterControlsProps) => {
  return (
    <section className="rounded-2xl border border-white/10 bg-cardBlue/60 p-4 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Master Controls</h2>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <button type="button" onClick={onPlayAll} className={buttonClass}>
          Play all
        </button>
        <button type="button" onClick={onPauseAll} className={buttonClass}>
          Pause all
        </button>
        <button type="button" onClick={onStopAll} className={buttonClass}>
          Stop all
        </button>
      </div>

      <div className="flex w-full items-center gap-3">
        <span className="shrink-0 text-xs font-medium text-slate-300">Master volume</span>
        <input
          className="drift-slider min-w-0 flex-1"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          onChange={(e) => onMasterVolumeChange(Number(e.target.value))}
        />
      </div>
    </section>
  );
};

export default MasterControls;
