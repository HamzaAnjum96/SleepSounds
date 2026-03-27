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
      { key: 'intensity',   label: 'Intensity',         min: 0,       max: 1,      step: 0.01,     def: 0.39,    fmt: v => v.toFixed(2) },
      { key: 'dryness',     label: 'Dryness',           min: 0,       max: 1,      step: 0.01,     def: 0.47,    fmt: v => v.toFixed(2) },
      { key: 'crackleBias', label: 'Crackle Bias',      min: 0,       max: 1,      step: 0.01,     def: 1.0,     fmt: v => v.toFixed(2) },
      { key: 'size',        label: 'Size / Saturation', min: 0,       max: 1,      step: 0.01,     def: 1.0,     fmt: v => v.toFixed(2) },
      { key: 'distance',    label: 'Distance',          min: 0,       max: 1,      step: 0.01,     def: 0.54,    fmt: v => v.toFixed(2) },
      { key: 'wind',        label: 'Wind',              min: 0,       max: 1,      step: 0.01,     def: 0.5,     fmt: v => v.toFixed(2) },
    ],
  },
  {
    label: 'Roar',
    params: [
      { key: 'bodyVol',   label: 'Roar Volume',       min: 0,       max: 2,      step: 0.05,     def: 1.4,     fmt: v => v.toFixed(2) },
      { key: 'bodyLp',    label: 'Roar Freq (LP α)',  min: 0.001,   max: 0.05,   step: 0.001,    def: 0.007,   fmt: v => v.toFixed(3) },
      { key: 'roarMean',  label: 'Roar Level',        min: 0,       max: 1,      step: 0.01,     def: 0.81,    fmt: v => v.toFixed(2) },
      { key: 'roarSpeed', label: 'Roll Speed (OU θ)', min: 0.000005,max: 0.0002, step: 0.000005, def: 0.00005, fmt: v => v.toFixed(6) },
      { key: 'roarSigma', label: 'Roar Variation',    min: 0,       max: 0.005,  step: 0.0001,   def: 0.0015,  fmt: v => v.toFixed(4) },
    ],
  },
  {
    label: 'Mix',
    params: [
      { key: 'crackleBase', label: 'Crackle Rate (base)', min: 0, max: 15, step: 0.5,  def: 13.5, fmt: v => v.toFixed(1) },
      { key: 'crackleVol',  label: 'Crackle Volume',      min: 0, max: 6,  step: 0.1,  def: 5.4,  fmt: v => v.toFixed(1) },
      { key: 'popVol',      label: 'Pop Volume',          min: 0, max: 3,  step: 0.05, def: 1.35, fmt: v => v.toFixed(2) },
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

// Module-level singletons so the AudioContext and module load persist across
// component re-mounts and don't get recreated on every play press.
let _sbCtx: AudioContext | null = null;
let _sbModule: Promise<void> | null = null;

const SOUND_TYPES = [
  { id: 'fire',     label: 'Fire',     icon: 'local_fire_department', hasWorklet: true },
  { id: 'birdsong', label: 'Birdsong', icon: 'raven',                hasWorklet: false },
] as const;

export default function SoundBuilder() {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [selectedSound, setSelectedSound] = useState<string>('fire');
  const [values, setValues] = useState<Record<string, number>>(DEFAULT_VALUES);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctxRef  = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const valRef  = useRef(values);
  useEffect(() => { valRef.current = values; }, [values]);

  const startFire = useCallback(async () => {
    setError(null);
    // ── Synchronous section — must stay before the first await ──────────
    // AudioContext creation and resume() both need to be within the user
    // gesture call stack, or iOS Safari will leave the context suspended.
    if (!_sbCtx) _sbCtx = new AudioContext();
    const ctx = _sbCtx;
    const resumeP = ctx.resume();
    if (!_sbModule) _sbModule = ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/fire.worklet.js`);
    // ────────────────────────────────────────────────────────────────────
    try {
      await Promise.all([resumeP, _sbModule]);
      const node = new AudioWorkletNode(ctx, 'fire-synth', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      for (const [key, val] of Object.entries(valRef.current)) {
        node.parameters.get(key)?.setValueAtTime(val, ctx.currentTime);
      }
      node.parameters.get('running')?.setValueAtTime(1, ctx.currentTime);
      node.connect(ctx.destination);
      ctxRef.current  = ctx;
      nodeRef.current = node;
      setPlaying(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[SoundBuilder]', err);
    }
  }, []);

  const stopFire = useCallback(() => {
    nodeRef.current?.disconnect();
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

  // Cleanup on unmount — only disconnect the node, never close the shared context
  useEffect(() => () => { nodeRef.current?.disconnect(); }, []);

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
          <div className="sb-sound-select">
            {SOUND_TYPES.map(st => (
              <button
                key={st.id}
                type="button"
                className={`sb-sound-btn${selectedSound === st.id ? ' active' : ''}`}
                onClick={() => { if (playing) stopFire(); setSelectedSound(st.id); }}
              >
                <span className="material-symbols-rounded">{st.icon}</span>
                {st.label}
              </button>
            ))}
          </div>

          <div className="sb-controls">
            <button
              type="button"
              className={`sb-play-btn${playing ? ' active' : ''}`}
              onClick={playing ? stopFire : startFire}
              disabled={!SOUND_TYPES.find(s => s.id === selectedSound)?.hasWorklet}
            >
              <span className="material-symbols-rounded">{playing ? 'stop' : 'play_arrow'}</span>
              {playing ? 'stop' : `play ${selectedSound}`}
            </button>
            <button type="button" className="sb-reset-btn" onClick={handleReset}>
              <span className="material-symbols-rounded">restart_alt</span>
              reset
            </button>
          </div>

          {!SOUND_TYPES.find(s => s.id === selectedSound)?.hasWorklet && (
            <div className="sb-info">Real-time parameter tuning not yet available for {selectedSound}. Use the sound card to preview.</div>
          )}

          {error && <div className="sb-error">{error}</div>}

          {selectedSound === 'fire' && PARAM_GROUPS.map(group => (
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

          {selectedSound === 'fire' && (
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
          )}
        </div>
      )}
    </div>
  );
}
