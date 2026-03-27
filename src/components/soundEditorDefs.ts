export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  fmt: (v: number) => string;
}

export interface ParamGroup {
  label: string;
  params: ParamDef[];
}

export interface SoundEditorModel {
  label: string;
  mode: 'worklet' | 'simple';
  worklet?: string;
  processor?: string;
  groups: ParamGroup[];
}

export const FIRE_PARAM_GROUPS: { label: string; params: ParamDef[] }[] = [
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

export const BIRDSONG_PARAM_GROUPS: { label: string; params: ParamDef[] }[] = [
  {
    label: 'Calls',
    params: [
      { key: 'callRate',    label: 'Call Density',  min: 0.1, max: 8,   step: 0.1,  def: 2.0,  fmt: v => v.toFixed(1) },
      { key: 'callPitch',   label: 'Call Pitch',    min: 0,   max: 1,   step: 0.01, def: 0.50, fmt: v => v.toFixed(2) },
      { key: 'callVol',     label: 'Call Volume',   min: 0,   max: 1,   step: 0.01, def: 0.55, fmt: v => v.toFixed(2) },
      { key: 'callVariety', label: 'Pitch Variety', min: 0,   max: 1,   step: 0.01, def: 0.50, fmt: v => v.toFixed(2) },
    ],
  },
  {
    label: 'Trills',
    params: [
      { key: 'trillRate',  label: 'Trill Density', min: 0,   max: 1,   step: 0.01, def: 0.30, fmt: v => v.toFixed(2) },
      { key: 'trillPitch', label: 'Trill Pitch',   min: 0,   max: 1,   step: 0.01, def: 0.50, fmt: v => v.toFixed(2) },
      { key: 'trillVol',   label: 'Trill Volume',  min: 0,   max: 1,   step: 0.01, def: 0.30, fmt: v => v.toFixed(2) },
      { key: 'trillSpeed', label: 'Warble Speed',  min: 0,   max: 1,   step: 0.01, def: 0.50, fmt: v => v.toFixed(2) },
    ],
  },
  {
    label: 'Peeps & Master',
    params: [
      { key: 'peepRate', label: 'Peep Density', min: 0,   max: 1,   step: 0.01, def: 0.50, fmt: v => v.toFixed(2) },
      { key: 'peepVol',  label: 'Peep Volume',  min: 0,   max: 0.5, step: 0.01, def: 0.15, fmt: v => v.toFixed(2) },
      { key: 'gain',     label: 'Output Gain',  min: 0,   max: 2,   step: 0.01, def: 0.62, fmt: v => v.toFixed(2) },
    ],
  },
];

const fmt01 = (v: number) => v.toFixed(2);

function simplePair(first: { key: string; label: string; def: number }, second: { key: string; label: string; def: number }): ParamGroup[] {
  return [{
    label: 'Quick Tune',
    params: [
      { key: first.key, label: first.label, min: 0, max: 1, step: 0.01, def: first.def, fmt: fmt01 },
      { key: second.key, label: second.label, min: 0, max: 1, step: 0.01, def: second.def, fmt: fmt01 },
    ],
  }];
}

export const SOUND_EDITOR_MODELS: Record<string, SoundEditorModel> = {
  fire: {
    label: 'Fire',
    mode: 'worklet',
    worklet: 'fire.worklet.js',
    processor: 'fire-synth',
    groups: FIRE_PARAM_GROUPS,
  },
  birdsong: {
    label: 'Birdsong',
    mode: 'worklet',
    worklet: 'birdsong.worklet.js',
    processor: 'birdsong-synth',
    groups: BIRDSONG_PARAM_GROUPS,
  },
  rain: { label: 'Rain', mode: 'simple', groups: simplePair({ key: 'density', label: 'Density', def: 0.68 }, { key: 'softness', label: 'Softness', def: 0.62 }) },
  ocean: { label: 'Ocean', mode: 'simple', groups: simplePair({ key: 'waveSize', label: 'Wave Size', def: 0.58 }, { key: 'foam', label: 'Foam', def: 0.47 }) },
  wind: { label: 'Wind', mode: 'simple', groups: simplePair({ key: 'gusts', label: 'Gusts', def: 0.52 }, { key: 'airTone', label: 'Air Tone', def: 0.46 }) },
  forest: { label: 'Forest', mode: 'simple', groups: simplePair({ key: 'leaves', label: 'Leaves', def: 0.64 }, { key: 'twigs', label: 'Twigs', def: 0.33 }) },
  stream: { label: 'Stream', mode: 'simple', groups: simplePair({ key: 'flow', label: 'Flow', def: 0.58 }, { key: 'sparkle', label: 'Sparkle', def: 0.44 }) },
  fan: { label: 'Fan', mode: 'simple', groups: simplePair({ key: 'speed', label: 'Speed', def: 0.49 }, { key: 'hum', label: 'Hum', def: 0.41 }) },
  thunder: { label: 'Thunder', mode: 'simple', groups: simplePair({ key: 'storm', label: 'Storm Depth', def: 0.63 }, { key: 'presence', label: 'Presence', def: 0.39 }) },
  train: { label: 'Train', mode: 'simple', groups: simplePair({ key: 'pace', label: 'Pace', def: 0.52 }, { key: 'metal', label: 'Metal Texture', def: 0.36 }) },
  night: { label: 'Night', mode: 'simple', groups: simplePair({ key: 'crickets', label: 'Crickets', def: 0.46 }, { key: 'hush', label: 'Night Hush', def: 0.58 }) },
  'white-noise': { label: 'White Noise', mode: 'simple', groups: simplePair({ key: 'brightness', label: 'Brightness', def: 0.54 }, { key: 'air', label: 'Air', def: 0.36 }) },
  'pink-noise': { label: 'Pink Noise', mode: 'simple', groups: simplePair({ key: 'warmth', label: 'Warmth', def: 0.61 }, { key: 'focus', label: 'Focus', def: 0.43 }) },
  'brown-noise': { label: 'Brown Noise', mode: 'simple', groups: simplePair({ key: 'depth', label: 'Depth', def: 0.72 }, { key: 'rumble', label: 'Rumble', def: 0.38 }) },
};

export const EDITABLE_SOUND_IDS = Object.keys(SOUND_EDITOR_MODELS);
