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
          linear-gradient(150deg, rgba(26,41,64,0.55) 0%, rgba(13,22,38,0.42) 72%)`,
  },
  'builtin-windy-forest': {
    mood: 'high boughs in a night wind',
    art: `radial-gradient(120% 90% at 80% 0%, rgba(143,191,154,0.26) 0%, transparent 55%),
          radial-gradient(90% 90% at 10% 95%, rgba(60,110,80,0.20) 0%, transparent 60%),
          linear-gradient(150deg, rgba(22,41,31,0.55) 0%, rgba(10,20,16,0.42) 72%)`,
  },
  'builtin-campfire-night': {
    mood: 'embers under a still night',
    art: `radial-gradient(110% 95% at 20% 100%, rgba(224,158,96,0.32) 0%, transparent 55%),
          radial-gradient(90% 80% at 85% 10%, rgba(120,70,40,0.20) 0%, transparent 60%),
          linear-gradient(160deg, rgba(43,26,16,0.55) 0%, rgba(18,10,6,0.42) 72%)`,
  },
  'builtin-rainy-train': {
    mood: 'a sleeper car through weather',
    art: `radial-gradient(130% 80% at 90% 10%, rgba(143,161,184,0.26) 0%, transparent 55%),
          radial-gradient(90% 90% at 5% 90%, rgba(80,95,130,0.20) 0%, transparent 60%),
          linear-gradient(150deg, rgba(31,36,51,0.55) 0%, rgba(14,17,28,0.42) 72%)`,
  },
  'builtin-deep-sleep': {
    mood: 'low noise, a resting pulse',
    art: `radial-gradient(120% 90% at 80% 0%, rgba(170,156,196,0.24) 0%, transparent 55%),
          radial-gradient(100% 90% at 15% 100%, rgba(90,75,130,0.18) 0%, transparent 60%),
          linear-gradient(155deg, rgba(29,24,48,0.55) 0%, rgba(11,9,22,0.42) 72%)`,
  },
  'builtin-rainforest': {
    mood: 'rain in the canopy, life beneath',
    art: `radial-gradient(120% 90% at 85% 5%, rgba(96,180,140,0.26) 0%, transparent 55%),
          radial-gradient(100% 90% at 10% 95%, rgba(60,140,130,0.18) 0%, transparent 60%),
          linear-gradient(150deg, rgba(20,41,31,0.55) 0%, rgba(10,20,14,0.42) 72%)`,
  },
  'builtin-underwater-cave': {
    mood: 'pressure, distance, dark water',
    art: `radial-gradient(130% 90% at 80% 100%, rgba(95,170,200,0.26) 0%, transparent 55%),
          radial-gradient(90% 80% at 15% 5%, rgba(50,100,140,0.20) 0%, transparent 60%),
          linear-gradient(160deg, rgba(15,37,49,0.55) 0%, rgba(8,18,24,0.42) 72%)`,
  },
  'builtin-cozy-cafe': {
    mood: 'murmurs, rain past the window',
    art: `radial-gradient(120% 95% at 20% 0%, rgba(209,166,114,0.30) 0%, transparent 55%),
          radial-gradient(90% 90% at 90% 95%, rgba(130,95,55,0.20) 0%, transparent 60%),
          linear-gradient(150deg, rgba(42,32,18,0.55) 0%, rgba(20,14,8,0.42) 72%)`,
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
