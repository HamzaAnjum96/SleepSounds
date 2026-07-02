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

/* Alphas are tuned for real OLED phones, where the previous values read as
   near-black tiles: the leading hue carries the card, the counter-glow keeps
   it from going flat, and the linear wash lifts the whole tile off the sky. */
const ART: Record<string, { mood: string; art: string }> = {
  'builtin-fan-rain': {
    mood: 'a fan’s hush over steady rain on glass',
    art: `radial-gradient(120% 90% at 82% 0%, rgba(143,161,184,0.30) 0%, transparent 62%),
          radial-gradient(100% 100% at 14% 100%, rgba(123,167,232,0.22) 0%, transparent 64%),
          linear-gradient(150deg, rgba(38,52,78,0.30) 0%, rgba(16,24,42,0.18) 72%)`,
  },
  'builtin-rainfall': {
    mood: 'just rain, falling steady through the night',
    art: `radial-gradient(120% 90% at 85% 0%, rgba(123,167,232,0.32) 0%, transparent 62%),
          radial-gradient(100% 100% at 15% 100%, rgba(90,120,180,0.20) 0%, transparent 64%),
          linear-gradient(150deg, rgba(40,60,96,0.30) 0%, rgba(16,26,46,0.18) 72%)`,
  },
  'builtin-distant-storm': {
    mood: 'thunder rolling in over steady, soaking rain',
    art: `radial-gradient(130% 85% at 80% 8%, rgba(150,165,195,0.28) 0%, transparent 62%),
          radial-gradient(90% 90% at 12% 95%, rgba(70,85,120,0.24) 0%, transparent 64%),
          linear-gradient(155deg, rgba(44,52,76,0.30) 0%, rgba(14,18,30,0.18) 72%)`,
  },
  'builtin-windy-forest': {
    mood: 'high boughs swaying in a cool night wind',
    art: `radial-gradient(120% 90% at 80% 0%, rgba(143,191,154,0.30) 0%, transparent 62%),
          radial-gradient(90% 90% at 10% 95%, rgba(60,110,80,0.22) 0%, transparent 64%),
          linear-gradient(150deg, rgba(34,62,46,0.30) 0%, rgba(13,26,20,0.18) 72%)`,
  },
  'builtin-fireside': {
    mood: 'crackle and embers glowing in the quiet dark',
    art: `radial-gradient(110% 95% at 22% 100%, rgba(224,158,96,0.34) 0%, transparent 62%),
          radial-gradient(90% 80% at 85% 10%, rgba(150,80,45,0.22) 0%, transparent 64%),
          linear-gradient(160deg, rgba(58,36,22,0.30) 0%, rgba(22,13,8,0.18) 72%)`,
  },
  'builtin-ocean-night': {
    mood: 'long waves breaking under a wide open sky',
    art: `radial-gradient(130% 90% at 80% 100%, rgba(95,170,200,0.30) 0%, transparent 62%),
          radial-gradient(90% 80% at 15% 5%, rgba(60,110,160,0.22) 0%, transparent 64%),
          linear-gradient(160deg, rgba(24,50,76,0.30) 0%, rgba(10,20,34,0.18) 72%)`,
  },
  'builtin-deep-rest': {
    mood: 'deep noise around a slow, resting heartbeat',
    art: `radial-gradient(120% 90% at 80% 0%, rgba(170,156,196,0.28) 0%, transparent 62%),
          radial-gradient(100% 90% at 15% 100%, rgba(90,75,130,0.22) 0%, transparent 64%),
          linear-gradient(155deg, rgba(42,36,66,0.30) 0%, rgba(15,12,26,0.18) 72%)`,
  },
  'builtin-underwater': {
    mood: 'pressure and distance in cold, dark water',
    art: `radial-gradient(130% 90% at 75% 95%, rgba(80,160,190,0.28) 0%, transparent 62%),
          radial-gradient(90% 80% at 18% 8%, rgba(45,95,135,0.22) 0%, transparent 64%),
          linear-gradient(165deg, rgba(18,46,60,0.30) 0%, rgba(8,20,28,0.18) 72%)`,
  },
  'builtin-curled-up': {
    mood: 'a warm purr breathing under gentle rain',
    art: `radial-gradient(110% 95% at 20% 100%, rgba(209,166,114,0.32) 0%, transparent 62%),
          radial-gradient(90% 80% at 85% 8%, rgba(123,167,232,0.18) 0%, transparent 64%),
          linear-gradient(160deg, rgba(56,42,28,0.30) 0%, rgba(20,14,10,0.18) 72%)`,
  },
  'builtin-evening-porch': {
    mood: 'chimes stirring now and then on a night breeze',
    art: `radial-gradient(120% 90% at 80% 0%, rgba(209,166,114,0.28) 0%, transparent 62%),
          radial-gradient(95% 90% at 15% 100%, rgba(143,191,154,0.20) 0%, transparent 64%),
          linear-gradient(150deg, rgba(52,44,30,0.30) 0%, rgba(18,15,10,0.18) 72%)`,
  },
};

const FALLBACK = {
  mood: 'a quiet blend to drift off to',
  art: `radial-gradient(120% 90% at 80% 0%, rgba(123,167,232,0.28) 0%, transparent 62%),
        linear-gradient(150deg, rgba(36,48,82,0.30) 0%, rgba(16,22,40,0.18) 72%)`,
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
