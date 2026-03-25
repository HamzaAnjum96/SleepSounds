interface VolumeSliderProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

const VolumeSlider = ({ value, onChange, label }: VolumeSliderProps) => {
  return (
    <label className="flex w-full flex-col gap-1">
      {label ? <span className="text-xs font-medium text-slate-300">{label}</span> : null}
      <input
        className="drift-slider w-full"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
};

export default VolumeSlider;
