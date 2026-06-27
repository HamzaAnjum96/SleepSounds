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

/** A named character preset for a sound: the chips shown above the sliders.
 *  `values` is a partial override of the param defaults. Exactly one variant per
 *  sound carries `{}` — the default character, selected when the editor opens. */
export interface SoundVariant {
  name: string;
  values: Record<string, number>;
}

export interface SoundEditorModel {
  label: string;
  mode: 'worklet' | 'simple';
  worklet?: string;
  processor?: string;
  groups: ParamGroup[];
  /** Character presets (evocative names). The editor leads with these; the
   *  sliders sit behind a "fine-tune" disclosure. */
  variants?: SoundVariant[];
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

/** Compact variant table: `vlist(['Steady', {}], ['Drizzle', { intensity: 0.3 }])`.
 *  Exactly one entry should be `{}` (the default character). */
function vlist(...items: [string, Record<string, number>][]): SoundVariant[] {
  return items.map(([name, values]) => ({ name, values }));
}

export const SOUND_EDITOR_MODELS: Record<string, SoundEditorModel> = {
  fire: {
    label: 'Fire',
    mode: 'worklet',
    worklet: 'fire.worklet.js',
    processor: 'fire-synth',
    groups: FIRE_PARAM_GROUPS,
    variants: vlist(
      ['Campfire', {}],
      ['Embers',    { intensity: 0.20, size: 0.55, crackleBase: 8,  crackleVol: 3.5, popVol: 0.6, bodyVol: 0.9, roarMean: 0.5 }],
      ['Hearth',    { intensity: 0.42, size: 0.80, distance: 0.40, crackleBase: 12, crackleVol: 5.0, bodyVol: 1.2 }],
      ['Bonfire',   { intensity: 0.70, size: 1.0,  distance: 0.70, bodyVol: 1.8, roarMean: 0.95, crackleBase: 15, popVol: 2.0 }],
      ['Crackling', { crackleBase: 15, crackleVol: 6, popVol: 2.4, bodyVol: 0.9, roarMean: 0.55, dryness: 0.80 }],
    ),
  },
  birdsong: {
    label: 'Birdsong',
    mode: 'worklet',
    worklet: 'birdsong.worklet.js',
    processor: 'birdsong-synth',
    groups: BIRDSONG_PARAM_GROUPS,
    variants: vlist(
      ['Distant',     { callRate: 1.0, callVol: 0.7, trillRate: 0.15, trillVol: 0.6, peepRate: 0.3, peepVol: 0.3, gain: 0.45 }],
      ['Garden', {}],
      ['Dawn Chorus', { callRate: 4.5, callVariety: 0.7, trillRate: 0.6, trillVol: 1.0, peepRate: 0.7, gain: 0.78 }],
    ),
  },
  rain: { label: 'Rain', mode: 'simple', groups: [
    {
      label: 'rainfall',
      params: [
        { key: 'intensity', label: 'intensity',  min: 0, max: 1, step: 0.01, def: 0.65 },
        { key: 'heaviness', label: 'heaviness',  min: 0, max: 1, step: 0.01, def: 0.50 },
        { key: 'surface',   label: 'surface',    min: 0, max: 1, step: 0.01, def: 0.50 },
        { key: 'bed',       label: 'background',  min: 0, max: 1, step: 0.01, def: 1.00 },
      ],
    },
    {
      label: 'character',
      params: [
        { key: 'drops',    label: 'drops',     min: 0, max: 1, step: 0.01, def: 0.25 },
        { key: 'movement', label: 'movement',  min: 0, max: 1, step: 0.01, def: 0.40 },
        { key: 'space',    label: 'space',     min: 0, max: 1, step: 0.01, def: 0.30 },
      ],
    },
  ], variants: vlist(
    ['Drizzle',     { intensity: 0.32, heaviness: 0.30, surface: 0.55, bed: 0.85, drops: 0.18, movement: 0.30 }],
    ['Steady', {}],
    ['Downpour',    { intensity: 0.92, heaviness: 0.72, surface: 0.42, drops: 0.30, movement: 0.55, space: 0.35 }],
    ['On a Roof',   { surface: 0.18, drops: 0.40, intensity: 0.60, heaviness: 0.55, bed: 0.80, space: 0.45 }],
    ['At a Window', { surface: 0.62, space: 0.62, drops: 0.45, bed: 0.68, intensity: 0.50, heaviness: 0.45 }],
  ) },
  ocean: { label: 'Ocean', mode: 'simple', groups: simpleGroup(
    { key: 'waveSize', label: 'wave size', def: 0.55 },
    { key: 'foam', label: 'foam', def: 0.50 },
    { key: 'depth', label: 'depth', def: 0.50 },
  ), variants: vlist(
    ['Calm Shore',    { waveSize: 0.30, foam: 0.35, depth: 0.40 }],
    ['Rolling Waves', {}],
    ['Storm Surf',    { waveSize: 0.85, foam: 0.75, depth: 0.70 }],
  )},
  wind: { label: 'Wind', mode: 'simple', groups: simpleGroup(
    { key: 'gusts', label: 'gusts', def: 0.50 },
    { key: 'whistle', label: 'whistle', def: 0.30 },
    { key: 'tone', label: 'tone', def: 0.50 },
  ), variants: vlist(
    ['Breeze',       { gusts: 0.25, whistle: 0.15, tone: 0.45 }],
    ['Gusty', {}],
    ['Howling Gale', { gusts: 0.85, whistle: 0.60, tone: 0.60 }],
  )},
  forest: { label: 'Windy Forest', mode: 'simple', groups: simpleGroup(
    { key: 'leaves', label: 'leaf rustle', def: 0.70 },
    { key: 'twigs', label: 'branch detail', def: 0.35 },
    { key: 'breeze', label: 'wind speed', def: 0.50 },
  ), variants: vlist(
    ['Light Rustle',       { leaves: 0.45, twigs: 0.20, breeze: 0.30 }],
    ['Breezy Canopy', {}],
    ['Storm in the Trees', { leaves: 0.90, twigs: 0.60, breeze: 0.80 }],
  )},
  stream: { label: 'Stream', mode: 'simple', groups: simpleGroup(
    { key: 'flow', label: 'flow', def: 0.60 },
    { key: 'sparkle', label: 'sparkle', def: 0.45 },
    { key: 'depth', label: 'depth', def: 0.50 },
  ), variants: vlist(
    ['Trickle',        { flow: 0.30, sparkle: 0.30, depth: 0.35 }],
    ['Babbling Brook', {}],
    ['Rushing Creek',  { flow: 0.85, sparkle: 0.60, depth: 0.65 }],
  )},
  thunder: { label: 'Thunder', mode: 'simple', groups: simpleGroup(
    { key: 'stormIntensity', label: 'storm intensity', def: 0.50 },
    { key: 'rumble', label: 'rumble', def: 0.60 },
    { key: 'distance', label: 'distance', def: 0.40 },
  ), variants: vlist(
    ['Far Off',       { stormIntensity: 0.30, rumble: 0.50, distance: 0.75 }],
    ['Rolling Storm', {}],
    ['Overhead',      { stormIntensity: 0.80, rumble: 0.75, distance: 0.15 }],
  )},
  fan: { label: 'Fan', mode: 'simple', groups: shapeGroup(
    { key: 'speed', label: 'speed', def: 0.10 },
    { key: 'hum', label: 'hum', def: 0.40 },
    { key: 'airflow', label: 'airflow', def: 0.60 },
    { key: 'size', label: 'fan size', def: 0.20 },
  ), variants: vlist(
    ['Low Hum',    { speed: 0.05, hum: 0.55, airflow: 0.40, size: 0.20 }],
    ['Steady', {}],
    ['High Speed', { speed: 0.40, hum: 0.30, airflow: 0.85, size: 0.35 }],
  )},
  train: { label: 'Train', mode: 'simple', groups: simpleGroup(
    { key: 'speed', label: 'speed', def: 0.50 },
    { key: 'rumble', label: 'rumble', def: 0.50 },
    { key: 'clatter', label: 'clatter', def: 0.35 },
  ), variants: vlist(
    ['Distant Rails',   { speed: 0.30, rumble: 0.40, clatter: 0.20 }],
    ['Steady Carriage', {}],
    ['Fast Express',    { speed: 0.80, rumble: 0.60, clatter: 0.60 }],
  )},
  night: { label: 'Night Insects', mode: 'simple', groups: shapeGroup(
    { key: 'cosmic', label: 'shimmer', def: 0.40 },
    { key: 'pulse', label: 'drift', def: 0.30 },
  ), variants: vlist(
    ['Still',        { cosmic: 0.20, pulse: 0.15 }],
    ['Summer Night', {}],
    ['Deep Drift',   { cosmic: 0.60, pulse: 0.55 }],
  )},
  'white-noise': { label: 'White Noise', mode: 'simple', groups: simpleGroup(
    { key: 'brightness', label: 'brightness', def: 0.55 },
    { key: 'depth', label: 'depth', def: 0.50 },
    { key: 'texture', label: 'texture', def: 0.40 },
  ), variants: vlist(
    ['Soft',     { brightness: 0.35, depth: 0.60, texture: 0.30 }],
    ['Balanced', {}],
    ['Bright',   { brightness: 0.80, depth: 0.40, texture: 0.55 }],
  )},
  'pink-noise': { label: 'Pink Noise', mode: 'simple', groups: simpleGroup(
    { key: 'warmth', label: 'warmth', def: 0.60 },
    { key: 'focus', label: 'focus', def: 0.45 },
    { key: 'air', label: 'air', def: 0.40 },
  ), variants: vlist(
    ['Warm',     { warmth: 0.80, focus: 0.35, air: 0.25 }],
    ['Balanced', {}],
    ['Airy',     { warmth: 0.45, focus: 0.55, air: 0.70 }],
  )},
  'brown-noise': { label: 'Brown Noise', mode: 'simple', groups: simpleGroup(
    { key: 'depth', label: 'depth', def: 0.70 },
    { key: 'rumble', label: 'rumble', def: 0.40 },
    { key: 'smoothness', label: 'smoothness', def: 0.50 },
  ), variants: vlist(
    ['Smooth',  { depth: 0.60, rumble: 0.25, smoothness: 0.75 }],
    ['Rolling', {}],
    ['Deep',    { depth: 0.90, rumble: 0.60, smoothness: 0.40 }],
  )},
  underwater: { label: 'Underwater', mode: 'simple', groups: simpleGroup(
    { key: 'depth', label: 'depth', def: 0.60 },
    { key: 'bubbles', label: 'bubbles', def: 0.40 },
    { key: 'current', label: 'current', def: 0.50 },
  ), variants: vlist(
    ['Still Depths',    { depth: 0.70, bubbles: 0.20, current: 0.30 }],
    ['Gentle Current', {}],
    ['Deep Sea',        { depth: 0.90, bubbles: 0.55, current: 0.70 }],
  )},
  shower: { label: 'Shower', mode: 'simple', groups: simpleGroup(
    { key: 'pressure', label: 'pressure', def: 0.60 },
    { key: 'steam', label: 'steam', def: 0.30 },
    { key: 'room', label: 'room', def: 0.50 },
  ), variants: vlist(
    ['Gentle',   { pressure: 0.35, steam: 0.40, room: 0.45 }],
    ['Steady', {}],
    ['Powerful', { pressure: 0.90, steam: 0.25, room: 0.60 }],
  )},
  airplane: { label: 'Airplane', mode: 'simple', groups: simpleGroup(
    { key: 'altitude', label: 'altitude', def: 0.50 },
    { key: 'cabin', label: 'cabin', def: 0.60 },
    { key: 'turbulence', label: 'turbulence', def: 0.30 },
  ), variants: vlist(
    ['Cruise', {}],
    ['Cabin',     { altitude: 0.40, cabin: 0.80, turbulence: 0.20 }],
    ['Turbulent', { altitude: 0.60, cabin: 0.55, turbulence: 0.70 }],
  )},
  heartbeat: { label: 'Heartbeat', mode: 'simple', groups: simpleGroup(
    { key: 'rate', label: 'rate', def: 0.50 },
    { key: 'chest', label: 'chest', def: 0.60 },
    { key: 'muffle', label: 'muffle', def: 0.50 },
  ), variants: vlist(
    ['Resting', {}],
    ['Calm', { rate: 0.35, chest: 0.60, muffle: 0.55 }],
    ['Deep', { rate: 0.45, chest: 0.85, muffle: 0.70 }],
  )},
};

export const EDITABLE_SOUND_IDS = Object.keys(SOUND_EDITOR_MODELS);
