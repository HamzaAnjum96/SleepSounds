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

function simpleGroup(
  first: { key: string; label: string; def: number },
  second: { key: string; label: string; def: number },
  third: { key: string; label: string; def: number },
): ParamGroup[] {
  return [{
    label: 'Tune',
    params: [
      { key: first.key, label: first.label, min: 0, max: 1, step: 0.01, def: first.def, fmt: fmt01 },
      { key: second.key, label: second.label, min: 0, max: 1, step: 0.01, def: second.def, fmt: fmt01 },
      { key: third.key, label: third.label, min: 0, max: 1, step: 0.01, def: third.def, fmt: fmt01 },
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
  // Existing sounds - upgraded to 3 sliders
  rain: { label: 'Rain', mode: 'simple', groups: simpleGroup(
    { key: 'intensity', label: 'Intensity', def: 0.65 },
    { key: 'heaviness', label: 'Heaviness', def: 0.50 },
    { key: 'surface', label: 'Surface', def: 0.50 },
  )},
  ocean: { label: 'Ocean', mode: 'simple', groups: simpleGroup(
    { key: 'waveSize', label: 'Wave Size', def: 0.55 },
    { key: 'foam', label: 'Foam', def: 0.50 },
    { key: 'depth', label: 'Depth', def: 0.50 },
  )},
  wind: { label: 'Wind', mode: 'simple', groups: simpleGroup(
    { key: 'gusts', label: 'Gusts', def: 0.50 },
    { key: 'whistle', label: 'Whistle', def: 0.30 },
    { key: 'tone', label: 'Tone', def: 0.50 },
  )},
  forest: { label: 'Forest', mode: 'simple', groups: simpleGroup(
    { key: 'leaves', label: 'Leaves', def: 0.70 },
    { key: 'twigs', label: 'Twigs', def: 0.35 },
    { key: 'breeze', label: 'Breeze', def: 0.50 },
  )},
  stream: { label: 'Stream', mode: 'simple', groups: simpleGroup(
    { key: 'flow', label: 'Flow', def: 0.60 },
    { key: 'sparkle', label: 'Sparkle', def: 0.45 },
    { key: 'depth', label: 'Depth', def: 0.50 },
  )},
  thunder: { label: 'Thunder', mode: 'simple', groups: simpleGroup(
    { key: 'stormIntensity', label: 'Storm Intensity', def: 0.50 },
    { key: 'rumble', label: 'Rumble', def: 0.60 },
    { key: 'distance', label: 'Distance', def: 0.40 },
  )},
  fan: { label: 'Fan', mode: 'simple', groups: simpleGroup(
    { key: 'speed', label: 'Speed', def: 0.50 },
    { key: 'hum', label: 'Hum', def: 0.40 },
    { key: 'airflow', label: 'Airflow', def: 0.60 },
  )},
  train: { label: 'Train', mode: 'simple', groups: simpleGroup(
    { key: 'speed', label: 'Speed', def: 0.50 },
    { key: 'rumble', label: 'Rumble', def: 0.50 },
    { key: 'clatter', label: 'Clatter', def: 0.35 },
  )},
  night: { label: 'Night', mode: 'simple', groups: simpleGroup(
    { key: 'crickets', label: 'Crickets', def: 0.50 },
    { key: 'depth', label: 'Depth', def: 0.50 },
    { key: 'rustling', label: 'Rustling', def: 0.40 },
  )},
  'white-noise': { label: 'White Noise', mode: 'simple', groups: simpleGroup(
    { key: 'brightness', label: 'Brightness', def: 0.55 },
    { key: 'depth', label: 'Depth', def: 0.50 },
    { key: 'texture', label: 'Texture', def: 0.40 },
  )},
  'pink-noise': { label: 'Pink Noise', mode: 'simple', groups: simpleGroup(
    { key: 'warmth', label: 'Warmth', def: 0.60 },
    { key: 'focus', label: 'Focus', def: 0.45 },
    { key: 'air', label: 'Air', def: 0.40 },
  )},
  'brown-noise': { label: 'Brown Noise', mode: 'simple', groups: simpleGroup(
    { key: 'depth', label: 'Depth', def: 0.70 },
    { key: 'rumble', label: 'Rumble', def: 0.40 },
    { key: 'smoothness', label: 'Smoothness', def: 0.50 },
  )},

  // New sounds
  waterfall: { label: 'Waterfall', mode: 'simple', groups: simpleGroup(
    { key: 'power', label: 'Power', def: 0.60 },
    { key: 'mist', label: 'Mist', def: 0.40 },
    { key: 'distance', label: 'Distance', def: 0.30 },
  )},
  'tent-rain': { label: 'Tent Rain', mode: 'simple', groups: simpleGroup(
    { key: 'intensity', label: 'Intensity', def: 0.60 },
    { key: 'fabric', label: 'Fabric', def: 0.50 },
    { key: 'wind', label: 'Wind', def: 0.30 },
  )},
  'tin-roof-rain': { label: 'Tin Roof Rain', mode: 'simple', groups: simpleGroup(
    { key: 'intensity', label: 'Intensity', def: 0.60 },
    { key: 'metallic', label: 'Metallic', def: 0.50 },
    { key: 'gutters', label: 'Gutters', def: 0.40 },
  )},
  underwater: { label: 'Underwater', mode: 'simple', groups: simpleGroup(
    { key: 'depth', label: 'Depth', def: 0.60 },
    { key: 'bubbles', label: 'Bubbles', def: 0.40 },
    { key: 'current', label: 'Current', def: 0.50 },
  )},
  shower: { label: 'Shower', mode: 'simple', groups: simpleGroup(
    { key: 'pressure', label: 'Pressure', def: 0.60 },
    { key: 'steam', label: 'Steam', def: 0.30 },
    { key: 'room', label: 'Room', def: 0.50 },
  )},
  frogs: { label: 'Frogs', mode: 'simple', groups: simpleGroup(
    { key: 'chorus', label: 'Chorus', def: 0.50 },
    { key: 'pitch', label: 'Pitch', def: 0.50 },
    { key: 'swamp', label: 'Swamp', def: 0.40 },
  )},
  cafe: { label: 'Café', mode: 'simple', groups: simpleGroup(
    { key: 'crowd', label: 'Crowd', def: 0.60 },
    { key: 'clinks', label: 'Clinks', def: 0.30 },
    { key: 'warmth', label: 'Warmth', def: 0.50 },
  )},
  airplane: { label: 'Airplane', mode: 'simple', groups: simpleGroup(
    { key: 'altitude', label: 'Altitude', def: 0.50 },
    { key: 'cabin', label: 'Cabin', def: 0.60 },
    { key: 'turbulence', label: 'Turbulence', def: 0.30 },
  )},
  dryer: { label: 'Dryer', mode: 'simple', groups: simpleGroup(
    { key: 'speed', label: 'Speed', def: 0.50 },
    { key: 'hum', label: 'Hum', def: 0.50 },
    { key: 'tumble', label: 'Tumble', def: 0.40 },
  )},
  space: { label: 'Deep Space', mode: 'simple', groups: simpleGroup(
    { key: 'void', label: 'Void', def: 0.60 },
    { key: 'cosmic', label: 'Cosmic', def: 0.40 },
    { key: 'pulse', label: 'Pulse', def: 0.30 },
  )},
  heartbeat: { label: 'Heartbeat', mode: 'simple', groups: simpleGroup(
    { key: 'rate', label: 'Rate', def: 0.50 },
    { key: 'chest', label: 'Chest', def: 0.60 },
    { key: 'muffle', label: 'Muffle', def: 0.50 },
  )},
};

export const EDITABLE_SOUND_IDS = Object.keys(SOUND_EDITOR_MODELS);
