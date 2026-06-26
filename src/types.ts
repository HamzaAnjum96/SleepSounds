/** How a sound is produced. Worklet sounds run a live AudioWorklet generator
 *  with a WAV loop as fallback; wav sounds are a procedural WAV loop. Both keep
 *  generation lazy (the closures run on first play) and async, because the WAV
 *  generator module is code-split — it's fetched on first use, never at load.
 *  The mixer plays either via one factory, so the UI never needs to know which
 *  is which. */
export type SoundSource =
  | { mode: 'worklet'; module: string; processor: string; params: Record<string, number>; fallback: () => Promise<string> }
  | { mode: 'wav'; make: () => Promise<string> };

/** Release readiness, for hiding unfinished work. 'experimental' sounds are
 *  shown only when the experimentalSounds feature flag is on. */
export type SoundQuality = 'good' | 'experimental' | 'needs-work';

export interface Sound {
  id: string;
  name: string;
  category: string;
  source: SoundSource;
  /** Free-text tags for future search/grouping. */
  tags: string[];
  quality: SoundQuality;
}

export interface SoundState {
  enabled: boolean;
  volume: number;
  /** Per-sound editor slider values saved with a mix/scene, so a preset can
   *  carry its own character (e.g. a gentle-trickle rain) and not just its
   *  level. Omitted = the sound's editor defaults. */
  tuning?: Record<string, number>;
}

export interface Preset {
  id: string;
  name: string;
  createdAt: string;
  state: Record<string, SoundState>;
  masterVolume?: number;
}
