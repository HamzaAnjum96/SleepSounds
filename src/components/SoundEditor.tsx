import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SOUND_EDITOR_MODELS } from './soundEditorDefs';

function sbSliderBg(value: number, min: number, max: number) {
  const pct = ((value - min) / (max - min)) * 100;
  return {
    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
  };
}

let editorCtx: AudioContext | null = null;
let modules: Record<string, Promise<void>> = {};

interface SoundEditorProps {
  soundId: string;
}

export default function SoundEditor({ soundId }: SoundEditorProps) {
  const soundType = SOUND_EDITOR_MODELS[soundId];
  if (!soundType) return null;
  const defaults = useMemo(
    () => Object.fromEntries(soundType.groups.flatMap(g => g.params).map(p => [p.key, p.def])),
    [soundType.groups],
  );

  const [playing, setPlaying] = useState(false);
  const [values, setValues] = useState<Record<string, number>>(defaults);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const valRef = useRef(values);
  useEffect(() => { valRef.current = values; }, [values]);
  useEffect(() => { setValues(defaults); }, [defaults]);

  const stopSound = useCallback(() => {
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    ctxRef.current = null;
    setPlaying(false);
  }, []);

  const startSound = useCallback(async () => {
    setError(null);
    if (!editorCtx) editorCtx = new AudioContext();
    const ctx = editorCtx;
    const resumeP = ctx.resume();
    if (soundType.mode !== 'worklet' || !soundType.worklet || !soundType.processor) return;
    if (!modules[soundId]) {
      modules[soundId] = ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/${soundType.worklet}`);
    }
    try {
      await Promise.all([resumeP, modules[soundId]]);
      const node = new AudioWorkletNode(ctx, soundType.processor, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      for (const [key, val] of Object.entries(valRef.current)) {
        node.parameters.get(key)?.setValueAtTime(val, ctx.currentTime);
      }
      node.parameters.get('running')?.setValueAtTime(1, ctx.currentTime);
      node.connect(ctx.destination);
      ctxRef.current = ctx;
      nodeRef.current = node;
      setPlaying(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[SoundEditor]', err);
    }
  }, [soundId, soundType.mode, soundType.processor, soundType.worklet]);

  const handleChange = useCallback((key: string, value: number) => {
    setValues(prev => ({ ...prev, [key]: value }));
    if (nodeRef.current && ctxRef.current) {
      nodeRef.current.parameters.get(key)?.setValueAtTime(value, ctxRef.current.currentTime);
    }
  }, []);

  const handleReset = useCallback(() => {
    setValues(defaults);
    if (nodeRef.current && ctxRef.current) {
      for (const [key, val] of Object.entries(defaults)) {
        nodeRef.current.parameters.get(key)?.setValueAtTime(val, ctxRef.current.currentTime);
      }
    }
  }, [defaults]);

  useEffect(() => () => { nodeRef.current?.disconnect(); }, []);

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
        {soundType.mode === 'worklet' && (
          <button
            type="button"
            className={`sb-play-btn${playing ? ' active' : ''}`}
            onClick={playing ? stopSound : startSound}
          >
            <span className="material-symbols-rounded">{playing ? 'stop' : 'play_arrow'}</span>
            {playing ? 'stop' : `play ${soundType.label.toLowerCase()}`}
          </button>
        )}
        <button type="button" className="sb-reset-btn" onClick={handleReset}>
          <span className="material-symbols-rounded">restart_alt</span>
          reset
        </button>
      </div>

      {error && <div className="sb-error">{error}</div>}

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
