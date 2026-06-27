// Layer roles for masking-aware mixing.
//
// Stacking several broadband beds (fan + white noise + rain, say) builds up hiss
// and low-mid fog: each layer masks the others, so the mix reads as one lump
// rather than a scene. Real ambiences are layered — one bed owns the floor,
// motion layers move over it, accents stay sparse. We encode that intent here
// and let the mixer apply gentle automatic trims when layers in the same
// spectral "mask group" pile up, instead of hand-tuning every preset.

export type LayerRole = 'bed' | 'motion' | 'accent';
export type MaskGroup = 'broad' | 'water' | 'low' | 'detail';

export interface LayerMeta {
  role: LayerRole;
  maskGroup: MaskGroup;
  /** 0..1 hint of how wide the layer should sit (reserved for per-layer panning
   *  once WAV playback moves onto the Web Audio graph). */
  defaultWidth: number;
}

export const LAYER_META: Record<string, LayerMeta> = {
  // Beds — own the spectral floor; trimmed when they collide with their kin.
  fan:            { role: 'bed',    maskGroup: 'broad',  defaultWidth: 0.15 },
  'white-noise':  { role: 'bed',    maskGroup: 'broad',  defaultWidth: 0.30 },
  'pink-noise':   { role: 'bed',    maskGroup: 'broad',  defaultWidth: 0.30 },
  'brown-noise':  { role: 'bed',    maskGroup: 'low',    defaultWidth: 0.05 },
  train:          { role: 'bed',    maskGroup: 'broad',  defaultWidth: 0.40 },
  airplane:       { role: 'bed',    maskGroup: 'broad',  defaultWidth: 0.40 },
  underwater:     { role: 'bed',    maskGroup: 'low',    defaultWidth: 0.20 },
  // Motion — move over the bed.
  rain:           { role: 'motion', maskGroup: 'water',  defaultWidth: 0.45 },
  ocean:          { role: 'motion', maskGroup: 'water',  defaultWidth: 0.65 },
  stream:         { role: 'motion', maskGroup: 'water',  defaultWidth: 0.55 },
  shower:         { role: 'motion', maskGroup: 'water',  defaultWidth: 0.50 },
  wind:           { role: 'motion', maskGroup: 'broad',  defaultWidth: 0.60 },
  forest:         { role: 'motion', maskGroup: 'broad',  defaultWidth: 0.55 },
  // Accents — sparse or localised; left alone.
  thunder:        { role: 'accent', maskGroup: 'low',    defaultWidth: 0.70 },
  fire:           { role: 'accent', maskGroup: 'detail', defaultWidth: 0.25 },
  birdsong:       { role: 'accent', maskGroup: 'detail', defaultWidth: 0.55 },
  night:          { role: 'accent', maskGroup: 'detail', defaultWidth: 0.50 },
  heartbeat:      { role: 'accent', maskGroup: 'low',    defaultWidth: 0.10 },
};

const dbToGain = (db: number): number => Math.pow(10, db / 20);

/** A gentle level trim for a sound given everything else currently playing, so
 *  stacked beds and piled-up motion layers don't fog the mix. Beds duck a touch
 *  for each same-group neighbour; a crowd of same-group motion layers ducks the
 *  extras; accents are never trimmed. Returns a multiplier in (0, 1]. */
export function layeringTrim(activeIds: string[], soundId: string): number {
  const self = LAYER_META[soundId];
  if (!self) return 1;
  const sameGroup = activeIds.filter(
    (id) => id !== soundId && LAYER_META[id]?.maskGroup === self.maskGroup,
  ).length;
  if (self.role === 'bed' && sameGroup > 0) return dbToGain(-1.5 * sameGroup);
  if (self.role === 'motion' && sameGroup > 1) return dbToGain(-1.0 * (sameGroup - 1));
  return 1;
}
