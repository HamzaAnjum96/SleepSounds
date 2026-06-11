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
  'builtin-fan-rain': {
    mood: 'steady air, rain on glass',
    art: `radial-gradient(120% 90% at 85% 0%, rgba(123,167,232,0.30) 0%, transparent 55%),
          radial-gradient(100% 100% at 15% 100%, rgba(90,120,180,0.18) 0%, transparent 60%),
          linear-gradient(150deg, #1a2940 0%, #0d1626 70%)`,
  },
  'builtin-windy-forest': {
    mood: 'high boughs in a night wind',
    art: `radial-gradient(120% 90% at 80% 0%, rgba(143,191,154,0.26) 0%, transparent 55%),
          radial-gradient(90% 90% at 10% 95%, rgba(60,110,80,0.20) 0%, transparent 60%),
          linear-gradient(150deg, #16291f 0%, #0a1410 70%)`,
  },
  'builtin-campfire-night': {
    mood: 'embers under tall trees',
    art: `radial-gradient(110% 95% at 20% 100%, rgba(224,158,96,0.32) 0%, transparent 55%),
          radial-gradient(90% 80% at 85% 10%, rgba(120,70,40,0.20) 0%, transparent 60%),
          linear-gradient(160deg, #2b1a10 0%, #120a06 70%)`,
  },
  'builtin-rainy-train': {
    mood: 'a sleeper car through weather',
    art: `radial-gradient(130% 80% at 90% 10%, rgba(143,161,184,0.26) 0%, transparent 55%),
          radial-gradient(90% 90% at 5% 90%, rgba(80,95,130,0.20) 0%, transparent 60%),
          linear-gradient(150deg, #1f2433 0%, #0e111c 70%)`,
  },
  'builtin-deep-sleep': {
    mood: 'low noise, a resting pulse',
    art: `radial-gradient(120% 90% at 80% 0%, rgba(170,156,196,0.24) 0%, transparent 55%),
          radial-gradient(100% 90% at 15% 100%, rgba(90,75,130,0.18) 0%, transparent 60%),
          linear-gradient(155deg, #1d1830 0%, #0b0916 70%)`,
  },
  'builtin-rainforest': {
    mood: 'rain in the canopy, life beneath',
    art: `radial-gradient(120% 90% at 85% 5%, rgba(96,180,140,0.26) 0%, transparent 55%),
          radial-gradient(100% 90% at 10% 95%, rgba(60,140,130,0.18) 0%, transparent 60%),
          linear-gradient(150deg, #14291f 0%, #0a140e 70%)`,
  },
  'builtin-underwater-cave': {
    mood: 'pressure, distance, dark water',
    art: `radial-gradient(130% 90% at 80% 100%, rgba(95,170,200,0.26) 0%, transparent 55%),
          radial-gradient(90% 80% at 15% 5%, rgba(50,100,140,0.20) 0%, transparent 60%),
          linear-gradient(160deg, #0f2531 0%, #081218 70%)`,
  },
  'builtin-cozy-cafe': {
    mood: 'murmurs, rain past the window',
    art: `radial-gradient(120% 95% at 20% 0%, rgba(209,166,114,0.30) 0%, transparent 55%),
          radial-gradient(90% 90% at 90% 95%, rgba(130,95,55,0.20) 0%, transparent 60%),
          linear-gradient(150deg, #2a2012 0%, #140e08 70%)`,
  },
};

const FALLBACK = {
  mood: 'a quiet blend',
  art: `radial-gradient(120% 90% at 80% 0%, rgba(123,167,232,0.22) 0%, transparent 55%),
        linear-gradient(150deg, #17203a 0%, #0c1120 70%)`,
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
