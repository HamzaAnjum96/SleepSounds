interface VolumeSliderProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

const VolumeSlider = ({ value, onChange, label }: VolumeSliderProps) => {
  return (
    <label className="block">
      {label ? <span className="mb-2 block text-xs font-medium text-slate-300">{label}</span> : null}
      <input
        className="slider"
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
