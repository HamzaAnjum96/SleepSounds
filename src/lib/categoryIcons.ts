/** Material Symbols glyph per sound category. Shared by the category filter
 *  pills (App) and the card element watermark (SoundCard). */
export const CATEGORY_ICONS: Record<string, string> = {
  All:      'apps',
  Water:    'water_drop',
  Fire:     'local_fire_department',
  Air:      'air',
  Earth:    'landscape',
  Noise:    'music_note',
  Urban:    'location_city',
  Wildlife: 'raven',
  Cozy:     'self_care',
};

/** Category accent triplets (`r,g,b`), mirroring the `--cat` values in
 *  index.css. Used to derive each saved mix's card tint from its layers. */
export const CATEGORY_COLORS: Record<string, string> = {
  Water:    '123,167,232',
  Fire:     '224,158,96',
  Air:      '159,196,216',
  Earth:    '163,179,138',
  Noise:    '170,156,196',
  Urban:    '143,161,184',
  Wildlife: '143,191,154',
  Cozy:     '209,166,114',
};
