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

const FIRE_PARAM_GROUPS: { label: string; params: ParamDef[] }[] = [
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

const BIRDSONG_PARAM_GROUPS: { label: string; params: ParamDef[] }[] = [
  {
    label: 'Ambience',
    params: [
      { key: 'bedVol',    label: 'Bed Volume',    min: 0,   max: 1,   step: 0.01, def: 0.35, fmt: v => v.toFixed(2) },
      { key: 'bedTone',   label: 'Bed Tone',      min: 0,   max: 1,   step: 0.01, def: 0.50, fmt: v => v.toFixed(2) },
      { key: 'bedBreath', label: 'Bed Breathing',  min: 0,   max: 1,   step: 0.01, def: 0.50, fmt: v => v.toFixed(2) },
    ],
  },
  {
    label: 'Calls',
    params: [
      { key: 'callRate',    label: 'Call Density',     min: 0.1, max: 8,   step: 0.1,  def: 2.0,  fmt: v => v.toFixed(1) },
      { key: 'callPitch',   label: 'Call Pitch',       min: 0,   max: 1,   step: 0.01, def: 0.50, fmt: v => v.toFixed(2) },
      { key: 'callVol',     label: 'Call Volume',      min: 0,   max: 1,   step: 0.01, def: 0.55, fmt: v => v.toFixed(2) },
      { key: 'callVariety', label: 'Pitch Variety',    min: 0,   max: 1,   step: 0.01, def: 0.50, fmt: v => v.toFixed(2) },
    ],
  },
  {
    label: 'Trills',
    params: [
      { key: 'trillRate',  label: 'Trill Density',    min: 0,   max: 1,   step: 0.01, def: 0.30, fmt: v => v.toFixed(2) },
      { key: 'trillPitch', label: 'Trill Pitch',      min: 0,   max: 1,   step: 0.01, def: 0.50, fmt: v => v.toFixed(2) },
      { key: 'trillVol',   label: 'Trill Volume',     min: 0,   max: 1,   step: 0.01, def: 0.30, fmt: v => v.toFixed(2) },
      { key: 'trillSpeed', label: 'Warble Speed',     min: 0,   max: 1,   step: 0.01, def: 0.50, fmt: v => v.toFixed(2) },
    ],
  },
  {
    label: 'Peeps & Master',
    params: [
      { key: 'peepRate',   label: 'Peep Density',     min: 0,   max: 1,   step: 0.01, def: 0.50, fmt: v => v.toFixed(2) },
      { key: 'peepVol',    label: 'Peep Volume',      min: 0,   max: 0.5, step: 0.01, def: 0.15, fmt: v => v.toFixed(2) },
      { key: 'gain',       label: 'Output Gain',      min: 0,   max: 2,   step: 0.01, def: 0.62, fmt: v => v.toFixed(2) },
    ],
  },
];

const SOUND_PARAM_GROUPS: Record<string, { label: string; params: ParamDef[] }[]> = {
  fire: FIRE_PARAM_GROUPS,
  birdsong: BIRDSONG_PARAM_GROUPS,
};

const ALL_FIRE_PARAMS = FIRE_PARAM_GROUPS.flatMap(g => g.params);
const ALL_BIRDSONG_PARAMS = BIRDSONG_PARAM_GROUPS.flatMap(g => g.params);
const FIRE_DEFAULTS = Object.fromEntries(ALL_FIRE_PARAMS.map(p => [p.key, p.def]));
const BIRDSONG_DEFAULTS = Object.fromEntries(ALL_BIRDSONG_PARAMS.map(p => [p.key, p.def]));
const SOUND_DEFAULTS: Record<string, Record<string, number>> = {
  fire: FIRE_DEFAULTS,
  birdsong: BIRDSONG_DEFAULTS,
};

function sbSliderBg(value: number, min: number, max: number) {
  const pct = ((value - min) / (max - min)) * 100;
  return {
    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
  };
}

// Module-level singletons so the AudioContext and module load persist across
// component re-mounts and don't get recreated on every play press.
let _sbCtx: AudioContext | null = null;
let _sbModules: Record<string, Promise<void>> = {};

const SOUND_TYPES = [
  { id: 'fire',     label: 'Fire',     icon: 'local_fire_department', worklet: 'fire.worklet.js',     processor: 'fire-synth' },
  { id: 'birdsong', label: 'Birdsong', icon: 'raven',                worklet: 'birdsong.worklet.js', processor: 'birdsong-synth' },
] as const;

export default function SoundBuilder() {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [selectedSound, setSelectedSound] = useState<string>('fire');
  const [values, setValues] = useState<Record<string, number>>(SOUND_DEFAULTS['fire']);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctxRef  = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const valRef  = useRef(values);
  useEffect(() => { valRef.current = values; }, [values]);

  const startSound = useCallback(async () => {
    setError(null);
    const st = SOUND_TYPES.find(s => s.id === selectedSound);
    if (!st) return;
    // ── Synchronous section — must stay before the first await ──────────
    // AudioContext creation and resume() both need to be within the user
    // gesture call stack, or iOS Safari will leave the context suspended.
    if (!_sbCtx) _sbCtx = new AudioContext();
    const ctx = _sbCtx;
    const resumeP = ctx.resume();
    if (!_sbModules[st.id]) _sbModules[st.id] = ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/${st.worklet}`);
    // ────────────────────────────────────────────────────────────────────
    try {
      await Promise.all([resumeP, _sbModules[st.id]]);
      const node = new AudioWorkletNode(ctx, st.processor, {
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
  }, [selectedSound]);

  const stopSound = useCallback(() => {
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
    const defaults = SOUND_DEFAULTS[selectedSound] ?? {};
    setValues(defaults);
    if (nodeRef.current && ctxRef.current) {
      for (const [key, val] of Object.entries(defaults)) {
        nodeRef.current.parameters.get(key)?.setValueAtTime(val, ctxRef.current.currentTime);
      }
    }
  }, [selectedSound]);

  // Stop when section is collapsed
  useEffect(() => {
    if (!open && playing) stopSound();
  }, [open, playing, stopSound]);

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
                onClick={() => { if (playing) stopSound(); setSelectedSound(st.id); setValues(SOUND_DEFAULTS[st.id] ?? {}); }}
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
              onClick={playing ? stopSound : startSound}
            >
              <span className="material-symbols-rounded">{playing ? 'stop' : 'play_arrow'}</span>
              {playing ? 'stop' : `play ${selectedSound}`}
            </button>
            <button type="button" className="sb-reset-btn" onClick={handleReset}>
              <span className="material-symbols-rounded">restart_alt</span>
              reset
            </button>
          </div>

          {error && <div className="sb-error">{error}</div>}

          {(SOUND_PARAM_GROUPS[selectedSound] ?? []).map(group => (
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
