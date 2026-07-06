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
 *  sound carries `{}` — the default character, selected when the editor opens.
 *  `icon` is a presentation-only mark token (see `lib/variantIcons`); when
 *  omitted the chip shows an intensity bar by position. The name stays the code
 *  identity and the visible/accessible label. */
export interface SoundVariant {
  name: string;
  values: Record<string, number>;
  icon?: string;
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
  /** When set, the editor shows only the variant chips — no fine-tune
   *  disclosure and no sliders. The `groups` still exist (so the played params,
   *  WAV fallback, reset, and chip-selection logic keep their defaults), they're
   *  just never rendered. Used for sounds that are intentionally chip-only. */
  variantsOnly?: boolean;
}

// Defaults are the "Crackling" character — dry kindling with rapid, prominent
// pops and crackle over a thin roar — so it's the fire everywhere a default is
// used (the opened editor, a tapped Fire, Reset, the WAV fallback, presets that
// don't tune fire). The Campfire variant carries the old steady-fire values.
const FIRE_PARAM_GROUPS: ParamGroup[] = [
  {
    label: 'character',
    params: [
      { key: 'intensity',   label: 'intensity',     min: 0, max: 1, step: 0.01, def: 0.30 },
      { key: 'dryness',     label: 'dryness',       min: 0, max: 1, step: 0.01, def: 0.80 },
      { key: 'crackleBias', label: 'crackle bias',  min: 0, max: 1, step: 0.01, def: 0.65 },
      { key: 'size',        label: 'fire size',     min: 0, max: 1, step: 0.01, def: 0.65 },
      { key: 'distance',    label: 'distance',      min: 0, max: 1, step: 0.01, def: 0.58 },
      { key: 'wind',        label: 'wind',          min: 0, max: 1, step: 0.01, def: 0.22 },
    ],
  },
  {
    label: 'roar',
    params: [
      { key: 'bodyVol',   label: 'roar volume',     min: 0,        max: 2,      step: 0.05,     def: 0.46 },
      { key: 'bodyLp',    label: 'roar brightness', min: 0.001,    max: 0.05,   step: 0.001,    def: 0.007 },
      { key: 'roarMean',  label: 'roar level',      min: 0,        max: 1,      step: 0.01,     def: 0.55 },
      { key: 'roarSpeed', label: 'roll speed',      min: 0.000005, max: 0.0002, step: 0.000005, def: 0.00005 },
      { key: 'roarSigma', label: 'roar variation',  min: 0,        max: 0.005,  step: 0.0001,   def: 0.0015 },
    ],
  },
  {
    label: 'balance',
    params: [
      { key: 'crackleBase', label: 'crackle rate',   min: 0, max: 15, step: 0.5,  def: 15 },
      { key: 'crackleVol',  label: 'crackle volume', min: 0, max: 6,  step: 0.1,  def: 6 },
      { key: 'popVol',      label: 'pop volume',     min: 0, max: 3,  step: 0.05, def: 2.4 },
      { key: 'hiss',        label: 'hiss',           min: 0, max: 1,  step: 0.01, def: 0.14 },
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
 *  Exactly one entry should be `{}` (the default character). An optional third
 *  tuple element is the chip's mark token (see `lib/variantIcons`); omit it to
 *  get an intensity bar by position (simple sounds list their variants low→high). */
function vlist(...items: ([string, Record<string, number>] | [string, Record<string, number>, string])[]): SoundVariant[] {
  return items.map(([name, values, icon]) => (icon ? { name, values, icon } : { name, values }));
}

export const SOUND_EDITOR_MODELS: Record<string, SoundEditorModel> = {
  fire: {
    label: 'Fire',
    mode: 'worklet',
    worklet: 'fire.worklet.js',
    processor: 'fire-synth',
    groups: FIRE_PARAM_GROUPS,
    // Ordered low → high energy, with the two character specials (stove,
    // crackling) last — so the marks read as a gentle ramp then two scenes.
    variants: vlist(
      // Smouldering: low roar, sparse soft crackle, a thread of sizzle.
      ['Embers',     { intensity: 0.16, size: 0.50, distance: 0.62, crackleBase: 5,  crackleVol: 2.4, popVol: 0.30, bodyVol: 0.42, roarMean: 0.45, dryness: 0.30, crackleBias: 0.45, hiss: 0.12 }, 'ember'],
      // Steady indoor fireplace — close, warm, moderate even crackle.
      ['Hearth',     { intensity: 0.40, size: 0.78, distance: 0.40, crackleBase: 11, crackleVol: 4.6, popVol: 0.80, bodyVol: 0.62, hiss: 0.16 }, 'hearth'],
      // Steady open campfire — moderate even crackle over a fuller (but still
      // restrained) roar; the old default character.
      ['Campfire',   { dryness: 0.38, bodyVol: 0.52, roarMean: 0.81, crackleBase: 9, crackleVol: 3.1, popVol: 0.55, hiss: 0.18 }, 'flame'],
      // Big open fire — frequent loud crackles and pops lead; even here the roar
      // is held well back so the fire reads as crackle, not rush.
      ['Bonfire',    { intensity: 0.72, size: 1.0,  distance: 0.70, bodyVol: 0.95, roarMean: 0.96, crackleBase: 14, crackleVol: 5.2, popVol: 2.10, dryness: 0.50, hiss: 0.10 }, 'blaze'],
      // Contained stove — dark low rumble and prominent escaping-air hiss, only
      // a few distant pops. This is the texture the report's "wood stove" wants.
      ['Wood Stove', { intensity: 0.26, size: 0.45, distance: 0.30, bodyVol: 0.68, bodyLp: 0.004, roarMean: 0.70, crackleBase: 5, crackleVol: 2.6, popVol: 0.35, dryness: 0.28, crackleBias: 0.40, hiss: 0.62 }, 'stove'],
      // Dry kindling — emphasised rapid pops and crackle over a thin roar. This
      // is the default character (its values match the group defs above).
      ['Crackling', {}, 'crackle'],
    ),
  },
  birdsong: {
    label: 'Birdsong',
    mode: 'worklet',
    worklet: 'birdsong.worklet.js',
    processor: 'birdsong-synth',
    groups: BIRDSONG_PARAM_GROUPS,
    variants: vlist(
      ['Distant',     { callRate: 1.0, callVol: 0.7, trillRate: 0.15, trillVol: 0.6, peepRate: 0.3, peepVol: 0.3, gain: 0.45 }, 'birdfar'],
      ['Garden', {}, 'birdgarden'],
      ['Dawn Chorus', { callRate: 4.5, callVariety: 0.7, trillRate: 0.6, trillVol: 1.0, peepRate: 0.7, gain: 0.78 }, 'birddawn'],
    ),
  },
  rain: { label: 'Rain', mode: 'simple', groups: [
    {
      label: 'rainfall',
      params: [
        { key: 'intensity', label: 'intensity',  min: 0, max: 1, step: 0.01, def: 0.48 },
        { key: 'heaviness', label: 'heaviness',  min: 0, max: 1, step: 0.01, def: 0.42 },
        { key: 'surface',   label: 'surface',    min: 0, max: 1, step: 0.01, def: 0.55 },
        { key: 'bed',       label: 'background',  min: 0, max: 1, step: 0.01, def: 0.62 },
      ],
    },
    {
      label: 'character',
      params: [
        { key: 'drops',    label: 'drops',     min: 0, max: 1, step: 0.01, def: 0.07 },
        { key: 'movement', label: 'movement',  min: 0, max: 1, step: 0.01, def: 0.22 },
        { key: 'space',    label: 'space',     min: 0, max: 1, step: 0.01, def: 0.18 },
        { key: 'metallic', label: 'metallic',  min: 0, max: 1, step: 0.01, def: 0 },
      ],
    },
  ], variants: vlist(
    // Open-air variants (Light Rain, Drizzle, Steady, Downpour): the drops are a
    // super-muted, soft, dull patter — rain on soft ground or a tent canvas — so
    // `drops` stays low and the hits sit under the wash. The surface variants
    // below raise `drops` to push their crisp hits forward (compensating for the
    // lower dropGain floor, so their prominence is unchanged).
    // Open-air variants first as a fine→heavy ramp (mist, then 1/2/3 drops),
    // then the three surface scenes (roof, window, tin) always grouped last.
    ['Drizzle',     { intensity: 0.32, heaviness: 0.30, surface: 0.55, bed: 0.85, drops: 0.06, movement: 0.30 }, 'mist'],
    // Very sparse, intermittent light rain — a thin wash with soft, far patter.
    ['Light Rain',  { intensity: 0.18, heaviness: 0.22, surface: 0.55, bed: 0.50, drops: 0.08, movement: 0.40, space: 0.20 }, 'drop1'],
    ['Steady', {}, 'drop2'],
    ['Downpour',    { intensity: 0.92, heaviness: 0.72, surface: 0.42, drops: 0.13, movement: 0.55, space: 0.35 }, 'drop3'],
    // Wooden roof — muffled, body-heavy taps, almost no metal ring.
    ['On a Roof',   { surface: 0.30, heaviness: 0.65, intensity: 0.62, drops: 0.55, bed: 0.80, space: 0.48, movement: 0.25, metallic: 0.05 }, 'roof'],
    // Glass — brighter taps, roomy, a touch of ring (you're indoors looking out).
    ['At a Window', { surface: 0.40, heaviness: 0.40, intensity: 0.50, drops: 0.55, bed: 0.66, space: 0.62, movement: 0.28, metallic: 0.30 }, 'window'],
    // Corrugated tin — sharp, bright, ringing pings on purpose.
    ['Tin Roof',    { surface: 0.15, heaviness: 0.42, intensity: 0.60, drops: 0.62, bed: 0.55, space: 0.40, movement: 0.30, metallic: 0.72 }, 'tin'],
  ) },
  ocean: { label: 'Ocean', mode: 'simple', groups: simpleGroup(
    { key: 'waveSize', label: 'wave size', def: 0.40 },
    { key: 'foam', label: 'crash & foam', def: 0.28 },
    { key: 'depth', label: 'undertow', def: 0.58 },
  ), variants: vlist(
    // Shore scenes, calm → wild: small quick laps, big surf heard from far
    // up the beach, the default rollers, and a heavy storm shore.
    ['Lapping Shore', { waveSize: 0.10, foam: 0.18, depth: 0.30 }, 'lap'],
    ['Distant Surf',  { waveSize: 0.65, foam: 0.06, depth: 0.85 }, 'farsurf'],
    ['Rolling Waves', {}, 'roller'],
    ['Storm Surf',    { waveSize: 0.88, foam: 0.75, depth: 0.70 }, 'stormsurf'],
  )},
  wind: { label: 'Wind', mode: 'simple', groups: simpleGroup(
    { key: 'gusts', label: 'gusts', def: 0.35 },
    { key: 'whistle', label: 'whistle', def: 0.08 },
    { key: 'tone', label: 'brightness', def: 0.40 },
  ), variants: vlist(
    // Places, not levels: a soft night airing, the default open ground, wind
    // heard whistling around a building, and a hard winter blow.
    ['Night Breeze',     { gusts: 0.22, whistle: 0.04, tone: 0.32 }, 'nightbreeze'],
    ['Open Hillside', {}, 'hillside'],
    ['Around the Eaves', { gusts: 0.55, whistle: 0.62, tone: 0.42 }, 'eaves'],
    ['Winter Gale',      { gusts: 0.85, whistle: 0.35, tone: 0.68 }, 'gale'],
  )},
  forest: { label: 'Windy Forest', mode: 'simple', groups: simpleGroup(
    { key: 'leaves', label: 'leaf rustle', def: 0.52 },
    { key: 'twigs', label: 'branch detail', def: 0.12 },
    { key: 'breeze', label: 'wind speed', def: 0.34 },
  ), variants: vlist(
    // Kinds of woods, not wind steps: trembling leaves in barely any wind,
    // the default canopy, close old-growth with creaking detail, and the
    // whole forest heaving before weather arrives.
    ['Aspen Shimmer',    { leaves: 0.72, twigs: 0.04, breeze: 0.20 }, 'aspen'],
    ['Breezy Canopy', {}, 'canopy'],
    ['Deep Woods',       { leaves: 0.42, twigs: 0.58, breeze: 0.38 }, 'deepwoods'],
    ['Before the Storm', { leaves: 0.85, twigs: 0.45, breeze: 0.85 }, 'stormtrees'],
  )},
  stream: { label: 'Stream', mode: 'simple', groups: simpleGroup(
    { key: 'flow', label: 'flow', def: 0.46 },
    { key: 'sparkle', label: 'sparkle', def: 0.22 },
    { key: 'depth', label: 'depth', def: 0.50 },
  ), variants: vlist(
    ['Trickle',        { flow: 0.30, sparkle: 0.30, depth: 0.35 }, 'trickle'],
    ['Babbling Brook', {}, 'brook'],
    ['Rushing Creek',  { flow: 0.85, sparkle: 0.60, depth: 0.65 }, 'creek'],
  )},
  // Thunder is crack-free rolling rumble; the scenes lead, but the three
  // sliders shape it (they were hidden — `variantsOnly` — but they map to
  // real, useful qualities, so they're back).
  thunder: { label: 'Thunder', mode: 'simple', groups: shapeGroup(
    { key: 'stormIntensity', label: 'activity', def: 0.18 },
    { key: 'rumble',         label: 'rumble',   def: 0.60 },
    { key: 'distance',       label: 'distance', def: 0.72 },
  ), variants: vlist(
    // Crack-free rolling rumble for sleep, ordered far → near.
    ['Distant Rumble',  { stormIntensity: 0.12, rumble: 0.72, distance: 0.92 }, 'thunderfar'],
    ['Rolling Storm', {}, 'thunderroll'],
    ['Gathering Storm', { stormIntensity: 0.35, rumble: 0.66, distance: 0.52 }, 'thundergather'],
    ['Heavy Storm',     { stormIntensity: 0.58, rumble: 0.82, distance: 0.34 }, 'thunderheavy'],
  )},
  fan: { label: 'Fan', mode: 'simple', groups: shapeGroup(
    { key: 'speed', label: 'speed', def: 0.08 },
    { key: 'hum', label: 'hum', def: 0.50 },
    { key: 'airflow', label: 'airflow', def: 0.38 },
    { key: 'size', label: 'fan size', def: 0.18 },
  ), variants: vlist(
    // Appliances, not speed steps: a purifier's smooth hiss, the bedside
    // default, a box fan's fuller drone, and a big workshop machine.
    ['Air Purifier', { speed: 0.04, hum: 0.22, airflow: 0.52, size: 0.08 }, 'purifier'],
    ['Bedroom Fan', {}, 'roundfan'],
    ['Box Fan',      { speed: 0.22, hum: 0.62, airflow: 0.72, size: 0.42 }, 'boxfan'],
    ['Shop Fan',     { speed: 0.45, hum: 0.55, airflow: 0.90, size: 0.75 }, 'shopfan'],
  )},
  train: { label: 'Train', mode: 'simple', groups: simpleGroup(
    { key: 'speed', label: 'speed', def: 0.50 },
    { key: 'rumble', label: 'rumble', def: 0.50 },
    { key: 'clatter', label: 'rail clatter', def: 0.35 },
  ), variants: vlist(
    // Journeys, not speed steps: a line heard across the fields, the default
    // overnight carriage, a slow old local on jointed track, and an express.
    ['Distant Line', { speed: 0.35, rumble: 0.30, clatter: 0.08 }, 'farrails'],
    ['Sleeper Car', {}, 'sleepercar'],
    ['Old Local',    { speed: 0.25, rumble: 0.60, clatter: 0.72 }, 'jointedrail'],
    ['Express',      { speed: 0.85, rumble: 0.55, clatter: 0.45 }, 'express'],
  )},
  night: { label: 'Night Insects', mode: 'simple', groups: shapeGroup(
    { key: 'cosmic', label: 'shimmer', def: 0.22 },
    { key: 'pulse', label: 'drift', def: 0.18 },
  ), variants: vlist(
    ['Still',        { cosmic: 0.20, pulse: 0.15 }, 'nightstill'],
    ['Summer Night', {}, 'nightsummer'],
    ['Deep Drift',   { cosmic: 0.60, pulse: 0.55 }, 'nightdeep'],
  )},
  'white-noise': { label: 'White Noise', mode: 'simple', groups: simpleGroup(
    { key: 'brightness', label: 'brightness', def: 0.32 },
    { key: 'depth', label: 'body', def: 0.58 },
    { key: 'texture', label: 'shimmer', def: 0.22 },
  ), variants: vlist(
    // For a texture, the spectrum is the character — but each of these is a
    // distinct use, not a volume: a dark veil for masking, the default, a
    // living airy wash, and crisp full-range static.
    ['Warm Hush',  { brightness: 0.16, depth: 0.75, texture: 0.12 }],
    ['Even Veil', {}],
    ['Open Air',   { brightness: 0.58, depth: 0.42, texture: 0.55 }],
    ['Crisp',      { brightness: 0.88, depth: 0.30, texture: 0.35 }],
  )},
  'pink-noise': { label: 'Pink Noise', mode: 'simple', groups: simpleGroup(
    { key: 'warmth', label: 'warmth', def: 0.70 },
    { key: 'focus', label: 'presence', def: 0.35 },
    { key: 'air', label: 'air', def: 0.20 },
  ), variants: vlist(
    // Characters: pulled over your head, the default steady fall, and thin
    // bright air with the mids stepping forward.
    ['Warm Blanket', { warmth: 0.88, focus: 0.25, air: 0.10 }],
    ['Soft Fall', {}],
    ['Mountain Air', { warmth: 0.45, focus: 0.55, air: 0.75 }],
  )},
  'brown-noise': { label: 'Brown Noise', mode: 'simple', groups: simpleGroup(
    { key: 'depth', label: 'depth', def: 0.72 },
    { key: 'rumble', label: 'rumble', def: 0.20 },
    { key: 'smoothness', label: 'smoothness', def: 0.78 },
  ), variants: vlist(
    // Characters: a featureless velvet floor, the default roll, and a heavy
    // storm-cellar rumble with real low-end grain.
    ['Velvet',      { depth: 0.60, rumble: 0.10, smoothness: 0.92 }],
    ['Rolling', {}],
    ['Storm Floor', { depth: 0.90, rumble: 0.70, smoothness: 0.35 }],
  )},
  underwater: { label: 'Underwater', mode: 'simple', groups: simpleGroup(
    { key: 'depth', label: 'depth', def: 0.60 },
    { key: 'bubbles', label: 'bubbles', def: 0.40 },
    { key: 'current', label: 'current', def: 0.50 },
  ), variants: vlist(
    ['Still Depths',    { depth: 0.70, bubbles: 0.20, current: 0.30 }, 'depthstill'],
    ['Gentle Current', {}, 'current'],
    ['Deep Sea',        { depth: 0.90, bubbles: 0.55, current: 0.70 }, 'deepsea'],
  )},
  shower: { label: 'Shower', mode: 'simple', groups: simpleGroup(
    { key: 'pressure', label: 'pressure', def: 0.60 },
    { key: 'steam', label: 'steam', def: 0.30 },
    { key: 'room', label: 'room', def: 0.50 },
  ), variants: vlist(
    ['Gentle',   { pressure: 0.35, steam: 0.40, room: 0.45 }, 'showergentle'],
    ['Steady', {}, 'showersteady'],
    ['Powerful', { pressure: 0.90, steam: 0.25, room: 0.60 }, 'showerpower'],
  )},
  airplane: { label: 'Airplane', mode: 'simple', groups: simpleGroup(
    { key: 'altitude', label: 'altitude', def: 0.50 },
    { key: 'cabin', label: 'cabin hush', def: 0.60 },
    { key: 'turbulence', label: 'turbulence', def: 0.30 },
  ), variants: vlist(
    // Seats and moments, not a turbulence dial: the quiet rear cabin on a
    // night flight, the default cruise, a seat over the wing where the
    // engines lead, and a stretch of light chop.
    ['Night Flight',  { altitude: 0.42, cabin: 0.85, turbulence: 0.08 }, 'nightflight'],
    ['Cruise', {}, 'cruise'],
    ['Over the Wing', { altitude: 0.75, cabin: 0.35, turbulence: 0.30 }, 'wing'],
    ['Light Chop',    { altitude: 0.50, cabin: 0.55, turbulence: 0.75 }, 'chop'],
  )},
  heartbeat: { label: 'Heartbeat', mode: 'simple', groups: shapeGroup(
    { key: 'rate', label: 'pace', def: 0.50 },
    { key: 'chest', label: 'chest depth', def: 0.60 },
    { key: 'muffle', label: 'muffle', def: 0.50 },
    { key: 'flow', label: 'blood flow', def: 0.15 },
  ), variants: vlist(
    // Characters, not tiers: drifting off, the default rest, an ear on a
    // chest, and the womb (flow + muffle carry that one).
    ['Falling Asleep',    { rate: 0.30, chest: 0.55, muffle: 0.60, flow: 0.10 }, 'heartdrift'],
    ['Resting', {}, 'heartrest'],
    ['Against the Chest', { rate: 0.45, chest: 0.85, muffle: 0.72, flow: 0.25 }, 'heartclose'],
    ['Womb',              { rate: 0.60, chest: 0.70, muffle: 0.85, flow: 0.90 }, 'womb'],
  )},
  purr: { label: 'Cat Purr', mode: 'simple', groups: simpleGroup(
    { key: 'rate', label: 'breathing', def: 0.45 },
    { key: 'rumble', label: 'rumble', def: 0.60 },
    { key: 'softness', label: 'softness', def: 0.55 },
  ), variants: vlist(
    ['Dozing',      { rate: 0.28, rumble: 0.48, softness: 0.75 }, 'catdozing'],
    ['Content', {}, 'catcontent'],
    ['Deep Rumble', { rate: 0.55, rumble: 0.85, softness: 0.40 }, 'catdeep'],
  )},
  chimes: { label: 'Wind Chimes', mode: 'simple', groups: simpleGroup(
    { key: 'activity', label: 'breeze strength', def: 0.42 },
    { key: 'tone', label: 'brightness', def: 0.45 },
    { key: 'sustain', label: 'ring', def: 0.50 },
  ), variants: vlist(
    // Four characters, calm → lively: a rare dark stir, long deep tolls,
    // the porch default, and a bright dancing set.
    ['Still Evening', { activity: 0.20, tone: 0.35, sustain: 0.55 }, 'chimestill'],
    ['Deep Tubes',    { activity: 0.30, tone: 0.15, sustain: 0.90 }, 'chimedeep'],
    ['On a Breeze', {}, 'chimebreeze'],
    ['Dancing',       { activity: 0.75, tone: 0.62, sustain: 0.42 }, 'chimedance'],
  )},
  clock: { label: 'Ticking Clock', mode: 'simple', groups: simpleGroup(
    { key: 'pace', label: 'pace', def: 0.50 },
    { key: 'contrast', label: 'tick–tock', def: 0.50 },
    { key: 'brightness', label: 'brightness', def: 0.50 },
  ), variants: vlist(
    // The bare mechanism IS the base sound now; the chips vary the mechanism
    // itself (beat, voicing, tone) instead of burying it in case and room.
    ['Slow Pendulum', { pace: 0.06, contrast: 0.70, brightness: 0.35 }, 'pendulum'],
    ['Bare Tick', {}, 'escapement'],
    ['Even Beat',     { pace: 0.50, contrast: 0.04, brightness: 0.45 }, 'metronome'],
    ['Pocket Watch',  { pace: 0.95, contrast: 0.30, brightness: 0.72 }, 'pocketwatch'],
  )},
};

export const EDITABLE_SOUND_IDS = Object.keys(SOUND_EDITOR_MODELS);
