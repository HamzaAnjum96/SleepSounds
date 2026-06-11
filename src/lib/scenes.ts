import type { Preset } from '../types';
import { BUILTIN_PRESETS } from '../data';

/**
 * Presentation layer for the curated scenes (the built-in presets).
 * Each scene carries a one-line mood and its own gradient art, generated
 * in CSS: no images, in keeping with drift's everything-generated character.
 */

export interface Scene {
  preset: Preset;
  /** One quiet line under the name. */
  mood: string;
  /** CSS background for the card art. */
  art: string;
}

const ART: Record<string, { mood: string; art: string }> = {
  'builtin-rainfall': {
    mood: 'just rain, falling steady',
    art: `radial-gradient(120% 90% at 85% 0%, rgba(123,167,232,0.30) 0%, transparent 58%),
          radial-gradient(100% 100% at 15% 100%, rgba(90,120,180,0.18) 0%, transparent 60%),
          linear-gradient(150deg, rgba(26,41,64,0.55) 0%, rgba(13,22,38,0.42) 72%)`,
  },
  'builtin-distant-storm': {
    mood: 'thunder rolling over steady rain',
    art: `radial-gradient(130% 85% at 80% 8%, rgba(150,165,195,0.24) 0%, transparent 58%),
          radial-gradient(90% 90% at 12% 95%, rgba(70,85,120,0.22) 0%, transparent 60%),
          linear-gradient(155deg, rgba(24,28,42,0.58) 0%, rgba(10,13,22,0.44) 72%)`,
  },
  'builtin-windy-forest': {
    mood: 'high boughs in a night wind',
    art: `radial-gradient(120% 90% at 80% 0%, rgba(143,191,154,0.26) 0%, transparent 58%),
          radial-gradient(90% 90% at 10% 95%, rgba(60,110,80,0.20) 0%, transparent 60%),
          linear-gradient(150deg, rgba(22,41,31,0.55) 0%, rgba(10,20,16,0.42) 72%)`,
  },
  'builtin-fireside': {
    mood: 'crackle and embers in the dark',
    art: `radial-gradient(110% 95% at 22% 100%, rgba(224,158,96,0.32) 0%, transparent 58%),
          radial-gradient(90% 80% at 85% 10%, rgba(150,80,45,0.20) 0%, transparent 60%),
          linear-gradient(160deg, rgba(38,24,15,0.56) 0%, rgba(16,9,6,0.44) 72%)`,
  },
  'builtin-ocean-night': {
    mood: 'long waves under an open sky',
    art: `radial-gradient(130% 90% at 80% 100%, rgba(95,170,200,0.26) 0%, transparent 58%),
          radial-gradient(90% 80% at 15% 5%, rgba(60,110,160,0.20) 0%, transparent 60%),
          linear-gradient(160deg, rgba(15,32,50,0.56) 0%, rgba(7,15,26,0.44) 72%)`,
  },
  'builtin-deep-rest': {
    mood: 'deep noise, a slow resting pulse',
    art: `radial-gradient(120% 90% at 80% 0%, rgba(170,156,196,0.24) 0%, transparent 58%),
          radial-gradient(100% 90% at 15% 100%, rgba(90,75,130,0.18) 0%, transparent 60%),
          linear-gradient(155deg, rgba(27,23,44,0.56) 0%, rgba(11,9,20,0.44) 72%)`,
  },
  'builtin-underwater': {
    mood: 'pressure, distance, dark water',
    art: `radial-gradient(130% 90% at 75% 95%, rgba(80,160,190,0.24) 0%, transparent 58%),
          radial-gradient(90% 80% at 18% 8%, rgba(45,95,135,0.20) 0%, transparent 60%),
          linear-gradient(165deg, rgba(11,30,40,0.58) 0%, rgba(6,15,21,0.46) 72%)`,
  },
  'builtin-cafe-rain': {
    mood: 'murmurs, rain past the window',
    art: `radial-gradient(120% 95% at 22% 0%, rgba(209,166,114,0.30) 0%, transparent 58%),
          radial-gradient(90% 90% at 90% 95%, rgba(140,100,60,0.20) 0%, transparent 60%),
          linear-gradient(150deg, rgba(38,29,17,0.55) 0%, rgba(18,12,7,0.43) 72%)`,
  },
};

const FALLBACK = {
  mood: 'a quiet blend',
  art: `radial-gradient(120% 90% at 80% 0%, rgba(123,167,232,0.22) 0%, transparent 55%),
        linear-gradient(150deg, rgba(23,32,58,0.55) 0%, rgba(12,17,32,0.42) 72%)`,
};

export const SCENES: Scene[] = BUILTIN_PRESETS.map((preset) => ({
  preset,
  ...(ART[preset.id] ?? FALLBACK),
}));

/** Sound ids active in a preset, in library order. */
export function presetSoundIds(preset: Preset): string[] {
  return Object.entries(preset.state)
    .filter(([, s]) => s.enabled)
    .map(([id]) => id);
}
