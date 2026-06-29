import { useCallback, useEffect, useMemo, useState } from 'react';
import { SOUND_EDITOR_MODELS, type SoundVariant } from './soundEditorDefs';
import { SOUND_ICONS } from '../lib/soundIcons';
import { VariantMark, variantToken } from '../lib/variantIcons';
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

  // Sliders (level 3) start hidden; most users stay on the variant chips.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [soundId]);

  const handleChange = useCallback((key: string, value: number) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      onValuesChange?.(next);
      return next;
    });
  }, [onValuesChange]);

  const applyValues = useCallback((next: Record<string, number>) => {
    setValues(next);
    onValuesChange?.(next);
  }, [onValuesChange]);

  const variants = soundType?.variants;
  /** Full slider values for a variant: its overrides on top of the defaults. */
  const resolve = useCallback(
    (v: SoundVariant) => ({ ...defaults, ...v.values }),
    [defaults],
  );
  // Which variant the current values match (a pure read; editing a slider
  // simply stops matching and the selection reads as "custom").
  const selected = useMemo(() => {
    if (!variants) return null;
    return variants.find((v) => {
      const r = resolve(v);
      return Object.keys(r).every((k) => Math.abs((values[k] ?? r[k]) - r[k]) < 1e-4);
    }) ?? null;
  }, [variants, values, resolve]);

  if (!soundType) return null;
  const title = soundType.label.toLowerCase();
  // A lone group label would only repeat the panel's own eyebrow.
  const showGroupLabels = soundType.groups.length > 1;
  // Chip-only sounds never reveal sliders or the fine-tune disclosure.
  const variantsOnly = soundType.variantsOnly ?? false;
  const showSliders = !variantsOnly && (!variants || expanded);

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
          onClick={() => applyValues(defaults)}
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

      {variants && (
        <div className="sb-variants" role="group" aria-label={`${title} presets`}>
          {variants.map((v, i) => (
            <button
              key={v.name}
              type="button"
              className={`sb-variant${selected?.name === v.name ? ' active' : ''}`}
              aria-pressed={selected?.name === v.name}
              onClick={() => applyValues(resolve(v))}
            >
              <VariantMark token={variantToken(v.icon, i)} />
              <span className="sb-variant-label">{v.name}</span>
            </button>
          ))}
          {!selected && <span className="sb-variant custom" aria-hidden="true">custom</span>}
        </div>
      )}

      {variants && !variantsOnly && (
        <button
          type="button"
          className={`sb-finetune${expanded ? ' open' : ''}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          <span className="material-symbols-rounded sb-finetune-icon" aria-hidden="true">tune</span>
          {/* Static label so the control is the same width open and closed; the
              rotating caret and the accent "open" state carry the toggle, and
              aria-expanded announces it to screen readers. */}
          <span>fine-tune sliders</span>
          <span className="material-symbols-rounded sb-finetune-caret" aria-hidden="true">keyboard_arrow_down</span>
        </button>
      )}

      {showSliders && soundType.groups.map(group => (
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
