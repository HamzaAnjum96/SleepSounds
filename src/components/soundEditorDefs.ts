export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
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

const FIRE_PARAM_GROUPS: ParamGroup[] = [
  {
    label: 'character',
    params: [
      { key: 'intensity',   label: 'intensity',     min: 0, max: 1, step: 0.01, def: 0.39 },
      { key: 'dryness',     label: 'dryness',       min: 0, max: 1, step: 0.01, def: 0.47 },
      { key: 'crackleBias', label: 'crackle bias',  min: 0, max: 1, step: 0.01, def: 1.0 },
      { key: 'size',        label: 'fire size',     min: 0, max: 1, step: 0.01, def: 1.0 },
      { key: 'distance',    label: 'distance',      min: 0, max: 1, step: 0.01, def: 0.54 },
      { key: 'wind',        label: 'wind',          min: 0, max: 1, step: 0.01, def: 0.5 },
    ],
  },
  {
    label: 'roar',
    params: [
      { key: 'bodyVol',   label: 'roar volume',     min: 0,        max: 2,      step: 0.05,     def: 1.4 },
      { key: 'bodyLp',    label: 'roar brightness', min: 0.001,    max: 0.05,   step: 0.001,    def: 0.007 },
      { key: 'roarMean',  label: 'roar level',      min: 0,        max: 1,      step: 0.01,     def: 0.81 },
      { key: 'roarSpeed', label: 'roll speed',      min: 0.000005, max: 0.0002, step: 0.000005, def: 0.00005 },
      { key: 'roarSigma', label: 'roar variation',  min: 0,        max: 0.005,  step: 0.0001,   def: 0.0015 },
    ],
  },
  {
    label: 'balance',
    params: [
      { key: 'crackleBase', label: 'crackle rate',   min: 0, max: 15, step: 0.5,  def: 13.5 },
      { key: 'crackleVol',  label: 'crackle volume', min: 0, max: 6,  step: 0.1,  def: 5.4 },
      { key: 'popVol',      label: 'pop volume',     min: 0, max: 3,  step: 0.05, def: 1.35 },
    ],
  },
];

const BIRDSONG_PARAM_GROUPS: ParamGroup[] = [
  {
    label: 'calls',
    params: [
      { key: 'callRate',    label: 'call density',  min: 0.1, max: 8, step: 0.1,  def: 2.0 },
      { key: 'callPitch',   label: 'call pitch',    min: 0,   max: 1, step: 0.01, def: 0.50 },
      { key: 'callVol',     label: 'call volume',   min: 0,   max: 1, step: 0.01, def: 1.0  },
      { key: 'callVariety', label: 'pitch variety', min: 0,   max: 1, step: 0.01, def: 0.50 },
    ],
  },
  {
    label: 'trills',
    params: [
      { key: 'trillRate',  label: 'trill density', min: 0, max: 1, step: 0.01, def: 0.30 },
      { key: 'trillPitch', label: 'trill pitch',   min: 0, max: 1, step: 0.01, def: 0.50 },
      { key: 'trillVol',   label: 'trill volume',  min: 0, max: 1, step: 0.01, def: 1.0  },
      { key: 'trillSpeed', label: 'warble speed',  min: 0, max: 1, step: 0.01, def: 0.50 },
    ],
  },
  {
    label: 'peeps & level',
    params: [
      { key: 'peepRate', label: 'peep density', min: 0, max: 1,   step: 0.01, def: 0.50 },
      { key: 'peepVol',  label: 'peep volume',  min: 0, max: 0.5, step: 0.01, def: 0.5  },
      { key: 'gain',     label: 'level',        min: 0, max: 2,   step: 0.01, def: 0.62 },
    ],
  },
];

function simpleGroup(
  first: { key: string; label: string; def: number },
  second: { key: string; label: string; def: number },
  third: { key: string; label: string; def: number },
): ParamGroup[] {
  return [{
    label: 'shape',
    params: [
      { key: first.key, label: first.label, min: 0, max: 1, step: 0.01, def: first.def },
      { key: second.key, label: second.label, min: 0, max: 1, step: 0.01, def: second.def },
      { key: third.key, label: third.label, min: 0, max: 1, step: 0.01, def: third.def },
    ],
  }];
}

