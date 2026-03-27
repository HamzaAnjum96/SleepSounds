import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  fmt: (v: number) => string;
}

const PARAM_GROUPS: { label: string; params: ParamDef[] }[] = [
  {
    label: 'Core',
    params: [
      { key: 'intensity',   label: 'Intensity',         min: 0,       max: 1,      step: 0.01,     def: 0.62,    fmt: v => v.toFixed(2) },
      { key: 'dryness',     label: 'Dryness',           min: 0,       max: 1,      step: 0.01,     def: 0.55,    fmt: v => v.toFixed(2) },
      { key: 'crackleBias', label: 'Crackle Bias',      min: 0,       max: 1,      step: 0.01,     def: 0.5,     fmt: v => v.toFixed(2) },
      { key: 'size',        label: 'Size / Saturation', min: 0,       max: 1,      step: 0.01,     def: 0.45,    fmt: v => v.toFixed(2) },
      { key: 'distance',    label: 'Distance',          min: 0,       max: 1,      step: 0.01,     def: 0.2,     fmt: v => v.toFixed(2) },
      { key: 'wind',        label: 'Wind',              min: 0,       max: 1,      step: 0.01,     def: 0.22,    fmt: v => v.toFixed(2) },
    ],
  },
  {
    label: 'Roar',
    params: [
      { key: 'bodyVol',   label: 'Roar Volume',       min: 0,       max: 2,      step: 0.05,     def: 0.40,    fmt: v => v.toFixed(2) },
      { key: 'bodyLp',    label: 'Roar Freq (LP α)',  min: 0.001,   max: 0.05,   step: 0.001,    def: 0.005,   fmt: v => v.toFixed(3) },
      { key: 'roarMean',  label: 'Roar Level',        min: 0,       max: 1,      step: 0.01,     def: 0.4,     fmt: v => v.toFixed(2) },
      { key: 'roarSpeed', label: 'Roll Speed (OU θ)', min: 0.000005,max: 0.0002, step: 0.000005, def: 0.00003, fmt: v => v.toFixed(6) },
      { key: 'roarSigma', label: 'Roar Variation',    min: 0,       max: 0.005,  step: 0.0001,   def: 0.0008,  fmt: v => v.toFixed(4) },
    ],
  },
  {
    label: 'Mix',
    params: [
      { key: 'crackleBase', label: 'Crackle Rate (base)', min: 0, max: 15, step: 0.5,  def: 3.0, fmt: v => v.toFixed(1) },
      { key: 'crackleVol',  label: 'Crackle Volume',      min: 0, max: 6,  step: 0.1,  def: 2.8, fmt: v => v.toFixed(1) },
      { key: 'popVol',      label: 'Pop Volume',          min: 0, max: 3,  step: 0.05, def: 1.2, fmt: v => v.toFixed(2) },
    ],
  },
];

const ALL_PARAMS = PARAM_GROUPS.flatMap(g => g.params);
const DEFAULT_VALUES = Object.fromEntries(ALL_PARAMS.map(p => [p.key, p.def]));

function sbSliderBg(value: number, min: number, max: number) {
  const pct = ((value - min) / (max - min)) * 100;
  return {
    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
  };
}

export default function SoundBuilder() {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [values, setValues] = useState<Record<string, number>>(DEFAULT_VALUES);
  const [copied, setCopied] = useState(false);

  const ctxRef  = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const valRef  = useRef(values);
  useEffect(() => { valRef.current = values; }, [values]);

  const startFire = useCallback(async () => {
    try {
      const ctx = new AudioContext();
      await ctx.resume();
      await ctx.audioWorklet.addModule('/worklets/fire.worklet.js');
      const node = new AudioWorkletNode(ctx, 'fire-synth', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      // Apply current slider values
      for (const [key, val] of Object.entries(valRef.current)) {
        node.parameters.get(key)?.setValueAtTime(val, ctx.currentTime);
      }
      node.parameters.get('running')?.setValueAtTime(1, ctx.currentTime);
      node.connect(ctx.destination);
      ctxRef.current  = ctx;
      nodeRef.current = node;
      setPlaying(true);
    } catch (err) {
      console.error('[SoundBuilder] failed to start fire:', err);
    }
  }, []);

  const stopFire = useCallback(() => {
    nodeRef.current?.disconnect();
    ctxRef.current?.close();
    nodeRef.current = null;
    ctxRef.current  = null;
    setPlaying(false);
  }, []);

  const handleChange = useCallback((key: string, value: number) => {
    setValues(prev => ({ ...prev, [key]: value }));
    if (nodeRef.current && ctxRef.current) {
      nodeRef.current.parameters.get(key)?.setValueAtTime(value, ctxRef.current.currentTime);
    }
  }, []);

  const handleReset = useCallback(() => {
    setValues(DEFAULT_VALUES);
    if (nodeRef.current && ctxRef.current) {
      for (const [key, val] of Object.entries(DEFAULT_VALUES)) {
        nodeRef.current.parameters.get(key)?.setValueAtTime(val, ctxRef.current.currentTime);
      }
    }
  }, []);

  // Stop when section is collapsed
  useEffect(() => {
    if (!open && playing) stopFire();
  }, [open, playing, stopFire]);

  // Cleanup on unmount
  useEffect(() => () => { ctxRef.current?.close(); }, []);

  const configText = useMemo(() => JSON.stringify(values, null, 2), [values]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(configText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [configText]);

  return (
    <div className="sb-wrap">
      <button type="button" className="sb-toggle" onClick={() => setOpen(v => !v)}>
        <span className="material-symbols-rounded">tune</span>
        sound builder
        <span className="material-symbols-rounded sb-chevron">{open ? 'expand_less' : 'expand_more'}</span>
      </button>

      {open && (
        <div className="sb-panel">
          <div className="sb-controls">
            <button
              type="button"
              className={`sb-play-btn${playing ? ' active' : ''}`}
              onClick={playing ? stopFire : startFire}
            >
              <span className="material-symbols-rounded">{playing ? 'stop' : 'play_arrow'}</span>
              {playing ? 'stop' : 'play fire'}
            </button>
            <button type="button" className="sb-reset-btn" onClick={handleReset}>
              <span className="material-symbols-rounded">restart_alt</span>
              reset
            </button>
          </div>

          {PARAM_GROUPS.map(group => (
            <div key={group.label} className="sb-group">
              <div className="sb-group-label">{group.label}</div>
              {group.params.map(p => (
                <div key={p.key} className="sb-row">
                  <div className="sb-row-header">
                    <span className="sb-param-label">{p.label}</span>
                    <span className="sb-param-val">{p.fmt(values[p.key])}</span>
                  </div>
                  <input
                    type="range"
                    className="drift-slider"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={values[p.key]}
                    style={sbSliderBg(values[p.key], p.min, p.max)}
                    onChange={e => handleChange(p.key, Number(e.target.value))}
                  />
                </div>
              ))}
            </div>
          ))}

          <div className="sb-output">
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
      )}
    </div>
  );
}
