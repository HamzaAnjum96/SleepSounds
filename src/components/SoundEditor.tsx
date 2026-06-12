import { useCallback, useEffect, useMemo, useState } from 'react';
import { SOUND_EDITOR_MODELS } from './soundEditorDefs';
import { SOUND_ICONS } from '../lib/soundIcons';
import { sliderFill } from '../lib/sliderFill';

interface SoundEditorProps {
  soundId: string;
  /** Whether the sound is in the mix (audible), so shaping can be heard. */
  active?: boolean;
  /** Add the sound to the mix from inside the editor. */
  onPlay?: () => void;
  onClose?: () => void;
  initialValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
}

/** Every parameter reads as a percentage of its own range, so a slider at
 *  half-way always says 50% regardless of the underlying engine units. */
function asPercent(value: number, min: number, max: number): string {
  const span = max - min;
  const pct = span > 0 ? ((value - min) / span) * 100 : 0;
  return `${Math.round(Math.min(100, Math.max(0, pct)))}%`;
}

export default function SoundEditor({
  soundId,
  active = false,
  onPlay,
  onClose,
  initialValues,
  onValuesChange,
}: SoundEditorProps) {
  const soundType = SOUND_EDITOR_MODELS[soundId];
  const defaults = useMemo(
    () => Object.fromEntries(
      (soundType?.groups ?? []).flatMap(g => g.params).map(p => [p.key, p.def]),
    ),
    [soundType],
  );

  const [values, setValues] = useState<Record<string, number>>(initialValues ?? defaults);
  useEffect(() => { setValues(initialValues ?? defaults); }, [defaults, initialValues, soundId]);

  const handleChange = useCallback((key: string, value: number) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      onValuesChange?.(next);
      return next;
    });
  }, [onValuesChange]);

  const handleReset = useCallback(() => {
    setValues(defaults);
    onValuesChange?.(defaults);
  }, [defaults, onValuesChange]);

  if (!soundType) return null;
  const title = soundType.label.toLowerCase();
  // A lone group label would only repeat the panel's own eyebrow.
  const showGroupLabels = soundType.groups.length > 1;

  return (
    <div className="sb-panel">
      <div className="sb-head">
        <span className="material-symbols-rounded sb-icon" aria-hidden="true">
          {SOUND_ICONS[soundId] ?? 'music_note'}
        </span>
        <div className="sb-head-text">
          <span className="sb-eyebrow">shape the sound</span>
          <span className="sb-title">{title}</span>
        </div>
        {!active && onPlay && (
          <button
            type="button"
            className="sb-play-btn"
            onClick={onPlay}
            aria-label={`Play ${title} to hear your changes`}
          >
            <span className="material-symbols-rounded" aria-hidden="true">play_arrow</span>
            play
          </button>
        )}
        <button
          type="button"
          className="sb-icon-btn"
          onClick={handleReset}
          aria-label={`Reset ${title} to its defaults`}
        >
          <span className="material-symbols-rounded">restart_alt</span>
        </button>
        {onClose && (
          <button
            type="button"
            className="sb-icon-btn"
            onClick={onClose}
            aria-label={`Close ${title} editor`}
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        )}
      </div>

      {soundType.groups.map(group => (
        <div key={group.label} className="sb-group">
          {showGroupLabels && <div className="sb-group-label">{group.label}</div>}
          <div className="sb-rows">
            {group.params.map(p => (
              <div key={p.key} className="sb-row">
                <div className="sb-row-header">
                  <span className="sb-param-label">{p.label}</span>
                  <span className="sb-param-val">{asPercent(values[p.key] ?? p.def, p.min, p.max)}</span>
                </div>
                <input
                  type="range"
                  className="drift-slider"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={values[p.key] ?? p.def}
                  style={sliderFill(values[p.key] ?? p.def, p.min, p.max)}
                  aria-label={p.label}
                  onChange={e => handleChange(p.key, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