/** A shape group with an arbitrary number of 0..1 sliders. */
function shapeGroup(...items: { key: string; label: string; def: number }[]): ParamGroup[] {
  return [{
    label: 'shape',
    params: items.map((it) => ({ key: it.key, label: it.label, min: 0, max: 1, step: 0.01, def: it.def })),
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
  rain: { label: 'Rain', mode: 'simple', groups: shapeGroup(
    { key: 'intensity', label: 'intensity', def: 0.65 },
    { key: 'heaviness', label: 'heaviness', def: 0.50 },
    { key: 'surface', label: 'surface', def: 0.50 },
    { key: 'swell', label: 'swell', def: 0.15 },
  )},
  ocean: { label: 'Ocean', mode: 'simple', groups: simpleGroup(
    { key: 'waveSize', label: 'wave size', def: 0.55 },
    { key: 'foam', label: 'foam', def: 0.50 },
    { key: 'depth', label: 'depth', def: 0.50 },
  )},
  wind: { label: 'Wind', mode: 'simple', groups: simpleGroup(
    { key: 'gusts', label: 'gusts', def: 0.50 },
    { key: 'whistle', label: 'whistle', def: 0.30 },
    { key: 'tone', label: 'tone', def: 0.50 },
  )},
  forest: { label: 'Windy Forest', mode: 'simple', groups: simpleGroup(
    { key: 'leaves', label: 'leaf rustle', def: 0.70 },
    { key: 'twigs', label: 'branch detail', def: 0.35 },
    { key: 'breeze', label: 'wind speed', def: 0.50 },
  )},
  stream: { label: 'Stream', mode: 'simple', groups: simpleGroup(
    { key: 'flow', label: 'flow', def: 0.60 },
    { key: 'sparkle', label: 'sparkle', def: 0.45 },
    { key: 'depth', label: 'depth', def: 0.50 },
  )},
  thunder: { label: 'Thunder', mode: 'simple', groups: simpleGroup(
    { key: 'stormIntensity', label: 'storm intensity', def: 0.50 },
    { key: 'rumble', label: 'rumble', def: 0.60 },
    { key: 'distance', label: 'distance', def: 0.40 },
  )},
  fan: { label: 'Fan', mode: 'simple', groups: simpleGroup(
    { key: 'speed', label: 'speed', def: 0.10 },
    { key: 'hum', label: 'hum', def: 0.40 },
    { key: 'airflow', label: 'airflow', def: 0.60 },
  )},
  train: { label: 'Train', mode: 'simple', groups: simpleGroup(
    { key: 'speed', label: 'speed', def: 0.50 },
    { key: 'rumble', label: 'rumble', def: 0.50 },
    { key: 'clatter', label: 'clatter', def: 0.35 },
  )},
  night: { label: 'Night Insects', mode: 'simple', groups: shapeGroup(
    { key: 'cosmic', label: 'shimmer', def: 0.40 },
    { key: 'pulse', label: 'drift', def: 0.30 },
  )},
  'white-noise': { label: 'White Noise', mode: 'simple', groups: simpleGroup(
    { key: 'brightness', label: 'brightness', def: 0.55 },
    { key: 'depth', label: 'depth', def: 0.50 },
    { key: 'texture', label: 'texture', def: 0.40 },
  )},
  'pink-noise': { label: 'Pink Noise', mode: 'simple', groups: simpleGroup(
    { key: 'warmth', label: 'warmth', def: 0.60 },
    { key: 'focus', label: 'focus', def: 0.45 },
    { key: 'air', label: 'air', def: 0.40 },
  )},
  'brown-noise': { label: 'Brown Noise', mode: 'simple', groups: simpleGroup(
    { key: 'depth', label: 'depth', def: 0.70 },
    { key: 'rumble', label: 'rumble', def: 0.40 },
    { key: 'smoothness', label: 'smoothness', def: 0.50 },
  )},
  underwater: { label: 'Underwater', mode: 'simple', groups: simpleGroup(
    { key: 'depth', label: 'depth', def: 0.60 },
    { key: 'bubbles', label: 'bubbles', def: 0.40 },
    { key: 'current', label: 'current', def: 0.50 },
  )},
  shower: { label: 'Shower', mode: 'simple', groups: simpleGroup(
    { key: 'pressure', label: 'pressure', def: 0.60 },
    { key: 'steam', label: 'steam', def: 0.30 },
    { key: 'room', label: 'room', def: 0.50 },
  )},
  airplane: { label: 'Airplane', mode: 'simple', groups: simpleGroup(
    { key: 'altitude', label: 'altitude', def: 0.50 },
    { key: 'cabin', label: 'cabin', def: 0.60 },
    { key: 'turbulence', label: 'turbulence', def: 0.30 },
  )},
  heartbeat: { label: 'Heartbeat', mode: 'simple', groups: simpleGroup(
    { key: 'rate', label: 'rate', def: 0.50 },
    { key: 'chest', label: 'chest', def: 0.60 },
    { key: 'muffle', label: 'muffle', def: 0.50 },
  )},
};

export const EDITABLE_SOUND_IDS = Object.keys(SOUND_EDITOR_MODELS);
