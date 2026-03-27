import { useCallback, useEffect, useMemo, useState } from 'react';
import { SOUND_EDITOR_MODELS } from './soundEditorDefs';

function sbSliderBg(value: number, min: number, max: number) {
  const pct = ((value - min) / (max - min)) * 100;
  return {
    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
  };
}

interface SoundEditorProps {
  soundId: string;
  onClose?: () => void;
  initialValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
}

export default function SoundEditor({
  soundId,
  onClose,
  initialValues,
  onValuesChange,
}: SoundEditorProps) {
  const soundType = SOUND_EDITOR_MODELS[soundId];
  if (!soundType) return null;
  const defaults = useMemo(
    () => Object.fromEntries(soundType.groups.flatMap(g => g.params).map(p => [p.key, p.def])),
    [soundType.groups],
  );

  const [values, setValues] = useState<Record<string, number>>(initialValues ?? defaults);
  const [copied, setCopied] = useState(false);
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

  const configText = useMemo(() => JSON.stringify(values, null, 2), [values]);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(configText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [configText]);

  return (
    <div className="sb-panel">
      <div className="sb-controls">
        <button type="button" className="sb-reset-btn" onClick={handleReset}>
          <span className="material-symbols-rounded">restart_alt</span>
          reset
        </button>
        {onClose && (
          <button type="button" className="sb-close-btn" onClick={onClose}>
            <span className="material-symbols-rounded">close</span>
            close
          </button>
        )}
      </div>

      {soundType.groups.map(group => (
        <div key={group.label} className="sb-group">
          <div className="sb-group-label">{group.label}</div>
          {group.params.map(p => (
            <div key={p.key} className="sb-row">
              <div className="sb-row-header">
                <span className="sb-param-label">{p.label}</span>
                <span className="sb-param-val">{p.fmt(values[p.key] ?? p.def)}</span>
              </div>
              <input
                type="range"
                className="drift-slider"
                min={p.min}
                max={p.max}
                step={p.step}
                value={values[p.key] ?? p.def}
                style={sbSliderBg(values[p.key] ?? p.def, p.min, p.max)}
                onChange={e => handleChange(p.key, Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      ))}

      <div className="sb-output compact">
        <div className="sb-output-header">
          <span className="sb-output-label">config values</span>
          <button type="button" className="sb-copy-btn" onClick={handleCopy}>
            <span className="material-symbols-rounded">{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
        <pre className="sb-pre">{configText}</pre>
      </div>
    </div>
  );
}
